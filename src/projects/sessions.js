import { randomUUID } from 'node:crypto'
import { failure } from '../tools.js'
import { resolveProject } from './workspaces.js'

export async function scopeDirectory(ctx, caller, projectId, signal) {
  const directory = projectId === undefined
    ? caller.cwd
    : (await resolveProject(ctx, projectId, signal)).path
  if (!directory) throw failure('SESSION_SCOPE', 'Use a session with a working directory or explicitly select a project.')
  return directory
}

export function matchesDirectory(header, directory) {
  return header?.cwd === directory && header?.origin !== 'subagent'
}

export function assertSession(id, header, directory) {
  if (header?.id !== id || !matchesDirectory(header, directory)) {
    throw failure('SESSION_NOT_AVAILABLE', 'Session is unavailable in the selected project.')
  }
}

export async function findSession(ctx, id, directory, signal) {
  const live = ctx.sessions.get(id)
  if (live) {
    assertSession(id, live.header, directory)
    return live.header
  }
  const records = await ctx.sessionQuery.filterSessions([
    { kind: 'id', values: [id] },
    { kind: 'cwd', values: [directory] },
  ], signal)
  signal.throwIfAborted()
  const header = records.find(record => record.header.id === id)?.header
  assertSession(id, header, directory)
  return header
}

export function relay(sender, text, projectId) {
  const project = projectId ? ` (project_id: ${projectId})` : ''
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    source: Object.freeze({ kind: 'agent-message', form: 'relay', senderSessionId: sender }),
    content: Object.freeze([
      Object.freeze({ type: 'text', text: `Session ${sender}${project} sent a message: ` }),
      Object.freeze({ type: 'text', text }),
    ]),
  })
}

export function senderProject(ctx, caller, targetDirectory) {
  return caller.cwd !== targetDirectory
    ? ctx.workspaceRegistry.list().find(project => project.path === caller.cwd)?.id
    : undefined
}
