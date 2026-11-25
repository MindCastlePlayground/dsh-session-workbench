import { requestApproval } from './approval.js'
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { failure, MESSAGE, PROJECT_ID, register, SESSION_ID } from '../tools.js'
import { assertSession, findSession, relay, scopeDirectory, senderProject } from './sessions.js'
import { createPreparedWorkspace, defaultWorkspace, prepareWorkspace, projectView, resolveProject } from './workspaces.js'
import { createHotRelocation } from './hot-relocation.js'

export const projectServices = ['tools', 'agents', 'sessions', 'sessionQuery', 'sessionController', 'workspaceRegistry', 'workspaceController']

const NAME = { type: 'string', minLength: 1, maxLength: 120 }
const PATH = { type: 'string', minLength: 1, maxLength: 4096, description: 'Absolute path on the DSH host. Omit for a managed directory.' }

export function applyProjects(ctx, moves) {
  const hot = createHotRelocation(ctx, moves)
  let projectMutations = Promise.resolve()
  function mutate(task, signal) {
    const operation = projectMutations.then(() => {
      signal.throwIfAborted()
      return task()
    })
    projectMutations = operation.catch(() => {})
    return operation
  }

  register(ctx, 'project_list',
    'List DSH projects and the default chat workspace. Use returned project IDs in session tools, or "default" for default chat.',
    {}, [], async (_args, caller, signal) => {
      const defaultChat = await defaultWorkspace(ctx, signal)
      const projects = ctx.workspaceRegistry.list()
      return {
        current_project_id: projects.find(project => project.path === caller.cwd)?.id ?? null,
        default_chat: defaultChat ? projectView(defaultChat) : null,
        projects: projects.map(projectView),
      }
    })

  register(ctx, 'project_create',
    'Create a named DSH project. Supply an absolute project directory or omit path to have the workbench allocate a directory.',
    { name: NAME, path: PATH }, ['name'],
    async ({ name, path }, _caller, signal, { agent, callId }) => {
      const plan = await prepareWorkspace(ctx, name.trim(), path?.trim())
      if (!plan.existing && path !== undefined) {
        const policy = ctx.get?.('sandboxPolicy')?.resolve({ session: agent.session })
        const inside = policy?.mode === 'workspace-write' && [policy.workspaceRoot, ...(policy.additionalWritableRoots ?? [])]
          .some(root => {
            if (!root) return false
            const child = relative(root, plan.canonicalPath)
            return child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)
          })
        if (policy?.mode !== 'danger-full-access' && !inside) {
          const allowed = await requestApproval(ctx, agent, {
            toolName: 'workbench_project_create', callId, signal,
            reason: 'Create a DSH project in an external directory',
            displayReason: {
              en: `Create or open folder for project "${plan.name}" at ${plan.canonicalPath}`,
              'zh-CN': `在 ${plan.canonicalPath} 创建或复用目录并登记项目「${plan.name}」`,
            },
          })
          if (!allowed) throw failure('APPROVAL_DENIED', 'The project creation was not approved.')
        }
      }
      return mutate(() => createPreparedWorkspace(ctx, plan, signal), signal)
    })

  register(ctx, 'project_rename',
    'Rename a DSH project by ID. Its directory and existing sessions stay in place.',
    { project_id: PROJECT_ID, name: NAME }, ['project_id', 'name'],
    ({ project_id: id, name }, _caller, signal) => mutate(async () => {
      const project = await resolveProject(ctx, id, signal)
      const { workspace } = await ctx.workspaceController.rename({ workspaceId: project.id, title: name.trim() })
      return { project: { project_id: workspace.workspaceId, name: workspace.title, path: workspace.path } }
    }, signal))

  register(ctx, 'session_create',
    'Create an independent session under an existing DSH project, or pass project_id "default" for default chat. Provide message to start the task immediately, and title to name the session. Use the returned project_id and session_id for coordination.',
    { project_id: PROJECT_ID, title: NAME, message: MESSAGE }, ['project_id'],
    async ({ project_id: id, title, message }, caller, signal) => {
      const project = await mutate(() => resolveProject(ctx, id, signal, true), signal)
      signal.throwIfAborted()
      const created = await ctx.sessionController.create({ workspaceId: project.id, sessionId: `session-${randomUUID()}` })
      const sessionId = created.sessionId
      const result = { session_id: sessionId, project_id: project.id }
      try {
        signal.throwIfAborted()
        if (title !== undefined) await ctx.sessionController.rename({ sessionId, title: title.trim() })
        if (message === undefined) return { ...result, state: 'created' }
        const found = await ctx.sessionController.resolveAgent(sessionId)
        signal.throwIfAborted()
        if ('error' in found) throw found.error
        assertSession(sessionId, found.agent.session.header, project.path)
        const input = relay(caller.id, message, senderProject(ctx, caller, project.path))
        found.agent.followup(input)
        return { ...result, state: 'queued', message_id: input.id }
      } catch (error) {
        signal.throwIfAborted()
        throw new Error(`Session "${sessionId}" was created in project "${project.id}", but setup did not finish: ${error.message}`, { cause: error })
      }
    })

  register(ctx, 'session_move',
    'Move a session and its history to another project, changing its working directory. Use target_project_id "default" for default chat. Supply source_project_id when the session lives outside your current working directory. When moving the current session, the host switches after this tool batch and automatically continues the same request in the destination. Set stop_running only when moving another running session.',
    { session_id: SESSION_ID, target_project_id: PROJECT_ID, source_project_id: PROJECT_ID, stop_running: { type: 'boolean' } },
    ['session_id', 'target_project_id'],
    async ({ session_id: sessionId, target_project_id: id, source_project_id: source, stop_running: stopRunning }, caller, signal, runtime) => {
      const directory = await scopeDirectory(ctx, caller, source, signal)
      await findSession(ctx, sessionId, directory, signal)
      const target = await mutate(() => resolveProject(ctx, id, signal, true), signal)
      signal.throwIfAborted()
      if (sessionId === caller.id && target.path !== directory) {
        const { agent, callId } = runtime
        if (typeof runtime.concludeTurn !== 'function' || !hot.supports(agent)) {
          throw failure('HOT_MOVE_UNAVAILABLE', 'This Web runtime does not support current-session relocation.')
        }
        const current = hot.inProgress(sessionId, target.id)
        if (current) return current
        const sourceProject = ctx.workspaceRegistry.list().find(project => project.path === directory)
        const mode = ctx.get?.('sandboxPolicy')?.resolve({ session: agent.session }).mode
        if (mode !== 'danger-full-access') {
          const allowed = await requestApproval(ctx, agent, {
            toolName: 'workbench_session_move', callId, signal,
            reason: 'Change the current session working directory',
            displayReason: {
              en: `Move this session from ${sourceProject?.title ?? directory} to ${target.title} (${target.path})`,
              'zh-CN': `将当前会话从「${sourceProject?.title ?? directory}」移到「${target.title}」（${target.path}）`,
            },
          })
          if (!allowed) throw failure('APPROVAL_DENIED', 'The project change was not approved.')
        }
        signal.throwIfAborted()
        return hot.schedule({ agent, callId, directory, sourceProject, target, runtime, signal })
      }
      const result = await moves.moveSession(sessionId, target, { expectedCwd: directory, stopRunning, callerId: caller.id })
      return {
        session_id: sessionId, project_id: target.id,
        state: result.already ? 'already' : 'moved',
        ...(result.notes?.length && { notes: result.notes }),
      }
    })

  register(ctx, 'session_move_status',
    'Check whether a session has arrived in the destination project or has an older pending move record.',
    { session_id: SESSION_ID, project_id: PROJECT_ID }, ['session_id', 'project_id'],
    async ({ session_id: sessionId, project_id: id }, _caller, signal) => {
      const target = await resolveProject(ctx, id, signal)
      const current = await hot.status(sessionId)
      if (current?.project_id === target.id && (current.state !== 'moved' || target.sessionIds.includes(sessionId))) return current
      const pending = await moves.pendingMove(sessionId)
      const state = target.sessionIds.includes(sessionId) ? 'moved'
        : pending?.targetPath === target.path ? 'historical_pending' : 'not_moved'
      return { session_id: sessionId, project_id: target.id, state }
    })
}
