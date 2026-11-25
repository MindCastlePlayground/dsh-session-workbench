/**
 * Sticky project-section headers for the native DSH sidebar workspace tree.
 * Uses IntersectionObserver to bound scroll-time measurement to only the
 * currently visible expanded project sections, preserving keyboard focus
 * clearance, project controls, counters, branch trees, and the Messages inbox.
 */

import { DOM_ATTRS } from './styles.js'

export const STICKY_ATTRS = Object.freeze({
  HOST: DOM_ATTRS.STICKY_HOST,
  DIRECT: DOM_ATTRS.STICKY_DIRECT,
  STUCK: DOM_ATTRS.STICKY_STUCK,
  COVERED: DOM_ATTRS.STICKY_COVERED,
  SECTION: DOM_ATTRS.STICKY_SECTION,
})

const CLEAR_ATTRS = Object.freeze([
  STICKY_ATTRS.HOST,
  STICKY_ATTRS.DIRECT,
  STICKY_ATTRS.STUCK,
  STICKY_ATTRS.COVERED,
  STICKY_ATTRS.SECTION,
])

const NATIVE_WS_EXPANDED_SEL = '[role="treeitem"][data-row-key^="workspace:"][aria-expanded="true"]'
const NATIVE_WS_PREFIX = 'workspace:'
const STICKY_FOCUS_GAP_PX = 4

function setAttrIfChanged(el, name, value) {
  if (!el) return
  if (value === null || value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name)
  } else if (el.getAttribute(name) !== String(value)) {
    el.setAttribute(name, String(value))
  }
}

function clearStickyAttrs(el) {
  if (!el) return
  for (const attr of CLEAR_ATTRS) {
    if (el.hasAttribute(attr)) el.removeAttribute(attr)
  }
}

/**
 * Compute which expanded project sections are currently stuck at the scrollport
 * top, and which ancestor sections are covered by a stuck nested project.
 * @param {Array<{key: string, parentKey: string|null, top: number, bottom: number, headerHeight: number}>} entries
 * @param {number} listTop
 * @returns {{ stuckKeys: Set<string>, coveredKeys: Set<string> }}
 */
export function computeStuckSections(entries, listTop) {
  const stuckKeys = new Set()
  const coveredKeys = new Set()
  if (!Array.isArray(entries) || !Number.isFinite(listTop)) {
    return { stuckKeys, coveredKeys }
  }

  const parentByKey = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string') continue
    parentByKey.set(entry.key, entry.parentKey ?? null)
    const minStickHeight = Math.min(Number(entry.headerHeight) || 32, 20)
    if (entry.top < listTop - 0.5 && entry.bottom > listTop + minStickHeight) {
      stuckKeys.add(entry.key)
    }
  }

  // If a nested descendant section reaches the top sticky slot, mark its
  // ancestors as covered so shadows and translucent text never double up.
  for (const entry of entries) {
    if (!entry || !entry.parentKey) continue
    const minStickHeight = Math.min(Number(entry.headerHeight) || 32, 20)
    const occupyingTop = entry.top <= listTop + 0.5 && entry.bottom > listTop + minStickHeight
    if (!occupyingTop && !stuckKeys.has(entry.key)) continue
    let ancestor = entry.parentKey
    const seen = new Set()
    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor)
      coveredKeys.add(ancestor)
      stuckKeys.delete(ancestor)
      ancestor = parentByKey.get(ancestor) ?? null
    }
  }

  return { stuckKeys, coveredKeys }
}

function containsSectionContent(el) {
  if (!el || typeof el.querySelector !== 'function') return false
  return el.querySelector('[data-row-key^="session:"], [data-row-key^="overflow:"], [role="group"]') !== null
}

/**
 * Locate the sticky host element (direct child of a project section) and its
 * enclosing section container for an expanded native workspace row.
 */
export function resolveStickyTarget(row, listArea) {
  if (!row || !listArea) return null
  const rawKey = row.getAttribute('data-row-key') || ''
  if (!rawKey.startsWith(NATIVE_WS_PREFIX)) return null
  const key = rawKey.slice(NATIVE_WS_PREFIX.length)

  let host = row
  let section = row.parentElement
  for (let depth = 0; depth < 3 && section && section !== listArea && section !== document.body; depth += 1) {
    if (section.getAttribute('role')) return null
    if (containsSectionContent(section) && !containsSectionContent(host)) {
      let parentKey = null
      const maybeGroup = section.parentElement
      if (maybeGroup && maybeGroup.getAttribute('role') === 'group') {
        const parentSection = maybeGroup.parentElement
        if (parentSection) {
          const marked = parentSection.getAttribute(STICKY_ATTRS.SECTION)
          if (marked !== null) parentKey = marked
          else {
            const pRow = parentSection.querySelector('[role="treeitem"][data-row-key^="workspace:"]')
            const pKey = pRow ? (pRow.getAttribute('data-row-key') || '') : ''
            if (pKey.startsWith(NATIVE_WS_PREFIX)) parentKey = pKey.slice(NATIVE_WS_PREFIX.length)
          }
        }
      }
      return {
        key,
        parentKey,
        row,
        host,
        section,
        direct: host === row,
      }
    }
    host = section
    section = section.parentElement
  }
  return null
}

/**
 * Create a sticky-header controller bound to one WorkspaceStatus instance.
 */
export function createStickyProjectController() {
  let boundListArea = null
  let scrollRaf = 0
  let io = null
  let ro = null
  const trackedHosts = new Set()
  const sectionMap = new Map()
  const intersecting = new Set()

  const cancelScrollRaf = () => {
    if (scrollRaf !== 0 && typeof window !== 'undefined') {
      window.cancelAnimationFrame(scrollRaf)
      scrollRaf = 0
    }
  }

  const updateStuck = () => {
    scrollRaf = 0
    if (!boundListArea || !boundListArea.isConnected) return
    if (boundListArea.scrollTop <= 1) {
      for (const host of trackedHosts) {
        setAttrIfChanged(host, STICKY_ATTRS.STUCK, null)
        setAttrIfChanged(host, STICKY_ATTRS.COVERED, null)
      }
      return
    }

    const listTop = boundListArea.getBoundingClientRect().top
    const sourceSections = io ? intersecting : sectionMap.keys()
    const visibleEntries = []
    for (const section of sourceSections) {
      const target = sectionMap.get(section)
      if (!target || !section.isConnected || !target.host.isConnected) continue
      const rect = section.getBoundingClientRect()
      visibleEntries.push({
        key: target.key,
        parentKey: target.parentKey,
        top: rect.top,
        bottom: rect.bottom,
        headerHeight: target.row.offsetHeight || 32,
      })
    }

    const { stuckKeys, coveredKeys } = computeStuckSections(visibleEntries, listTop)
    for (const target of sectionMap.values()) {
      if (!target.host.isConnected) continue
      setAttrIfChanged(target.host, STICKY_ATTRS.STUCK, stuckKeys.has(target.key) ? 'true' : null)
      setAttrIfChanged(target.host, STICKY_ATTRS.COVERED, coveredKeys.has(target.key) ? 'true' : null)
    }
  }

  const scheduleUpdateStuck = () => {
    if (scrollRaf !== 0 || typeof window === 'undefined') return
    scrollRaf = window.requestAnimationFrame(updateStuck)
  }

  const onScroll = () => {
    scheduleUpdateStuck()
  }

  const onFocusIn = (event) => {
    if (!boundListArea || !boundListArea.isConnected) return
    const target = event && event.target instanceof Element ? event.target : null
    if (!target || !boundListArea.contains(target)) return
    const coveredHost = target.closest(`[${STICKY_ATTRS.COVERED}="true"]`)
    if (coveredHost) {
      const parentSection = coveredHost.closest(`[${STICKY_ATTRS.SECTION}]`)
      if (parentSection) {
        const listTop = boundListArea.getBoundingClientRect().top
        const secTop = parentSection.getBoundingClientRect().top
        if (secTop < listTop - 1) {
          boundListArea.scrollTop = Math.max(0, boundListArea.scrollTop - Math.ceil(listTop - secTop))
          scheduleUpdateStuck()
        }
      }
      return
    }
    // Focusing a control inside a visible stuck header needs no downward scroll nudge.
    if (target.closest(`[${STICKY_ATTRS.STUCK}="true"]`)) return
    const stuckHost = boundListArea.querySelector(`[${STICKY_ATTRS.STUCK}="true"]:not([${STICKY_ATTRS.COVERED}="true"])`)
    if (!stuckHost) return
    const stuckRect = stuckHost.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    if (targetRect.height <= 0 || stuckRect.height <= 0) return
    if (targetRect.top < stuckRect.bottom + 2 && targetRect.bottom > stuckRect.top) {
      const nudge = Math.ceil(stuckRect.bottom + STICKY_FOCUS_GAP_PX - targetRect.top)
      if (nudge > 0) {
        boundListArea.scrollTop = Math.max(0, boundListArea.scrollTop - nudge)
        scheduleUpdateStuck()
      }
    }
  }

  const detach = () => {
    cancelScrollRaf()
    if (io) {
      try { io.disconnect() } catch (e) {}
      io = null
    }
    if (ro) {
      try { ro.disconnect() } catch (e) {}
      ro = null
    }
    if (boundListArea) {
      boundListArea.removeEventListener('scroll', onScroll)
      boundListArea.removeEventListener('focusin', onFocusIn)
      boundListArea = null
    }
    for (const host of trackedHosts) clearStickyAttrs(host)
    for (const section of sectionMap.keys()) {
      if (section && section.hasAttribute && section.hasAttribute(STICKY_ATTRS.SECTION)) {
        section.removeAttribute(STICKY_ATTRS.SECTION)
      }
    }
    trackedHosts.clear()
    sectionMap.clear()
    intersecting.clear()
  }

  const attach = (listArea) => {
    if (boundListArea === listArea) return
    detach()
    boundListArea = listArea
    listArea.addEventListener('scroll', onScroll, { passive: true })
    listArea.addEventListener('focusin', onFocusIn)
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(
        (entries) => {
          let changed = false
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (!intersecting.has(entry.target)) {
                intersecting.add(entry.target)
                changed = true
              }
            } else if (intersecting.delete(entry.target)) {
              changed = true
            }
          }
          if (changed) scheduleUpdateStuck()
        },
        { root: listArea, threshold: [0] },
      )
    }
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(scheduleUpdateStuck)
      ro.observe(listArea)
    }
  }

  const sync = (listArea, active) => {
    if (!active || !listArea || !listArea.isConnected) {
      detach()
      return
    }
    attach(listArea)

    const nextHosts = new Set()
    const nextSections = new Map()
    const expandedRows = listArea.querySelectorAll(NATIVE_WS_EXPANDED_SEL)
    for (const row of expandedRows) {
      const target = resolveStickyTarget(row, listArea)
      if (!target) continue
      nextHosts.add(target.host)
      nextSections.set(target.section, target)
      setAttrIfChanged(target.section, STICKY_ATTRS.SECTION, target.key)
      setAttrIfChanged(target.host, STICKY_ATTRS.HOST, 'true')
      setAttrIfChanged(target.host, STICKY_ATTRS.DIRECT, target.direct ? 'true' : null)
    }

    for (const prevHost of trackedHosts) {
      if (!nextHosts.has(prevHost)) clearStickyAttrs(prevHost)
    }
    trackedHosts.clear()
    for (const host of nextHosts) trackedHosts.add(host)

    if (io) {
      for (const prevSec of sectionMap.keys()) {
        if (!nextSections.has(prevSec)) {
          io.unobserve(prevSec)
          intersecting.delete(prevSec)
          if (prevSec.isConnected && prevSec.hasAttribute(STICKY_ATTRS.SECTION)) {
            prevSec.removeAttribute(STICKY_ATTRS.SECTION)
          }
        }
      }
      for (const nextSec of nextSections.keys()) {
        if (!sectionMap.has(nextSec)) io.observe(nextSec)
      }
    } else {
      for (const prevSec of sectionMap.keys()) {
        if (!nextSections.has(prevSec) && prevSec.isConnected && prevSec.hasAttribute(STICKY_ATTRS.SECTION)) {
          prevSec.removeAttribute(STICKY_ATTRS.SECTION)
        }
      }
    }

    sectionMap.clear()
    for (const [sec, target] of nextSections) sectionMap.set(sec, target)

    scheduleUpdateStuck()
  }

  return {
    sync,
    dispose: detach,
  }
}
