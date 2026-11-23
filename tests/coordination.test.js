import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCoordination } from '../src/coordination/index.js'

function session(id, cwd = 'C:/work', origin) {
  const events = []
  const header = { id, cwd, origin, createdAt: 1 }
  return { header, events, snapshotEvents: () => events, inheritedEventCount: 0 }
}

function agent(session, status = 'idle') {
  const inbox = { nextTurn: [], nextStep: [] }
  return { id: session.header.id, session, status, inbox, followup: message => inbox.nextTurn.push(message) }
}

function setup() {
  const caller = agent(session('caller'))
  const target = agent(session('target'))
  const cold = session('cold')
  const other = session('other', 'D:/work')
  const child = session('child', 'C:/work', 'subagent')
  const records = [caller.session, target.session, cold, other, child]
  const agents = new Map([caller, target].map(value => [value.id, value]))
  const tools = new Map()
  const archived = []
  applyCoordination({
    tools: { register: tool => tools.set(tool.name, tool) },
    agents: { get: id => agents.get(id) },
    sessions: { get: id => agents.get(id)?.session },
    sessionQuery: {
      filterSessions: async filters => records.filter(({ header }) =>
        filters.every(({ kind, values }) => values.includes(header[kind])))
        .map(({ header }) => ({ header })),
      readSession: async id => {
        const found = records.find(({ header }) => header.id === id)
        return { session: found.header, events: found.events, inheritedEventCount: found.inheritedEventCount }
      },
    },
    workspaceRegistry: { archivedSessionIds: archived },
    sessionController: { resolveAgent: async id => {
      if (id === cold.header.id && !agents.has(id)) agents.set(id, agent(cold))
      return { agent: agents.get(id) }
    } },
  })
  const run = (name, args, from = caller, signal = new AbortController().signal) =>
    tools.get(`workbench_session_${name}`).execute(args, { agent: from, signal })
  return { run, caller, target, cold, archived }
}

function text(text) {
  return { type: 'text', text }
}

test('lists independent workspace peers and rejects self, children and unrelated directories', async () => {
  const { run } = setup()
  const result = await run('list', { limit: 1 })
  assert.equal(result.self_session_id, 'caller')
  assert.deepEqual(result.sessions.map(item => item.session_id), ['target'])
  assert.deepEqual((await run('list', { offset: result.next_offset })).sessions.map(item => item.session_id), ['cold'])
  for (const session_id of ['caller', 'other', 'child']) {
    await assert.rejects(run('status', { session_id }), { code: 'SESSION_NOT_AVAILABLE' })
  }
  await assert.rejects(run('list', {}, agent(session('unknown', ''))), { code: 'SESSION_SCOPE' })
})

test('resumes a cold recipient, queues an attributed message, and rejects archived delivery', async () => {
  const { run, target, archived } = setup()
  const receipt = await run('send', { session_id: 'target', message: 'hello' })
  const [message] = target.inbox.nextTurn
  assert.deepEqual(receipt, { session_id: 'target', message_id: message.id, state: 'queued' })
  assert.equal(message.source.senderSessionId, 'caller')
  assert.equal(message.content.at(-1).text, 'hello')
  assert.equal((await run('status', { session_id: 'cold' })).state, 'inactive')
  await run('send', { session_id: 'cold', message: 'wake up' })
  assert.equal((await run('status', { session_id: 'cold' })).pending_messages, 1)
  archived.push('target')
  await assert.rejects(run('send', { session_id: 'target', message: 'blocked' }), { code: 'SESSION_ARCHIVED' })
  assert.equal((await run('status', { session_id: 'target' })).state, 'archived')
  assert.equal(target.inbox.nextTurn.length, 1)
})

test('pages public text while skipping inherited, runtime context, reasoning and tool records', async () => {
  const { run, cold } = setup()
  cold.inheritedEventCount = 1
  cold.events.push(
    { type: 'user/message', seq: 0, data: { source: { kind: 'user' }, content: [text('parent')] } },
    { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [text('question')] } },
    { type: 'user/message', seq: 2, data: { source: { kind: 'runtime-context' }, content: [text('private')] } },
    { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'thinking', text: 'private' }, text('answer')] } } },
    { type: 'tool/result', seq: 4, data: { content: [text('private')] } },
  )
  const first = await run('history', { session_id: 'cold', limit: 1 })
  assert.deepEqual(first.messages, [{ seq: 3, role: 'assistant', text: 'answer' }])
  assert.equal(first.next_before_seq, 3)
  const second = await run('history', { session_id: 'cold', before_seq: first.next_before_seq })
  assert.deepEqual(second.messages, [{ seq: 1, role: 'user', text: 'question' }])
  assert.equal(second.next_before_seq, null)
})

test('a receipt waits for the turn that admitted its message and preserves its outcome', async () => {
  const { run, caller, target } = setup()
  const session_id = 'target'
  const { message_id } = await run('send', { session_id, message: 'please review' })
  const args = { session_id, message_id, timeout_ms: 1 }
  const { events } = target.session
  const add = (type, data) => events.push({ type, data, seq: events.length })
  add('turn/start', { turn: 1 })
  add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal((await run('wait', args)).outcome, 'timeout')
  target.status = 'running'
  add('turn/start', { turn: 2 })
  add('user/message', target.inbox.nextTurn.shift())
  assert.equal((await run('wait', args)).outcome, 'timeout')
  add('turn/end', { turn: 2, reason: { kind: 'aborted' } })
  assert.deepEqual(await run('wait', args), {
    session_id, message_id, outcome: 'settled', message_seq: 3,
    turn: 2, turn_end_seq: 4, turn_outcome: 'aborted',
  })
  caller.status = 'idle'
  assert.equal((await run('wait', { ...args, session_id: 'caller' }, target)).outcome, 'unconfirmed')
})

test('cancels a wait and releases the dependency when the caller aborts', async () => {
  const { run, caller, target } = setup()
  caller.status = target.status = 'running'
  const control = new AbortController()
  const waiting = run('wait', { session_id: 'target' }, caller, control.signal)
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(run('wait', { session_id: 'caller' }, target), { code: 'SESSION_WAIT_CYCLE' })
  control.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  caller.status = 'idle'
  assert.equal((await run('wait', { session_id: 'caller' }, target)).outcome, 'idle')
})
