import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { failure } from '../tools.js'

export const DEFAULT_PROJECT = 'default'
const CHAT_NAME = '默认聊天'

function managedRoot() {
  return resolve(process.env.DSH_HOME || join(homedir(), '.dsh'), 'workbench')
}

export function projectView(project) {
  return { project_id: project.id, name: project.title, path: project.path }
}

export async function defaultWorkspace(ctx, signal, create = false) {
  const native = await ctx.workspaceController.initializeDefault(signal)
  signal.throwIfAborted()
  if (native?.workspace) return ctx.workspaceRegistry.get(native.workspace.workspaceId)
  const path = join(managedRoot(), 'chat')
  const existing = await byPath(ctx, path)
  if (existing || !create) return existing
  signal.throwIfAborted()
  await mkdir(path, { recursive: true })
  return ctx.workspaceRegistry.create(path, CHAT_NAME)
}

export async function resolveProject(ctx, id, signal, createDefault = false) {
  const project = id === DEFAULT_PROJECT
    ? await defaultWorkspace(ctx, signal, createDefault)
    : ctx.workspaceRegistry.get(id)
  if (!project) throw failure('PROJECT_NOT_FOUND', `Project "${id}" is unavailable. Use workbench_project_list to find project IDs.`)
  return project
}

export async function createWorkspace(ctx, name, path, signal) {
  if (path !== undefined && (!isAbsolute(path) || parse(path).root.length < (process.platform === 'win32' ? 3 : 1))) {
    throw failure('PROJECT_PATH', 'Use a fully qualified local directory path for a project.')
  }
  let requested = path ?? join(managedRoot(), 'projects', projectFolder(name))
  const sameName = ctx.workspaceRegistry.list().find(item => item.title === name)
  if (path === undefined && sameName) return { project: projectView(sameName), created: false }
  const existing = await byPath(ctx, requested)
  if (existing) {
    if (existing.title === name) return { project: projectView(existing), created: false }
    if (path !== undefined) {
      throw failure('PROJECT_PATH_IN_USE', `That directory belongs to project "${existing.id}". Use workbench_project_rename to change its name.`)
    }
    requested += `-${randomUUID().slice(0, 8)}`
  }
  if (sameName) throw failure('PROJECT_NAME_IN_USE', `Project name "${name}" is already in use.`)
  signal.throwIfAborted()
  await mkdir(requested, { recursive: true })
  const project = await ctx.workspaceRegistry.create(requested, name)
  if (project.title !== name) {
    throw failure('PROJECT_PATH_IN_USE', `That directory was registered as project "${project.id}" with another name.`)
  }
  return { project: projectView(project), created: true }
}

async function byPath(ctx, path) {
  let canonical
  try {
    canonical = await realpath(path)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
  return ctx.workspaceRegistry.list().find(item => item.path === canonical)
}

function projectFolder(name) {
  // A renamed project keeps its real working directory. Newly created projects get their own directory.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'
  const digest = createHash('sha256').update(name).digest('hex').slice(0, 12)
  return `${slug}-${digest}`
}
