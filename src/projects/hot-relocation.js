import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { deriveSessionDir, encodeSegmentFor, resolveSessionRoot } from '../manager/handle-era-paths.js'
import { failure } from '../tools.js'

const CONTINUATION = 'workbench-relocation'
const PHASE = Object.freeze({
  APPROVED: 'approved', PREPARED: 'prepared', COMMITTED: 'committed',
  QUEUED: 'queued', DONE: 'done', CANCELLED: 'cancelled',
})
const RETRY_DELAYS = [60, 180]

function logger(ctx, record, error) {
  ctx.logger?.warn?.(`Session relocation "${record.id}": ${error.message}`)
}

function continuationId(sessionId, requestId, callId) {
  return createHash('sha256').update(JSON.stringify([sessionId, requestId, callId])).digest('hex')
}

function sourceRequest(session) {
  const events = session.snapshotEvents()
  const currentTurn = events.findLastIndex(event => event.type === 'turn/start')
  const event = events.slice(currentTurn + 1).find(event => event.type === 'user/message'
    && (event.data.source.kind === 'user' || event.data.source.kind === 'agent-message'
      || event.data.source.kind === CONTINUATION))
  const source = event?.data.source
  return source?.requestId ?? source?.rpcId ?? event?.data.id ?? null
}

async function exists(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function response(record, state, extra = {}) {
  return { session_id: record.id, project_id: record.targetProject, state, ...extra }
}

function message(record) {
  const text = record.outcome.state === 'moved'
    ? 'Session project switched. Continue the original request in the new working directory.'
    : 'Session project switch failed. Continue the original request from the reported working directory and explain the result.'
  return {
    id: record.continuationId,
    role: 'user',
    source: { kind: CONTINUATION, form: 'notice', requestId: record.requestId },
    content: [{ type: 'text', text: `${text}\n${JSON.stringify(record.outcome)}` }],
  }
}

async function retry(task, canRetry) {
  for (const wait of RETRY_DELAYS) {
    try {
      return await task()
    } catch (error) {
      if (!canRetry(error)) throw error
      await delay(wait)
    }
  }
  return task()
}

export function createHotRelocation(ctx, moves) {
  const sp = ctx.get?.('sessionPersistence')
  const root = resolveSessionRoot(sp)
  const journal = root && join(dirname(root), `${basename(root)}.workbench-relocation`)
  const active = new Map()
  const pathFor = id => join(journal, continuationId(id, '', '') + '.json')

  async function save(record, change) {
    const next = { ...record, ...change }
    await mkdir(journal, { recursive: true, mode: 0o700 })
    const target = pathFor(record.id)
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600, flush: true })
      await rename(temporary, target)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    Object.assign(record, change)
  }

  async function load(id) {
    if (!journal) return null
    try {
      return JSON.parse(await readFile(pathFor(id), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  // The source backup is retained until the committed journal record is durable.
  async function restoreSource(record) {
    if (record.phase !== PHASE.PREPARED) return
    const segment = encodeSegmentFor(record.id)
    if (!record.backup?.startsWith(segment + '-') || basename(record.backup) !== record.backup
      || !/^\d+-\d+$/.test(record.backup.slice(segment.length + 1))) {
      throw new Error('The relocation backup path is invalid.')
    }
    const source = deriveSessionDir(root, record.source, record.id)
    const target = deriveSessionDir(root, record.target, record.id)
    const backup = join(dirname(root), 'sessions-manager-move-backup', record.backup)
    const [sourceExists, backupExists] = await Promise.all([exists(source), exists(backup)])
    if (sourceExists && backupExists) throw new Error('Both the source and backup exist. Session logs were preserved.')
    if (backupExists) {
      const destination = await sp.stat(record.id)
      if (destination && (destination.header.cwd !== record.target
        || !Number.isSafeInteger(destination.eventCount) || destination.eventCount > record.eventCount)) {
        throw new Error('The destination was written by another host. Both session logs were preserved.')
      }
      if (await exists(target)) await rm(target, { recursive: true })
      await mkdir(dirname(source), { recursive: true })
      await rename(backup, source)
    } else if (!sourceExists) {
      throw new Error('Cannot find the source session log or its relocation backup.')
    }
    await moves.restoreMoveMembership(record.id, record.source, record.sourceProject)
    await save(record, { phase: PHASE.APPROVED, backup: null })
  }

  async function queueContinuation(record, signal) {
    const { agent } = await retry(async () => {
      const found = await ctx.sessionController.resolveAgent(record.id)
      if ('error' in found) throw found.error
      return found
    }, error => error?.code !== 'session/not-found')
    if (agent.session.header.cwd !== record.outcome.cwd) {
      throw new Error('The resumed Agent has a different working directory.')
    }
    if (signal.aborted) {
      if (agent.inbox.nextTurn.some(item => item.id === record.continuationId)) agent.inbox.remove(record.continuationId)
      await save(record, { phase: PHASE.CANCELLED, outcome: { ...record.outcome, state: 'cancelled' } })
      return agent
    }
    if (agent.session.snapshotEvents().some(event => event.type === 'user/message' && event.data.id === record.continuationId)) {
      await save(record, { phase: PHASE.DONE })
      return null
    }
    if (!agent.inbox.nextTurn.some(item => item.id === record.continuationId)) {
      await agent.queueSessionRelocation(message(record))
    }
    await save(record, { phase: PHASE.QUEUED })
    return agent
  }

  async function execute(record, signal, recovery = false) {
    if (record.phase === PHASE.PREPARED) await restoreSource(record)
    if (record.phase === PHASE.APPROVED) {
      try {
        signal.throwIfAborted()
        const target = ctx.workspaceRegistry.get(record.targetProject)
        if (target?.path !== record.target || await realpath(record.target) !== record.target) {
          throw failure('PROJECT_PATH_CHANGED', 'The destination no longer matches the approved project directory.')
        }
        await retry(async () => {
          if (record.phase === PHASE.PREPARED) await restoreSource(record)
          await moves.moveSession(record.id, target, {
            expectedCwd: record.source,
            transaction: {
              signal,
              prepare: (backup, eventCount) => save(record, { phase: PHASE.PREPARED, backup, eventCount }),
              commit: () => save(record, { phase: PHASE.COMMITTED, outcome: response(record, 'moved', { cwd: record.target }) }),
            },
          })
        }, error => !signal.aborted && ['EBUSY', 'EAGAIN', 'DSM_MOVE_IN_PROGRESS'].includes(error.code))
      } catch (error) {
        if (record.phase === PHASE.COMMITTED) {
          logger(ctx, record, error)
        } else {
          if (record.phase === PHASE.PREPARED) await restoreSource(record)
          await save(record, {
            phase: PHASE.COMMITTED,
            outcome: response(record, 'failed', { cwd: record.source, code: error.code ?? 'MOVE_FAILED', error: error.message }),
          })
        }
      }
    }
    if (recovery && record.outcome?.state === 'moved') {
      await moves.restoreMoveMembership(record.id, record.target, record.targetProject)
    }
    return queueContinuation(record, signal)
  }

  function wake(agent, record) {
    if (!agent) return
    agent.wakeSessionInbox()
    void agent.whenIdle().then(async () => {
      if (record.phase !== PHASE.QUEUED || (await load(record.id))?.continuationId !== record.continuationId) return
      // Only retire a receipt once its continuation was admitted to the model.
      if (agent.session.snapshotEvents().some(event => event.type === 'user/message' && event.data.id === record.continuationId)) {
        await save(record, { phase: PHASE.DONE })
      }
    }).catch(error => logger(ctx, record, error))
  }

  function inProgress(id, targetProject) {
    const record = active.get(id)
    if (!record) return null
    if (record.targetProject !== targetProject) throw failure('MOVE_IN_PROGRESS', 'This session already has another destination.')
    return response(record, 'switching_after_step')
  }

  async function schedule({ agent, callId, directory, sourceProject, target, runtime, signal }) {
    const id = agent.id
    const existing = inProgress(id, target.id)
    if (existing) return existing
    if (!callId) throw failure('MOVE_CALL_ID', 'The host did not provide a tool call ID.')
    const requestId = sourceRequest(agent.session)
    const record = {
      id, requestId, continuationId: continuationId(id, requestId, callId), source: directory,
      sourceProject: sourceProject?.id ?? null, target: target.path, targetProject: target.id,
      phase: PHASE.APPROVED,
    }
    active.set(id, record)
    let saved = false
    try {
      const prior = await load(id)
      if (prior?.continuationId === record.continuationId && prior.outcome) {
        active.delete(id)
        return prior.outcome
      }
      signal.throwIfAborted()
      await save(record)
      saved = true
      signal.throwIfAborted()
      const completion = ctx.agents.scheduleSessionRelocation(agent, cutover => execute(record, cutover))
      runtime.concludeTurn()
      void completion.then(next => wake(next, record)).catch(async error => {
        logger(ctx, record, error)
        if (record.phase !== PHASE.APPROVED || ctx.agents.get(id) !== agent) return
        await save(record, { phase: PHASE.COMMITTED, outcome: response(record, 'failed', { cwd: directory, error: error.message }) })
        wake(await queueContinuation(record, new AbortController().signal), record)
      }).catch(error => logger(ctx, record, error)).finally(() => active.delete(id))
    } catch (error) {
      active.delete(id)
      if (saved) await save(record, { phase: PHASE.CANCELLED }).catch(storeError => logger(ctx, record, storeError))
      throw error
    }
    return response(record, 'switching_after_step')
  }

  if (journal && typeof sp.withSessionRelocationLease === 'function') {
    ctx.effect?.(() => {
      const signal = new AbortController()
      void (async () => {
        const files = await readdir(journal).catch(error => {
          if (error.code === 'ENOENT') return []
          throw error
        })
        for (const file of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
          signal.signal.throwIfAborted()
          const record = JSON.parse(await readFile(join(journal, file), 'utf8'))
          if (pathFor(record.id) !== join(journal, file) || ![PHASE.APPROVED, PHASE.PREPARED, PHASE.COMMITTED, PHASE.QUEUED].includes(record.phase)
            || active.has(record.id)) continue
          active.set(record.id, record)
          try {
            const agent = await ctx.agents.withSessionRelocation(record.id, {}, () => execute(record, signal.signal, true))
            wake(agent, record)
          } catch (error) {
            logger(ctx, record, error)
          } finally {
            active.delete(record.id)
          }
        }
      })().catch(error => { if (!signal.signal.aborted) logger(ctx, { id: 'startup' }, error) })
      return () => signal.abort()
    }, 'workbench: recover session relocations')
  }

  return {
    supports: agent => Boolean(journal && ctx.agents.supportsHotSessionRelocation?.(agent)),
    schedule, inProgress,
    async status(id) {
      const record = active.get(id)
      if (record) return response(record, 'switching_after_step')
      const persisted = await load(id)
      if (persisted?.phase === PHASE.COMMITTED) {
        return response(persisted, 'recovery_pending', { cwd: persisted.outcome.cwd })
      }
      return persisted?.outcome ?? null
    },
  }
}
