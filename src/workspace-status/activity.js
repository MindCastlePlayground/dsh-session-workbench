export function projectActivity(items, byId, statuses, archivedIds) {
  const archived = new Set(archivedIds)
  const workspaces = new Map()
  for (const workspace of items) {
    for (const id of workspace.sessionIds) workspaces.set(id, workspace)
  }

  const isRunning = (id, session) => statuses.get(id)?.running ?? session.running === true
  const activeParents = new Set()
  const waitingParents = new Set()
  for (const session of Object.values(byId)) {
    if (session.origin !== 'subagent' || !session.parentId || archived.has(session.id)) continue
    if (isRunning(session.id, session)) activeParents.add(session.parentId)
    if (statuses.get(session.id)?.pendingInteraction != null) waitingParents.add(session.parentId)
  }

  const counts = new Map()
  const rows = []
  for (const session of Object.values(byId)) {
    const { id } = session
    if (session.origin === 'subagent' || archived.has(id)) continue
    const status = statuses.get(id)
    const running = isRunning(id, session) || activeParents.has(id)
    const waiting = status?.pendingInteraction != null || waitingParents.has(id)
    // DSH uses the same reminder for unread completions and explicit unread marks.
    const unread = status?.completionUnread === true
    if (session.blank && !running && !waiting && !unread) continue

    const workspace = workspaces.get(id)
    if (running || waiting || unread) {
      const key = workspace?.workspaceId ?? ''
      const count = counts.get(key) ?? { running: 0, unread: 0, waiting: 0 }
      count.running += Number(running && !waiting)
      count.unread += Number(unread)
      count.waiting += Number(waiting)
      counts.set(key, count)
    }
    rows.push({
      id,
      title: session.displayTitle || session.title || id,
      workspaceTitle: workspace?.title ?? '',
      updatedAt: session.updatedAt ?? 0,
      running,
      unread,
      waiting,
      failed: status?.completionFailed === true,
    })
  }

  rows.sort((a, b) => Number(b.running) - Number(a.running)
    || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  return { counts, rows }
}
