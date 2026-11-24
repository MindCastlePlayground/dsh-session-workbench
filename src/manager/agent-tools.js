import { failure } from '../tools.js'

const SESSION_ID = { type: 'string', minLength: 1, maxLength: 200 }
const SESSION_IDS = { type: 'array', items: SESSION_ID, minItems: 1, maxItems: 500 }
const ID = { type: 'string', minLength: 1, maxLength: 200 }
const NAME = { type: 'string', minLength: 1, maxLength: 80 }

// Every action is an exact host route and a deliberately narrow argument schema.
// Keeping this table allowlisted prevents an Agent from turning the route bridge
// into arbitrary HTTP or arbitrary host-route access.
const ACTIONS = [
  { name: 'sessions', description: 'List sessions and their manager metadata.', route: '/archived-sessions/sessions', method: 'GET', properties: {}, required: [] },
  { name: 'archived_list', description: 'List archived sessions.', route: '/archived-sessions/list', method: 'GET', properties: {}, required: [] },
  { name: 'storage', description: 'Read session storage usage.', route: '/archived-sessions/storage', method: 'POST', properties: {}, required: [] },
  { name: 'trash_verify', description: 'Verify that a recycled session can be restored.', route: '/archived-sessions/trash/verify', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'] },
  { name: 'trash_list', description: 'List recycle-bin sessions and retention settings.', route: '/archived-sessions/trash/list', method: 'GET', properties: {}, required: [] },
  { name: 'tags_list', description: 'List tags and session assignments.', route: '/archived-sessions/tags/list', method: 'GET', properties: {}, required: [] },
  { name: 'filters_list', description: 'List saved manager filters.', route: '/archived-sessions/filters/list', method: 'GET', properties: {}, required: [] },
  { name: 'sidebar_state', description: 'Read the manager sidebar state.', route: '/archived-sessions/sidebar-state', method: 'GET', properties: {}, required: [] },
  { name: 'lineage_tree', description: 'Read session and subagent lineage.', route: '/archived-sessions/lineage-tree', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'] },
  { name: 'branch_points', description: 'Read the exact branch points and their child sessions.', route: '/archived-sessions/branch-points', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'] },
  { name: 'pending_moves', description: 'List historical pending moves.', route: '/archived-sessions/pending-moves', method: 'GET', properties: {}, required: [] },
  { name: 'pending_cancel', description: 'Cancel selected historical moves.', route: '/archived-sessions/pending-moves/cancel', method: 'POST', properties: { sessionIds: SESSION_IDS }, required: ['sessionIds'] },
  { name: 'pending_retry', description: 'Retry a historical move for another session.', route: '/archived-sessions/pending-moves/retry', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'], approval: true, excludeCaller: true },
  { name: 'move_many', description: 'Move other sessions to a project path. Use workbench_session_move for the current session.', route: '/archived-sessions/move-many', method: 'POST', properties: { sessionIds: SESSION_IDS, targetPath: { type: 'string', minLength: 1, maxLength: 4096 }, stopRunning: { type: 'boolean' } }, required: ['sessionIds', 'targetPath'], approval: true, excludeCaller: true },
  { name: 'details', description: 'Read details for one session.', route: '/archived-sessions/details', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'] },
  { name: 'export_markdown', description: 'Export one session as Markdown.', route: '/archived-sessions/export-md', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'] },
  { name: 'archive', description: 'Archive one session.', route: '/archived-sessions/archive', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'], approval: true },
  { name: 'archive_many', description: 'Archive selected sessions.', route: '/archived-sessions/archive-many', method: 'POST', properties: { sessionIds: SESSION_IDS }, required: ['sessionIds'], approval: true },
  { name: 'restore', description: 'Restore one archived session.', route: '/archived-sessions/restore', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'], approval: true },
  { name: 'restore_many', description: 'Restore selected archived sessions.', route: '/archived-sessions/restore-many', method: 'POST', properties: { sessionIds: SESSION_IDS }, required: ['sessionIds'], approval: true },
  { name: 'delete', description: 'Move one session to the recycle bin.', route: '/archived-sessions/delete', method: 'POST', properties: { sessionId: SESSION_ID, cascadeSubagents: { type: 'boolean' } }, required: ['sessionId'], approval: true },
  { name: 'delete_many', description: 'Move selected sessions to the recycle bin.', route: '/archived-sessions/delete-many', method: 'POST', properties: { sessionIds: SESSION_IDS, cascadeSubagents: { type: 'boolean' } }, required: ['sessionIds'], approval: true },
  { name: 'trash_restore', description: 'Restore one session from the recycle bin.', route: '/archived-sessions/trash/restore', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'], approval: true },
  { name: 'trash_purge', description: 'Permanently delete one recycled session.', route: '/archived-sessions/trash/purge', method: 'POST', properties: { sessionId: SESSION_ID }, required: ['sessionId'], approval: true },
  { name: 'trash_purge_many', description: 'Permanently delete selected recycled sessions.', route: '/archived-sessions/trash/purge-many', method: 'POST', properties: { sessionIds: SESSION_IDS }, required: ['sessionIds'], approval: true },
  { name: 'star_set', description: 'Set or clear stars on selected sessions.', route: '/archived-sessions/star/set', method: 'POST', properties: { sessionIds: SESSION_IDS, starred: { type: 'boolean' } }, required: ['sessionIds', 'starred'] },
  { name: 'tag_create', description: 'Create a tag.', route: '/archived-sessions/tags/create', method: 'POST', properties: { name: NAME }, required: ['name'] },
  { name: 'tag_rename', description: 'Rename a tag.', route: '/archived-sessions/tags/rename', method: 'POST', properties: { id: ID, name: NAME }, required: ['id', 'name'] },
  { name: 'tag_merge', description: 'Merge one tag into another.', route: '/archived-sessions/tags/merge', method: 'POST', properties: { fromId: ID, toId: ID }, required: ['fromId', 'toId'] },
  { name: 'tag_delete', description: 'Delete a tag.', route: '/archived-sessions/tags/delete', method: 'POST', properties: { id: ID }, required: ['id'] },
  { name: 'tag_set', description: 'Set tags for one session.', route: '/archived-sessions/tags/set', method: 'POST', properties: { sessionId: SESSION_ID, tagIds: { type: 'array', items: ID, maxItems: 200 } }, required: ['sessionId', 'tagIds'] },
  { name: 'filter_save', description: 'Save a named filter.', route: '/archived-sessions/filters/save', method: 'POST', properties: { name: NAME, filters: { type: 'object' } }, required: ['name', 'filters'] },
  { name: 'filter_delete', description: 'Delete saved filters by ID.', route: '/archived-sessions/filters/delete', method: 'POST', properties: { ids: { type: 'array', items: ID, minItems: 1, maxItems: 100 } }, required: ['ids'] },
  { name: 'trash_settings', description: 'Read or update recycle-bin retention days.', route: '/archived-sessions/trash/settings', method: 'POST', properties: { retentionDays: { type: 'integer', enum: [0, 7, 30, 90] } }, required: [], approval: 'mutating' },
  { name: 'auto_archive_settings', description: 'Read or update automatic archive settings.', route: '/archived-sessions/auto-archive/settings', method: 'POST', properties: { inactiveDays: { type: 'integer', minimum: 1, maximum: 3650 }, skipStarred: { type: 'boolean' } }, required: [], approval: true },
  { name: 'auto_archive_run', description: 'Run the automatic archive sweep now.', route: '/archived-sessions/auto-archive/run', method: 'POST', properties: {}, required: [], approval: true },
]

/**
 * Register Agent tools over the manager's already-registered route handlers.
 * `approve` must be connected to DSH's native approval service by the caller;
 * destructive actions fail closed if that integration is missing.
 */
export function registerManagerAgentTools(ctx, routes, { approve } = {}) {
  const disposers = []
  for (const action of ACTIONS) {
    const handler = routes instanceof Map ? routes.get(action.route) : routes?.[action.route]
    if (typeof handler !== 'function') continue
    const properties = action.properties
    const required = action.required
    const tool = {
      name: `workbench_manager_${action.name}`,
      description: action.description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
      output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, { agent, signal, callId }) {
        signal?.throwIfAborted()
        const caller = agent?.session?.header
        if (!caller?.id || caller.origin === 'subagent') throw failure('SESSION_SCOPE', 'Use this tool from an independent session.')
        validate(args, properties, required)
        if (action.excludeCaller && (args.sessionId === caller.id || args.sessionIds?.includes(caller.id))) {
          throw failure('USE_SESSION_MOVE', 'Use workbench_session_move to move the current session.')
        }
        const needsApproval = action.approval === true || (action.approval === 'mutating' && Object.keys(args).length > 0)
        if (needsApproval) {
          if (typeof approve !== 'function') throw failure('APPROVAL_UNAVAILABLE', 'Native DSH approval is required for this action.')
          const permitted = await approve(agent, {
            kind: 'manager-route', callId, toolName: tool.name, action: action.name, route: action.route,
            sessionIds: args.sessionIds || (args.sessionId ? [args.sessionId] : []),
            request: { ...args },
          }, signal)
          if (permitted !== true) throw failure('APPROVAL_DENIED', 'The action was not approved.')
        }
        signal?.throwIfAborted()
        return invoke(handler, action.method, args, signal)
      },
    }
    disposers.push(ctx.tools.register(tool))
  }
  return () => { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose() }
}

export const managerAgentActionNames = Object.freeze(ACTIONS.map((action) => action.name))

async function invoke(handler, method, body, signal) {
  const headers = new Map()
  let status = 200
  let payload
  const req = method === 'GET' ? emptyRequest() : jsonRequest(body)
  const res = {
    writeHead(code, values = {}) { status = code; for (const [key, value] of Object.entries(values)) headers.set(key.toLowerCase(), value) },
    end(text = '') { payload = text },
  }
  signal?.throwIfAborted()
  await handler(req, res)
  signal?.throwIfAborted()
  let data
  try { data = JSON.parse(payload || 'null') } catch { throw failure('MANAGER_RESPONSE_INVALID', 'The manager route returned invalid JSON.') }
  if (status < 200 || status >= 300) {
    const error = failure(data?.code || 'MANAGER_ROUTE_FAILED', data?.error || `Manager route failed with status ${status}.`)
    error.status = status
    error.response = data
    throw error
  }
  return { status, data }
}

function emptyRequest() { return ReadableBody([]) }
function jsonRequest(value) { return ReadableBody([Buffer.from(JSON.stringify(value))]) }
function ReadableBody(chunks) {
  return { async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk } }
}

function validate(args, properties, required) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw failure('INVALID_ARGS', 'Tool arguments must be an object.')
  for (const key of required) if (!Object.hasOwn(args, key)) throw failure('INVALID_ARGS', `${key} is required.`)
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key]
    if (!spec || !valid(value, spec)) throw failure('INVALID_ARGS', `Invalid ${key}.`)
  }
}

function valid(value, spec) {
  if (spec.type === 'string') return typeof value === 'string' && value.trim().length >= spec.minLength && value.length <= spec.maxLength && (!spec.pattern || spec.pattern.test(value))
  if (spec.type === 'boolean') return typeof value === 'boolean'
  if (spec.type === 'integer') return Number.isSafeInteger(value) && (spec.enum ? spec.enum.includes(value) : value >= spec.minimum && value <= spec.maximum)
  if (spec.type === 'array') return Array.isArray(value) && value.length >= (spec.minItems || 0) && value.length <= (spec.maxItems ?? Infinity) && value.every((entry) => valid(entry, spec.items))
  if (spec.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return false
}
