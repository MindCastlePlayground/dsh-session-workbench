/** Shared lightweight state bridge between global-search indexing and the workspace header search trigger. */
const bridgeState = {
  active: false,
  searchMounts: 0,
  poller: null,
}

const listeners = new Set()

function notifyListeners() {
  const snapshot = getBridgeSearchState()
  for (const listener of listeners) listener(snapshot)
}

export function getBridgeSearchState() {
  return {
    active: bridgeState.active,
    searchMounts: bridgeState.searchMounts,
  }
}

export function setBridgeIndexActive(active) {
  const next = Boolean(active)
  if (bridgeState.active === next) return
  bridgeState.active = next
  notifyListeners()
}

export function setBridgeSearchMounts(count) {
  const next = typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
  if (bridgeState.searchMounts === next) return
  bridgeState.searchMounts = next
  notifyListeners()
}

export function subscribeBridgeSearchState(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  listener(getBridgeSearchState())
  return () => listeners.delete(listener)
}

export function setBridgePoller(poller) {
  bridgeState.poller = typeof poller === 'function' ? poller : null
}

export function pollBridgeIndexActivity(signal) {
  if (typeof bridgeState.poller !== 'function') return undefined
  return bridgeState.poller(signal)
}
