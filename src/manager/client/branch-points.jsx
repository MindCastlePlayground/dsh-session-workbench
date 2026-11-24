/**
 * Source-conversation fork branch disclosures (official conversation slots +
 * strictly scoped active-conversation DOM sync).
 *
 * Design invariants:
 * - Bounded cache for the active conversation only (single slot, cleared on
 *   session change / unload).
 * - Never guesses an anchor and never indexes rendered DOM by raw recordIndex.
 * - Prefers official `conversation.chat.assistant-actions` when available; falls
 *   back to exact `[data-chat-node-key]` turn-tail anchors scoped inside the
 *   active conversation scrollport, deduplicating by `branchPointKey`.
 * - Any `unanchored` child or currently unloaded / unconfirmed point stays in
 *   the explicit session-level disclosure in `conversation.session.header.utilities`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  branchPointKey,
  matchPointToActionSlot,
  partitionBranchPoints,
  pathTail,
  sameWorkspacePath,
  shortId,
} from './logic.js'

const BRANCH_POINTS_CSS = `
.dsm-bp-hdr{position:relative;display:inline-flex;align-items:center;flex:none}
.dsm-bp-hdr-btn{appearance:none;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 38%,var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-sm,8px);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 8%,transparent);color:var(--dsw-alias-state-success-primary,#2f8f4e);font:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;transition:background-color .15s ease,border-color .15s ease}
.dsm-bp-hdr-btn:hover{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 15%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 58%,transparent)}
.dsm-bp-hdr-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:1px}
.dsm-bp-hdr-btn[aria-expanded="true"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 18%,transparent)}
.dsm-bp-hdr-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#EAB308);flex:none}
.dsm-bp-pop{position:fixed;z-index:1200;width:min(360px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 80px));overflow-y:auto;scrollbar-width:thin;padding:10px;border:1px solid var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(24px) saturate(140%));box-shadow:0 14px 38px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:10px;box-sizing:border-box;animation:dsm-bp-in .15s cubic-bezier(.16,1,.3,1)}
@keyframes dsm-bp-in{from{opacity:0;transform:translateY(-4px)}}
.dsm-bp-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:6px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsm-bp-pop-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0;display:inline-flex;align-items:center;gap:6px}
.dsm-bp-pop-acts{display:inline-flex;align-items:center;gap:4px}
.dsm-bp-icon-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:.5px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .14s ease,color .14s ease}
.dsm-bp-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsm-bp-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:1px}
.dsm-bp-icon-btn:disabled{opacity:.45;cursor:default}
.dsm-bp-sec{display:flex;flex-direction:column;gap:5px}
.dsm-bp-sec-head{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsm-bp-sec-note{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary);margin:0}
.dsm-bp-unloc-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#EAB308) 14%,transparent);color:var(--dsw-alias-label-primary);border:.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#EAB308) 45%,transparent);font-size:10.5px;font-weight:500}
.dsm-bp-group{display:flex;flex-direction:column;gap:4px;padding:7px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.dsm-bp-group--warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#EAB308) 42%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#EAB308) 5%,var(--dsw-alias-bg-layer-1))}
.dsm-bp-group-head{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsm-bp-group-link{appearance:none;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;padding:1px 7px;cursor:pointer;transition:border-color .14s ease,color .14s ease}
.dsm-bp-group-link:hover{border-color:var(--dsw-alias-state-business-primary,#4f6ef7);color:var(--dsw-alias-state-business-primary,#4f6ef7)}
.dsm-bp-group-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:1px}
.dsm-bp-list{display:flex;flex-direction:column;gap:3px}
.dsm-bp-child{appearance:none;display:flex;align-items:center;gap:7px;width:100%;min-height:30px;padding:5px 8px;border:.5px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;transition:background-color .14s ease,border-color .14s ease}
.dsm-bp-child:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.dsm-bp-child:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:-1px}
.dsm-bp-child-ico{flex:none;color:var(--dsw-alias-state-success-primary,#2f8f4e);display:inline-flex}
.dsm-bp-child-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.dsm-bp-child-ws{flex:none;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dsm-bp-child-go{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsm-bp-child:hover .dsm-bp-child-go{color:var(--dsw-alias-state-success-primary,#2f8f4e)}
.dsm-bp-slot{position:relative;display:inline-flex;align-items:center}
.dsm-bp-inline{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:8px 0 2px;padding-top:6px;border-top:.5px dashed color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 28%,var(--dsw-alias-border-l1))}
.dsm-bp-pill{appearance:none;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 42%,transparent);border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 9%,transparent);color:var(--dsw-alias-state-success-primary,#2f8f4e);font:inherit;font-size:11.5px;font-weight:500;line-height:1;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;transition:background-color .14s ease,border-color .14s ease}
.dsm-bp-pill:hover{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 16%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 60%,transparent)}
.dsm-bp-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:1px}
.dsm-bp-pill[aria-expanded="true"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 18%,transparent)}
.dsm-bp-caret{transition:transform .14s ease;flex:none}
.dsm-bp-pill[aria-expanded="true"] .dsm-bp-caret{transform:rotate(90deg)}
.dsm-bp-tray{display:flex;flex-direction:column;gap:3px;width:min(420px,100%);padding:6px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 32%,var(--dsw-alias-border-l2));border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 4px 16px rgba(0,0,0,.08);box-sizing:border-box}
.dsm-bp-tray-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:1px 4px 4px;font-size:11px;color:var(--dsw-alias-label-secondary);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsm-bp-flash{outline:2px solid var(--dsw-alias-state-success-primary,#2f8f4e);outline-offset:2px;border-radius:10px;transition:outline-color .5s ease}
.dsm-bp-err{font-size:11.5px;color:var(--dsw-alias-state-error-primary);padding:4px 2px}
@media (prefers-reduced-motion:reduce){.dsm-bp-pop{animation:none}.dsm-bp-hdr-btn,.dsm-bp-pill,.dsm-bp-caret,.dsm-bp-child,.dsm-bp-flash{transition:none}}
`

const FORK_SVG_STR = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="5" cy="3.5" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="12.5" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="11.5" cy="7.5" r="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M5 5.1v5.8M5 8.5c0-1.6 1.5-2.6 4.9-1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
const CARET_SVG_STR = '<svg class="dsm-bp-caret" width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function ForkIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="5" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="7.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5.1v5.8M5 8.5c0-1.6 1.5-2.6 4.9-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CaretIcon({ open }) {
  return (
    <svg
      className="dsm-bp-caret"
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={open ? { transform: 'rotate(90deg)' } : undefined}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M13 8a5 5 0 1 1-1.4-3.5M13 3.2v2.4h-2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function escapeAttr(val) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(val))
  return String(val).replace(/["\\]/g, '\\$&')
}

function findMainChatRow(nodeKey) {
  if (typeof document === 'undefined' || !nodeKey) return null
  try {
    const rows = document.querySelectorAll(`[data-chat-node-key="${escapeAttr(nodeKey)}"]`)
    for (const row of rows) {
      if (row.closest('[data-sidebar-right-tab]')) continue
      return row
    }
    return rows[0] || null
  } catch (e) {
    return null
  }
}

function findConversationScope(order) {
  if (typeof document === 'undefined') return null
  try {
    const direct = document.querySelector('[data-conversation-scroll]')
    if (direct) return direct
    if (Array.isArray(order) && order.length) {
      for (let i = order.length - 1; i >= 0; i--) {
        const row = findMainChatRow(order[i])
        if (row) {
          return row.closest('[data-conversation-scroll]') || row.parentElement || null
        }
      }
    }
  } catch (e) { /* ignore */ }
  return null
}

function pointHeadingLabel(point) {
  if (!point || typeof point !== 'object') return '分支点'
  if (Number.isSafeInteger(point.turn)) return `第 ${point.turn} 轮处`
  if (Number.isSafeInteger(point.atSeq)) return `事件 #${point.atSeq} 处`
  if (Number.isSafeInteger(point.recordIndex)) return `记录 #${point.recordIndex} 处`
  return '此处分支'
}

export function installBranchPointsIntegration(ctx, {
  postJSON,
  openSessionById,
  notify,
  subscribeLineageChange,
  getAuthoritativeTitle,
  getSessionCwd,
}) {
  // Single-entry bounded cache: holds ONLY the currently active conversation.
  const store = {
    sessionId: null,
    status: 'idle',
    points: [],
    unanchored: [],
    error: null,
    reqSeq: 0,
    controller: null,
    slotKeys: new Set(),
    listeners: new Set(),
  }

  const emit = () => {
    for (const fn of store.listeners) {
      try { fn() } catch (e) { /* listener error isolated */ }
    }
  }

  const subscribe = (fn) => {
    store.listeners.add(fn)
    return () => store.listeners.delete(fn)
  }

  const removeAllDomAnchors = () => {
    if (typeof document === 'undefined') return
    try {
      document.querySelectorAll('[data-dsm-branch-anchor]').forEach((el) => el.remove())
    } catch (e) { /* best-effort */ }
  }

  const clearStoreFor = (sid) => {
    if (sid != null && store.sessionId !== String(sid)) return
    if (store.controller) {
      try { store.controller.abort() } catch (e) {}
      store.controller = null
    }
    store.reqSeq += 1
    store.sessionId = null
    store.status = 'idle'
    store.points = []
    store.unanchored = []
    store.error = null
    store.slotKeys.clear()
    removeAllDomAnchors()
    emit()
  }

  const fetchBranchPoints = async (sid, { force = false } = {}) => {
    const id = sid ? String(sid) : ''
    if (!id) return
    if (!force && store.sessionId === id && store.status === 'loading') return
    if (store.controller) {
      try { store.controller.abort() } catch (e) {}
      store.controller = null
    }
    const isSwitch = store.sessionId !== id
    const reqId = ++store.reqSeq
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    store.controller = controller
    store.sessionId = id
    store.status = 'loading'
    store.error = null
    if (isSwitch) {
      store.points = []
      store.unanchored = []
      store.slotKeys.clear()
      removeAllDomAnchors()
    }
    emit()
    try {
      const res = await fetch('/archived-sessions/branch-points', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId: id }),
        signal: controller ? controller.signal : undefined,
      })
      const data = await res.json().catch(() => null)
      if (reqId !== store.reqSeq || store.sessionId !== id) return
      if (!res.ok || !data) {
        throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`)
      }
      store.points = Array.isArray(data.points) ? data.points : []
      store.unanchored = Array.isArray(data.unanchored) ? data.unanchored : []
      store.status = 'ready'
      store.error = null
      store.controller = null
      emit()
    } catch (e) {
      if ((controller && controller.signal.aborted) || reqId !== store.reqSeq || store.sessionId !== id) return
      store.status = 'error'
      store.error = String((e && e.message) || e)
      store.controller = null
      emit()
    }
  }

  const registerSlotKey = (sid, key) => {
    if (!key || store.sessionId !== String(sid)) return () => {}
    store.slotKeys.add(key)
    emit()
    return () => {
      if (store.slotKeys.delete(key)) emit()
    }
  }

  const labelForChild = (child) => {
    if (!child) return ''
    const auth = typeof getAuthoritativeTitle === 'function' ? getAuthoritativeTitle(String(child.id)) : null
    return String(child.title || auth || '').trim() || shortId(child.id) || String(child.id)
  }

  const crossProjectLabel = (child, sourceCwd) => {
    if (!child || !child.cwd) return ''
    if (sourceCwd && sameWorkspacePath(child.cwd, sourceCwd)) return ''
    return pathTail(child.cwd) || child.cwd
  }

  const handleOpenChild = async (child, parentSessionId) => {
    if (!child || !child.id) return
    const res = await openSessionById(child.id, parentSessionId)
    if (res !== 'ok' && typeof notify === 'function') {
      notify(`无法打开分支「${labelForChild(child)}」，请在左侧会话列表中手动切换`, 'err')
    }
  }

  const loadThroughSeq = (sessionId, seq) => {
    if (!Number.isSafeInteger(seq)) return false
    try {
      const sessions = ctx.get('sessions')
      const binding = sessions && typeof sessions.binding === 'function' ? sessions.binding(sessionId) : null
      const session = binding && binding.session
      if (session && typeof session.loadThrough === 'function') {
        const pending = session.loadThrough(seq)
        if (pending && typeof pending.catch === 'function') pending.catch(() => {})
        return true
      }
    } catch (e) { /* best-effort */ }
    return false
  }

  const scrollToAnchoredNode = (nodeKey) => {
    const row = findMainChatRow(nodeKey)
    if (!row) return false
    try {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      row.classList.add('dsm-bp-flash')
      setTimeout(() => row.classList.remove('dsm-bp-flash'), 1200)
      return true
    } catch (e) {
      return false
    }
  }

  // ---- Official slot 1: conversation.chat.assistant-actions ----------------
  function AssistantActionsBranchSeat(props) {
    const sid = props && props.sessionId != null ? String(props.sessionId) : store.sessionId
    const [, setTick] = useState(0)
    const [open, setOpen] = useState(false)
    const [popStyle, setPopStyle] = useState(null)
    const wrapRef = useRef(null)
    const popRef = useRef(null)
    const btnRef = useRef(null)

    useEffect(() => subscribe(() => setTick((n) => n + 1)), [])

    const matchedPoint = useMemo(() => {
      if (!sid || store.sessionId !== sid || !store.points.length) return null
      return matchPointToActionSlot(store.points, props)
    }, [sid, store.points, props])

    const pointKey = matchedPoint ? branchPointKey(matchedPoint) : ''

    useEffect(() => {
      if (!sid || !pointKey) return undefined
      return registerSlotKey(sid, pointKey)
    }, [sid, pointKey])

    useEffect(() => {
      if (!open) return undefined
      const place = () => {
        const btn = btnRef.current
        if (!btn) return
        const r = btn.getBoundingClientRect()
        const width = Math.min(340, window.innerWidth - 24)
        const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
        const spaceBelow = window.innerHeight - r.bottom - 12
        const top = spaceBelow >= 140 ? r.bottom + 6 : Math.max(12, r.top - Math.min(260, r.top - 12))
        setPopStyle({ top: `${Math.round(top)}px`, left: `${Math.round(left)}px`, width: `${Math.round(width)}px` })
      }
      place()
      const onDown = (e) => {
        if (wrapRef.current && wrapRef.current.contains(e.target)) return
        if (popRef.current && popRef.current.contains(e.target)) return
        setOpen(false)
      }
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          setOpen(false)
          if (btnRef.current) btnRef.current.focus()
        }
      }
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', place)
      window.addEventListener('scroll', place, true)
      return () => {
        document.removeEventListener('mousedown', onDown)
        document.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', place)
        window.removeEventListener('scroll', place, true)
      }
    }, [open])

    if (!matchedPoint || !Array.isArray(matchedPoint.children) || !matchedPoint.children.length) return null
    const sourceCwd = typeof getSessionCwd === 'function' ? getSessionCwd(sid) : null
    const count = matchedPoint.children.length
    const trayId = `dsm-bp-slot-${pointKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`

    return (
      <span ref={wrapRef} className="dsm-bp-slot">
        <button
          ref={btnRef}
          type="button"
          className="dsm-bp-pill"
          aria-expanded={open}
          aria-controls={trayId}
          aria-label={`${pointHeadingLabel(matchedPoint)}创建了 ${count} 个分支会话`}
          title={`${pointHeadingLabel(matchedPoint)}的 ${count} 个分支`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
        >
          <ForkIcon size={12} />
          <span>{count} 分支</span>
          <CaretIcon open={open} />
        </button>
        {open && (
          <div
            ref={popRef}
            id={trayId}
            className="dsm-bp-pop"
            role="region"
            aria-label={`${pointHeadingLabel(matchedPoint)}的分支会话`}
            style={popStyle || undefined}
          >
            <div className="dsm-bp-tray-head">
              <span>{pointHeadingLabel(matchedPoint)} · {count} 个分支</span>
            </div>
            <div className="dsm-bp-list">
              {matchedPoint.children.map((child) => {
                const ws = crossProjectLabel(child, sourceCwd)
                const title = labelForChild(child)
                return (
                  <button
                    key={String(child.id)}
                    type="button"
                    className="dsm-bp-child"
                    title={child.cwd ? `${title} · ${child.cwd}` : title}
                    onClick={() => {
                      setOpen(false)
                      handleOpenChild(child, sid)
                    }}
                  >
                    <span className="dsm-bp-child-ico"><ForkIcon size={12} /></span>
                    <span className="dsm-bp-child-title">{title}</span>
                    {ws && <span className="dsm-bp-child-ws" title={child.cwd}>{ws}</span>}
                    <span className="dsm-bp-child-go" aria-hidden="true">↗</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </span>
    )
  }

  // ---- Official slot 2: conversation.session.header.utilities --------------
  function BranchPointsHeaderSeat(props) {
    const sid = props && props.sessionId != null ? String(props.sessionId) : ''
    const useChat = props && typeof props.useChat === 'function' ? props.useChat : null
    const order = useChat ? useChat((s) => (s ? s.order : null)) : null
    const nodes = useChat ? useChat((s) => (s ? s.nodes : null)) : null

    const [, setTick] = useState(0)
    const [open, setOpen] = useState(false)
    const [popStyle, setPopStyle] = useState(null)
    const btnRef = useRef(null)
    const popRef = useRef(null)
    const openInlineKeysRef = useRef(new Set())

    useEffect(() => subscribe(() => setTick((n) => n + 1)), [])

    // Fetch for active conversation and clean up completely on switch/unload.
    useEffect(() => {
      if (!sid) return undefined
      openInlineKeysRef.current.clear()
      setOpen(false)
      fetchBranchPoints(sid, { force: true })
      return () => {
        openInlineKeysRef.current.clear()
        clearStoreFor(sid)
      }
    }, [sid])

    // Refresh when new native forks appear (via lineage updates or host session events).
    useEffect(() => {
      if (!sid) return undefined
      let timer = null
      const scheduleRefresh = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          fetchBranchPoints(sid, { force: true })
        }, 250)
      }
      const unsubs = []
      if (typeof subscribeLineageChange === 'function') {
        unsubs.push(subscribeLineageChange(sid, scheduleRefresh))
      }
      try {
        if (typeof ctx.on === 'function') {
          const off = ctx.on('session/created', (session) => {
            if (session && session.header && String(session.header.parentSession || '') === sid && session.header.origin !== 'subagent') {
              scheduleRefresh()
            }
          })
          if (typeof off === 'function') unsubs.push(off)
        }
      } catch (e) { /* event hook optional */ }
      try {
        const sessionsSvc = ctx.get('sessions')
        if (sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.subscribe === 'function') {
          let prevCount = -1
          const off = sessionsSvc.list.subscribe(() => {
            try {
              const snap = typeof sessionsSvc.list.getSnapshot === 'function' ? sessionsSvc.list.getSnapshot() : null
              const items = snap && Array.isArray(snap.items) ? snap.items : null
              const count = items ? items.length : -1
              if (prevCount >= 0 && count !== prevCount) scheduleRefresh()
              if (count >= 0) prevCount = count
            } catch (err) { /* ignore */ }
          })
          if (typeof off === 'function') unsubs.push(off)
        }
      } catch (e) { /* subscription optional */ }
      const onVis = () => {
        if (typeof document !== 'undefined' && !document.hidden) scheduleRefresh()
      }
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', onVis)
        unsubs.push(() => document.removeEventListener('visibilitychange', onVis))
      }
      return () => {
        if (timer) clearTimeout(timer)
        for (const fn of unsubs) {
          try { fn() } catch (e) {}
        }
      }
    }, [sid])

    const activeData = store.sessionId === sid
      ? { points: store.points, unanchored: store.unanchored }
      : { points: [], unanchored: [] }

    const slotKeysSig = [...store.slotKeys].sort().join(',')
    const partitioned = useMemo(
      () => partitionBranchPoints(activeData, order, nodes, store.slotKeys),
      [activeData.points, activeData.unanchored, order, nodes, slotKeysSig],
    )

    // Scoped DOM sync for exact `domAnchored` points (fallback when official
    // assistant-actions slot did not render that point).
    useEffect(() => {
      if (!sid || typeof document === 'undefined') return undefined
      const sourceCwd = typeof getSessionCwd === 'function' ? getSessionCwd(sid) : null
      let raf = 0
      let obs = null

      const renderInlineDisclosure = (container, item) => {
        const { point, pointKey } = item
        const kids = Array.isArray(point.children) ? point.children : []
        const isOpen = openInlineKeysRef.current.has(pointKey)
        const sig = `${pointKey}|${isOpen ? 1 : 0}|${kids.map((c) => `${c.id}:${labelForChild(c)}:${c.cwd || ''}`).join(';')}`
        if (container.dataset.dsmBpSig === sig) return
        container.dataset.dsmBpSig = sig
        container.textContent = ''

        const trayId = `dsm-bp-dom-${pointKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'dsm-bp-pill'
        btn.setAttribute('aria-expanded', String(isOpen))
        btn.setAttribute('aria-controls', trayId)
        btn.setAttribute('aria-label', `${pointHeadingLabel(point)}创建了 ${kids.length} 个分支会话`)
        btn.innerHTML = `${FORK_SVG_STR}<span>${kids.length} 个分支</span>${CARET_SVG_STR}`
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (openInlineKeysRef.current.has(pointKey)) openInlineKeysRef.current.delete(pointKey)
          else openInlineKeysRef.current.add(pointKey)
          renderInlineDisclosure(container, item)
        })
        container.appendChild(btn)

        if (isOpen) {
          const tray = document.createElement('div')
          tray.id = trayId
          tray.className = 'dsm-bp-tray'
          tray.setAttribute('role', 'region')
          tray.setAttribute('aria-label', `${pointHeadingLabel(point)}的分支会话`)
          tray.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              openInlineKeysRef.current.delete(pointKey)
              renderInlineDisclosure(container, item)
              container.querySelector('.dsm-bp-pill')?.focus()
            }
          })
          const head = document.createElement('div')
          head.className = 'dsm-bp-tray-head'
          head.textContent = `${pointHeadingLabel(point)} · 全部 ${kids.length} 个分支`
          tray.appendChild(head)

          const list = document.createElement('div')
          list.className = 'dsm-bp-list'
          for (const child of kids) {
            const rowBtn = document.createElement('button')
            rowBtn.type = 'button'
            rowBtn.className = 'dsm-bp-child'
            const title = labelForChild(child)
            const ws = crossProjectLabel(child, sourceCwd)
            rowBtn.title = child.cwd ? `${title} · ${child.cwd}` : title
            const ico = document.createElement('span')
            ico.className = 'dsm-bp-child-ico'
            ico.innerHTML = FORK_SVG_STR
            rowBtn.appendChild(ico)
            const nameEl = document.createElement('span')
            nameEl.className = 'dsm-bp-child-title'
            nameEl.textContent = title
            rowBtn.appendChild(nameEl)
            if (ws) {
              const wsEl = document.createElement('span')
              wsEl.className = 'dsm-bp-child-ws'
              wsEl.textContent = ws
              wsEl.title = child.cwd
              rowBtn.appendChild(wsEl)
            }
            const goEl = document.createElement('span')
            goEl.className = 'dsm-bp-child-go'
            goEl.setAttribute('aria-hidden', 'true')
            goEl.textContent = '↗'
            rowBtn.appendChild(goEl)
            rowBtn.addEventListener('click', (e) => {
              e.stopPropagation()
              handleOpenChild(child, sid)
            })
            list.appendChild(rowBtn)
          }
          tray.appendChild(list)
          container.appendChild(tray)
        }
      }

      const syncDom = () => {
        const expected = new Map()
        for (const item of partitioned.domAnchored) expected.set(item.pointKey, item)

        // Remove stale anchors first.
        document.querySelectorAll('[data-dsm-branch-anchor]').forEach((el) => {
          const key = el.getAttribute('data-dsm-branch-anchor') || ''
          const ownerSid = el.getAttribute('data-dsm-branch-session') || ''
          const match = ownerSid === sid ? expected.get(key) : null
          if (!match) {
            el.remove()
            return
          }
          const targetRow = findMainChatRow(match.nodeKey)
          if (!targetRow || el.parentElement !== targetRow) el.remove()
        })

        for (const [key, item] of expected) {
          const row = findMainChatRow(item.nodeKey)
          if (!row) continue
          let box = row.querySelector(`[data-dsm-branch-anchor="${escapeAttr(key)}"]`)
          if (!box) {
            box = document.createElement('div')
            box.className = 'dsm-bp-inline'
            box.setAttribute('data-dsm-branch-anchor', key)
            box.setAttribute('data-dsm-branch-session', sid)
            row.appendChild(box)
          }
          renderInlineDisclosure(box, item)
        }
      }

      const scheduleSync = () => {
        if (raf) return
        raf = requestAnimationFrame(() => {
          raf = 0
          syncDom()
        })
      }

      syncDom()
      const scopeEl = findConversationScope(order)
      if (scopeEl && typeof MutationObserver === 'function' && partitioned.domAnchored.length > 0) {
        obs = new MutationObserver(scheduleSync)
        obs.observe(scopeEl, { childList: true, subtree: true })
      }

      return () => {
        if (raf) cancelAnimationFrame(raf)
        if (obs) {
          try { obs.disconnect() } catch (e) {}
          obs = null
        }
        removeAllDomAnchors()
      }
    }, [sid, partitioned.domAnchored, order])

    // Popover placement & dismissal.
    useEffect(() => {
      if (!open) return undefined
      const place = () => {
        const btn = btnRef.current
        if (!btn) return
        const r = btn.getBoundingClientRect()
        const width = Math.min(360, window.innerWidth - 24)
        const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))
        const top = Math.min(r.bottom + 6, Math.max(12, window.innerHeight - 180))
        setPopStyle({ top: `${Math.round(top)}px`, left: `${Math.round(left)}px` })
      }
      place()
      const onDown = (e) => {
        if (popRef.current && popRef.current.contains(e.target)) return
        if (btnRef.current && btnRef.current.contains(e.target)) return
        setOpen(false)
      }
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          setOpen(false)
          if (btnRef.current) btnRef.current.focus()
        }
      }
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', place)
      return () => {
        document.removeEventListener('mousedown', onDown)
        document.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', place)
      }
    }, [open])

    if (!sid || store.sessionId !== sid) return null

    const totalBranchChildren =
      activeData.points.reduce((sum, p) => sum + ((p && Array.isArray(p.children) ? p.children.length : 0)), 0) +
      activeData.unanchored.length
    if (totalBranchChildren === 0 && store.status !== 'error') return null

    const unresolvedCount =
      activeData.unanchored.length +
      partitioned.unloadedPoints.reduce((sum, item) => sum + item.point.children.length, 0)
    const anchoredList = [
      ...partitioned.slotAnchored.map((x) => ({ ...x, nodeKey: null })),
      ...partitioned.domAnchored,
    ]
    const sourceCwd = typeof getSessionCwd === 'function' ? getSessionCwd(sid) : null
    const popId = `dsm-bp-hdr-pop-${sid.replace(/[^a-zA-Z0-9_-]/g, '_')}`

    return (
      <span className="dsm-bp-hdr">
        <button
          ref={btnRef}
          type="button"
          className="dsm-bp-hdr-btn"
          aria-expanded={open}
          aria-controls={popId}
          aria-label={unresolvedCount > 0 ? `会话分支（共 ${totalBranchChildren} 个，其中 ${unresolvedCount} 个未在当前视口定位）` : `会话分支（共 ${totalBranchChildren} 个）`}
          title={unresolvedCount > 0 ? `共 ${totalBranchChildren} 个分支 · ${unresolvedCount} 个未定位或尚未加载` : `共 ${totalBranchChildren} 个分支会话`}
          onClick={() => setOpen((v) => !v)}
        >
          <ForkIcon size={13} />
          <span>{totalBranchChildren} 分支</span>
          {unresolvedCount > 0 && <span className="dsm-bp-hdr-dot" aria-hidden="true" />}
        </button>
        {open && (
          <div
            ref={popRef}
            id={popId}
            className="dsm-bp-pop"
            role="dialog"
            aria-label="当前会话分支列表"
            style={popStyle || undefined}
          >
            <div className="dsm-bp-pop-head">
              <h4 className="dsm-bp-pop-title">
                <ForkIcon size={14} />
                <span>会话分支 · {totalBranchChildren}</span>
              </h4>
              <span className="dsm-bp-pop-acts">
                <button
                  type="button"
                  className="dsm-bp-icon-btn"
                  disabled={store.status === 'loading'}
                  title="刷新分支点"
                  aria-label="刷新分支点"
                  onClick={() => fetchBranchPoints(sid, { force: true })}
                >
                  <RefreshIcon />
                </button>
                <button
                  type="button"
                  className="dsm-bp-icon-btn"
                  title="关闭"
                  aria-label="关闭分支列表"
                  onClick={() => {
                    setOpen(false)
                    if (btnRef.current) btnRef.current.focus()
                  }}
                >
                  ×
                </button>
              </span>
            </div>

            {store.status === 'error' && (
              <div className="dsm-bp-err" role="alert">
                读取分支点失败：{store.error}
              </div>
            )}

            {activeData.unanchored.length > 0 && (
              <div className="dsm-bp-sec">
                <div className="dsm-bp-sec-head">
                  <span>未定位分支 · {activeData.unanchored.length}</span>
                  <span className="dsm-bp-unloc-tag">未记录精确位置</span>
                </div>
                <p className="dsm-bp-sec-note">以下分支缺少可验证的源消息锚点，不猜测挂载到具体消息，可直接在此打开。</p>
                <div className="dsm-bp-group dsm-bp-group--warn">
                  <div className="dsm-bp-list">
                    {activeData.unanchored.map((child) => {
                      const title = labelForChild(child)
                      const ws = crossProjectLabel(child, sourceCwd)
                      return (
                        <button
                          key={String(child.id)}
                          type="button"
                          className="dsm-bp-child"
                          title={child.cwd ? `${title} · ${child.cwd}` : title}
                          onClick={() => {
                            setOpen(false)
                            handleOpenChild(child, sid)
                          }}
                        >
                          <span className="dsm-bp-child-ico"><ForkIcon size={12} /></span>
                          <span className="dsm-bp-child-title">{title}</span>
                          {ws && <span className="dsm-bp-child-ws" title={child.cwd}>{ws}</span>}
                          <span className="dsm-bp-child-go" aria-hidden="true">↗</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {partitioned.unloadedPoints.length > 0 && (
              <div className="dsm-bp-sec">
                <div className="dsm-bp-sec-head">
                  <span>当前未加载 / 未定位锚点 · {partitioned.unloadedPoints.length}</span>
                  <span className="dsm-bp-unloc-tag">未在视口中</span>
                </div>
                <p className="dsm-bp-sec-note">对应历史消息尚未加载到当前对话或无法确信定位，不猜测挂载到其他消息。</p>
                {partitioned.unloadedPoints.map(({ point, pointKey }) => (
                  <div key={pointKey} className="dsm-bp-group dsm-bp-group--warn">
                    <div className="dsm-bp-group-head">
                      <span>{pointHeadingLabel(point)} · {point.children.length} 个分支</span>
                      {Number.isSafeInteger(point.atSeq) && (
                        <button
                          type="button"
                          className="dsm-bp-group-link"
                          title="加载更早历史以定位到该分支点"
                          onClick={() => {
                            const ok = loadThroughSeq(sid, point.atSeq)
                            if (!ok && typeof notify === 'function') notify('当前版本暂不支持自动加载该段历史', 'warn')
                          }}
                        >
                          加载历史
                        </button>
                      )}
                    </div>
                    <div className="dsm-bp-list">
                      {point.children.map((child) => {
                        const title = labelForChild(child)
                        const ws = crossProjectLabel(child, sourceCwd)
                        return (
                          <button
                            key={String(child.id)}
                            type="button"
                            className="dsm-bp-child"
                            title={child.cwd ? `${title} · ${child.cwd}` : title}
                            onClick={() => {
                              setOpen(false)
                              handleOpenChild(child, sid)
                            }}
                          >
                            <span className="dsm-bp-child-ico"><ForkIcon size={12} /></span>
                            <span className="dsm-bp-child-title">{title}</span>
                            {ws && <span className="dsm-bp-child-ws" title={child.cwd}>{ws}</span>}
                            <span className="dsm-bp-child-go" aria-hidden="true">↗</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {anchoredList.length > 0 && (
              <div className="dsm-bp-sec">
                <div className="dsm-bp-sec-head">
                  <span>已定位到对话 · {anchoredList.length} 处</span>
                </div>
                {anchoredList.map(({ point, pointKey, nodeKey }) => (
                  <div key={pointKey} className="dsm-bp-group">
                    <div className="dsm-bp-group-head">
                      <span>{pointHeadingLabel(point)} · {point.children.length} 个分支</span>
                      {nodeKey && (
                        <button
                          type="button"
                          className="dsm-bp-group-link"
                          onClick={() => {
                            setOpen(false)
                            scrollToAnchoredNode(nodeKey)
                          }}
                        >
                          定位消息
                        </button>
                      )}
                    </div>
                    <div className="dsm-bp-list">
                      {point.children.map((child) => {
                        const title = labelForChild(child)
                        const ws = crossProjectLabel(child, sourceCwd)
                        return (
                          <button
                            key={String(child.id)}
                            type="button"
                            className="dsm-bp-child"
                            title={child.cwd ? `${title} · ${child.cwd}` : title}
                            onClick={() => {
                              setOpen(false)
                              handleOpenChild(child, sid)
                            }}
                          >
                            <span className="dsm-bp-child-ico"><ForkIcon size={12} /></span>
                            <span className="dsm-bp-child-title">{title}</span>
                            {ws && <span className="dsm-bp-child-ws" title={child.cwd}>{ws}</span>}
                            <span className="dsm-bp-child-go" aria-hidden="true">↗</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </span>
    )
  }

  // Inject styles and register both official conversation slots inside ctx.effect
  // so everything tears down cleanly on plugin unload / HMR.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.dsm = 'branch-points'
    tag.textContent = BRANCH_POINTS_CSS
    document.head.appendChild(tag)
    return () => {
      clearStoreFor(null)
      tag.remove()
    }
  }, 'dsm: branch-points styles')

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'dsm-branch-points-header',
            order: 25,
          },
          BranchPointsHeaderSeat,
        ),
      ),
    'dsm: branch-points header seat',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.assistant-actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.assistant-actions',
            id: 'dsm-branch-points-inline',
            order: 60,
          },
          AssistantActionsBranchSeat,
        ),
      ),
    'dsm: branch-points assistant-actions seat',
  )
}
