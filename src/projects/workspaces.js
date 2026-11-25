import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
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

// Read-only planning. Calling this never creates a directory or registry entry.
export async function prepareWorkspace(ctx, name, path) {
  if (path !== undefined && (!isAbsolute(path) || parse(path).root.length < (process.platform === 'win32' ? 3 : 1))) {
    throw failure('PROJECT_PATH', 'Use a fully qualified local directory path for a project.')
  }
  let requestedPath = resolve(path ?? join(managedRoot(), 'projects', projectFolder(name)))
  let targetPath = requestedPath
  let canonicalPath = await canonicalDestination(targetPath)
  let existing = ctx.workspaceRegistry.list().find(item => item.path === canonicalPath)
  if (existing) {
    if (existing.title === name) {
      return Object.freeze({ existing: projectView(existing), requestedPath, targetPath, canonicalPath, name })
    }
    if (path !== undefined) {
      throw failure('PROJECT_PATH_IN_USE', `That directory belongs to project "${existing.id}". Use workbench_project_rename to change its name.`)
    }
    targetPath += `-${randomUUID().slice(0, 8)}`
    canonicalPath = await canonicalDestination(targetPath)
    existing = ctx.workspaceRegistry.list().find(item => item.path === canonicalPath)
  }
  const sameName = ctx.workspaceRegistry.list().find(item => item.title === name)
  if (sameName) throw failure('PROJECT_NAME_IN_USE', `Project name "${name}" is already in use.`)
  if (existing) throw failure('PROJECT_PATH_IN_USE', `That directory belongs to project "${existing.id}".`)
  return Object.freeze({ existing: null, requestedPath, targetPath, canonicalPath, name })
}

// Must only be called after the caller's approval succeeds.
export async function createPreparedWorkspace(ctx, plan, signal) {
  if (plan.existing) return { project: plan.existing, created: false }
  signal.throwIfAborted()
  const current = await canonicalDestination(plan.targetPath)
  if (current !== plan.canonicalPath) {
    throw failure('PROJECT_PATH_CHANGED', 'The project directory resolved to a different location after approval. Prepare the request again.')
  }
  const sameName = ctx.workspaceRegistry.list().find(item => item.title === plan.name)
  if (sameName) throw failure('PROJECT_NAME_IN_USE', `Project name "${plan.name}" is already in use.`)
  const byCanonical = ctx.workspaceRegistry.list().find(item => item.path === current)
  if (byCanonical) {
    if (byCanonical.title === plan.name) return { project: projectView(byCanonical), created: false }
    throw failure('PROJECT_PATH_IN_USE', `That directory belongs to project "${byCanonical.id}".`)
  }
  signal.throwIfAborted()
  await mkdir(plan.canonicalPath, { recursive: true })
  // Check again after mkdir to catch a final-component symlink/junction swap.
  const afterMkdir = await realpath(plan.targetPath)
  if (afterMkdir !== plan.canonicalPath) {
    throw failure('PROJECT_PATH_CHANGED', 'The project directory changed while it was being created. No project was registered.')
  }
  const project = await ctx.workspaceRegistry.create(afterMkdir, plan.name)
  if (project.title !== plan.name || project.path !== afterMkdir) {
    throw failure('PROJECT_PATH_IN_USE', `That directory was registered as project "${project.id}" with another name.`)
  }
  return { project: projectView(project), created: true }
}

// Backward-compatible direct operation for existing callers without approval UI.
export async function createWorkspace(ctx, name, path, signal) {
  const plan = await prepareWorkspace(ctx, name, path)
  return createPreparedWorkspace(ctx, plan, signal)
}

async function canonicalDestination(path) {
  let current = resolve(path)
  const suffix = []
  while (true) {
    try {
      const resolved = await realpath(current)
      const info = await stat(current)
      // realpath/stat follow symlinks; keeping the returned canonical path is intentional.
      if (!info.isDirectory()) {
        throw failure('PROJECT_PATH', 'The project path must be a directory.')
      }
      return resolve(resolved, ...suffix.reverse())
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(current)
      if (parent === current) throw failure('PROJECT_PATH', 'Could not resolve a parent directory for the project path.')
      suffix.push(current.slice(parent.length + (current[parent.length] === '/' || current[parent.length] === '\\' ? 1 : 0)))
      current = parent
    }
  }
}

async function byPath(ctx, path) {
  const canonical = await canonicalDestination(path)
  return ctx.workspaceRegistry.list().find(item => item.path === canonical)
}

function projectFolder(name) {
  // A renamed project keeps its real working directory. Newly created projects get their own directory.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'
  const digest = createHash('sha256').update(name).digest('hex').slice(0, 12)
  return `${slug}-${digest}`
}
