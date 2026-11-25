import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createDiskIndex } from '../src/search/disk-index.js'

function fixture(recordState, reads, beforeCatalog, beforeRead) {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.search-index-test-'))
  const filename = path.join(directory, 'index.sqlite')
  const catalog = async () => {
    await beforeCatalog?.()
    return recordState.map(({ id, revision, deleted, text }) => ({
      header: { id, createdAt: 10, cwd: '/test' }, revision, deleted, text,
    }))
  }
  const config = {
    filename,
    catalog,
    readLive: () => undefined,
    async read(record) {
      await beforeRead?.()
      reads.set(record.header.id, (reads.get(record.header.id) || 0) + 1)
      return {
        id: record.header.id,
        createdAt: record.header.createdAt,
        title: '',
        questions: [{ parts: [{ text: record.text ?? 'searchable ' + record.header.id, files: [] }], paragraphs: [] }],
      }
    },
  }
  return { directory, filename, index: createDiskIndex(config), reopen: () => createDiskIndex(config) }
}

test('status is lazy and does not create the index file', async (t) => {
  const state = [{ id: 'one', revision: 1, deleted: false }]
  const fixtureState = fixture(state, new Map())
  t.after(() => fs.rmSync(fixtureState.directory, { recursive: true, force: true }))

  assert.equal(fs.existsSync(fixtureState.filename), false)
  assert.equal(fixtureState.index.activity().progress.active, false)
  assert.equal((await fixtureState.index.status()).sessions, 0)
  assert.equal(fs.existsSync(fixtureState.filename), false)

  await fixtureState.index.warm()
  assert.equal(fs.existsSync(fixtureState.filename), true)
})

test('background indexing is single-flight and a full index keeps committed and deleted rows searchable', async (t) => {
  const limit = 1024 * 1024
  const records = [{ id: 'one', revision: 1 }]
  const fixtureState = fixture(records, new Map())
  const { directory, filename, index, reopen } = fixtureState
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  await index.warm()
  await index.setCapacity(limit)
  records[0].deleted = true
  records.push({ id: 'large', revision: 1, text: 'large '.repeat(200000) })

  assert.equal(index.start().progress.active, true)
  const running = index.warm()
  assert.equal(index.warm(), running)
  await assert.rejects(index.setCapacity(null), { code: 'index-busy' })
  await assert.rejects(running, { code: 'index-full' })

  const status = await index.status()
  assert.equal(status.progress.active, false)
  assert.equal(status.error.code, 'index-full')
  assert.equal(status.maxBytes, limit)
  assert.equal(status.dbBytes, fs.statSync(filename).size)
  assert.ok(status.dbBytes <= limit)
  const snapshot = await index.snapshot()
  assert.equal((await collect(snapshot.scan(['searchable'], true)))[0].deleted, true)
  assert.deepEqual(await collect(snapshot.scan(['large'], true)), [])
  const reopened = await reopen().status()
  assert.equal(reopened.maxBytes, limit)
  assert.equal(reopened.error.code, 'index-full')
  await index.setCapacity(null)
  await index.warm()
  assert.equal((await index.status()).sessions, 2)
  await assert.rejects(index.setCapacity(limit), { code: 'index-capacity-below-size' })
  assert.equal((await reopen().status()).maxBytes, null)
})

test('incremental warm reuses unchanged persisted sessions', async (t) => {
  const state = [
    { id: 'one', revision: 1, deleted: false },
    { id: 'two', revision: 1, deleted: false },
  ]
  const reads = new Map()
  const fixtureState = fixture(state, reads)
  t.after(() => fs.rmSync(fixtureState.directory, { recursive: true, force: true }))

  await fixtureState.index.warm()
  assert.deepEqual(Object.fromEntries(reads), { one: 1, two: 1 })

  state[1].revision = 2
  await fixtureState.index.warm()
  assert.deepEqual(Object.fromEntries(reads), { one: 1, two: 2 })
})

test('partial snapshot serves committed rows while an incremental warm is pending', async (t) => {
  const state = [{ id: 'one', revision: 1, deleted: false }]
  let catalogGate
  let catalogEntered
  const fixtureState = fixture(state, new Map(), async () => {
    if (catalogGate) {
      catalogEntered()
      await catalogGate
    }
  })
  t.after(() => fs.rmSync(fixtureState.directory, { recursive: true, force: true }))
  await fixtureState.index.warm()
  state.push({ id: 'two', revision: 1, deleted: false })
  let release
  catalogGate = new Promise(resolve => { release = resolve })
  const entered = new Promise(resolve => { catalogEntered = resolve })
  const pending = fixtureState.index.warm()
  await entered
  try {
    const snapshot = await fixtureState.index.snapshot({ partial: true })
    assert.equal(fixtureState.index.activity().progress.active, true)
    assert.equal(snapshot.indexed, 1)
    assert.deepEqual((await collect(snapshot.scan(['searchable'], false))).map(row => row.id), ['one'])
  } finally {
    release()
    await pending
  }
  assert.equal((await fixtureState.index.snapshot()).indexed, 2)
})

test('first-build search can read an empty partial snapshot before the first batch commits', async (t) => {
  const gate = Promise.withResolvers()
  const entered = Promise.withResolvers()
  const state = [{ id: 'one', revision: 1, deleted: false }]
  const { directory, index } = fixture(state, new Map(), undefined, async () => {
    entered.resolve()
    await gate.promise
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const query = index.snapshot({ partial: true })
  await entered.promise
  try {
    const snapshot = await query
    assert.equal(snapshot.indexed, 0)
    assert.equal(index.activity().progress.active, true)
  } finally {
    gate.resolve()
    await index.warm()
  }
  assert.equal((await index.snapshot()).indexed, 1)
})

test('deleted snapshots stay searchable by opt-in and return when restored', async (t) => {
  const state = [{ id: 'one', revision: 1, deleted: false }]
  const fixtureState = fixture(state, new Map())
  t.after(() => fs.rmSync(fixtureState.directory, { recursive: true, force: true }))

  await fixtureState.index.warm()
  state[0].deleted = true
  await fixtureState.index.warm()
  let snapshot = await fixtureState.index.snapshot()
  assert.deepEqual(await collect(snapshot.scan(['searchable'], false)), [])
  assert.equal((await collect(snapshot.scan(['searchable'], true))).length, 1)

  state[0].deleted = false
  await fixtureState.index.warm()
  snapshot = await fixtureState.index.snapshot()
  const restored = await collect(snapshot.scan(['searchable'], false))
  assert.equal(restored.length, 1)
  assert.equal(restored[0].deleted, false)
})

async function collect(iterable) {
  const items = []
  for await (const item of iterable) items.push(item)
  return items
}
