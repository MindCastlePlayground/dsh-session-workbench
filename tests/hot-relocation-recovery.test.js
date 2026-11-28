import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { deriveSessionDir, encodeSegmentFor } from '../src/manager/handle-era-paths.js'
import { createHotRelocation } from '../src/projects/hot-relocation.js'

async function recover(t, phase, { admitted = false, externalWrite = false } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'workbench-hot-move-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const id = 'session-test'
  const root = join(home, 'sessions')
  const source = join(home, 'source')
  const target = join(home, 'target')
  const sourceLog = deriveSessionDir(root, source, id)
  const targetLog = deriveSessionDir(root, target, id)
  const backup = encodeSegmentFor(id) + '-1-2'
  const backupDir = join(home, 'sessions-manager-move-backup', backup)
  const journal = join(home, basename(root) + '.workbench-relocation')
  const continuationId = 'continuation-test'
  const idHash = createHash('sha256').update(JSON.stringify([id, '', ''])).digest('hex')
  const recordPath = join(journal, idHash + '.json')
  const outcome = { session_id: id, project_id: 'target', state: 'moved', cwd: target }
  const record = { id, phase, source, target, sourceProject: 'source', targetProject: 'target',
    continuationId, requestId: 'test', backup, eventCount: 5, ...(phase !== 'prepared' && { outcome }) }
  for (const dir of [source, target, targetLog, backupDir, journal]) await mkdir(dir, { recursive: true })
  await writeFile(join(backupDir, 'history'), 'preserved history')
  await writeFile(join(targetLog, 'history'), 'partially copied history')
  await writeFile(recordPath, JSON.stringify(record))
  const actions = []
  const errors = []
  const queued = []
  const persisted = admitted ? [{ type: 'user/message', data: { id: continuationId } }] : []
  const ctx = {
    get: () => ({
      root, withSessionRelocationLease() {},
      stat: async () => ({ header: { cwd: target }, eventCount: externalWrite ? 6 : 3 }),
    }),
    agents: { withSessionRelocation: async (_id, _options, task) => task() },
    workspaceRegistry: { get: () => ({ id: 'target', path: target }) },
    sessionController: { resolveAgent: async () => ({ agent: {
      session: { header: { cwd: target }, snapshotEvents: () => persisted },
      inbox: { nextTurn: queued },
      queueSessionRelocation: async item => { queued.push(item) },
      wakeSessionInbox: () => { actions.push('wake') },
      whenIdle: async () => {},
    } }) },
    logger: { warn: error => errors.push(error) },
    effect: start => { t.after(start()) },
  }
  createHotRelocation(ctx, {
    restoreMoveMembership: async (_id, _cwd, project) => { actions.push(project) },
    moveSession: async (_id, _target, { transaction }) => {
      actions.push('move')
      assert.equal(await readFile(join(sourceLog, 'history'), 'utf8'), 'preserved history')
      await assert.rejects(readFile(join(targetLog, 'history')), { code: 'ENOENT' })
      await transaction.commit()
    },
  })
  return { read: async () => JSON.parse(await readFile(recordPath, 'utf8')), actions, errors, queued, backupDir, targetLog }
}

async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await delay(10)
  }
  assert.fail('Recovery did not settle')
}

test('restores source backup before retrying a prepared move and queues one continuation', async t => {
  const state = await recover(t, 'prepared')
  await until(() => state.actions.includes('wake') || state.errors.length > 0)
  assert.deepEqual(state.errors, [])
  assert.deepEqual(state.actions, ['source', 'move', 'target', 'wake'])
  assert.equal(state.queued.length, 1)
  assert.match(state.queued[0].content[0].text, /"state":"moved"/)
})

test('preserves both copies when another writer appended to an uncommitted destination', async t => {
  const state = await recover(t, 'prepared', { externalWrite: true })
  await until(() => state.errors.length > 0)
  assert.match(state.errors[0], /another host/)
  assert.deepEqual(state.actions, [])
  assert.equal(await readFile(join(state.backupDir, 'history'), 'utf8'), 'preserved history')
  assert.equal(await readFile(join(state.targetLog, 'history'), 'utf8'), 'partially copied history')
})

test('reopens a committed destination without moving again or replaying an admitted continuation', async t => {
  const state = await recover(t, 'committed', { admitted: true })
  await until(async () => (await state.read()).phase === 'done' || state.errors.length > 0)
  assert.deepEqual(state.errors, [])
  assert.deepEqual(state.actions, ['target'])
  assert.deepEqual(state.queued, [])
})
