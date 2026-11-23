// 回归：回收站「彻底删除」在 handle 世代（persistence.kind === 'session-handle'）
// 曾因 purgeFromTrash 引用了从未赋值的 locatedHeader 而稳定 500
// （ReferenceError: locatedHeader is not defined），且崩溃点在墓碑写入之后，
// 会话卡在「墓碑已立、文件还在」的半删除态：无法恢复、重试永远命中同一崩溃。
// 本文件在 0.1.3 形状的宿主假件上走完整 purge 路由，锁定修复后的行为：
// 路由 200、写所有权探测执行、会话目录被删、墓碑落盘、回收站条目移除。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Readable } from 'node:stream'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

let root
let trashDir
let logPath
let routes
let writeOpenCount
const fixtures = new Map()

async function createFixture(id) {
  const { projectKeyFor, encodeSegmentFor } = await import('../src/manager/handle-era-paths.js')
  const cwd = join(root, 'workspace')
  const sessionDir = join(root, projectKeyFor(cwd), encodeSegmentFor(id))
  const filename = join(sessionDir, 'session.v2.jsonl.zstd')
  await mkdir(sessionDir, { recursive: true })
  await writeFile(filename, 'zstd-frame-placeholder')
  fixtures.set(id, { filename, header: { id, cwd, createdAt: 1 } })
  return filename
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsm-purge-'))
  trashDir = join(root, 'trash')
  process.env.DSH_SESSIONS_MANAGER_TRASH_DIR = trashDir
  // 插件状态目录同样隔离，避免测试进程退出时打断原子写而漏下 .tmp
  process.env.DSH_SESSIONS_MANAGER_STAR_DIR = join(root, 'state')
  process.env.DSH_SESSIONS_MANAGER_PENDING_DIR = join(root, 'pending')
  await mkdir(trashDir, { recursive: true })
  const { apply } = await import(`../src/manager/index.js?purge=${Date.now()}`)
  routes = new Map()
  writeOpenCount = 0

  // 真实后端布局：root / projectKey(cwd) / encodeSegment(id) / session.v2.jsonl.zstd
  const sid = 'h-1'
  logPath = await createFixture(sid)
  const header = fixtures.get(sid).header
  const sp = {
    root,
    // list/stat 读磁盘现状：目录删除后官方视角必须看不到该会话。
    async list() {
      return [...fixtures.values()].filter(({ filename }) => existsSync(filename))
        .map(({ header }) => ({ header, revision: 'r1', sizeBytes: 22 }))
    },
    async stat(id) {
      return (await this.list()).find(({ header }) => header.id === id)
    },
    async open(id, access) {
      if (access === 'write') writeOpenCount++
      return {
        header: fixtures.get(id).header,
        inheritedEventCount: 0,
        async read(offset, length) { return [] },
        async close() {},
      }
    },
  }

  const domainState = { archivedSessionIds: [] }
  const ctx = {
    workspaceRegistry: { list: () => [], state: domainState, archiveSession: async () => {} },
    sessionPersistence: sp,
    sessionQuery: {
      readTitleSnapshots: async (ids) => ids.map(() => ({ status: 'fulfilled', value: { session: header, title: { title: 'Purge regression' } } })),
    },
    storageDomain: { get: () => ({ global: { get: () => domainState, set: async (next) => Object.assign(domainState, next) } }) },
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } },
    get: () => null,
    effect: (fn) => fn(),
  }
  apply(ctx)

  // 直接预置回收站索引：条目已在回收站，originalPath 指向真实日志。
  await writeFile(join(trashDir, 'index.json'), JSON.stringify({
    schemaVersion: 2,
    settings: { retentionDays: 0 },
    items: [{ sessionId: sid, title: 'Purge regression', originalPath: logPath, deletedAt: 1 }],
    purgedSessionIds: [],
  }))
})

after(async () => { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) })

async function call(path, body = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  let status = 200
  let text = ''
  const res = { writeHead: (value) => { status = value }, end: (value) => { text += value || '' } }
  await routes.get(path)(req, res)
  return { status, body: JSON.parse(text) }
}

test('handle-era purge completes: artifacts removed, tombstone persisted, trash item dropped', async () => {
  const { status, body } = await call('/archived-sessions/trash/purge', { sessionId: 'h-1' })
  assert.equal(status, 200, `purge route must succeed, got ${status}: ${body.error}`)
  assert.equal(body.purged, true)
  assert.equal(existsSync(logPath), false, 'session log directory must be physically removed')
  assert.ok(writeOpenCount >= 1, 'the write-ownership probe (open id,write) must run')
  const store = JSON.parse(readFileSync(join(trashDir, 'index.json'), 'utf8'))
  assert.ok(store.purgedSessionIds.includes('h-1'), 'purge tombstone must be persisted')
  assert.equal(store.items.length, 0, 'the trash entry must be gone after a successful purge')
})

test('batch purge records each selected or cascaded session once and includes cascade failures', async () => {
  const indexPath = join(trashDir, 'index.json')
  const store = JSON.parse(readFileSync(indexPath, 'utf8'))
  const parentPath = await createFixture('parent')
  const childPath = await createFixture('child')
  const otherPath = await createFixture('unrelated')
  store.items = [
    { sessionId: 'parent', deletedAt: 1, originalPath: parentPath },
    { sessionId: 'child', deletedAt: 1, cascadeFrom: 'parent', originalPath: childPath },
    { sessionId: 'blocked-child', deletedAt: 1, cascadeFrom: 'parent', originalPath: otherPath },
  ]
  await writeFile(indexPath, JSON.stringify(store))

  const { status, body } = await call('/archived-sessions/trash/purge-many', { sessionIds: ['parent', 'child'] })
  assert.equal(status, 200)
  assert.equal(body.purged, 2, JSON.stringify(body.results))
  assert.deepEqual(body.results.map(({ sessionId, ok }) => [sessionId, ok]), [
    ['parent', true], ['child', true], ['blocked-child', false],
  ])
  assert.equal(existsSync(otherPath), true, 'an unrelated log must remain intact')
})
