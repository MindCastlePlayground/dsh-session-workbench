import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { historyPage, messageTurn, recentTurn, sessionTitle } from './history.js'

import { failure, LIMIT, MESSAGE, PROJECT_ID, register, SESSION_ID } from '../tools.js'
import { assertSession, findSession, matchesDirectory, relay, scopeDirectory, senderProject } from '../projects/sessions.js'

export const coordinationServices = ['tools', 'agents', 'sessions', 'sessionQuery', 'sessionController', 'workspaceRegistry', 'workspaceController']

const MAX_WAIT = 120_000
const MAX_HISTORY = 20
const OUTCOME = {
  IDLE: 'idle',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
  SETTLED: 'settled',
  UNCONFIRMED: 'unconfirmed',
  TIMEOUT: 'timeout',
}

async function peerDirectory(ctx, caller, id, projectId, signal) {
  if (caller.id === id) throw failure('SESSION_NOT_AVAILABLE', 'Select another independent session.')
  return scopeDirectory(ctx, caller, projectId, signal)
}

function archived(ctx, id) {
  return ctx.workspaceRegistry.archivedSessionIds.includes(id)
}

async function observe(ctx, directory, id, signal) {
  const live = ctx.sessions.get(id)
  if (live) {
    assertSession(id, live.header, directory)
    return { events: live.snapshotEvents(), inherited: live.inheritedEventCount ?? 0 }
  }
  await findSession(ctx, id, directory, signal)
  const result = await ctx.sessionQuery.readSession(id)
  signal.throwIfAborted()
  assertSession(id, result.session, directory)
  return { events: result.events, inherited: result.inheritedEventCount ?? 0 }
}

function state(ctx, id) {
  const agent = ctx.agents.get(id)
  return archived(ctx, id) ? OUTCOME.ARCHIVED : agent?.status ?? OUTCOME.INACTIVE
}

function pending(agent) {
  return [...(agent?.inbox.nextTurn ?? []), ...(agent?.inbox.nextStep ?? [])]
}

function addWait(waits, caller, target) {
  const queue = [target]
  const visited = new Set()
  while (queue.length) {
    const current = queue.pop()
    if (current === caller) throw failure('SESSION_WAIT_CYCLE', 'The target already depends on this session finishing. Check its status or history instead.')
    if (visited.has(current)) continue
    visited.add(current)
    for (const entry of waits.get(current) ?? []) queue.push(entry.target)
  }
  const entry = { target }
  const edges = waits.get(caller) ?? new Set()
  waits.set(caller, edges)
  edges.add(entry)
  return () => {
    edges.delete(entry)
    if (edges.size === 0) waits.delete(caller)
  }
}

export function applyCoordination(ctx) {
  const waits = new Map()

  register(ctx, 'session_list',
    'Find other independent sessions in the current workspace or selected project for a task requiring cross-session collaboration. The result includes your own session ID for replies.',
    { project_id: PROJECT_ID, limit: LIMIT, offset: { type: 'integer', minimum: 0 } }, [],
    async ({ limit = 20, offset = 0, project_id: project }, caller, signal) => {
      const directory = await scopeDirectory(ctx, caller, project, signal)
      const records = await ctx.sessionQuery.filterSessions([{ kind: 'cwd', values: [directory] }], signal)
      signal.throwIfAborted()
      const eligible = records.filter(({ header }) => header.id !== caller.id && matchesDirectory(header, directory) && !archived(ctx, header.id))
      const page = eligible.slice(offset, offset + limit)
      const sessions = page.map(({ header }) => ({
        session_id: header.id,
        created_at: header.createdAt,
        state: state(ctx, header.id),
        title: sessionTitle(ctx.sessions.get(header.id)?.snapshotEvents() ?? []),
      }))
      return {
        self_session_id: caller.id,
        sessions,
        next_offset: offset + page.length < eligible.length ? offset + page.length : null,
      }
    })

  register(ctx, 'session_send',
    'Queue a text message to another session in your workspace or selected project when the task calls for collaboration. An inactive recipient resumes. State queued confirms inbox acceptance only. To reply, use the sender session ID and its project_id when provided. A reply queues a later turn in the sender.',
    { session_id: SESSION_ID, message: MESSAGE, project_id: PROJECT_ID },
    ['session_id', 'message'],
    async ({ session_id: id, message, project_id: project }, caller, signal) => {
      const directory = await peerDirectory(ctx, caller, id, project, signal)
      await findSession(ctx, id, directory, signal)
      if (archived(ctx, id)) throw failure('SESSION_ARCHIVED', 'Unarchive the session before sending to it.')
      const found = await ctx.sessionController.resolveAgent(id)
      signal.throwIfAborted()
      if ('error' in found) throw found.error
      assertSession(id, found.agent.session.header, directory)
      if (archived(ctx, id)) throw failure('SESSION_ARCHIVED', 'Unarchive the session before sending to it.')
      const input = relay(caller.id, message, senderProject(ctx, caller, directory))
      found.agent.followup(input)
      return { session_id: id, message_id: input.id, state: 'queued' }
    })

  register(ctx, 'session_history',
    'Read committed human, peer-message, and assistant text in another session in your workspace or selected project. Omit before_seq for the newest page. Pass next_before_seq to get older messages.',
    {
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      before_seq: { type: 'integer', minimum: 0 },
      limit: { ...LIMIT, maximum: MAX_HISTORY },
    }, ['session_id'],
    async ({ session_id: id, before_seq: before = Infinity, limit = 10, project_id: project }, caller, signal) => {
      const directory = await peerDirectory(ctx, caller, id, project, signal)
      const { events, inherited } = await observe(ctx, directory, id, signal)
      return { session_id: id, ...historyPage(events, inherited, before, limit) }
    })

  register(ctx, 'session_status',
    'Read another session in your workspace or selected project’s running, idle, inactive, or archived state, queue count when loaded, and last recorded turn outcome. Does not start it.',
    { session_id: SESSION_ID, project_id: PROJECT_ID }, ['session_id'],
    async ({ session_id: id, project_id: project }, caller, signal) => {
      const directory = await peerDirectory(ctx, caller, id, project, signal)
      const { events, inherited } = await observe(ctx, directory, id, signal)
      const agent = ctx.agents.get(id)
      return {
        session_id: id,
        state: state(ctx, id),
        pending_messages: agent ? pending(agent).length : null,
        ...recentTurn(events, inherited),
      }
    })

  register(ctx, 'session_wait',
    'Wait for a workspace peer to become idle, or pass the message_id returned by your send to wait for the specific turn that consumes it. Check turn_outcome and read history for the response. Timeout leaves the peer running. During a wait, inbound replies stay queued for your later turn.',
    {
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      message_id: { type: 'string', minLength: 1, maxLength: 200 },
      timeout_ms: { type: 'integer', minimum: 1, maximum: MAX_WAIT },
    }, ['session_id'],
    async ({ session_id: id, message_id: message, timeout_ms: timeout = 30_000, project_id: project }, caller, signal) => {
      const directory = await peerDirectory(ctx, caller, id, project, signal)
      await findSession(ctx, id, directory, signal)
      let stop
      const deadline = performance.now() + timeout
      try {
        while (true) {
          signal.throwIfAborted()
          const current = state(ctx, id)
          const live = ctx.sessions.get(id)
          if (live) assertSession(id, live.header, directory)
          let outcome
          let details
          if (message === undefined) {
            if (current !== 'running') {
              const { events, inherited } = await observe(ctx, directory, id, signal)
              if (state(ctx, id) === current) {
                outcome = current
                details = recentTurn(events, inherited)
              }
            }
          } else {
            // A cold target is observed once. A live target uses its in-memory log.
            const { events, inherited } = await observe(ctx, directory, id, signal)
            details = messageTurn(events, inherited, message, caller.id)
            const now = state(ctx, id)
            if (details?.turn_end_seq !== undefined) outcome = OUTCOME.SETTLED
            else if (now === OUTCOME.INACTIVE || now === OUTCOME.ARCHIVED) outcome = now
            else if (now === OUTCOME.IDLE && !pending(ctx.agents.get(id)).some(item => item.id === message)) {
              outcome = OUTCOME.UNCONFIRMED
            }
          }
          const remaining = deadline - performance.now()
          if (outcome || remaining <= 0) {
            return {
              session_id: id,
              outcome: outcome ?? OUTCOME.TIMEOUT,
              ...(message !== undefined && { message_id: message }),
              ...details,
            }
          }
          stop ??= addWait(waits, caller.id, id)
          await delay(Math.min(250, remaining), undefined, { signal })
        }
      } finally {
        stop?.()
      }
    }, { timeoutMs: MAX_WAIT + 5000, isConcurrencySafe: () => true })
}
