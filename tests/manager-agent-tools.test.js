import test from 'node:test'
import assert from 'node:assert/strict'
import { registerManagerAgentTools } from '../src/manager/agent-tools.js'

function harness(routeHandlers, options) {
  const tools = new Map()
  const ctx = { tools: { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name) } } }
  registerManagerAgentTools(ctx, routeHandlers, options)
  return tools
}

function caller(origin) { return { session: { header: { id: 'agent-1', origin } } } }
function run(tools, name, args, agent = caller('user')) {
  return tools.get(`workbench_manager_${name}`).execute(args, { agent, signal: new AbortController().signal })
}

test('exposes only routes present in the supplied allowlist and returns parsed route response', async () => {
  let gotMethod
  let gotBody
  const tools = harness({
    '/archived-sessions/sessions': async (req, res) => {
      gotMethod = req[Symbol.asyncIterator] ? 'GET/stream' : 'GET'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ items: [{ sessionId: 's1' }] }))
    },
    '/archived-sessions/archive': async (req, res) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      gotBody = JSON.parse(Buffer.concat(chunks).toString())
      res.writeHead(200)
      res.end('{"ok":true}')
    },
  })
  assert.deepEqual((await run(tools, 'sessions', {})).data.items[0], { sessionId: 's1' })
  assert.equal(gotMethod, 'GET/stream')
  assert.deepEqual((await run(tools, 'archive', { sessionId: 's1' }).catch(e => e.code)), 'APPROVAL_UNAVAILABLE')
  assert.equal(tools.has('workbench_manager_move'), false)
  assert.equal(gotBody, undefined)
})

test('destructive calls use the approval callback with the exact route and audited request', async () => {
  let approval
  let routeCalled = false
  const tools = harness({
    '/archived-sessions/trash/purge': async (req, res) => {
      routeCalled = true
      res.writeHead(200)
      res.end('{"ok":true,"purged":true}')
    },
  }, { approve: async (...args) => { approval = args; return true } })
  const value = await run(tools, 'trash_purge', { sessionId: 's-2' })
  assert.equal(value.data.purged, true)
  assert.equal(routeCalled, true)
  assert.equal(approval[1].route, '/archived-sessions/trash/purge')
  assert.deepEqual(approval[1].sessionIds, ['s-2'])
  assert.deepEqual(approval[1].request, { sessionId: 's-2' })
})

test('denied approval prevents route execution and subagents cannot invoke tools', async () => {
  let called = false
  const tools = harness({
    '/archived-sessions/delete': async (_req, res) => { called = true; res.writeHead(200); res.end('{}') },
  }, { approve: async () => false })
  await assert.rejects(run(tools, 'delete', { sessionId: 's1' }), { code: 'APPROVAL_DENIED' })
  assert.equal(called, false)
  await assert.rejects(run(tools, 'delete', { sessionId: 's1' }, caller('subagent')), { code: 'SESSION_SCOPE' })
})

test('rejects unknown input and surfaces HTTP route failures with response details', async () => {
  const tools = harness({
    '/archived-sessions/details': async (_req, res) => { res.writeHead(404); res.end('{"code":"NO_SESSION","error":"missing"}') },
  })
  await assert.rejects(run(tools, 'details', { sessionId: 's1', extra: true }), { code: 'INVALID_ARGS' })
  await assert.rejects(run(tools, 'details', { sessionId: 's1' }), (error) => {
    assert.equal(error.code, 'NO_SESSION')
    assert.equal(error.status, 404)
    assert.deepEqual(error.response, { code: 'NO_SESSION', error: 'missing' })
    return true
  })
})
