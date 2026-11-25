/**
 * Current-conversation header actions (`conversation.session.header.actions`):
 * - Archive / Unarchive (native `uiWorkspace` / `workspaces`, fallback to `/archived-sessions/*`)
 * - Pin / Unpin (real DSH pinned state via `useWorkspaces` + `uiWorkspace`/`workspaces`, independent of Workbench stars)
 * - Show in Sidebar (opens native sidebar if needed, switches from Inbox view, clears search, expands workspace ancestors & older-row overflow, scrolls into view without changing active conversation)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeRevealScrollTop,
  isActiveSessionArchiveRefusal,
  resolveWorkspaceChainForSession,
} from './logic.js'

const HEADER_SLOT = Object.freeze({
  NAME: 'conversation.session.header.actions',
  ID: 'dsm-session-header-actions',
  ORDER: 20,
  STYLE_KEY: 'header-actions',
})

const HEADER_ATTRS = Object.freeze({
  REVEAL: 'data-dsm-reveal',
  SIDEBAR_COLLAPSED: 'data-sidebar-collapsed',
  SIDEBAR_SCROLLPORT: '[data-sidebar-scrollport]',
  SIDEBAR_LIST_AREA: '[data-sidebar-list-area]',
  SIDEBAR_HEADER: '[data-sidebar-workspace-header]',
  SIDEBAR_OPENER: '[data-sidebar-opener]',
  SIDEBAR_TOGGLE: '[data-sidebar-toggle]',
  WORKSPACES_TAB: '#dswb-tab-workspaces',
  VIEW_ATTR: 'data-dswb-view',
  VIEW_MESSAGES: 'messages',
  HIDDEN_ATTR: 'data-dsm-hidden',
  ENSURE_WORKSPACES_EVENT: 'dswb:ensure-workspaces-view',
})

const REVEAL_LIMITS = Object.freeze({
  SIDEBAR_OPEN_MAX_FRAMES: 24,
  MAX_OVERFLOW_STEPS: 40,
  STALL_LIMIT: 2,
  HIGHLIGHT_MS: 1600,
  STICKY_CLEARANCE_PX: 44,
})

const COPY = Object.freeze({
  zh: {
    groupLabel: '当前会话快捷操作',
    revealShort: '定位',
    revealLabel: '在侧栏中显示当前会话',
    revealBusy: '定位中…',
    pinShort: '置顶',
    unpinShort: '已置顶',
    pinLabel: '置顶当前会话',
    unpinLabel: '取消置顶当前会话',
    pinArchivedDisabled: '已归档会话无法置顶，取消归档后可置顶',
    pinUnavailable: '当前环境暂不支持置顶会话',
    pinNoAccess: '当前权限不允许置顶或取消置顶此会话',
    pinFailed: '置顶失败，请稍后重试',
    unpinFailed: '取消置顶失败，请稍后重试',
    archiveShort: '归档',
    unarchiveShort: '取消归档',
    archiveLabel: '归档当前会话',
    unarchiveLabel: '取消归档当前会话',
    archiveUnavailable: '当前环境暂不支持归档会话',
    archiveNoAccess: '当前权限不允许修改此会话的归档状态',
    archivedToast: '会话已归档',
    stoppedArchivedToast: '已停止运行并归档会话',
    undoArchive: '撤销',
    unarchivedToast: '已取消归档',
    archiveActivePrompt: '当前会话仍有运行中的任务，需先停止后才能归档',
    stopAndArchive: '停止并归档',
    archiveFailed: '归档失败',
    unarchiveFailed: '取消归档失败',
    revealTrashed: '该会话已移入回收站，未在侧栏显示',
    revealSubagent: '子智能体对话不在常规侧栏列表中',
    revealArchivedHidden: '当前会话已归档且侧栏未显示已归档项，可在侧栏视图选项中开启显示',
    revealMissing: '未在当前侧栏列表中找到该会话',
    revealSidebarClosed: '无法展开侧栏，请手动打开左侧栏查看',
  },
  en: {
    groupLabel: 'Session actions',
    revealShort: 'Locate',
    revealLabel: 'Show current session in sidebar',
    revealBusy: 'Locating…',
    pinShort: 'Pin',
    unpinShort: 'Pinned',
    pinLabel: 'Pin session',
    unpinLabel: 'Unpin session',
    pinArchivedDisabled: 'Archived sessions cannot be pinned',
    pinUnavailable: 'Pinning is unavailable in this environment',
    pinNoAccess: 'Permission denied to pin or unpin this session',
    pinFailed: 'Could not pin session. Try again later.',
    unpinFailed: 'Could not unpin session. Try again later.',
    archiveShort: 'Archive',
    unarchiveShort: 'Unarchive',
    archiveLabel: 'Archive session',
    unarchiveLabel: 'Unarchive session',
    archiveUnavailable: 'Archiving is unavailable in this environment',
    archiveNoAccess: 'Permission denied to archive or unarchive this session',
    archivedToast: 'Session archived',
    stoppedArchivedToast: 'Stopped activity and archived session',
    undoArchive: 'Undo',
    unarchivedToast: 'Session unarchived',
    archiveActivePrompt: 'This session still has active work running. Stop it to archive.',
    stopAndArchive: 'Stop & archive',
    archiveFailed: 'Could not archive session',
    unarchiveFailed: 'Could not unarchive session',
    revealTrashed: 'This session is in Trash and hidden from the sidebar',
    revealSubagent: 'Subagent conversations are omitted from the standard sidebar list',
    revealArchivedHidden: 'Session is archived and hidden by the sidebar filter. Enable "Show archived" in sidebar options.',
    revealMissing: 'Could not find this session in the sidebar',
    revealSidebarClosed: 'Could not open the sidebar automatically',
  },
})

function activeLanguage() {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement?.lang
    if (typeof lang === 'string' && lang) return /^zh/i.test(lang) ? 'zh' : 'en'
  }
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    return /^zh/i.test(navigator.language) ? 'zh' : 'en'
  }
  return 'zh'
}

const HEADER_ACTIONS_CSS = `
.dsm-hdr-acts{display:inline-flex;align-items:center;height:28px;padding:2px;gap:1px;box-sizing:border-box;flex:none;border-radius:var(--dsw-radius-sm,8px);border:.5px solid color-mix(in srgb,var(--dsw-alias-border-l2) 85%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 68%,transparent);-webkit-app-region:no-drag}
.dsm-hdr-act{appearance:none;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:22px;padding:0 7px;border:0;border-radius:calc(var(--dsw-radius-sm,8px) - 2px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;line-height:1;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,transform 80ms ease}
@media (hover:hover){.dsm-hdr-act:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}
.dsm-hdr-act:active:not(:disabled){transform:scale(.97)}
.dsm-hdr-act:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f6ef7));outline-offset:-1px;z-index:1}
.dsm-hdr-act:disabled{opacity:.42;cursor:not-allowed}
.dsm-hdr-act svg{flex:none;display:block}
.dsm-hdr-act-lbl{line-height:1}
.dsm-hdr-sep{width:.5px;height:12px;background:color-mix(in srgb,var(--dsw-alias-border-l1) 90%,transparent);flex:none;transition:opacity 120ms ease;pointer-events:none}
.dsm-hdr-act:hover+.dsm-hdr-sep,.dsm-hdr-act:focus-visible+.dsm-hdr-sep,.dsm-hdr-act--pinned+.dsm-hdr-sep,.dsm-hdr-act--archived+.dsm-hdr-sep,.dsm-hdr-sep:has(+ .dsm-hdr-act:hover),.dsm-hdr-sep:has(+ .dsm-hdr-act:focus-visible),.dsm-hdr-sep:has(+ .dsm-hdr-act--pinned),.dsm-hdr-sep:has(+ .dsm-hdr-act--archived){opacity:0}
.dsm-hdr-act--pinned{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7));background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 12%,transparent);font-weight:560}
@media (hover:hover){.dsm-hdr-act--pinned:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 18%,transparent);color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7))}}
.dsm-hdr-act--archived{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 65%,var(--dsw-alias-label-primary));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 14%,transparent);font-weight:560}
@media (hover:hover){.dsm-hdr-act--archived:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 22%,transparent);color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 72%,var(--dsw-alias-label-primary))}}
.dsm-hdr-spin{animation:dsm-hdr-spin .9s linear infinite}
@keyframes dsm-hdr-spin{to{transform:rotate(360deg)}}
@container (max-width:560px){
  .dsm-hdr-act-lbl{display:none}
  .dsm-hdr-act{width:24px;padding:0}
}
@keyframes dsm-reveal-flash{
  0%{background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 20%,transparent);box-shadow:inset 0 0 0 1.5px var(--dsw-alias-state-business-primary,#4f6ef7)}
  55%{background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 12%,transparent);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 72%,transparent)}
  100%{background-color:transparent;box-shadow:inset 0 0 0 1.5px transparent}
}
[role="treeitem"][${HEADER_ATTRS.REVEAL}="true"]{animation:dsm-reveal-flash ${REVEAL_LIMITS.HIGHLIGHT_MS}ms cubic-bezier(.16,1,.3,1) forwards}
@media (prefers-reduced-motion:reduce){
  .dsm-hdr-act,.dsm-hdr-sep{transition:none}
  .dsm-hdr-act:active:not(:disabled){transform:none}
  .dsm-hdr-spin{animation:none}
  [role="treeitem"][${HEADER_ATTRS.REVEAL}="true"]{animation:none;box-shadow:inset 0 0 0 1.5px var(--dsw-alias-state-business-primary,#4f6ef7);background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 12%,transparent)}
}
`

function ArchiveIcon({ archived }) {
  if (archived) {
    return (
      <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <rect x="2" y="2.5" width="12" height="2.8" rx="0.9" stroke="currentColor" strokeWidth="1.35" />
        <path d="M3.2 5.3v7.2c0 .66.54 1.2 1.2 1.2h7.2c.66 0 1.2-.54 1.2-1.2V5.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 11.4V7.6M6.3 9.2L8 7.5l1.7 1.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="2" y="2.5" width="12" height="2.8" rx="0.9" stroke="currentColor" strokeWidth="1.35" />
      <path d="M3.2 5.3v7.2c0 .66.54 1.2 1.2 1.2h7.2c.66 0 1.2-.54 1.2-1.2V5.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.4 8.7h3.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function PinIcon({ pinned }) {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9.7 2.4l3.9 3.9-.9.9c-.55.55-1.3.7-1.95.44l-2.3 2.3.3 1.9-.75.75L5.8 10.4 2.7 13.5l-.4-.4 3.1-3.1L3.2 7.8l.75-.75 1.9.3 2.3-2.3c-.26-.65-.11-1.4.44-1.95l.91-.7z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RevealSidebarIcon() {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.1" y="2.5" width="11.8" height="11" rx="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.2 2.7v10.6" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8.5 8h3.4M10.4 6.4L12 8l-1.6 1.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="dsm-hdr-spin" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeOpacity="0.24" strokeWidth="1.5" />
      <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function escapeAttrVal(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value))
  return String(value).replace(/["\\]/g, '\\$&')
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}

function findVisibleSessionRow(listArea, sessionId) {
  if (!listArea || !sessionId) return null
  try {
    const sel = `[role="treeitem"][data-row-key="session:${escapeAttrVal(sessionId)}"]`
    const row = listArea.querySelector(sel)
    if (!row) return null
    if (row.style && row.style.display === 'none') return null
    if (row.hasAttribute(HEADER_ATTRS.HIDDEN_ATTR)) return null
    return row
  } catch (e) {
    return null
  }
}

export function installHeaderActionsIntegration(ctx, {
  postJSON,
  notify,
  isTrashedOrPurged,
  getLineage,
  recognizeGroupQuiet,
} = {}) {
  let activeRevealSeq = 0
  let activeRevealTimer = null
  let activeRevealRow = null

  const clearRevealHighlight = () => {
    if (activeRevealTimer) {
      clearTimeout(activeRevealTimer)
      activeRevealTimer = null
    }
    if (activeRevealRow && activeRevealRow.isConnected) {
      activeRevealRow.removeAttribute(HEADER_ATTRS.REVEAL)
    }
    activeRevealRow = null
  }

  const getWorkspacesSnapshotFallback = () => {
    try {
      const wsSvc = ctx.get('workspaces')
      if (wsSvc && wsSvc.list && typeof wsSvc.list.getSnapshot === 'function') {
        return wsSvc.list.getSnapshot()
      }
    } catch (e) { /* optional */ }
    return null
  }

  const getSessionSummaryFallback = (sid) => {
    try {
      const sessionsSvc = ctx.get('sessions')
      if (sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.getSnapshot === 'function') {
        return sessionsSvc.list.getSnapshot()?.byId?.[sid] || null
      }
    } catch (e) { /* optional */ }
    return null
  }

  const resolveCommands = () => {
    let uiWorkspace = null
    let workspaces = null
    let layout = null
    try { uiWorkspace = ctx.get('uiWorkspace') || null } catch (e) { uiWorkspace = null }
    try { workspaces = ctx.get('workspaces') || null } catch (e) { workspaces = null }
    try { layout = ctx.get('layout') || null } catch (e) { layout = null }
    return { uiWorkspace, workspaces, layout }
  }

  const flashSessionRow = (row) => {
    clearRevealHighlight()
    activeRevealRow = row
    row.setAttribute(HEADER_ATTRS.REVEAL, 'true')
    activeRevealTimer = setTimeout(() => {
      activeRevealTimer = null
      if (activeRevealRow === row && row.isConnected) {
        row.removeAttribute(HEADER_ATTRS.REVEAL)
      }
      if (activeRevealRow === row) activeRevealRow = null
    }, REVEAL_LIMITS.HIGHLIGHT_MS)
  }

  const ensureSidebarExpanded = async (seq, layout) => {
    const isSidebarOpen = () => {
      const listArea = document.querySelector(HEADER_ATTRS.SIDEBAR_LIST_AREA)
      if (!listArea || listArea.closest('[inert]')) return false
      if (document.querySelector(`[${HEADER_ATTRS.SIDEBAR_COLLAPSED}="true"]`)) return false
      return true
    }
    if (isSidebarOpen()) return true

    let triggered = false
    if (layout && typeof layout.toggleSidebar === 'function') {
      try {
        layout.toggleSidebar()
        triggered = true
      } catch (e) { /* fall through to opener button */ }
    }
    if (!triggered) {
      const opener = document.querySelector(HEADER_ATTRS.SIDEBAR_OPENER)
        || document.querySelector(HEADER_ATTRS.SIDEBAR_TOGGLE)
      if (opener && typeof opener.click === 'function') {
        opener.click()
        triggered = true
      }
    }
    if (!triggered) return false

    for (let frame = 0; frame < REVEAL_LIMITS.SIDEBAR_OPEN_MAX_FRAMES; frame++) {
      await nextFrame()
      if (seq !== activeRevealSeq) return false
      if (isSidebarOpen()) {
        await nextFrame()
        return seq === activeRevealSeq
      }
    }
    return isSidebarOpen()
  }

  const findGroupKeyFromRenderedTrees = (listArea, sid) => {
    if (typeof recognizeGroupQuiet !== 'function') return null
    const wsRows = listArea.querySelectorAll('[role="treeitem"][data-row-key^="workspace:"]')
    for (const row of wsRows) {
      const group = recognizeGroupQuiet(row)
      if (!group || !Array.isArray(group.sessions)) continue
      if (group.sessions.some((s) => s && String(s.id) === sid)) {
        const raw = row.getAttribute('data-row-key') || ''
        return raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : String(group.key ?? '')
      }
    }
    return null
  }

  function HeaderActionsSeat(props) {
    const sid = props && props.sessionId != null ? String(props.sessionId) : ''
    const useWorkspaces = props && typeof props.useWorkspaces === 'function' ? props.useWorkspaces : null
    const useSession = props && typeof props.useSession === 'function' ? props.useSession : null
    const useSessions = props && typeof props.useSessions === 'function' ? props.useSessions : null
    const useAccess = props && typeof props.useAccess === 'function' ? props.useAccess : null
    const useSessionAccess = props && typeof props.useSessionAccess === 'function' ? props.useSessionAccess : null

    const copy = COPY[activeLanguage()]

    const wsSnapHook = useWorkspaces ? useWorkspaces((s) => s) : null
    const sessionSnap = useSession ? useSession((s) => s) : null
    const summaryHook = useSessions ? useSessions((s) => (s && s.byId ? s.byId[sid] : null)) : null

    const [wsSnapFallback, setWsSnapFallback] = useState(() => (useWorkspaces ? null : getWorkspacesSnapshotFallback()))
    const [fallbackArchived, setFallbackArchived] = useState(null)
    const [pinBusy, setPinBusy] = useState(false)
    const [archiveBusy, setArchiveBusy] = useState(false)
    const [revealBusy, setRevealBusy] = useState(false)
    const mountedRef = useRef(true)

    useEffect(() => {
      mountedRef.current = true
      return () => { mountedRef.current = false }
    }, [])

    useEffect(() => {
      setFallbackArchived(null)
      setPinBusy(false)
      setArchiveBusy(false)
      setRevealBusy(false)
      activeRevealSeq += 1
    }, [sid])

    useEffect(() => {
      if (useWorkspaces) return undefined
      const wsSvc = resolveCommands().workspaces
      if (!wsSvc || !wsSvc.list || typeof wsSvc.list.subscribe !== 'function') return undefined
      setWsSnapFallback(wsSvc.list.getSnapshot())
      return wsSvc.list.subscribe(() => {
        if (mountedRef.current) setWsSnapFallback(wsSvc.list.getSnapshot())
      })
    }, [useWorkspaces])

    const wsSnap = wsSnapHook || wsSnapFallback || getWorkspacesSnapshotFallback()
    const hasNativeWorkspaceState = Boolean(wsSnap && Array.isArray(wsSnap.archivedSessionIds))
    const archived = hasNativeWorkspaceState
      ? wsSnap.archivedSessionIds.includes(sid)
      : Boolean(fallbackArchived)
    const hasNativePinState = Boolean(wsSnap && Array.isArray(wsSnap.pinnedSessionIds))
    const pinned = hasNativePinState && wsSnap.pinnedSessionIds.includes(sid)

    const { uiWorkspace, workspaces, layout } = resolveCommands()

    const canNativePin = Boolean(
      (uiWorkspace && typeof uiWorkspace.pinSession === 'function' && typeof uiWorkspace.unpinSession === 'function')
      || (workspaces && typeof workspaces.pinSession === 'function' && typeof workspaces.unpinSession === 'function'),
    )
    const canNativeArchive = Boolean(
      (uiWorkspace && typeof uiWorkspace.archiveSession === 'function' && typeof uiWorkspace.unarchiveSession === 'function')
      || (workspaces && typeof workspaces.archiveSession === 'function' && typeof workspaces.unarchiveSession === 'function'),
    )
    const canFallbackArchive = typeof postJSON === 'function'

    const pinEndpoint = pinned ? 'workspace/unpinSession' : 'workspace/pinSession'
    const archiveEndpoint = archived ? 'workspace/unarchiveSession' : 'workspace/archiveSession'

    const hasPinAccess = typeof useAccess === 'function'
      ? Boolean(useAccess(pinEndpoint))
      : typeof useSessionAccess === 'function'
        ? Boolean(useSessionAccess(sid, pinEndpoint))
        : true
    const hasArchiveAccess = typeof useAccess === 'function'
      ? Boolean(useAccess(archiveEndpoint))
      : typeof useSessionAccess === 'function'
        ? Boolean(useSessionAccess(sid, archiveEndpoint))
        : true

    const summary = summaryHook || getSessionSummaryFallback(sid)
    const isBlank = Boolean(sessionSnap?.blank || summary?.blank)
    const isSubagent = Boolean(
      sessionSnap?.subagent
      || summary?.origin === 'subagent'
      || (typeof getLineage === 'function' && getLineage(sid)?.origin === 'subagent'),
    )

    const notifyUser = useCallback((msg, kind = 'ok', action) => {
      if (typeof notify === 'function') notify(msg, kind, action)
    }, [])

    const runUnarchive = useCallback(async (targetSid) => {
      const cmds = resolveCommands()
      const unarchiveFn = (cmds.uiWorkspace && typeof cmds.uiWorkspace.unarchiveSession === 'function')
        ? (id) => cmds.uiWorkspace.unarchiveSession(id)
        : (cmds.workspaces && typeof cmds.workspaces.unarchiveSession === 'function')
          ? (id) => cmds.workspaces.unarchiveSession(id)
          : canFallbackArchive
            ? (id) => postJSON('/archived-sessions/restore', { sessionId: id })
            : null
      if (!unarchiveFn) {
        notifyUser(copy.archiveUnavailable, 'err')
        return
      }
      await unarchiveFn(targetSid)
      if (!hasNativeWorkspaceState && mountedRef.current && targetSid === sid) setFallbackArchived(false)
      notifyUser(copy.unarchivedToast, 'ok')
    }, [canFallbackArchive, copy, hasNativeWorkspaceState, notifyUser, sid])

    const runArchive = useCallback(async (targetSid, stopActivity = false) => {
      const cmds = resolveCommands()
      const archiveFn = (cmds.uiWorkspace && typeof cmds.uiWorkspace.archiveSession === 'function')
        ? (id, opts) => cmds.uiWorkspace.archiveSession(id, opts)
        : (cmds.workspaces && typeof cmds.workspaces.archiveSession === 'function')
          ? (id, opts) => cmds.workspaces.archiveSession(id, opts)
          : (!stopActivity && canFallbackArchive)
            ? (id) => postJSON('/archived-sessions/archive', { sessionId: id })
            : null

      if (!archiveFn) {
        notifyUser(copy.archiveUnavailable, 'err')
        return
      }
      try {
        await archiveFn(targetSid, stopActivity ? { stopActivity: true } : undefined)
        if (!hasNativeWorkspaceState && mountedRef.current && targetSid === sid) setFallbackArchived(true)
        notifyUser(
          stopActivity ? copy.stoppedArchivedToast : copy.archivedToast,
          'ok',
          {
            label: copy.undoArchive,
            busyLabel: '…',
            onAction: () => runUnarchive(targetSid).catch((err) => {
              notifyUser(`${copy.unarchiveFailed}：${String((err && err.message) || err)}`, 'err')
            }),
          },
        )
      } catch (err) {
        const activeRefusal = isActiveSessionArchiveRefusal(err)
        if (!stopActivity && activeRefusal !== null) {
          notifyUser(copy.archiveActivePrompt, 'warn', {
            label: copy.stopAndArchive,
            busyLabel: '…',
            onAction: () => runArchive(targetSid, true),
          })
          return
        }
        notifyUser(`${copy.archiveFailed}：${String((err && err.message) || err)}`, 'err')
      }
    }, [canFallbackArchive, copy, hasNativeWorkspaceState, notifyUser, runUnarchive, sid])

    const handleArchiveClick = async (e) => {
      e.stopPropagation()
      if (!sid || archiveBusy) return
      if (!hasArchiveAccess) {
        notifyUser(copy.archiveNoAccess, 'warn')
        return
      }
      if (!canNativeArchive && !canFallbackArchive) {
        notifyUser(copy.archiveUnavailable, 'err')
        return
      }
      setArchiveBusy(true)
      try {
        if (archived) {
          await runUnarchive(sid)
        } else {
          await runArchive(sid, false)
        }
      } catch (err) {
        notifyUser(`${archived ? copy.unarchiveFailed : copy.archiveFailed}：${String((err && err.message) || err)}`, 'err')
      } finally {
        if (mountedRef.current) setArchiveBusy(false)
      }
    }

    const handlePinClick = async (e) => {
      e.stopPropagation()
      if (!sid || pinBusy || archived) return
      if (!hasPinAccess) {
        notifyUser(copy.pinNoAccess, 'warn')
        return
      }
      const cmds = resolveCommands()
      const targetSvc = cmds.uiWorkspace && typeof cmds.uiWorkspace.pinSession === 'function' && typeof cmds.uiWorkspace.unpinSession === 'function'
        ? cmds.uiWorkspace
        : (cmds.workspaces && typeof cmds.workspaces.pinSession === 'function' && typeof cmds.workspaces.unpinSession === 'function' ? cmds.workspaces : null)
      const fn = targetSvc ? (pinned ? targetSvc.unpinSession : targetSvc.pinSession) : null
      if (typeof fn !== 'function') {
        notifyUser(copy.pinUnavailable, 'err')
        return
      }
      setPinBusy(true)
      try {
        await fn.call(targetSvc, sid)
      } catch (err) {
        notifyUser(pinned ? copy.unpinFailed : copy.pinFailed, 'err')
      } finally {
        if (mountedRef.current) setPinBusy(false)
      }
    }

    const handleRevealClick = async (e) => {
      e.stopPropagation()
      if (!sid || revealBusy || typeof document === 'undefined') return
      if (typeof isTrashedOrPurged === 'function' && isTrashedOrPurged(sid)) {
        notifyUser(copy.revealTrashed, 'warn')
        return
      }
      if (isSubagent) {
        notifyUser(copy.revealSubagent, 'warn')
        return
      }

      const seq = ++activeRevealSeq
      setRevealBusy(true)
      try {
        const opened = await ensureSidebarExpanded(seq, layout)
        if (seq !== activeRevealSeq || !mountedRef.current) return
        if (!opened) {
          notifyUser(copy.revealSidebarClosed, 'warn')
          return
        }

        let listArea = document.querySelector(HEADER_ATTRS.SIDEBAR_LIST_AREA)
        if (!listArea) {
          notifyUser(copy.revealMissing, 'warn')
          return
        }

        if (listArea.getAttribute(HEADER_ATTRS.VIEW_ATTR) === HEADER_ATTRS.VIEW_MESSAGES) {
          window.dispatchEvent(new CustomEvent(HEADER_ATTRS.ENSURE_WORKSPACES_EVENT))
          await nextFrame()
          if (seq !== activeRevealSeq || !mountedRef.current) return
          listArea = document.querySelector(HEADER_ATTRS.SIDEBAR_LIST_AREA) || listArea
          if (listArea.getAttribute(HEADER_ATTRS.VIEW_ATTR) === HEADER_ATTRS.VIEW_MESSAGES) {
            const tab = document.querySelector(HEADER_ATTRS.WORKSPACES_TAB)
            if (tab && typeof tab.click === 'function') {
              tab.click()
              await nextFrame()
              if (seq !== activeRevealSeq || !mountedRef.current) return
            }
          }
        }

        const sidebarHeader = document.querySelector(HEADER_ATTRS.SIDEBAR_HEADER)
        const searchInput = sidebarHeader ? sidebarHeader.querySelector('input') : null
        if (searchInput && searchInput.value) {
          const clearBtn = searchInput.parentElement
            ? searchInput.parentElement.querySelector('button:not([aria-expanded])')
            : null
          if (clearBtn && typeof clearBtn.click === 'function') {
            clearBtn.click()
            await nextFrame()
            await nextFrame()
            if (seq !== activeRevealSeq || !mountedRef.current) return
            listArea = document.querySelector(HEADER_ATTRS.SIDEBAR_LIST_AREA) || listArea
          }
        }

        let targetRow = findVisibleSessionRow(listArea, sid)

        if (!targetRow) {
          const hasWorkspacesTree = listArea.querySelector('[role="treeitem"][data-row-key^="workspace:"]') !== null
          if (hasWorkspacesTree) {
            const wsItems = (wsSnap && Array.isArray(wsSnap.items)) ? wsSnap.items : []
            const chain = resolveWorkspaceChainForSession(wsItems, sid)
            let targetGroupKey = chain.groupKey
            let ancestorKeys = chain.ancestorKeys
            if (!chain.found) {
              const inferredKey = findGroupKeyFromRenderedTrees(listArea, sid)
              if (inferredKey !== null) {
                targetGroupKey = inferredKey
                ancestorKeys = [inferredKey]
              }
            }

            for (const key of ancestorKeys) {
              if (seq !== activeRevealSeq) return
              const wsRow = listArea.querySelector(
                `[role="treeitem"][data-row-key="workspace:${escapeAttrVal(key)}"]`,
              )
              if (wsRow && wsRow.getAttribute('aria-expanded') === 'false') {
                wsRow.click()
                await nextFrame()
                await nextFrame()
                if (seq !== activeRevealSeq || !mountedRef.current) return
              }
            }

            targetRow = findVisibleSessionRow(listArea, sid)
            if (!targetRow) {
              let stalls = 0
              let prevGroupCount = -1
              for (let step = 0; step < REVEAL_LIMITS.MAX_OVERFLOW_STEPS; step++) {
                if (seq !== activeRevealSeq || !mountedRef.current) return
                targetRow = findVisibleSessionRow(listArea, sid)
                if (targetRow) break
                const overflowBtn = listArea.querySelector(
                  `[data-row-key="overflow:${escapeAttrVal(targetGroupKey)}"]`,
                )
                if (!overflowBtn || overflowBtn.getAttribute('aria-expanded') === 'true') break
                if (overflowBtn.style && overflowBtn.style.display === 'none') break
                const scope = overflowBtn.parentElement
                const curCount = scope
                  ? scope.querySelectorAll('[role="treeitem"][data-row-key^="session:"]').length
                  : 0
                const prevText = overflowBtn.textContent || ''
                overflowBtn.click()
                await nextFrame()
                await nextFrame()
                if (seq !== activeRevealSeq || !mountedRef.current) return
                targetRow = findVisibleSessionRow(listArea, sid)
                if (targetRow) break
                const nextBtn = listArea.querySelector(
                  `[data-row-key="overflow:${escapeAttrVal(targetGroupKey)}"]`,
                )
                const nextCount = scope && scope.isConnected
                  ? scope.querySelectorAll('[role="treeitem"][data-row-key^="session:"]').length
                  : curCount
                const textChanged = Boolean(nextBtn && (nextBtn.textContent || '') !== prevText)
                if (nextCount <= curCount && !textChanged && prevGroupCount === curCount) {
                  if (++stalls >= REVEAL_LIMITS.STALL_LIMIT) break
                } else {
                  stalls = 0
                }
                prevGroupCount = curCount
              }
            }
          }
        }

        if (seq !== activeRevealSeq || !mountedRef.current) return
        if (!targetRow) {
          notifyUser(archived ? copy.revealArchivedHidden : copy.revealMissing, 'warn')
          return
        }

        const scrollport = document.querySelector(HEADER_ATTRS.SIDEBAR_SCROLLPORT)
        if (scrollport && scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop > 1) {
          scrollport.scrollTop = scrollport.scrollHeight - scrollport.clientHeight
          await nextFrame()
          if (seq !== activeRevealSeq || !mountedRef.current) return
        }

        const reduced = prefersReducedMotion()
        if (listArea.scrollHeight > listArea.clientHeight + 1) {
          const listRect = listArea.getBoundingClientRect()
          const rowRect = targetRow.getBoundingClientRect()
          const nextTop = computeRevealScrollTop({
            rowTop: rowRect.top,
            rowHeight: rowRect.height || 32,
            listTop: listRect.top,
            listHeight: listRect.height,
            currentScrollTop: listArea.scrollTop,
            scrollHeight: listArea.scrollHeight,
            stickyClearance: REVEAL_LIMITS.STICKY_CLEARANCE_PX,
          })
          if (typeof listArea.scrollTo === 'function') {
            listArea.scrollTo({ top: nextTop, behavior: reduced ? 'auto' : 'smooth' })
          } else {
            listArea.scrollTop = nextTop
          }
        } else if (typeof targetRow.scrollIntoView === 'function') {
          targetRow.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
        }

        if (typeof targetRow.focus === 'function') {
          targetRow.focus({ preventScroll: true })
        }
        flashSessionRow(targetRow)
      } finally {
        if (mountedRef.current && seq === activeRevealSeq) setRevealBusy(false)
      }
    }

    if (!sid || isBlank) return null

    const pinDisabled = pinBusy || archived || !canNativePin || !hasPinAccess
    const pinTitle = archived
      ? copy.pinArchivedDisabled
      : !canNativePin
        ? copy.pinUnavailable
        : !hasPinAccess
          ? copy.pinNoAccess
          : (pinned ? copy.unpinLabel : copy.pinLabel)

    const archiveDisabled = archiveBusy || (!canNativeArchive && !canFallbackArchive) || !hasArchiveAccess
    const archiveTitle = !canNativeArchive && !canFallbackArchive
      ? copy.archiveUnavailable
      : !hasArchiveAccess
        ? copy.archiveNoAccess
        : (archived ? copy.unarchiveLabel : copy.archiveLabel)

    return (
      <div className="dsm-hdr-acts" role="group" aria-label={copy.groupLabel}>
        <button
          type="button"
          className={'dsm-hdr-act' + (archived ? ' dsm-hdr-act--archived' : '')}
          disabled={archiveDisabled}
          aria-pressed={archived}
          aria-label={archiveTitle}
          title={archiveTitle}
          onClick={handleArchiveClick}
        >
          {archiveBusy ? <SpinnerIcon /> : <ArchiveIcon archived={archived} />}
          <span className="dsm-hdr-act-lbl">{archived ? copy.unarchiveShort : copy.archiveShort}</span>
        </button>
        <span className="dsm-hdr-sep" aria-hidden="true" />
        <button
          type="button"
          className={'dsm-hdr-act' + (pinned ? ' dsm-hdr-act--pinned' : '')}
          disabled={pinDisabled}
          aria-pressed={pinned}
          aria-label={pinTitle}
          title={pinTitle}
          onClick={handlePinClick}
        >
          {pinBusy ? <SpinnerIcon /> : <PinIcon pinned={pinned} />}
          <span className="dsm-hdr-act-lbl">{pinned ? copy.unpinShort : copy.pinShort}</span>
        </button>
        <span className="dsm-hdr-sep" aria-hidden="true" />
        <button
          type="button"
          className="dsm-hdr-act"
          disabled={revealBusy}
          aria-busy={revealBusy || undefined}
          aria-label={copy.revealLabel}
          title={copy.revealLabel}
          onClick={handleRevealClick}
        >
          {revealBusy ? <SpinnerIcon /> : <RevealSidebarIcon />}
          <span className="dsm-hdr-act-lbl">{revealBusy ? copy.revealBusy : copy.revealShort}</span>
        </button>
      </div>
    )
  }

  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.dsm = HEADER_SLOT.STYLE_KEY
    tag.textContent = HEADER_ACTIONS_CSS
    document.head.appendChild(tag)
    return () => {
      activeRevealSeq += 1
      clearRevealHighlight()
      tag.remove()
    }
  }, 'dsm: header-actions styles')

  ctx.effect(
    () =>
      ctx.slots.inject(HEADER_SLOT.NAME, () =>
        ctx.slots.register(
          {
            name: HEADER_SLOT.NAME,
            id: HEADER_SLOT.ID,
            order: HEADER_SLOT.ORDER,
          },
          HeaderActionsSeat,
        ),
      ),
    'dsm: session header actions seat',
  )
}
