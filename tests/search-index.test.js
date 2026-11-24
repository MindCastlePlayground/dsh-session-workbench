import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createDiskIndex } from '../src/search/disk-index.js'

function fixture(recordState, reads) {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.search-index-test-'))
  const filename = path.join(directory, 'index.sqlite')
  const catalog = async () => recordState.map(({ id, revision, deleted }) => ({
    header: { id, createdAt: 10, cwd: '/test' }, revision, deleted,
  }))
  const index = createDiskIndex({
    filename,
    catalog,
    readLive: () => undefined,
    async read(record) {
      reads.set(record.header.id, (reads.get(record.header.id) || 0) + 1)
      return {
        id: record.header.id,
        createdAt: record.header.createdAt,
        title: '',
        questions: [{ parts: [{ text: 'searchable ' + record.header.id, files: [] }], paragraphs: [] }],
      }
    },
  })
  return { directory, filename, index }
}

test('status is lazy and does not create the index file', async (t) => {
  const state = [{ id: 'one', revision: 1, deleted: false }]
  const fixtureState = fixture(state, new Map())
  t.after(() => fs.rmSync(fixtureState.directory, { recursive: true, force: true }))

  assert.equal(fs.existsSync(fixtureState.filename), false)
  assert.equal(fixtureState.index.status().sessions, 0)
  assert.equal(fs.existsSync(fixtureState.filename), false)

  await fixtureState.index.warm()
  assert.equal(fs.existsSync(fixtureState.filename), true)
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
