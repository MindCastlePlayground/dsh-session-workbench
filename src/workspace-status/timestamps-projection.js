export const TIMESTAMPS_PROJECTION_KEY = 'dswbTimestamps'
export const TIMESTAMPS_STATE_VERSION = 1

export class SessionEventType {
  static USER_MESSAGE = 'user/message'
  static ASSISTANT_MESSAGE = 'assistant/message'
  static TURN_START = 'turn/start'
  static TURN_END = 'turn/end'
  static APPROVAL_ASKED = 'approval/asked'
  static APPROVAL_DECIDED = 'approval/decided'
  static TOOL_CALL = 'tool/call'
  static TOOL_RESULT = 'tool/result'
  static PTC_START = 'tool/ptc-dispatch-start'
  static PTC_RESULT = 'tool/ptc-dispatch'
}

export class SourceKind {
  static USER = 'user'
  static QUESTION_REPLY = 'user-question-reply'
}

export class ToolName {
  static ASK_USER_QUESTION = 'ask_user_question'
  static EXIT_PLAN_MODE = 'exit_plan_mode'
}

export class RequestPrefix {
  static APPROVAL = 'a:'
  static TOOL = 't:'
}

export class ToolErrorCode {
  static OUTCOME_UNKNOWN = 'TOOL_OUTCOME_UNKNOWN'
}

function finiteTime(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPendingToolContent(content) {
  if (!Array.isArray(content)) return false
  const textBlock = content.find((block) => block && block.type === 'text')
  if (!textBlock || typeof textBlock.text !== 'string') return false
  try {
    const parsed = JSON.parse(textBlock.text)
    return isPlainObject(parsed) && parsed.pending === true
  } catch {
    return false
  }
}

function sameView(left, right) {
  return left.lastUserAt === right.lastUserAt
    && left.lastFinishedAt === right.lastFinishedAt
    && left.pendingRequestAt === right.pendingRequestAt
}

function upsertRequest(requests, id, at, continued) {
  const index = requests.findIndex((entry) => entry.id === id)
  if (index >= 0) {
    const existing = requests[index]
    const nextContinued = existing.continued || continued
    const nextAt = existing.at
    if (existing.continued === nextContinued && existing.at === nextAt) return requests
    const copy = requests.slice()
    copy[index] = { id, at: nextAt, continued: nextContinued }
    return copy
  }
  return [...requests, { id, at, continued }]
}

function removeRequest(requests, id) {
  if (!requests.some((entry) => entry.id === id)) return requests
  return requests.filter((entry) => entry.id !== id)
}

function clearTurnScopedRequests(requests) {
  if (!requests.some((entry) => !entry.continued)) return requests
  return requests.filter((entry) => entry.continued)
}

function parseView(raw) {
  if (!isPlainObject(raw)) {
    throw new TypeError('dswbTimestamps view must be an object')
  }
  return {
    lastUserAt: finiteTime(raw.lastUserAt),
    lastFinishedAt: finiteTime(raw.lastFinishedAt),
    pendingRequestAt: finiteTime(raw.pendingRequestAt),
  }
}

function parseState(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.requests)) {
    throw new TypeError('dswbTimestamps state must carry view and requests')
  }
  const view = parseView(raw.view)
  const requests = []
  for (const entry of raw.requests) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') {
      throw new TypeError('dswbTimestamps request entry is invalid')
    }
    const at = finiteTime(entry.at)
    if (at === null) throw new TypeError('dswbTimestamps request timestamp must be finite')
    requests.push({
      id: entry.id,
      at,
      continued: entry.continued === true,
    })
  }
  return { view, requests }
}

/** Init state for one session. */
export function initTimestampState() {
  return {
    view: {
      lastUserAt: null,
      lastFinishedAt: null,
      pendingRequestAt: null,
    },
    requests: [],
  }
}

/** Pure fold over committed session events computing per-state timestamps. */
export function applyTimestampEvent(state, event) {
  if (!event || typeof event.type !== 'string') return state
  const eventAt = finiteTime(event.time)
  let nextUserAt = state.view.lastUserAt
  let nextFinishedAt = state.view.lastFinishedAt
  let nextRequests = state.requests

  switch (event.type) {
    case SessionEventType.USER_MESSAGE: {
      const source = event.data?.source
      if (source?.kind === SourceKind.USER && eventAt !== null) {
        nextUserAt = eventAt
      } else if (source?.kind === SourceKind.QUESTION_REPLY && typeof source.callId === 'string') {
        nextRequests = removeRequest(nextRequests, RequestPrefix.TOOL + source.callId)
      }
      break
    }
    case SessionEventType.ASSISTANT_MESSAGE: {
      if (eventAt !== null) nextFinishedAt = eventAt
      break
    }
    case SessionEventType.TURN_START: {
      nextRequests = clearTurnScopedRequests(nextRequests)
      break
    }
    case SessionEventType.TURN_END: {
      if (eventAt !== null) nextFinishedAt = eventAt
      nextRequests = clearTurnScopedRequests(nextRequests)
      break
    }
    case SessionEventType.APPROVAL_ASKED: {
      const id = event.data?.id
      if (typeof id === 'string' && eventAt !== null) {
        nextRequests = upsertRequest(nextRequests, RequestPrefix.APPROVAL + id, eventAt, false)
      }
      break
    }
    case SessionEventType.APPROVAL_DECIDED: {
      const id = event.data?.id
      if (typeof id === 'string') {
        nextRequests = removeRequest(nextRequests, RequestPrefix.APPROVAL + id)
      }
      break
    }
    case SessionEventType.TOOL_CALL: {
      const name = event.data?.name
      const callId = event.data?.callId
      if (
        (name === ToolName.ASK_USER_QUESTION || name === ToolName.EXIT_PLAN_MODE)
        && typeof callId === 'string'
        && eventAt !== null
      ) {
        nextRequests = upsertRequest(nextRequests, RequestPrefix.TOOL + callId, eventAt, false)
      }
      break
    }
    case SessionEventType.TOOL_RESULT: {
      const callId = event.data?.message?.toolCallId ?? event.data?.message?.source?.callId
      if (typeof callId === 'string') {
        const key = RequestPrefix.TOOL + callId
        const isContinued = isPendingToolContent(event.data?.message?.content)
          || event.data?.error?.code === ToolErrorCode.OUTCOME_UNKNOWN
        if (isContinued) {
          const existing = nextRequests.find((entry) => entry.id === key)
          if (existing || eventAt !== null) {
            nextRequests = upsertRequest(nextRequests, key, existing ? existing.at : eventAt, true)
          }
        } else {
          nextRequests = removeRequest(nextRequests, key)
        }
      }
      break
    }
    case SessionEventType.PTC_START: {
      const subCallId = event.data?.subCallId
      if (event.data?.name === ToolName.ASK_USER_QUESTION && typeof subCallId === 'string' && eventAt !== null) {
        nextRequests = upsertRequest(nextRequests, RequestPrefix.TOOL + subCallId, eventAt, false)
      }
      break
    }
    case SessionEventType.PTC_RESULT: {
      const subCallId = event.data?.subCallId
      if (event.data?.name === ToolName.ASK_USER_QUESTION && typeof subCallId === 'string') {
        const key = RequestPrefix.TOOL + subCallId
        const isPending = event.data?.isError !== true && isPendingToolContent(event.data?.content)
        if (isPending) {
          const existing = nextRequests.find((entry) => entry.id === key)
          if (existing || eventAt !== null) {
            nextRequests = upsertRequest(nextRequests, key, existing ? existing.at : eventAt, true)
          }
        } else {
          nextRequests = removeRequest(nextRequests, key)
        }
      }
      break
    }
    default:
      return state
  }

  const nextPendingAt = nextRequests.length > 0 ? nextRequests[nextRequests.length - 1].at : null
  const candidateView = {
    lastUserAt: nextUserAt,
    lastFinishedAt: nextFinishedAt,
    pendingRequestAt: nextPendingAt,
  }
  const viewChanged = !sameView(state.view, candidateView)
  if (!viewChanged && nextRequests === state.requests) return state
  return {
    view: viewChanged ? candidateView : state.view,
    requests: nextRequests,
  }
}

export const timestampsProjectionDefinition = {
  key: TIMESTAMPS_PROJECTION_KEY,
  stateVersion: TIMESTAMPS_STATE_VERSION,
  stateSchema: { parse: parseState },
  init: initTimestampState,
  apply: applyTimestampEvent,
  wire: {
    viewSchema: { parse: parseView },
    view: (state) => state.view,
    summary: true,
  },
}

/** Register the summary timestamp projection on the host context when sessionProjections exists. */
export function registerTimestampsProjection(ctx) {
  if (!ctx || typeof ctx.inject !== 'function') return
  ctx.inject(['sessionProjections'], async (scope) => {
    const registry = scope?.sessionProjections ?? scope?.get?.('sessionProjections')
    if (!registry || typeof registry.register !== 'function') return undefined
    const handle = registry.register(timestampsProjectionDefinition)
    if (handle && typeof handle.then === 'function') {
      try {
        await handle
      } catch {
        // Projection registration failure should not crash the workbench host plugin.
      }
    }
    return () => {
      if (typeof handle === 'function') {
        void handle()
      } else if (handle && typeof handle.dispose === 'function') {
        void handle.dispose()
      }
    }
  })
}
