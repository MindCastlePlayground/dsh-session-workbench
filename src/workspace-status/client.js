// Adapted from Stijnus/dsh-workspace-status v0.3.2 (c3ca1a0). See LICENSE.
import React from 'react'
import { createPortal } from 'react-dom'
import { projectActivity } from './activity.js'
import {
  BASE_WORKBENCH_CSS,
  CLS,
  DOM_ATTRS,
  LIMITS,
  SLOT_CONFIG,
  VIEW_MODE,
  rowFallbackCss,
} from './styles.js'
import {
  HeaderGlobalSearchButton,
  MessagesView,
  ViewSwitcher,
  WorkspaceRowTail,
  getMessage,
} from './messages-view.js'
import { createStickyProjectController, STICKY_ATTRS } from './sticky.js'

export const inject = ['slots']

const GLOBAL_SEARCH_PANEL_ID = 'global-search'

const EMPTY_ITEMS = []
const EMPTY_SESSIONS = {}
const EMPTY_STATUSES = new Map()
const EMPTY_MAP = new Map()

function isFresh(updatedAt, now) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return false
  return now - updatedAt <= LIMITS.FINISHED_WINDOW_MS
}

/** Drop one Session from the watch (archived or gone). */
function forget(watch, sessionId) {
  watch.running.delete(sessionId)
  watch.stoppedAt.delete(sessionId)
}

/** Whether any direct subagent child of one Session is currently running. */
function runsChild(sessionId, children, sessions, statuses) {
  const kids = children.get(sessionId)
  if (kids === undefined) return false
  for (const childId of kids) {
    const status = statuses?.get?.(childId)
    const running = status?.running === undefined
      ? sessions[childId]?.running === true
      : status.running === true
    if (running) return true
  }
  return false
}

/** Direct subagent children per parent Session id. */
function childMap(sessions) {
  const children = new Map()
  for (const sessionId of Object.keys(sessions)) {
    const row = sessions[sessionId]
    if (row?.origin !== 'subagent' || typeof row.parentId !== 'string') continue
    const list = children.get(row.parentId)
    if (list === undefined) children.set(row.parentId, [sessionId])
    else list.push(sessionId)
  }
  return children
}

/**
 * Legacy activity derivation kept for waiting-priority and recent-finished tracking.
 * @returns marked group keys by state, counts, display titles, and per-group tallies.
 */
function deriveActivity(items, byId, statuses, archivedSessionIds, now, watch) {
  const sessions = byId !== null && typeof byId === 'object' ? byId : {}
  const archived = new Set(Array.isArray(archivedSessionIds) ? archivedSessionIds : [])
  const statusMap = statuses !== null && typeof statuses?.get === 'function' ? statuses : undefined

  const workspaceOf = new Map()
  const titles = new Map()
  for (const workspace of Array.isArray(items) ? items : []) {
    if (workspace === null || typeof workspace !== 'object') continue
    const key = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : ''
    titles.set(key, typeof workspace.title === 'string' ? workspace.title : '')
    for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
      workspaceOf.set(sessionId, key)
    }
  }

  const children = childMap(sessions)
  const groups = new Map()
  const tally = (key) => {
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, title: titles.get(key) ?? '', waiting: 0, running: 0, done: 0 }
      groups.set(key, group)
    }
    return group
  }

  for (const sessionId of Object.keys(sessions).sort()) {
    const row = sessions[sessionId]
    if (row === null || row === undefined) continue
    if (row.origin === 'subagent') continue
    if (archived.has(sessionId)) {
      forget(watch, sessionId)
      continue
    }

    const status = statusMap?.get?.(sessionId)
    const running = status?.running === true
      || (status?.running === undefined && row.running === true)
      || runsChild(sessionId, children, sessions, statusMap)
    const waiting = status?.pendingInteraction !== undefined && status?.pendingInteraction !== null

    if (running) {
      watch.running.add(sessionId)
      watch.stoppedAt.delete(sessionId)
    } else if (watch.running.delete(sessionId) && status?.completionUnread === true) {
      watch.stoppedAt.set(sessionId, now)
    }

    const recent = isFresh(row.updatedAt, now)
      || (watch.stoppedAt.get(sessionId) !== undefined
        && now - watch.stoppedAt.get(sessionId) <= LIMITS.FINISHED_WINDOW_MS)
    const key = workspaceOf.has(sessionId) ? workspaceOf.get(sessionId) : ''

    if (waiting) {
      tally(key).waiting += 1
    } else if (running) {
      tally(key).running += 1
    } else if (status?.completionUnread === true && recent) {
      tally(key).done += 1
    }
  }

  for (const sessionId of watch.running) {
    if (sessions[sessionId] === undefined) watch.running.delete(sessionId)
  }
  for (const [sessionId, stoppedAt] of watch.stoppedAt) {
    if (sessions[sessionId] === undefined || now - stoppedAt > LIMITS.FINISHED_WINDOW_MS) {
      watch.stoppedAt.delete(sessionId)
    }
  }

  const waitingKeys = []
  const runningKeys = []
  const doneKeys = []
  const names = new Map()
  const totals = { waiting: 0, running: 0, done: 0 }
  let marked = 0
  for (const group of groups.values()) {
    const total = group.waiting + group.running + group.done
    if (total === 0) continue
    if (group.waiting > 0) waitingKeys.push(group.key)
    else if (group.running > 0) runningKeys.push(group.key)
    else doneKeys.push(group.key)
    totals.waiting += group.waiting
    totals.running += group.running
    totals.done += group.done
    marked += total
    names.set(group.key, group.title)
  }
  waitingKeys.sort()
  runningKeys.sort()
  doneKeys.sort()

  return { waiting: waitingKeys, running: runningKeys, done: doneKeys, totals, marked, names, byGroup: groups }
}

/** Accessible aggregate summary aligned with projectActivity + waiting/recent indicators. */
function describe(legacyActivity, projected, totals, titleMap) {
  const separator = getMessage('activity.listSeparator')
  const clauses = []
  if (totals.waiting > 0) clauses.push(getMessage('activity.waiting', { n: totals.waiting }))
  if (totals.running > 0) clauses.push(getMessage('activity.running', { n: totals.running }))
  if (totals.unread > 0) clauses.push(getMessage('activity.unread', { n: totals.unread }))
  else if (legacyActivity.totals.done > 0) clauses.push(getMessage('activity.done', { n: legacyActivity.totals.done }))

  const runKeys = []
  const unreadKeys = []
  for (const [key, entry] of projected.counts) {
    if ((entry?.running ?? 0) > 0) runKeys.push(key)
    else if ((entry?.unread ?? 0) > 0) unreadKeys.push(key)
  }
  runKeys.sort()
  unreadKeys.sort()

  const orderedKeys = []
  const seen = new Set()
  for (const key of [...legacyActivity.waiting, ...runKeys, ...unreadKeys, ...legacyActivity.done]) {
    if (seen.has(key)) continue
    seen.add(key)
    orderedKeys.push(key)
  }

  const names = orderedKeys.map((key) => {
    const title = titleMap.get(key) ?? legacyActivity.names.get(key)
    return title !== undefined && title !== '' ? title : getMessage('activity.unnamed')
  })
  const listed = names.slice(0, LIMITS.MAX_NAMES)
  const rest = names.length - listed.length
  if (rest > 0) listed.push(getMessage('activity.more', { n: rest }))

  return getMessage('activity.summary', {
    clauses: clauses.join(separator),
    names: listed.join(separator),
  })
}

function useStandard(hook, selector, fallback) {
  return typeof hook === 'function' ? (hook(selector) ?? fallback) : fallback
}

function openNativeSession(ctx, sessionId) {
  if (!ctx || typeof ctx.get !== 'function' || !sessionId) return
  try {
    const uiWorkspace = ctx.get('uiWorkspace')
    if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
      uiWorkspace.openSession(sessionId)
      return
    }
  } catch { /* fall through to legacy sessions service */ }
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.open === 'function') {
      sessions.open(sessionId)
    }
  } catch { /* host selection unavailable */ }
}

function toggleGlobalSearchPanel(ctx, currentlyActive) {
  if (!ctx || typeof ctx.get !== 'function') return
  try {
    const layout = ctx.get('layout')
    if (layout && typeof layout.selectPanel === 'function') {
      layout.selectPanel(currentlyActive ? null : GLOBAL_SEARCH_PANEL_ID)
    }
  } catch {
    if (currentlyActive) {
      try {
        ctx.get('layout')?.selectPanel?.(null)
      } catch { /* ignore */ }
    }
  }
}

function findDirectChild(parent, attrName) {
  for (const child of parent.children) {
    if (child.hasAttribute && child.hasAttribute(attrName)) return child
  }
  return null
}

function findNativeSearchSlot(header) {
  if (!header) return null
  for (const child of header.children) {
    if (child.tagName === 'DIV' && child.querySelector('input')) return child
  }
  return null
}

function syncLiveTimestamps(liveMap, sessions, statuses, archivedIds) {
  const now = Date.now()
  const archived = new Set(Array.isArray(archivedIds) ? archivedIds : [])
  const statusMap = statuses instanceof Map ? statuses : EMPTY_STATUSES
  const safeSessions = sessions && typeof sessions === 'object' ? sessions : EMPTY_SESSIONS

  for (const id of liveMap.keys()) {
    if (!safeSessions[id] || archived.has(id)) liveMap.delete(id)
  }

  for (const [id, session] of Object.entries(safeSessions)) {
    if (!session || archived.has(id)) continue
    const status = statusMap.get(id)
    const running = status?.running ?? session.running === true
    const pending = status?.pendingInteraction
    const pendingKey = pending == null
      ? null
      : (pending.key || pending.callId || pending.kind || 'pending')

    let entry = liveMap.get(id)
    if (!entry) {
      liveMap.set(id, {
        running,
        pendingKey,
        userObservedAt: 0,
        finishedObservedAt: 0,
        pendingObservedAt: pendingKey !== null ? now : 0,
      })
      continue
    }

    if (pendingKey !== null && pendingKey !== entry.pendingKey) {
      entry.pendingObservedAt = now
    } else if (pendingKey === null) {
      entry.pendingObservedAt = 0
    }
    entry.pendingKey = pendingKey

    if (!entry.running && running) {
      entry.userObservedAt = now
    } else if (entry.running && !running && pendingKey === null) {
      entry.finishedObservedAt = now
    }
    entry.running = running
  }

  return liveMap
}

function isManagedNode(node) {
  if (!node || typeof node.closest !== 'function') return false
  return node.closest(
    `[${DOM_ATTRS.SWITCHER_HOST}],[${DOM_ATTRS.MESSAGES_HOST}],[${DOM_ATTRS.WS_HOST}],[${DOM_ATTRS.GLOBAL_SEARCH_HOST}]`,
  ) !== null
}

function isManagedMutation(mutation) {
  if (isManagedNode(mutation.target)) return true
  if (mutation.type !== 'childList') return false
  const changed = [...mutation.addedNodes, ...mutation.removedNodes]
  return changed.length > 0 && changed.every(node => isManagedNode(node))
}

function sameWorkspaceRows(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].key !== b[i].key || a[i].hostEl !== b[i].hostEl) return false
  }
  return true
}

function readInitialCollapsed() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DOM_ATTRS.READ_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function clearInjectedNodes(scope = document) {
  if (typeof document === 'undefined') return
  for (const el of scope.querySelectorAll(`[${DOM_ATTRS.VIEW}]`)) {
    el.removeAttribute(DOM_ATTRS.VIEW)
  }
  for (const el of scope.querySelectorAll(`[${DOM_ATTRS.HEADER_HIDDEN}]`)) {
    el.removeAttribute(DOM_ATTRS.HEADER_HIDDEN)
  }
  for (const el of scope.querySelectorAll(`[${DOM_ATTRS.WS_ROW_FLAG}]`)) {
    el.removeAttribute(DOM_ATTRS.WS_ROW_FLAG)
  }
  for (const attr of Object.values(STICKY_ATTRS)) {
    for (const el of scope.querySelectorAll(`[${attr}]`)) {
      el.removeAttribute(attr)
    }
  }
  for (const el of scope.querySelectorAll(
    `[${DOM_ATTRS.SWITCHER_HOST}],[${DOM_ATTRS.MESSAGES_HOST}],[${DOM_ATTRS.WS_HOST}],[${DOM_ATTRS.GLOBAL_SEARCH_HOST}]`,
  )) {
    el.remove()
  }
}

export function WorkspaceStatus({
  wide,
  useWorkspaces,
  useSessions,
  useSessionStatus,
  usePanelInfo,
  openSession,
  onToggleGlobalSearch,
}) {
  const isWide = wide !== false
  const items = useStandard(useWorkspaces, state => state?.items, EMPTY_ITEMS)
  const archived = useStandard(useWorkspaces, state => state?.archivedSessionIds, EMPTY_ITEMS)
  const sessions = useStandard(useSessions, state => state?.byId, EMPTY_SESSIONS)
  const statuses = useStandard(useSessionStatus, state => state, EMPTY_STATUSES)
  const activePanelId = useStandard(usePanelInfo, info => info?.activePanelId ?? null, null)
  const panelActive = activePanelId !== null
  const globalSearchActive = activePanelId === GLOBAL_SEARCH_PANEL_ID

  const currentId = React.useMemo(() => {
    if (panelActive) return undefined
    for (const id of Object.keys(sessions)) {
      const row = sessions[id]
      if (row && (row.retainedBy?.mainView ?? 0) > 0) return id
    }
    return undefined
  }, [panelActive, sessions])

  const titleMap = React.useMemo(() => {
    const map = new Map()
    for (const workspace of Array.isArray(items) ? items : []) {
      if (!workspace || typeof workspace !== 'object') continue
      const key = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : ''
      if (typeof workspace.title === 'string') map.set(key, workspace.title)
    }
    return map
  }, [items])

  const watch = React.useRef(undefined)
  if (watch.current === undefined) watch.current = { running: new Set(), stoppedAt: new Map() }

  const liveTimestampsRef = React.useRef(undefined)
  if (liveTimestampsRef.current === undefined) liveTimestampsRef.current = new Map()

  const projected = React.useMemo(() => {
    const liveMap = syncLiveTimestamps(liveTimestampsRef.current, sessions, statuses, archived)
    const result = typeof projectActivity === 'function'
      ? projectActivity(items, sessions, statuses, archived, liveMap)
      : null
    return {
      counts: result?.counts instanceof Map ? result.counts : EMPTY_MAP,
      rows: Array.isArray(result?.rows) ? result.rows : EMPTY_ITEMS,
    }
  }, [items, sessions, statuses, archived])

  const legacyActivity = React.useMemo(
    () => deriveActivity(items, sessions, statuses, archived, Date.now(), watch.current),
    [items, sessions, statuses, archived],
  )

  const totals = React.useMemo(() => {
    let running = 0
    let unread = 0
    for (const entry of projected.counts.values()) {
      running += entry?.running ?? 0
      unread += entry?.unread ?? 0
    }
    return { running, unread, waiting: legacyActivity.totals.waiting }
  }, [projected.counts, legacyActivity.totals.waiting])

  const [mode, setMode] = React.useState(VIEW_MODE.WORKSPACES)
  const [visibleLimit, setVisibleLimit] = React.useState(LIMITS.INITIAL_PAGE_SIZE)
  const [readCollapsed, setReadCollapsed] = React.useState(readInitialCollapsed)
  const [clockNow, setClockNow] = React.useState(() => Date.now())
  const [anchors, setAnchors] = React.useState(() => ({
    switcherHost: null,
    messagesHost: null,
    globalSearchHost: null,
    listArea: null,
    header: null,
    workspaceRows: EMPTY_ITEMS,
  }))

  const modeRef = React.useRef(mode)
  modeRef.current = mode
  const anchorsRef = React.useRef(anchors)
  anchorsRef.current = anchors
  const tabRefs = React.useRef({ [VIEW_MODE.WORKSPACES]: null, [VIEW_MODE.MESSAGES]: null })
  const listContainerRef = React.useRef(null)
  const stickyRef = React.useRef(null)
  if (stickyRef.current === null && typeof createStickyProjectController === 'function') {
    stickyRef.current = createStickyProjectController()
  }
  const savedScrollRef = React.useRef({
    [VIEW_MODE.WORKSPACES]: 0,
    [VIEW_MODE.MESSAGES]: 0,
  })
  const switchingScrollRef = React.useRef(false)

  const handleModeChange = React.useCallback((nextMode) => {
    if (nextMode === modeRef.current) return
    const listArea = anchorsRef.current.listArea
    if (listArea) savedScrollRef.current[modeRef.current] = listArea.scrollTop
    switchingScrollRef.current = true
    setMode(nextMode)
  }, [])

  React.useEffect(() => {
    if (!isWide || typeof window === 'undefined') return undefined
    const onEnsureWorkspaces = () => {
      handleModeChange(VIEW_MODE.WORKSPACES)
    }
    window.addEventListener(DOM_ATTRS.ENSURE_WORKSPACES_EVENT, onEnsureWorkspaces)
    return () => {
      window.removeEventListener(DOM_ATTRS.ENSURE_WORKSPACES_EVENT, onEnsureWorkspaces)
    }
  }, [isWide, handleModeChange])

  // Redirect collapsed-rail native search clicks to Global Search so there is one unified search entry.
  React.useEffect(() => {
    if (isWide || typeof document === 'undefined') return undefined
    const onRailSearchClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (!target) return
      const header = document.querySelector(DOM_ATTRS.NATIVE_HEADER)
      const listArea = document.querySelector(DOM_ATTRS.NATIVE_LIST_AREA)
      const railSearch = listArea?.previousElementSibling
      if (!railSearch || railSearch === header || !railSearch.contains(target)) return
      event.preventDefault()
      event.stopPropagation()
      onToggleGlobalSearch?.(globalSearchActive)
    }
    document.addEventListener('click', onRailSearchClick, true)
    return () => {
      document.removeEventListener('click', onRailSearchClick, true)
    }
  }, [isWide, globalSearchActive, onToggleGlobalSearch])

  const focusMessagesList = React.useCallback(() => {
    const firstRow = listContainerRef.current?.querySelector(`.${CLS.MSG_ROW}`)
    if (firstRow && typeof firstRow.focus === 'function') firstRow.focus()
  }, [])

  const returnToTabs = React.useCallback(() => {
    const tab = tabRefs.current[modeRef.current]
    if (tab && typeof tab.focus === 'function') tab.focus()
  }, [])

  const handleLoadMore = React.useCallback(() => {
    setVisibleLimit(limit => limit + LIMITS.PAGE_STEP)
  }, [])

  const handleToggleReadCollapsed = React.useCallback(() => {
    setReadCollapsed((prev) => {
      const next = !prev
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(DOM_ATTRS.READ_COLLAPSED_KEY, next ? 'true' : 'false')
        }
      } catch { /* ignore storage errors */ }
      return next
    })
  }, [])

  const handleTriggerGlobalSearch = React.useCallback(() => {
    onToggleGlobalSearch?.(globalSearchActive)
  }, [onToggleGlobalSearch, globalSearchActive])

  // Keep relative timestamps accurate only while the Messages list is visible.
  React.useEffect(() => {
    if (!isWide || mode !== VIEW_MODE.MESSAGES || typeof document === 'undefined') return undefined
    setClockNow(Date.now())
    const tick = () => {
      if (!document.hidden) setClockNow(Date.now())
    }
    const timer = setInterval(tick, LIMITS.TIME_TICK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [isWide, mode])

  // Track active tab scroll position continuously while settled in that tab.
  React.useEffect(() => {
    const { listArea } = anchors
    if (!isWide || !listArea) return undefined
    const onListScroll = () => {
      if (switchingScrollRef.current) return
      savedScrollRef.current[modeRef.current] = listArea.scrollTop
    }
    listArea.addEventListener('scroll', onListScroll, { passive: true })
    return () => {
      listArea.removeEventListener('scroll', onListScroll)
    }
  }, [isWide, anchors.listArea])

  // Non-destructive view toggle: hides/reveals native tree rows and restores saved scroll offset per tab.
  React.useLayoutEffect(() => {
    const { listArea, header } = anchors
    if (!isWide) {
      if (listArea) listArea.removeAttribute(DOM_ATTRS.VIEW)
      if (header) header.removeAttribute(DOM_ATTRS.HEADER_HIDDEN)
      switchingScrollRef.current = false
      return undefined
    }

    const scrollport = typeof document !== 'undefined' ? document.querySelector(DOM_ATTRS.NATIVE_SCROLLPORT) : null
    if (scrollport && scrollport.scrollTop !== 0) {
      scrollport.scrollTop = 0
    }

    if (header) {
      if (mode === VIEW_MODE.MESSAGES) header.setAttribute(DOM_ATTRS.HEADER_HIDDEN, 'true')
      else header.removeAttribute(DOM_ATTRS.HEADER_HIDDEN)
    }
    const targetTop = savedScrollRef.current[mode] ?? 0
    if (listArea) {
      if (mode === VIEW_MODE.MESSAGES) listArea.setAttribute(DOM_ATTRS.VIEW, DOM_ATTRS.VIEW_MESSAGES)
      else listArea.removeAttribute(DOM_ATTRS.VIEW)
      if (listArea.scrollTop !== targetTop) listArea.scrollTop = targetTop
    }
    stickyRef.current?.sync(listArea, isWide && mode === VIEW_MODE.WORKSPACES)

    let rafId = 0
    if (listArea && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        if (modeRef.current === mode && targetTop > 0 && listArea.scrollTop === 0 && listArea.scrollHeight > listArea.clientHeight) {
          listArea.scrollTop = targetTop
          stickyRef.current?.sync(listArea, mode === VIEW_MODE.WORKSPACES)
        }
        switchingScrollRef.current = false
      })
    } else {
      switchingScrollRef.current = false
    }

    return () => {
      if (rafId !== 0 && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId)
      }
      switchingScrollRef.current = false
    }
  }, [isWide, mode, anchors.listArea, anchors.header])

  // Idempotent portal-host attachment + MutationObserver for native sidebar DOM nodes.
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (!isWide) {
      stickyRef.current?.dispose()
      clearInjectedNodes()
      setAnchors({
        switcherHost: null,
        messagesHost: null,
        globalSearchHost: null,
        listArea: null,
        header: null,
        workspaceRows: EMPTY_ITEMS,
      })
      return undefined
    }

    let rafId = 0
    let region = null

    const syncHosts = () => {
      const rootScope = document.querySelector(DOM_ATTRS.NATIVE_SCROLLPORT) || document
      const header = rootScope.querySelector(DOM_ATTRS.NATIVE_HEADER) || document.querySelector(DOM_ATTRS.NATIVE_HEADER)
      const listArea = rootScope.querySelector(DOM_ATTRS.NATIVE_LIST_AREA) || document.querySelector(DOM_ATTRS.NATIVE_LIST_AREA)
      region = rootScope === document ? (header ?? listArea)?.parentElement : rootScope

      let switcherHost = null
      if (header && header.parentElement) {
        switcherHost = findDirectChild(header.parentElement, DOM_ATTRS.SWITCHER_HOST)
        if (!switcherHost) {
          switcherHost = document.createElement('div')
          switcherHost.className = CLS.SWITCHER_HOST
          switcherHost.setAttribute(DOM_ATTRS.SWITCHER_HOST, '')
          header.parentElement.insertBefore(switcherHost, header)
        } else if (switcherHost.nextElementSibling !== header) {
          header.parentElement.insertBefore(switcherHost, header)
        }
      }

      let globalSearchHost = null
      if (header) {
        const nativeSearchSlot = findNativeSearchSlot(header)
        if (nativeSearchSlot) {
          globalSearchHost = findDirectChild(nativeSearchSlot, DOM_ATTRS.GLOBAL_SEARCH_HOST)
          if (!globalSearchHost) {
            globalSearchHost = document.createElement('div')
            globalSearchHost.setAttribute(DOM_ATTRS.GLOBAL_SEARCH_HOST, '')
            nativeSearchSlot.appendChild(globalSearchHost)
          }
        }
      }

      let messagesHost = null
      if (listArea) {
        messagesHost = findDirectChild(listArea, DOM_ATTRS.MESSAGES_HOST)
        if (!messagesHost) {
          messagesHost = document.createElement('div')
          messagesHost.setAttribute(DOM_ATTRS.MESSAGES_HOST, '')
          listArea.appendChild(messagesHost)
        }
      }

      const workspaceRows = []
      if (listArea) {
        for (const row of listArea.querySelectorAll(DOM_ATTRS.NATIVE_WS_ROW)) {
          const rowKey = row.getAttribute('data-row-key') || ''
          if (!rowKey.startsWith(DOM_ATTRS.WS_ROW_PREFIX)) continue
          const key = rowKey.slice(DOM_ATTRS.WS_ROW_PREFIX.length)
          let hostEl = findDirectChild(row, DOM_ATTRS.WS_HOST)
          if (!hostEl) {
            hostEl = document.createElement('span')
            hostEl.setAttribute(DOM_ATTRS.WS_HOST, '')
            row.appendChild(hostEl)
          }
          if (row.getAttribute(DOM_ATTRS.WS_ROW_FLAG) !== 'true') {
            row.setAttribute(DOM_ATTRS.WS_ROW_FLAG, 'true')
          }
          workspaceRows.push({ key, hostEl })
        }
      }

      setAnchors((prev) => {
        if (
          prev.switcherHost === switcherHost
          && prev.messagesHost === messagesHost
          && prev.globalSearchHost === globalSearchHost
          && prev.listArea === listArea
          && prev.header === header
          && sameWorkspaceRows(prev.workspaceRows, workspaceRows)
        ) {
          return prev
        }
        return { switcherHost, messagesHost, globalSearchHost, listArea, header, workspaceRows }
      })
      stickyRef.current?.sync(listArea, isWide && modeRef.current === VIEW_MODE.WORKSPACES)
    }

    const scheduleSync = () => {
      if (rafId !== 0) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        syncHosts()
      })
    }

    syncHosts()

    let observer = null
    const observeRoot = document.body || document.documentElement
    if (observeRoot && typeof MutationObserver === 'function') {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (isManagedMutation(mutation)) continue
          if (region?.isConnected && !region.contains(mutation.target)) continue
          if (!region && !Array.from(mutation.addedNodes).some(node =>
            node.nodeType === 1 && (node.matches(DOM_ATTRS.NATIVE_HEADER)
              || node.querySelector(DOM_ATTRS.NATIVE_HEADER)))) continue
          scheduleSync()
          break
        }
      })
      observer.observe(observeRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-row-key', 'aria-expanded'],
      })
    }

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
      stickyRef.current?.dispose()
      clearInjectedNodes()
    }
  }, [isWide])

  const hasActivity = legacyActivity.marked > 0 || totals.running > 0 || totals.unread > 0
  const canPortal = typeof createPortal === 'function'

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'style',
      { 'data-plugin-css': SLOT_CONFIG.STYLE_ID },
      BASE_WORKBENCH_CSS + rowFallbackCss(legacyActivity),
    ),
    hasActivity && React.createElement(
      'span',
      { className: CLS.SR },
      describe(legacyActivity, projected, totals, titleMap),
    ),
    canPortal && isWide && anchors.switcherHost && createPortal(
      React.createElement(ViewSwitcher, {
        mode,
        onChange: handleModeChange,
        totalRunning: totals.running,
        totalUnread: totals.unread,
        totalWaiting: totals.waiting,
        tabRefs,
        onFocusMessagesList: focusMessagesList,
      }),
      anchors.switcherHost,
    ),
    canPortal && isWide && anchors.globalSearchHost && createPortal(
      React.createElement(HeaderGlobalSearchButton, {
        active: globalSearchActive,
        onTrigger: handleTriggerGlobalSearch,
      }),
      anchors.globalSearchHost,
    ),
    canPortal && isWide && mode === VIEW_MODE.MESSAGES && anchors.messagesHost && createPortal(
      React.createElement(MessagesView, {
        rows: projected.rows,
        sessions,
        statuses,
        currentId,
        now: clockNow,
        visibleLimit,
        readCollapsed,
        onToggleReadCollapsed: handleToggleReadCollapsed,
        onLoadMore: handleLoadMore,
        onSelectSession: openSession,
        listContainerRef,
        onReturnToTabs: returnToTabs,
      }),
      anchors.messagesHost,
    ),
    canPortal && isWide && mode === VIEW_MODE.WORKSPACES && anchors.workspaceRows.map((entry) => {
      const counts = projected.counts.get(entry.key)
      const legacyGroup = legacyActivity.byGroup.get(entry.key)
      const running = counts?.running ?? 0
      const unread = counts?.unread ?? 0
      const waiting = legacyGroup?.waiting ?? 0
      const recentDone = (legacyGroup?.done ?? 0) > 0
      if (running <= 0 && unread <= 0 && waiting <= 0 && !recentDone) return null
      return createPortal(
        React.createElement(WorkspaceRowTail, {
          running,
          unread,
          waiting,
          recentDone,
        }),
        entry.hostEl,
        entry.key || '__ungrouped__',
      )
    }),
  )
}

export function apply(ctx) {
  ctx.slots.inject(SLOT_CONFIG.SLOT, () =>
    ctx.slots.register(
      {
        name: SLOT_CONFIG.SLOT,
        id: SLOT_CONFIG.ENTRY_ID,
        order: SLOT_CONFIG.ORDER,
        inject: () => ({
          openSession: sessionId => openNativeSession(ctx, sessionId),
          onToggleGlobalSearch: currentlyActive => toggleGlobalSearchPanel(ctx, currentlyActive),
        }),
      },
      WorkspaceStatus,
    ),
  )
}
