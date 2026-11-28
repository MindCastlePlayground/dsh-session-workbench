import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' || specifier === 'react-dom') {
      return { url: `virtual:${specifier}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === 'virtual:react') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export function createElement(type, props, ...children) {
            const merged = { ...(props || {}) }
            if (children.length > 0) merged.children = children
            return { type, props: merged, key: merged.key === undefined ? null : merged.key }
          }
          export const Fragment = Symbol('Fragment')
          export const useState = (init) => [typeof init === 'function' ? init() : init, () => {}]
          export const useEffect = () => {}
          export const useLayoutEffect = () => {}
          export const useRef = (v) => ({ current: v })
          export const useMemo = (fn) => fn()
          export const useCallback = (fn) => fn
          export default { createElement, Fragment, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback }
        `,
      }
    }
    if (url === 'virtual:react-dom') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export function createPortal(el, target) { return { portal: true, el, target } }
          export default { createPortal }
        `,
      }
    }
    return nextLoad(url, context)
  },
})

const {
  TIMESTAMPS_PROJECTION_KEY,
  applyTimestampEvent,
  initTimestampState,
  timestampsProjectionDefinition,
} = await import('../src/workspace-status/timestamps-projection.js')
const { MESSAGE_GROUP, projectActivity } = await import('../src/workspace-status/activity.js')
const {
  HeaderGlobalSearchButton,
  MessagesView,
  partitionMessageRows,
} = await import('../src/workspace-status/messages-view.js')
const {
  getBridgeSearchState,
  setBridgeIndexActive,
  setBridgePoller,
  setBridgeSearchMounts,
} = await import('../src/workspace-status/search-bridge.js')
const { BASE_WORKBENCH_CSS, CLS } = await import('../src/workspace-status/styles.js')

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  const children = node.props?.children
  if (children !== undefined) collectNodes(children, predicate, out)
  return out
}

function collectText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  if (typeof node === 'object') {
    if (typeof node.type === 'function') return collectText(node.type(node.props))
    return collectText(node.props?.children)
  }
  return ''
}

function renderWithLanguage(lang, renderFn) {
  const prevDoc = globalThis.document
  globalThis.document = { documentElement: { lang } }
  try {
    return renderFn()
  } finally {
    if (prevDoc === undefined) delete globalThis.document
    else globalThis.document = prevDoc
  }
}

test('timestamps projection tracks user prompt, reply finish, and pending request timestamps accurately', () => {
  let state = initTimestampState()
  const fold = (type, time, data) => {
    state = applyTimestampEvent(state, { type, time, data })
    return state
  }

  // Unrelated event preserves exact state identity.
  const initialRef = state
  assert.equal(fold('session/meta', 50, {}), initialRef)

  // User turn start + prompt -> reply -> turn end.
  fold('user/message', 1000, { source: { kind: 'user' } })
  assert.equal(state.view.lastUserAt, 1000)
  assert.equal(state.view.pendingRequestAt, null)

  fold('assistant/message', 1100, { message: { role: 'assistant', content: [] } })
  fold('turn/end', 1200, { turn: 1, reason: { kind: 'done' } })
  assert.equal(state.view.lastFinishedAt, 1200)

  // Approval request during turn 2 sets and clears pendingRequestAt.
  fold('turn/start', 2000, { turn: 2 })
  fold('user/message', 2005, { source: { kind: 'user' } })
  fold('approval/asked', 2050, { id: 'appr-1', toolName: 'bash' })
  assert.equal(state.view.pendingRequestAt, 2050)
  assert.equal(state.view.lastUserAt, 2005)
  fold('approval/decided', 2090, { id: 'appr-1', outcome: 'allowed-once' })
  assert.equal(state.view.pendingRequestAt, null)

  // Plan review (exit_plan_mode) & timed ask_user_question (continued past tool/result).
  fold('tool/call', 2100, { name: 'exit_plan_mode', callId: 'call-plan-1' })
  assert.equal(state.view.pendingRequestAt, 2100)
  fold('tool/result', 2120, { message: { toolCallId: 'call-plan-1', content: [{ type: 'text', text: '{"approved":true}' }] } })
  assert.equal(state.view.pendingRequestAt, null)

  fold('tool/call', 2200, { name: 'ask_user_question', callId: 'call-q-1' })
  assert.equal(state.view.pendingRequestAt, 2200)
  fold('tool/result', 2250, {
    message: { toolCallId: 'call-q-1', content: [{ type: 'text', text: JSON.stringify({ pending: true, callId: 'call-q-1' }) }] },
  })
  assert.equal(state.view.pendingRequestAt, 2200)

  // turn/end clears non-continued requests but keeps continued ask_user_question until reply arrives.
  fold('turn/end', 2300, { turn: 2, reason: { kind: 'done' } })
  assert.equal(state.view.pendingRequestAt, 2200)
  assert.equal(state.view.lastFinishedAt, 2300)

  // Late question reply does NOT overwrite lastUserAt (only user prompts count as user initiation).
  fold('user/message', 2500, { source: { kind: 'user-question-reply', callId: 'call-q-1' } })
  assert.equal(state.view.pendingRequestAt, null)
  assert.equal(state.view.lastUserAt, 2005)

  // Checkpoint schema round-trip validation.
  const cloned = timestampsProjectionDefinition.stateSchema.parse(structuredClone(state))
  assert.deepEqual(cloned, state)
  const wireView = timestampsProjectionDefinition.wire.viewSchema.parse(timestampsProjectionDefinition.wire.view(cloned))
  assert.deepEqual(wireView, state.view)
})

test('projectActivity groups into running, waiting, and completed (unread first) sorted by group-specific timestamps', () => {
  const items = [
    { workspaceId: 'ws-a', title: 'Workspace A', sessionIds: ['r-old', 'r-new', 'w-early', 'w-late', 'f-unread-old', 'f-unread-new', 'f-read-new', 'f-read-old'] },
    { workspaceId: 'ws-b', title: 'Workspace B', sessionIds: ['parent-w', 'child-w'] },
  ]

  const ts = (lastUserAt, lastFinishedAt, pendingRequestAt) => ({
    [TIMESTAMPS_PROJECTION_KEY]: { lastUserAt, lastFinishedAt, pendingRequestAt },
  })

  const byId = {
    'r-old': { id: 'r-old', title: 'Run Old Prompt', updatedAt: 9000, running: true, projectionValues: ts(1000, 500, null) },
    'r-new': { id: 'r-new', title: 'Run New Prompt', updatedAt: 2000, running: true, projectionValues: ts(3000, 500, null) },
    'w-early': { id: 'w-early', title: 'Wait Earlier Request', updatedAt: 9500, running: true, projectionValues: ts(1200, null, 2000) },
    'w-late': { id: 'w-late', title: 'Wait Later Request', updatedAt: 1500, running: true, projectionValues: ts(1100, null, 4500) },
    'f-unread-old': { id: 'f-unread-old', title: 'Unread Older Reply', updatedAt: 9900, running: false, projectionValues: ts(9800, 3100, null) },
    'f-unread-new': { id: 'f-unread-new', title: 'Unread Newer Reply', updatedAt: 1000, running: false, projectionValues: ts(900, 5200, null) },
    'f-read-new': { id: 'f-read-new', title: 'Read Newer Reply', updatedAt: 1100, running: false, projectionValues: ts(1000, 6500, null) },
    'f-read-old': { id: 'f-read-old', title: 'Read Older Reply', updatedAt: 8000, running: false, projectionValues: ts(7900, 2100, null) },
    'parent-w': { id: 'parent-w', title: 'Parent Waiting Via Subagent', updatedAt: 1200, running: true, projectionValues: ts(1200, null, null) },
    'child-w': { id: 'child-w', title: 'Child', origin: 'subagent', parentId: 'parent-w', updatedAt: 6000, running: true, projectionValues: ts(1200, null, 6000) },
  }

  const statuses = new Map([
    ['r-old', { running: true, completionUnread: false, completionFailed: false, pendingInteraction: null }],
    ['r-new', { running: true, completionUnread: false, completionFailed: false, pendingInteraction: null }],
    ['w-early', { running: true, completionUnread: false, completionFailed: false, pendingInteraction: { kind: 'approval' } }],
    ['w-late', { running: true, completionUnread: false, completionFailed: false, pendingInteraction: { kind: 'question' } }],
    ['f-unread-old', { running: false, completionUnread: true, completionFailed: false, pendingInteraction: null }],
    ['f-unread-new', { running: false, completionUnread: true, completionFailed: false, pendingInteraction: null }],
    ['f-read-new', { running: false, completionUnread: false, completionFailed: false, pendingInteraction: null }],
    ['f-read-old', { running: false, completionUnread: false, completionFailed: false, pendingInteraction: null }],
    ['child-w', { running: true, completionUnread: false, completionFailed: false, pendingInteraction: { kind: 'approval' } }],
  ])

  const { counts, rows } = projectActivity(items, byId, statuses, [])
  assert.deepEqual(
    rows.map((r) => r.id),
    [
      'r-new', 'r-old',
      'parent-w', 'w-late', 'w-early',
      'f-unread-new', 'f-unread-old',
      'f-read-new', 'f-read-old',
    ],
  )
  assert.equal(rows.find((r) => r.id === 'r-new')?.group, MESSAGE_GROUP.RUNNING)
  assert.equal(rows.find((r) => r.id === 'w-late')?.group, MESSAGE_GROUP.WAITING)
  assert.equal(rows.find((r) => r.id === 'f-unread-new')?.group, MESSAGE_GROUP.FINISHED)
  assert.deepEqual(counts.get('ws-a'), { running: 2, unread: 2, waiting: 2 })
  assert.deepEqual(counts.get('ws-b'), { running: 0, unread: 0, waiting: 1 })
})

test('MessagesView renders Running, Waiting, Completed (unread first) and collapses read+completed sessions', () => {
  const rows = [
    { id: 'r1', title: 'Running 1', workspaceTitle: 'W1', updatedAt: 100, sortAt: 4000, group: MESSAGE_GROUP.RUNNING, running: true, waiting: false, unread: false, failed: false },
    { id: 'w1', title: 'Waiting 1', workspaceTitle: 'W1', updatedAt: 100, sortAt: 3500, group: MESSAGE_GROUP.WAITING, running: true, waiting: true, unread: false, failed: false },
    { id: 'fu1', title: 'Unread Done', workspaceTitle: 'W1', updatedAt: 100, sortAt: 3000, group: MESSAGE_GROUP.FINISHED, running: false, waiting: false, unread: true, failed: false },
    { id: 'fr1', title: 'Read Done 1', workspaceTitle: 'W1', updatedAt: 100, sortAt: 2500, group: MESSAGE_GROUP.FINISHED, running: false, waiting: false, unread: false, failed: false },
    { id: 'fr2', title: 'Read Done 2', workspaceTitle: 'W1', updatedAt: 100, sortAt: 2000, group: MESSAGE_GROUP.FINISHED, running: false, waiting: false, unread: false, failed: false },
  ]
  const statuses = new Map([
    ['w1', { pendingInteraction: { kind: 'plan-review' } }],
  ])

  const expandedPartition = partitionMessageRows(rows, { visibleLimit: 30, readCollapsed: false })
  assert.equal(expandedPartition.slices.finishedUnread.length, 1)
  assert.equal(expandedPartition.slices.finishedRead.length, 2)
  assert.equal(expandedPartition.totals.waiting, 1)

  const collapsedPartition = partitionMessageRows(rows, { visibleLimit: 30, readCollapsed: true })
  assert.equal(collapsedPartition.slices.running.length, 1)
  assert.equal(collapsedPartition.slices.waiting.length, 1)
  assert.equal(collapsedPartition.slices.finishedUnread.length, 1)
  assert.equal(collapsedPartition.slices.finishedRead.length, 0)

  const expandedTree = renderWithLanguage('zh-CN', () => MessagesView({
    rows,
    sessions: {},
    statuses,
    currentId: undefined,
    now: 4000 + 5 * 60_000,
    visibleLimit: 30,
    readCollapsed: false,
    onToggleReadCollapsed: () => {},
    onLoadMore: () => {},
    onSelectSession: () => {},
  }))
  const sectionTitles = collectNodes(expandedTree, (n) => n.props?.className === CLS.MSG_SEC_HEAD)
    .map((n) => collectText(n.props.children[0]))
  assert.deepEqual(sectionTitles, ['运行中', '待回复', '已完成'])

  const expandedRowIds = collectNodes(expandedTree, (n) => typeof n.props?.['data-dswb-msg-id'] === 'string')
    .map((n) => n.props['data-dswb-msg-id'])
  assert.deepEqual(expandedRowIds, ['r1', 'w1', 'fu1', 'fr1', 'fr2'])

  const collapsedTree = renderWithLanguage('zh-CN', () => MessagesView({
    rows,
    sessions: {},
    statuses,
    currentId: undefined,
    now: 4000 + 5 * 60_000,
    visibleLimit: 30,
    readCollapsed: true,
    onToggleReadCollapsed: () => {},
    onLoadMore: () => {},
    onSelectSession: () => {},
  }))
  const collapsedRowIds = collectNodes(collapsedTree, (n) => typeof n.props?.['data-dswb-msg-id'] === 'string')
    .map((n) => n.props['data-dswb-msg-id'])
  assert.deepEqual(collapsedRowIds, ['r1', 'w1', 'fu1'])
  const toggleBtn = collectNodes(collapsedTree, (n) => n.props?.['data-dswb-read-toggle'] === 'true')[0]
  assert.ok(toggleBtn, 'read+completed collapse toggle button should render')
  assert.equal(toggleBtn.props['aria-expanded'], false)
  assert.ok(collectText(toggleBtn).includes('展开已读已完成'))
})

test('BASE_WORKBENCH_CSS freezes upper sidebar down to listArea and replaces native workspace search button', () => {
  assert.match(BASE_WORKBENCH_CSS, /\[data-sidebar-scrollport\]\{[^}]*overflow:hidden!important;container-type:normal!important;grid-template-rows:8px max-content 2px minmax\(0,1fr\)!important/)
  assert.match(BASE_WORKBENCH_CSS, /\[data-sidebar-scrollport\] \[data-sidebar-list-area\]\{[^}]*overflow-y:auto!important/)
  assert.match(BASE_WORKBENCH_CSS, /\[data-sidebar-workspace-header\]>div:has\(>div>input\)>:not\(\[data-dswb-global-search-host\]\)\{display:none!important\}/)
  assert.ok(BASE_WORKBENCH_CSS.includes(`.${CLS.MSG_READ_TOGGLE}`))
  assert.ok(BASE_WORKBENCH_CSS.includes(`.${CLS.HEADER_SEARCH_BTN}`))

  setBridgeIndexActive(false)
  setBridgeSearchMounts(0)
  setBridgePoller(null)
  assert.deepEqual(getBridgeSearchState(), { active: false, searchMounts: 0 })

  const btn = renderWithLanguage('zh-CN', () => HeaderGlobalSearchButton({ active: true, onTrigger: () => {} }))
  assert.equal(btn.props['data-active'], 'true')
  assert.equal(btn.props['aria-pressed'], 'true')
})
