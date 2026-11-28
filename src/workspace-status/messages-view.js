import React from 'react'
import { MESSAGE_GROUP } from './activity.js'
import { pollBridgeIndexActivity, subscribeBridgeSearchState } from './search-bridge.js'
import { CLS, DOM_ATTRS, LIMITS, VIEW_MODE } from './styles.js'

const h = React.createElement

const DICTIONARIES = {
  en: {
    'activity.summary': 'Workspace activity: {clauses} — {names}',
    'activity.waiting': '{n} waiting for you',
    'activity.running': '{n} running',
    'activity.unread': '{n} unread',
    'activity.done': '{n} recently finished',
    'activity.unnamed': 'Ungrouped',
    'activity.more': 'and {n} more',
    'activity.listSeparator': ', ',
    'view.tablist': 'Sidebar view',
    'view.workspaces': 'Workspaces',
    'view.messages': 'Messages',
    'view.messagesAria': 'Messages ({counts})',
    'headerSearch.label': 'Global search',
    'headerSearch.indexing': 'Updating search index',
    'msg.panelLabel': 'Messages list',
    'msg.section.running': 'Running',
    'msg.section.waiting': 'Waiting for reply',
    'msg.section.finished': 'Completed',
    'msg.readGroup.expand': 'Show read & completed',
    'msg.readGroup.collapse': 'Collapse read & completed',
    'msg.summary.progress': '{shown} / {total}',
    'msg.summary.total': '{n} sessions',
    'msg.status.running': 'Running',
    'msg.status.unread': 'Unread',
    'msg.status.failed': 'Failed',
    'msg.status.waiting': 'Waiting',
    'msg.status.approval': 'Approval',
    'msg.status.planReview': 'Plan review',
    'msg.status.answer': 'Answer',
    'msg.untitled': 'Untitled',
    'msg.newSession': 'New Session',
    'msg.loadMore': 'Load more ({remaining} left)',
    'msg.empty': 'No messages yet',
    'time.now': 'now',
    'time.minutes': '{n}m',
    'time.hours': '{n}h',
    'time.days': '{n}d',
    'time.months': '{n}mo',
    'time.years': '{n}y',
  },
  zh: {
    'activity.summary': '工作区状态：{clauses} — {names}',
    'activity.waiting': '{n} 个等待你处理',
    'activity.running': '{n} 个运行中',
    'activity.unread': '{n} 条未读',
    'activity.done': '{n} 个刚刚完成',
    'activity.unnamed': '未分组',
    'activity.more': '等 {n} 个',
    'activity.listSeparator': '、',
    'view.tablist': '侧栏视图',
    'view.workspaces': '工作区',
    'view.messages': '消息',
    'view.messagesAria': '消息列表（{counts}）',
    'headerSearch.label': '全局搜索',
    'headerSearch.indexing': '索引更新中',
    'msg.panelLabel': '消息列表',
    'msg.section.running': '运行中',
    'msg.section.waiting': '待回复',
    'msg.section.finished': '已完成',
    'msg.readGroup.expand': '展开已读已完成',
    'msg.readGroup.collapse': '收起已读已完成',
    'msg.summary.progress': '{shown} / {total}',
    'msg.summary.total': '共 {n} 条',
    'msg.status.running': '运行中',
    'msg.status.unread': '未读',
    'msg.status.failed': '出错',
    'msg.status.waiting': '待处理',
    'msg.status.approval': '待审批',
    'msg.status.planReview': '计划待审',
    'msg.status.answer': '待回答',
    'msg.untitled': '未命名',
    'msg.newSession': '新会话',
    'msg.loadMore': '加载更多（剩余 {remaining} 条）',
    'msg.empty': '暂无消息',
    'time.now': '刚刚',
    'time.minutes': '{n}分钟',
    'time.hours': '{n}小时',
    'time.days': '{n}天',
    'time.months': '{n}个月',
    'time.years': '{n}年',
  },
}

/** Resolve active UI language from document/navigator. */
export function currentLanguage() {
  const candidates = []
  if (typeof document !== 'undefined') {
    const lang = document?.documentElement?.lang
    if (typeof lang === 'string' && lang !== '') candidates.push(lang)
  }
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    candidates.push(navigator.language)
  }
  for (const value of candidates) {
    if (/^zh/i.test(value)) return 'zh'
  }
  return 'en'
}

function formatTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    params !== undefined && Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match
  ))
}

/** One localized message, falling back to English and then the key. */
export function getMessage(key, params) {
  const language = currentLanguage()
  const dictionary = DICTIONARIES[language] ?? DICTIONARIES.en
  const template = dictionary[key] ?? DICTIONARIES.en[key] ?? key
  return formatTemplate(template, params)
}

/** Compact numeric badge text (`1..99`, `99+`). */
export function formatCompactCount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '0'
  return n > LIMITS.MAX_BADGE_COUNT ? `${LIMITS.MAX_BADGE_COUNT}+` : String(Math.floor(n))
}

/** Compact relative time matching DSH's sidebar bucketing. */
export function formatRelativeTime(updatedAt, now) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return ''
  const diff = Math.max(0, now - updatedAt)
  const min = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (diff < min) return getMessage('time.now')
  if (diff < hour) return getMessage('time.minutes', { n: Math.floor(diff / min) })
  if (diff < day) return getMessage('time.hours', { n: Math.floor(diff / hour) })
  if (diff < 30 * day) return getMessage('time.days', { n: Math.floor(diff / day) })
  if (diff < 365 * day) return getMessage('time.months', { n: Math.floor(diff / (30 * day)) })
  return getMessage('time.years', { n: Math.floor(diff / (365 * day)) })
}

/** Absolute local timestamp for tooltip display. */
export function formatAbsoluteTime(updatedAt) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return ''
  try {
    const lang = currentLanguage() === 'zh' ? 'zh-CN' : 'en-US'
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(updatedAt))
  } catch {
    return ''
  }
}

/** Extract an already-present native summary without loading history or search indexes. */
export function extractNativeSummary(row, session, resolvedTitle) {
  const candidates = [
    row?.summary,
    row?.snippet,
    row?.preview,
    session?.summary,
    session?.preview,
    session?.excerpt,
    session?.projectionValues?.summary,
  ]
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue
    const normalized = raw.replace(/\s+/g, ' ').trim()
    if (normalized === '') continue
    if (resolvedTitle && normalized === resolvedTitle) continue
    return normalized
  }
  return ''
}

/** Human-readable label for a pending user interaction kind. */
export function waitingKindLabel(status) {
  const kind = status?.pendingInteraction?.kind
  if (kind === 'approval') return getMessage('msg.status.approval')
  if (kind === 'plan-review') return getMessage('msg.status.planReview')
  if (kind === 'question') return getMessage('msg.status.answer')
  return getMessage('msg.status.waiting')
}

function buildCountClauses({ waiting = 0, running = 0, unread = 0, recentDone = false }) {
  const clauses = []
  if (waiting > 0) clauses.push(getMessage('activity.waiting', { n: waiting }))
  if (running > 0) clauses.push(getMessage('activity.running', { n: running }))
  if (unread > 0) clauses.push(getMessage('activity.unread', { n: unread }))
  else if (recentDone) clauses.push(getMessage('activity.done', { n: 1 }))
  return clauses
}

function SpinnerIcon(size = 13, className = CLS.MSG_SPINNER) {
  return h(
    'svg',
    {
      className,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h(
      'g',
      null,
      h('circle', { className: CLS.MSG_SPINNER_TRACK, cx: 12, cy: 12, r: 9 }),
      h('circle', { className: CLS.MSG_SPINNER_ARC, cx: 12, cy: 12, r: 9 }),
    ),
  )
}

function WorkspacesIcon() {
  return h(
    'svg',
    {
      width: 13,
      height: 13,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', {
      d: 'M2.2 4.3c0-.66.54-1.2 1.2-1.2h2.7l1.15 1.3h5.35c.66 0 1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2H3.4c-.66 0-1.2-.54-1.2-1.2V4.3Z',
      stroke: 'currentColor',
      strokeWidth: 1.35,
      strokeLinejoin: 'round',
    }),
  )
}

function InboxIcon() {
  return h(
    'svg',
    {
      width: 13,
      height: 13,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', {
      d: 'M2.6 4.2c0-.72.58-1.3 1.3-1.3h8.2c.72 0 1.3.58 1.3 1.3v7.6c0 .72-.58 1.3-1.3 1.3H3.9c-.72 0-1.3-.58-1.3-1.3V4.2Z',
      stroke: 'currentColor',
      strokeWidth: 1.35,
      strokeLinejoin: 'round',
    }),
    h('path', {
      d: 'M2.8 9.2h2.8l.95 1.35h2.9L10.4 9.2h2.8',
      stroke: 'currentColor',
      strokeWidth: 1.35,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

function FolderMicroIcon() {
  return h(
    'svg',
    {
      width: 11,
      height: 11,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', {
      d: 'M2.3 4.5c0-.61.49-1.1 1.1-1.1h2.5l1.1 1.2h5.6c.61 0 1.1.49 1.1 1.1v5.8c0 .61-.49 1.1-1.1 1.1H3.4c-.61 0-1.1-.49-1.1-1.1V4.5Z',
      stroke: 'currentColor',
      strokeWidth: 1.35,
      strokeLinejoin: 'round',
    }),
  )
}

function EmptyInboxIcon() {
  return h(
    'svg',
    {
      width: 24,
      height: 24,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('rect', {
      x: 3.5,
      y: 4.5,
      width: 17,
      height: 15,
      rx: 2.5,
      stroke: 'currentColor',
      strokeWidth: 1.5,
    }),
    h('path', {
      d: 'M3.8 14h4.4l1.4 2h4.8l1.4-2h4.4',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** Keyboard-accessible segmented switcher between Workspaces and Messages views. */
export function ViewSwitcher({
  mode,
  onChange,
  totalRunning,
  totalUnread,
  totalWaiting,
  tabRefs,
  onFocusMessagesList,
}) {
  const isMessages = mode === VIEW_MODE.MESSAGES
  const sep = getMessage('activity.listSeparator')
  const countClauses = buildCountClauses({
    waiting: totalWaiting,
    running: totalRunning,
    unread: totalUnread,
  })
  const messagesAria = countClauses.length > 0
    ? getMessage('view.messagesAria', { counts: countClauses.join(sep) })
    : getMessage('view.messages')

  const focusAndSwitch = (targetMode) => {
    onChange(targetMode)
    const node = tabRefs?.current?.[targetMode]
    if (node && typeof node.focus === 'function') node.focus()
  }

  const onTabKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusAndSwitch(isMessages ? VIEW_MODE.WORKSPACES : VIEW_MODE.MESSAGES)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusAndSwitch(VIEW_MODE.WORKSPACES)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusAndSwitch(VIEW_MODE.MESSAGES)
      return
    }
    if (event.key === 'ArrowDown' && isMessages && typeof onFocusMessagesList === 'function') {
      event.preventDefault()
      onFocusMessagesList()
    }
  }

  return h(
    'div',
    {
      className: CLS.SEG,
      role: 'tablist',
      'aria-label': getMessage('view.tablist'),
      style: { '--dswb-tab-idx': isMessages ? 1 : 0 },
      onKeyDown: onTabKeyDown,
    },
    h('span', { className: CLS.SEG_THUMB, 'aria-hidden': 'true' }),
    h(
      'button',
      {
        ref: (el) => { if (tabRefs?.current) tabRefs.current[VIEW_MODE.WORKSPACES] = el },
        id: 'dswb-tab-workspaces',
        type: 'button',
        role: 'tab',
        className: CLS.SEG_TAB,
        'aria-selected': !isMessages,
        tabIndex: isMessages ? -1 : 0,
        onClick: () => onChange(VIEW_MODE.WORKSPACES),
      },
      h('span', { className: CLS.SEG_ICON, 'aria-hidden': 'true' }, WorkspacesIcon()),
      h('span', { className: CLS.SEG_LABEL }, getMessage('view.workspaces')),
    ),
    h(
      'button',
      {
        ref: (el) => { if (tabRefs?.current) tabRefs.current[VIEW_MODE.MESSAGES] = el },
        id: 'dswb-tab-messages',
        type: 'button',
        role: 'tab',
        className: CLS.SEG_TAB,
        'aria-selected': isMessages,
        'aria-controls': 'dswb-panel-messages',
        'aria-label': messagesAria,
        tabIndex: isMessages ? 0 : -1,
        onClick: () => onChange(VIEW_MODE.MESSAGES),
      },
      h('span', { className: CLS.SEG_ICON, 'aria-hidden': 'true' }, InboxIcon()),
      h('span', { className: CLS.SEG_LABEL }, getMessage('view.messages')),
      (totalRunning > 0 || totalUnread > 0) && h(
        'span',
        { className: CLS.SEG_BADGES, 'aria-hidden': 'true' },
        totalRunning > 0 && h(
          'span',
          { className: `${CLS.SEG_CHIP} ${CLS.SEG_CHIP_RUN}` },
          formatCompactCount(totalRunning),
        ),
        totalUnread > 0 && h(
          'span',
          { className: `${CLS.SEG_CHIP} ${CLS.SEG_CHIP_UNREAD}` },
          formatCompactCount(totalUnread),
        ),
      ),
    ),
  )
}

/** Trailing dual-count indicator rendered inside each native workspace row. */
export function WorkspaceRowTail({ running, unread, waiting, recentDone }) {
  if (waiting <= 0 && running <= 0 && unread <= 0 && !recentDone) return null
  const sep = getMessage('activity.listSeparator')
  const srText = buildCountClauses({ waiting, running, unread, recentDone }).join(sep)

  return h(
    'span',
    { className: CLS.WS_TAIL, title: srText },
    waiting > 0 && h('span', { className: CLS.WS_WAIT, 'aria-hidden': 'true' }),
    running > 0 && h(
      'span',
      { className: `${CLS.WS_PILL} ${CLS.WS_PILL_RUN}`, 'aria-hidden': 'true' },
      SpinnerIcon(10),
      h('span', null, formatCompactCount(running)),
    ),
    unread > 0
      ? h(
        'span',
        {
          className: `${CLS.WS_PILL} ${CLS.WS_PILL_UNREAD}`,
          'data-recent': recentDone ? 'true' : undefined,
          'aria-hidden': 'true',
        },
        formatCompactCount(unread),
      )
      : recentDone && h('span', { className: CLS.WS_DOT_DONE, 'aria-hidden': 'true' }),
    srText !== '' && h('span', { className: CLS.SR }, srText),
  )
}

function renderRailIndicator(row) {
  if (row.waiting) return h('span', { className: `${CLS.MSG_DOT} ${CLS.MSG_DOT_WAIT}` })
  if (row.running) return SpinnerIcon(13)
  if (row.failed) return h('span', { className: `${CLS.MSG_DOT} ${CLS.MSG_DOT_ERR}` })
  if (row.unread) return h('span', { className: `${CLS.MSG_DOT} ${CLS.MSG_DOT_UNREAD}` })
  return h('span', { className: `${CLS.MSG_DOT} ${CLS.MSG_DOT_IDLE}` })
}

function HeaderSearchSvg(size = 15) {
  return h(
    'svg',
    { viewBox: '0 0 20 20', width: size, height: size, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    h('circle', { cx: '8.5', cy: '8.5', r: '5.2', stroke: 'currentColor', strokeWidth: 1.5 }),
    h('path', { d: 'M12.4 12.4 17 17', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
    h('path', { d: 'M6.2 8.7h4.6M6.2 6.3h2.6', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', opacity: '0.72' }),
  )
}

function ChevronRightIcon(size = 12) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    h('path', {
      d: 'M4.5 2.5L8 6l-3.5 3.5',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** Global Search trigger mounted in place of the native search button next to "工作区". */
export function HeaderGlobalSearchButton({ active, onTrigger }) {
  const [indexing, setIndexing] = React.useState(false)
  const [inSearch, setInSearch] = React.useState(false)

  React.useEffect(() => subscribeBridgeSearchState((snap) => {
    setIndexing(snap.active)
    setInSearch(snap.searchMounts > 0)
  }), [])

  React.useEffect(() => {
    if (inSearch) return undefined
    let cancelled = false
    let timer = null
    let controller = null
    const poll = () => {
      controller = new AbortController()
      const promise = pollBridgeIndexActivity(controller.signal)
      if (!promise || typeof promise.then !== 'function') return
      promise.then(
        (val) => {
          if (cancelled) return
          setIndexing(Boolean(val && (val.progress ? val.progress.active : val.active)))
          timer = setTimeout(poll, 2500)
        },
        () => {
          if (!cancelled) timer = setTimeout(poll, 4000)
        },
      )
    }
    poll()
    return () => {
      cancelled = true
      controller?.abort()
      if (timer !== null) clearTimeout(timer)
    }
  }, [inSearch])

  const label = getMessage('headerSearch.label')
  return h(
    'button',
    {
      type: 'button',
      className: CLS.HEADER_SEARCH_BTN,
      [DOM_ATTRS.GLOBAL_SEARCH_BTN]: 'true',
      'data-active': active ? 'true' : undefined,
      'aria-label': label,
      'aria-pressed': active ? 'true' : 'false',
      title: indexing ? `${label} · ${getMessage('headerSearch.indexing')}` : label,
      onClick: onTrigger,
    },
    HeaderSearchSvg(15),
    indexing && h('span', {
      className: CLS.HEADER_SEARCH_DOT,
      role: 'status',
      'aria-label': getMessage('headerSearch.indexing'),
    }),
  )
}

/** Partition sorted activity rows into Messages sections with collapsible read+completed slicing. */
export function partitionMessageRows(rows, { visibleLimit = LIMITS.INITIAL_PAGE_SIZE, readCollapsed = false } = {}) {
  const safeRows = Array.isArray(rows) ? rows : []
  const running = []
  const waiting = []
  const finishedUnread = []
  const finishedRead = []
  for (const row of safeRows) {
    const group = row.group ?? (row.waiting ? MESSAGE_GROUP.WAITING : row.running ? MESSAGE_GROUP.RUNNING : MESSAGE_GROUP.FINISHED)
    if (group === MESSAGE_GROUP.RUNNING) running.push(row)
    else if (group === MESSAGE_GROUP.WAITING) waiting.push(row)
    else if (row.unread) finishedUnread.push(row)
    else finishedRead.push(row)
  }

  const limit = Number.isFinite(visibleLimit) && visibleLimit > 0 ? visibleLimit : LIMITS.INITIAL_PAGE_SIZE
  let budget = limit
  const take = (list) => {
    if (budget <= 0 || list.length === 0) return []
    const slice = list.slice(0, budget)
    budget -= slice.length
    return slice
  }

  const runningSlice = take(running)
  const waitingSlice = take(waiting)
  const finishedUnreadSlice = take(finishedUnread)
  const finishedReadSlice = readCollapsed ? [] : take(finishedRead)

  const shownCount = runningSlice.length + waitingSlice.length + finishedUnreadSlice.length + finishedReadSlice.length
  const expandedTotal = running.length + waiting.length + finishedUnread.length + (readCollapsed ? 0 : finishedRead.length)
  const remaining = Math.max(0, expandedTotal - shownCount)

  return {
    totals: {
      total: safeRows.length,
      running: running.length,
      waiting: waiting.length,
      unread: finishedUnread.length,
      finished: finishedUnread.length + finishedRead.length,
      finishedUnread: finishedUnread.length,
      finishedRead: finishedRead.length,
    },
    slices: {
      running: runningSlice,
      waiting: waitingSlice,
      finishedUnread: finishedUnreadSlice,
      finishedRead: finishedReadSlice,
    },
    shownCount,
    expandedTotal,
    remaining,
  }
}

function renderMessageRow({ row, session, status, currentId, now, onSelectSession }) {
  const isCurrent = row.id === currentId
  const rawTitle = typeof row.title === 'string' ? row.title.trim() : ''
  const title = rawTitle !== ''
    ? rawTitle
    : session?.blank
      ? getMessage('msg.newSession')
      : getMessage('msg.untitled')
  const wsTitle = typeof row.workspaceTitle === 'string' && row.workspaceTitle.trim() !== ''
    ? row.workspaceTitle.trim()
    : getMessage('activity.unnamed')
  const displayTime = row.sortAt || row.updatedAt
  const relTime = formatRelativeTime(displayTime, now)
  const absTime = formatAbsoluteTime(displayTime)
  const summary = extractNativeSummary(row, session, title)

  const badges = []
  if (row.waiting) badges.push({ cls: CLS.TAG_WARN, text: waitingKindLabel(status) })
  if (row.running && !row.waiting) badges.push({ cls: CLS.TAG_RUN, text: getMessage('msg.status.running') })
  if (row.failed) badges.push({ cls: CLS.TAG_ERR, text: getMessage('msg.status.failed') })
  else if (row.unread) badges.push({ cls: CLS.TAG_UNREAD, text: getMessage('msg.status.unread') })

  const rowClasses = [CLS.MSG_ROW]
  if (isCurrent) rowClasses.push(CLS.MSG_ROW_ACTIVE)
  if (row.running && !row.waiting) rowClasses.push(CLS.MSG_ROW_RUNNING)
  if (row.unread) rowClasses.push(CLS.MSG_ROW_UNREAD)
  if (row.waiting) rowClasses.push(CLS.MSG_ROW_WAITING)
  if (row.failed) rowClasses.push(CLS.MSG_ROW_FAILED)

  const sep = getMessage('activity.listSeparator')
  const ariaLabel = [
    title,
    wsTitle,
    relTime,
    ...badges.map(b => b.text),
    summary,
  ].filter(Boolean).join(sep)

  return h(
    'li',
    { key: row.id, className: CLS.MSG_ITEM },
    h(
      'button',
      {
        type: 'button',
        className: rowClasses.join(' '),
        'data-dswb-msg-id': row.id,
        'aria-current': isCurrent ? 'true' : undefined,
        'aria-label': ariaLabel,
        onClick: () => onSelectSession(row.id),
      },
      h('span', { className: CLS.MSG_RAIL, 'aria-hidden': 'true' }, renderRailIndicator(row)),
      h(
        'span',
        { className: CLS.MSG_BODY },
        h(
          'span',
          { className: CLS.MSG_TOP },
          h('span', { className: CLS.MSG_TITLE, title }, title),
          relTime !== '' && h('span', { className: CLS.MSG_TIME, title: absTime || undefined }, relTime),
        ),
        h(
          'span',
          { className: CLS.MSG_META },
          h(
            'span',
            { className: CLS.MSG_WS, title: wsTitle },
            FolderMicroIcon(),
            h('span', { className: CLS.MSG_WS_TEXT }, wsTitle),
          ),
          badges.length > 0 && h(
            'span',
            { className: CLS.MSG_TAGS },
            badges.map(badge => h(
              'span',
              { key: badge.text, className: `${CLS.TAG} ${badge.cls}` },
              badge.text,
            )),
          ),
        ),
        summary !== '' && h('span', { className: CLS.MSG_SUMMARY, title: summary }, summary),
      ),
    ),
  )
}

function renderRowList(items, context) {
  if (items.length === 0) return null
  return h(
    'ul',
    { className: CLS.MSG_LIST },
    items.map(row => renderMessageRow({
      row,
      session: context.sessions?.[row.id],
      status: context.statuses?.get?.(row.id),
      currentId: context.currentId,
      now: context.now,
      onSelectSession: context.onSelectSession,
    })),
  )
}

function renderSection(title, totalCount, items, context) {
  if (items.length === 0) return null
  return h(
    'section',
    { className: CLS.MSG_SEC, 'aria-label': `${title} (${totalCount})` },
    h(
      'div',
      { className: CLS.MSG_SEC_HEAD },
      h('span', null, title),
      h('span', { className: CLS.MSG_SEC_COUNT }, String(totalCount)),
    ),
    renderRowList(items, context),
  )
}

function renderFinishedSection({
  title,
  totals,
  slices,
  readCollapsed,
  onToggleReadCollapsed,
  context,
}) {
  if (totals.finished === 0) return null
  const showReadToggle = totals.finishedRead > 0
    && (readCollapsed || slices.finishedUnread.length === totals.finishedUnread)
  const hasVisibleItems = slices.finishedUnread.length > 0 || slices.finishedRead.length > 0
  if (!hasVisibleItems && !showReadToggle) return null

  const toggleLabel = getMessage(readCollapsed ? 'msg.readGroup.expand' : 'msg.readGroup.collapse')
  return h(
    'section',
    { className: CLS.MSG_SEC, 'aria-label': `${title} (${totals.finished})` },
    h(
      'div',
      { className: CLS.MSG_SEC_HEAD },
      h('span', null, title),
      h('span', { className: CLS.MSG_SEC_COUNT }, String(totals.finished)),
    ),
    renderRowList(slices.finishedUnread, context),
    showReadToggle && h(
      'button',
      {
        type: 'button',
        className: CLS.MSG_READ_TOGGLE,
        'data-dswb-read-toggle': 'true',
        'aria-expanded': !readCollapsed,
        onClick: onToggleReadCollapsed,
      },
      h('span', { className: CLS.MSG_READ_CHEVRON, 'aria-hidden': 'true' }, ChevronRightIcon(12)),
      h('span', null, toggleLabel),
      h('span', { className: CLS.MSG_READ_COUNT }, String(totals.finishedRead)),
    ),
    !readCollapsed && renderRowList(slices.finishedRead, context),
  )
}

/** Switchable sidebar inbox list grouped into Running, Waiting, and Completed (unread first). */
export function MessagesView({
  rows,
  sessions,
  statuses,
  currentId,
  now,
  visibleLimit,
  readCollapsed = false,
  onToggleReadCollapsed,
  onLoadMore,
  onSelectSession,
  listContainerRef,
  onReturnToTabs,
}) {
  const { totals, slices, shownCount, expandedTotal, remaining } = partitionMessageRows(rows, {
    visibleLimit,
    readCollapsed,
  })

  const sep = getMessage('activity.listSeparator')
  const summaryClauses = buildCountClauses({
    waiting: totals.waiting,
    running: totals.running,
    unread: totals.unread,
  })
  const summaryText = summaryClauses.length > 0
    ? summaryClauses.join(sep)
    : getMessage('msg.summary.total', { n: totals.total })

  const onPanelKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const root = listContainerRef?.current
    if (!root) return
    const focusables = Array.from(root.querySelectorAll(`.${CLS.MSG_ROW}, .${CLS.MSG_READ_TOGGLE}, .${CLS.LOAD_MORE}`))
    if (focusables.length === 0) return
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const activeIndex = focusables.indexOf(activeEl)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = activeIndex < 0 ? 0 : Math.min(focusables.length - 1, activeIndex + 1)
      focusables[next]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (activeIndex <= 0) onReturnToTabs?.()
      else focusables[activeIndex - 1]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusables[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      focusables[focusables.length - 1]?.focus()
    }
  }

  const rowContext = { sessions, statuses, currentId, now, onSelectSession }

  return h(
    'div',
    {
      ref: listContainerRef,
      id: 'dswb-panel-messages',
      role: 'tabpanel',
      'aria-labelledby': 'dswb-tab-messages',
      'aria-label': getMessage('msg.panelLabel'),
      className: CLS.MSG_ROOT,
      onKeyDown: onPanelKeyDown,
    },
    totals.total === 0
      ? h(
        'div',
        { className: CLS.EMPTY },
        EmptyInboxIcon(),
        h('div', { className: CLS.EMPTY_TITLE }, getMessage('msg.empty')),
      )
      : h(
        React.Fragment,
        null,
        h(
          'div',
          { className: CLS.MSG_BAR },
          h('span', { className: CLS.MSG_BAR_META }, summaryText),
          remaining > 0 && h(
            'span',
            { className: CLS.MSG_BAR_COUNT },
            getMessage('msg.summary.progress', { shown: shownCount, total: expandedTotal }),
          ),
        ),
        renderSection(getMessage('msg.section.running'), totals.running, slices.running, rowContext),
        renderSection(getMessage('msg.section.waiting'), totals.waiting, slices.waiting, rowContext),
        renderFinishedSection({
          title: getMessage('msg.section.finished'),
          totals,
          slices,
          readCollapsed,
          onToggleReadCollapsed,
          context: rowContext,
        }),
        remaining > 0 && h(
          'button',
          {
            type: 'button',
            className: CLS.LOAD_MORE,
            onClick: onLoadMore,
          },
          getMessage('msg.loadMore', { remaining }),
        ),
      ),
  )
}
