import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyProjects } from '../src/projects/index.js'

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-projects-'))
  const projectAPath = join(root, 'project-a')
  const projectBPath = join(root, 'project-b')
  await Promise.all([mkdir(projectAPath), mkdir(projectBPath)])
  const projects = [
    { id: 'project-a', title: 'Project A', path: projectAPath, sessionIds: ['s-a'] },
    { id: 'project-b', title: 'Project B', path: projectBPath, sessionIds: [] },
    { id: 'default-project', title: 'Default chat', path: root, sessionIds: ['s-default'] },
  ]
  const tools = new Map()
  const headers = new Map([
    ['s-a', { id: 's-a', cwd: projectAPath }],
    ['s-b', { id: 's-b', cwd: projectBPath }],
    ['s-default', { id: 's-default', cwd: root }],
  ])
  const created = []
  const renamed = []
  const moves = new Map()
  let defaultWorkspace
  let nextId = 0
  const ctx = {
    tools: { register: tool => tools.set(tool.name, tool) },
    workspaceRegistry: {
      list: () => projects,
      get: id => projects.find(project => project.id === id),
      create: async (path, title) => {
        const workspace = { id: `project-new-${++nextId}`, path, title, sessionIds: [] }
        projects.push(workspace)
        created.push(workspace)
        return workspace
      },
    },
    workspaceController: {
      initializeDefault: async () => defaultWorkspace ? { workspace: { workspaceId: defaultWorkspace.id } } : undefined,
      rename: async ({ workspaceId, title }) => {
        const workspace = projects.find(project => project.id === workspaceId)
        if (!workspace) return undefined
        workspace.title = title
        renamed.push({ workspaceId, title })
        return { workspace: { workspaceId, title, path: workspace.path } }
      },
    },
    sessions: { get: id => headers.has(id) ? { header: headers.get(id) } : undefined },
    sessionQuery: {
      filterSessions: async filters => [...headers.values()]
        .filter(header => filters.every(({ kind, values }) => values.includes(header[kind])))
        .map(header => ({ header })),
    },
    sessionController: {
      create: async ({ workspaceId, sessionId }) => {
        const header = { id: sessionId, cwd: projects.find(project => project.id === workspaceId).path }
        headers.set(sessionId, header)
        return { sessionId }
      },
      rename: async () => {},
      resolveAgent: async id => ({ agent: { session: { header: headers.get(id) }, followup: () => {} } }),
    },
  }
  const moveApi = {
    moveSession: async (id, target, { expectedCwd } = {}) => {
      const result = moves.get(id) || { moved: true }
      if (result.moved) {
        const oldPath = headers.get(id)?.cwd
        const old = projects.find(project => project.path === oldPath)
        if (old) old.sessionIds = old.sessionIds.filter(item => item !== id)
        target.sessionIds.push(id)
        headers.set(id, { ...headers.get(id), cwd: target.path })
      }
      return result
    },
    pendingMove: async id => moves.get(id)?.queued ? { targetPath: projects.find(project => project.path !== headers.get(id)?.cwd)?.path } : null,
  }
  applyProjects(ctx, moveApi)
  const exec = (name, args = {}, sessionId = 's-a') => tools.get(`workbench_${name}`).execute(args, {
    agent: { session: { header: headers.get(sessionId) } },
    signal: new AbortController().signal,
  })
  return { root, projects, projectAPath, projectBPath, headers, tools, created, renamed, moves, exec, setDefault: value => { defaultWorkspace = value } }
}

test('lists projects and the default chat', async t => {
  const state = await setup()
  t.after(() => rm(state.root, { recursive: true, force: true }))
  const listed = await state.exec('project_list')
  assert.equal(listed.current_project_id, 'project-a')
  assert.deepEqual(listed.projects, [
    { project_id: 'project-a', name: 'Project A', path: state.projectAPath },
    { project_id: 'project-b', name: 'Project B', path: state.projectBPath },
    { project_id: 'default-project', name: 'Default chat', path: state.root },
  ])
  assert.equal(listed.default_chat, null)
  state.setDefault(state.projects[2])
  assert.deepEqual((await state.exec('project_list')).default_chat, { project_id: 'default-project', name: 'Default chat', path: state.root })
})

test('creates and renames projects', async t => {
  const state = await setup()
  t.after(() => rm(state.root, { recursive: true, force: true }))
  const made = await state.exec('project_create', { name: 'New project', path: join(state.root, 'new-project') })
  assert.equal(made.created, true)
  assert.deepEqual(made.project, { project_id: 'project-new-1', name: 'New project', path: join(state.root, 'new-project') })
  const renamed = await state.exec('project_rename', { project_id: 'project-a', name: 'Renamed A' })
  assert.deepEqual(renamed, { project: { project_id: 'project-a', name: 'Renamed A', path: state.projectAPath } })
  assert.deepEqual(state.renamed, [{ workspaceId: 'project-a', title: 'Renamed A' }])
})

test('creates sessions in the selected project and routes defaults by workspace', async t => {
  const state = await setup()
  t.after(() => rm(state.root, { recursive: true, force: true }))
  const inProject = await state.exec('session_create', { project_id: 'project-b', message: 'hello', title: 'First chat' })
  assert.equal(inProject.project_id, 'project-b')
  assert.ok(inProject.session_id)
  assert.equal(inProject.state, 'queued')
  assert.ok(inProject.message_id)
  const inA = await state.exec('session_create', { project_id: 'project-a', message: 'from A' }, 's-a')
  assert.equal(inA.project_id, 'project-a')
  const inB = await state.exec('session_create', { project_id: 'project-b', message: 'from B' }, 's-b')
  assert.equal(inB.project_id, 'project-b')
})

test('reports immediate, queued and already-completed cross-workspace moves', async t => {
  const state = await setup()
  t.after(() => rm(state.root, { recursive: true, force: true }))
  const moved = await state.exec('session_move', { session_id: 's-a', target_project_id: 'project-b' })
  assert.deepEqual(moved, { session_id: 's-a', project_id: 'project-b', state: 'moved' })
  assert.equal((await state.exec('session_move_status', { session_id: 's-a', project_id: 'project-b' })).state, 'moved')

  state.moves.set('s-b', { queued: true, moved: false })
  const queued = await state.exec('session_move', { session_id: 's-b', target_project_id: 'project-a', source_project_id: 'project-b' })
  assert.deepEqual(queued, { session_id: 's-b', project_id: 'project-a', state: 'queued' })
  assert.equal((await state.exec('session_move_status', { session_id: 's-b', project_id: 'project-a' })).state, 'queued')

  state.moves.set('s-default', { already: true, moved: false })
  const already = await state.exec('session_move', { session_id: 's-default', target_project_id: 'project-a', source_project_id: 'default-project' })
  assert.deepEqual(already, { session_id: 's-default', project_id: 'project-a', state: 'already' })
  assert.equal((await state.exec('session_move_status', { session_id: 's-default', project_id: 'project-a' })).state, 'not_moved')
})
