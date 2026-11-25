export function projectActivity(items, byId, statuses, archivedIds) {
  const archived = new Set(archivedIds)
  const workspaces = new Map()
  for (const workspace of items) {
    for (const id of workspace.sessionIds) workspaces.set(id, workspace)
  }

  const isRunning = (id, session) => statuses.get(id)?.running ?? session.running === true
  const activeParents = new Set()
  for (const session of Object.values(byId)) {
    if (session.origin === 'subagent' && session.parentId && isRunning(session.id, session)) {
      activeParents.add(session.parentId)
    }
  }

  const counts = new Map()
  const rows = []
  for (const session of Object.values(byId)) {
    const { id } = session
    if (session.origin === 'subagent' || archived.has(id)) continue
    const status = statuses.get(id)
    const running = isRunning(id, session) || activeParents.has(id)
    const unread = status?.completionUnread === true
    if (session.blank && !running && !unread) continue

    const workspace = workspaces.get(id)
    if (running || unread) {
      const key = workspace?.workspaceId ?? ''
      const count = counts.get(key) ?? { running: 0, unread: 0 }
      count.running += Number(running)
      count.unread += Number(unread)
      counts.set(key, count)
    }
    rows.push({
      id,
      title: session.displayTitle || session.title || id,
      workspaceTitle: workspace?.title ?? '',
      updatedAt: session.updatedAt ?? 0,
      running,
      unread,
      waiting: status?.pendingInteraction != null,
      failed: status?.completionFailed === true,
    })
  }

  rows.sort((a, b) => Number(b.running) - Number(a.running)
    || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  return { counts, rows }
}
