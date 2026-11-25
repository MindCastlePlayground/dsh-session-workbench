import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lstat, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreparedWorkspace, prepareWorkspace } from '../src/projects/workspaces.js'

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-create-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projects = []
  const created = []
  const ctx = { workspaceRegistry: {
    list: () => projects,
    create: async (path, title) => {
      const project = { id: `p-${created.length + 1}`, path, title }
      projects.push(project)
      created.push(project)
      return project
    },
  } }
  return { root, projects, created, ctx }
}

test('prepares without writes and creates only when execution is authorized', async t => {
  const { root, ctx, created } = await setup(t)
  const target = join(root, 'parent', 'project')
  const plan = await prepareWorkspace(ctx, 'Project', target)
  assert.equal(created.length, 0)
  await assert.rejects(lstat(target), { code: 'ENOENT' })

  const result = await createPreparedWorkspace(ctx, plan, new AbortController().signal)
  assert.equal(result.created, true)
  assert.equal(result.project.path, await realpath(target))
  assert.equal(created.length, 1)
})

test('returns the same project idempotently by name and canonical path', async t => {
  const { root, ctx, created } = await setup(t)
  const target = join(root, 'project')
  const first = await createPreparedWorkspace(ctx, await prepareWorkspace(ctx, 'Same', target), new AbortController().signal)
  const secondPlan = await prepareWorkspace(ctx, 'Same', target)
  assert.deepEqual(secondPlan.existing, first.project)
  assert.deepEqual(await createPreparedWorkspace(ctx, secondPlan, new AbortController().signal), { project: first.project, created: false })
  assert.equal(created.length, 1)
})

test('rejects an ancestor symlink or junction retargeted after approval before creating files', async t => {
  const { root, ctx, created } = await setup(t)
  const parent = join(root, 'parent')
  const redirected = join(root, 'redirected')
  await Promise.all([mkdir(parent), mkdir(redirected)])
  const target = join(parent, 'project')
  const plan = await prepareWorkspace(ctx, 'Project', target)

  await rm(parent, { recursive: true })
  await symlink(redirected, parent, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(createPreparedWorkspace(ctx, plan, new AbortController().signal), { code: 'PROJECT_PATH_CHANGED' })
  await assert.rejects(lstat(join(redirected, 'project')), { code: 'ENOENT' })
  assert.equal(created.length, 0)
})
