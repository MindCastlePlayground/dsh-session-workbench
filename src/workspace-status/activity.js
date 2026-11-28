import { TIMESTAMPS_PROJECTION_KEY } from './timestamps-projection.js'

/**
 * Pure activity projection for the sidebar workspace indicators and Messages inbox.
 */
export const MESSAGE_GROUP = Object.freeze({
  RUNNING: 'running',
  WAITING: 'waiting',
  FINISHED: 'finished',
})

const TIER = Object.freeze({
  RUNNING: 0,
  WAITING: 1,
  FINISHED_UNREAD: 2,
  FINISHED_READ: 3,
})

function pickTime(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function resolveStatusMap(statuses) {
  return statuses instanceof Map ? statuses : new Map()
}

function collectSubagentStates(byId, statusMap, archived, isRunning, liveMap) {
  const activeParents = new Set()
  const waitingParentAt = new Map()
  for (const session of Object.values(byId)) {
    if (!session || session.origin !== 'subagent' || !session.parentId || archived.has(session.id)) continue
    if (isRunning(session.id, session)) activeParents.add(session.parentId)
    const status = statusMap.get(session.id)
    if (status?.pendingInteraction != null) {
      const timestamps = session.projectionValues?.[TIMESTAMPS_PROJECTION_KEY]
      const liveEntry = liveMap?.get?.(session.id)
      const requestAt = pickTime(
        timestamps?.pendingRequestAt,
        liveEntry?.pendingObservedAt,
        session.updatedAt,
      )
      const prev = waitingParentAt.get(session.parentId) ?? 0
      if (requestAt >= prev) waitingParentAt.set(session.parentId, requestAt)
    }
  }
  return { activeParents, waitingParentAt }
}

function resolveGroup(running, waiting) {
  if (waiting) return MESSAGE_GROUP.WAITING
  if (running) return MESSAGE_GROUP.RUNNING
  return MESSAGE_GROUP.FINISHED
}

function resolveSortAt(group, session, timestamps, liveEntry, waitingParentAtValue) {
  const listMeta = session.projectionValues?.sessionListMetadata
  const updatedAt = pickTime(session.updatedAt)
  const rawUserAt = pickTime(timestamps?.lastUserAt, listMeta?.lastPromptAt)
  const rawFinishedAt = pickTime(
    timestamps?.lastFinishedAt,
    session.lastReplyAt,
    session.lastFinishedAt,
  )
  const rawPendingAt = pickTime(waitingParentAtValue, timestamps?.pendingRequestAt)

  if (group === MESSAGE_GROUP.WAITING) {
    return pickTime(rawPendingAt, liveEntry?.pendingObservedAt, rawUserAt, updatedAt)
  }

  if (group === MESSAGE_GROUP.RUNNING) {
    const liveUserAt = pickTime(liveEntry?.userObservedAt)
    const userAt = liveUserAt > rawUserAt && rawUserAt < rawFinishedAt
      ? liveUserAt
      : rawUserAt
    return pickTime(userAt, updatedAt)
  }

  const liveFinishedAt = pickTime(liveEntry?.finishedObservedAt)
  const finishedAt = rawFinishedAt > 0
    ? (liveFinishedAt > rawFinishedAt && liveFinishedAt >= rawUserAt && rawFinishedAt < rawUserAt
      ? liveFinishedAt
      : rawFinishedAt)
    : liveFinishedAt
  return pickTime(finishedAt, updatedAt)
}

export function rowPriorityTier(row) {
  if (!row) return TIER.FINISHED_READ
  const group = row.group ?? resolveGroup(Boolean(row.running), Boolean(row.waiting))
  if (group === MESSAGE_GROUP.RUNNING) return TIER.RUNNING
  if (group === MESSAGE_GROUP.WAITING) return TIER.WAITING
  return row.unread ? TIER.FINISHED_UNREAD : TIER.FINISHED_READ
}

export function projectActivity(items, byId, statuses, archivedIds, liveTimestamps) {
  const counts = new Map()
  const rows = []
  if (!byId || typeof byId !== 'object') return { counts, rows }

  const archived = new Set(Array.isArray(archivedIds) ? archivedIds : [])
  const statusMap = resolveStatusMap(statuses)
  const liveMap = liveTimestamps instanceof Map ? liveTimestamps : undefined
  const isRunning = (id, session) => statusMap.get(id)?.running ?? session.running === true
  const { activeParents, waitingParentAt } = collectSubagentStates(
    byId,
    statusMap,
    archived,
    isRunning,
    liveMap,
  )

  const workspaceOf = new Map()
  for (const ws of Array.isArray(items) ? items : []) {
    if (!ws || typeof ws !== 'object') continue
    for (const id of ws.sessionIds ?? []) workspaceOf.set(id, ws)
  }

  for (const [id, session] of Object.entries(byId)) {
    if (!session || session.origin === 'subagent' || archived.has(id)) continue
    const workspace = workspaceOf.get(id)
    const status = statusMap.get(id)
    const running = isRunning(id, session) || activeParents.has(id)
    const waiting = status?.pendingInteraction != null || waitingParentAt.has(id)
    // DSH uses the same reminder for unread completions and explicit unread marks.
    const unread = status?.completionUnread === true

    if (running || waiting || unread) {
      const key = workspace?.workspaceId ?? ''
      const count = counts.get(key) ?? { running: 0, unread: 0, waiting: 0 }
      count.running += Number(running && !waiting)
      count.unread += Number(unread)
      count.waiting += Number(waiting)
      counts.set(key, count)
    }

    if (session.blank) continue
    const group = resolveGroup(running, waiting)
    const timestamps = session.projectionValues?.[TIMESTAMPS_PROJECTION_KEY]
    const liveEntry = liveMap?.get?.(id)
    const sortAt = resolveSortAt(group, session, timestamps, liveEntry, waitingParentAt.get(id))

    rows.push({
      id,
      title: session.displayTitle || session.title || id,
      workspaceTitle: workspace?.title ?? '',
      updatedAt: pickTime(session.updatedAt),
      sortAt,
      group,
      running,
      unread,
      waiting,
      failed: status?.completionFailed === true,
    })
  }

  rows.sort((a, b) => (
    rowPriorityTier(a) - rowPriorityTier(b)
    || b.sortAt - a.sortAt
    || b.updatedAt - a.updatedAt
    || a.id.localeCompare(b.id)
  ))

  return { counts, rows }
}
