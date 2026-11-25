/**
 * Constants, design-token CSS, and selector utilities for the sidebar
 * workspace-status indicator, view switcher, and messages inbox view.
 */

export const SLOT_CONFIG = Object.freeze({
  SLOT: 'sidebar.footer.action',
  ENTRY_ID: 'dsh-session-workbench-workspace-status',
  STYLE_ID: 'dsh-session-workbench/workspace-status.css',
  ORDER: 950,
})

export const LIMITS = Object.freeze({
  FINISHED_WINDOW_MS: 60 * 60 * 1000,
  MAX_NAMES: 4,
  INITIAL_PAGE_SIZE: 30,
  PAGE_STEP: 30,
  MAX_BADGE_COUNT: 99,
  TIME_TICK_MS: 60 * 1000,
})

export const VIEW_MODE = Object.freeze({
  WORKSPACES: 'workspaces',
  MESSAGES: 'messages',
})

export const DOM_ATTRS = Object.freeze({
  VIEW: 'data-dswb-view',
  VIEW_MESSAGES: 'messages',
  HEADER_HIDDEN: 'data-dswb-header-hidden',
  SWITCHER_HOST: 'data-dswb-switcher-host',
  MESSAGES_HOST: 'data-dswb-messages-host',
  WS_HOST: 'data-dswb-ws-host',
  WS_ROW_FLAG: 'data-dswb-ws-ready',
  WS_ROW_PREFIX: 'workspace:',
  STICKY_HOST: 'data-dswb-sticky-host',
  STICKY_DIRECT: 'data-dswb-sticky-direct',
  STICKY_STUCK: 'data-dswb-sticky-stuck',
  STICKY_COVERED: 'data-dswb-sticky-covered',
  STICKY_SECTION: 'data-dswb-sticky-section',
  ENSURE_WORKSPACES_EVENT: 'dswb:ensure-workspaces-view',
  NATIVE_SCROLLPORT: '[data-sidebar-scrollport]',
  NATIVE_HEADER: '[data-sidebar-workspace-header]',
  NATIVE_LIST_AREA: '[data-sidebar-list-area]',
  NATIVE_LIST_AREA_ATTR: 'data-sidebar-list-area',
  NATIVE_WS_ROW: '[data-row-key^="workspace:"]',
})

export const CLS = Object.freeze({
  SPIN: 'dsh-workbench-workspace-spin',
  SR: 'dsh-workbench-workspace-sr',
  SWITCHER_HOST: 'dswb-switcher-host',
  SEG: 'dswb-seg',
  SEG_THUMB: 'dswb-seg-thumb',
  SEG_TAB: 'dswb-seg-tab',
  SEG_ICON: 'dswb-seg-icon',
  SEG_LABEL: 'dswb-seg-label',
  SEG_BADGES: 'dswb-seg-badges',
  SEG_CHIP: 'dswb-seg-chip',
  SEG_CHIP_RUN: 'dswb-seg-chip--run',
  SEG_CHIP_UNREAD: 'dswb-seg-chip--unread',
  WS_TAIL: 'dswb-ws-tail',
  WS_WAIT: 'dswb-ws-wait',
  WS_PILL: 'dswb-ws-pill',
  WS_PILL_RUN: 'dswb-ws-pill--run',
  WS_PILL_UNREAD: 'dswb-ws-pill--unread',
  WS_DOT_DONE: 'dswb-ws-dot-done',
  MSG_ROOT: 'dswb-msg-root',
  MSG_BAR: 'dswb-msg-bar',
  MSG_BAR_META: 'dswb-msg-bar-meta',
  MSG_BAR_COUNT: 'dswb-msg-bar-count',
  MSG_SEC: 'dswb-msg-sec',
  MSG_SEC_HEAD: 'dswb-msg-sec-head',
  MSG_SEC_COUNT: 'dswb-msg-sec-count',
  MSG_LIST: 'dswb-msg-list',
  MSG_ITEM: 'dswb-msg-item',
  MSG_ROW: 'dswb-msg-row',
  MSG_ROW_ACTIVE: 'dswb-msg-row--active',
  MSG_ROW_RUNNING: 'dswb-msg-row--running',
  MSG_ROW_UNREAD: 'dswb-msg-row--unread',
  MSG_ROW_WAITING: 'dswb-msg-row--waiting',
  MSG_ROW_FAILED: 'dswb-msg-row--failed',
  MSG_RAIL: 'dswb-msg-rail',
  MSG_DOT: 'dswb-msg-dot',
  MSG_DOT_WAIT: 'dswb-msg-dot--wait',
  MSG_DOT_ERR: 'dswb-msg-dot--err',
  MSG_DOT_UNREAD: 'dswb-msg-dot--unread',
  MSG_DOT_IDLE: 'dswb-msg-dot--idle',
  MSG_SPINNER: 'dswb-msg-spinner',
  MSG_SPINNER_TRACK: 'dswb-msg-spinner-track',
  MSG_SPINNER_ARC: 'dswb-msg-spinner-arc',
  MSG_BODY: 'dswb-msg-body',
  MSG_TOP: 'dswb-msg-top',
  MSG_TITLE: 'dswb-msg-title',
  MSG_TIME: 'dswb-msg-time',
  MSG_META: 'dswb-msg-meta',
  MSG_WS: 'dswb-msg-ws',
  MSG_WS_TEXT: 'dswb-msg-ws-text',
  MSG_TAGS: 'dswb-msg-tags',
  TAG: 'dswb-tag',
  TAG_WARN: 'dswb-tag--warn',
  TAG_RUN: 'dswb-tag--run',
  TAG_ERR: 'dswb-tag--err',
  TAG_UNREAD: 'dswb-tag--unread',
  MSG_SUMMARY: 'dswb-msg-summary',
  LOAD_MORE: 'dswb-load-more',
  EMPTY: 'dswb-empty',
  EMPTY_TITLE: 'dswb-empty-title',
})

const RING = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='4' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-opacity='.25'/%3E%3Ccircle cx='5' cy='5' r='4' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-dasharray='5 20'/%3E%3C/svg%3E\")"

export const BASE_WORKBENCH_CSS = `
@keyframes ${CLS.SPIN}{to{transform:rotate(360deg)}}
@keyframes dswb-arc-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}100%{stroke-dasharray:12 150;stroke-dashoffset:0}}
@keyframes dswb-fade-in{from{opacity:0;transform:translateY(2px)}}

.${CLS.SR}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}

[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}][${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]>:not([${DOM_ATTRS.MESSAGES_HOST}]){display:none!important}
[${DOM_ATTRS.HEADER_HIDDEN}="true"]{display:none!important}

.${CLS.SWITCHER_HOST}{flex:none;container-type:inline-size;margin:2px var(--dsh-sidebar-paint-inset,3px) 6px;box-sizing:border-box}
.${CLS.SEG}{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;padding:3px;box-sizing:border-box;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-interactive-bg-hover);border:.5px solid color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent)}
.${CLS.SEG_THUMB}{position:absolute;top:3px;left:3px;width:calc((100% - 8px)/2);height:calc(100% - 6px);border-radius:calc(var(--dsw-radius-md,10px) - 3px);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.06));box-sizing:border-box;transform:translateX(calc(var(--dswb-tab-idx,0) * (100% + 2px)));transition:transform 180ms cubic-bezier(.22,1,.36,1);pointer-events:none}
.${CLS.SEG_TAB}{position:relative;z-index:1;appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:0;height:26px;padding:0 7px;border:0;border-radius:calc(var(--dsw-radius-md,10px) - 3px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;font-weight:480;line-height:18px;letter-spacing:-.005em;cursor:pointer;white-space:nowrap;transition:color 140ms ease}
.${CLS.SEG_TAB}[aria-selected="true"]{color:var(--dsw-alias-label-primary);font-weight:580}
@media (hover:hover){.${CLS.SEG_TAB}:hover{color:var(--dsw-alias-label-primary)}}
.${CLS.SEG_TAB}:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f6ef7));outline-offset:-2px}
.${CLS.SEG_ICON}{flex:none;display:inline-flex;align-items:center;justify-content:center;opacity:.84}
.${CLS.SEG_TAB}[aria-selected="true"] .${CLS.SEG_ICON}{opacity:1}
.${CLS.SEG_LABEL}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${CLS.SEG_BADGES}{flex:none;display:inline-flex;align-items:center;gap:3px}
.${CLS.SEG_CHIP}{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;box-sizing:border-box;border-radius:999px;font-size:10px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.${CLS.SEG_CHIP_RUN}{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7));background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 14%,transparent)}
.${CLS.SEG_CHIP_UNREAD}{color:var(--dsw-alias-state-success-primary,#2f8f4e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 14%,transparent)}
@container (max-width:235px){.${CLS.SEG_TAB}{padding:0 5px;gap:4px;font-size:12px}.${CLS.SEG_ICON}{display:none}}

[${DOM_ATTRS.WS_HOST}]{flex:none;display:inline-flex;align-items:center;margin-inline-start:2px}
[${DOM_ATTRS.WS_HOST}]:empty{display:none}
.${CLS.WS_TAIL}{display:inline-flex;align-items:center;gap:4px}
.${CLS.WS_WAIT}{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#eab308);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 18%,transparent)}
.${CLS.WS_DOT_DONE}{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#2f8f4e);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 15%,transparent)}
.${CLS.WS_PILL}{display:inline-flex;align-items:center;gap:3px;height:17px;padding:0 5px;box-sizing:border-box;border-radius:999px;font-size:10.5px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.${CLS.WS_PILL_RUN}{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7));border:.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 26%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 11%,transparent)}
.${CLS.WS_PILL_UNREAD}{color:var(--dsw-alias-state-success-primary,#2f8f4e);border:.5px solid color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 26%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 11%,transparent)}
.${CLS.WS_PILL_UNREAD}[data-recent="true"]{box-shadow:0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 18%,transparent)}
.${CLS.WS_PILL_UNREAD}::before{content:"";width:5px;height:5px;border-radius:50%;flex:none;background:currentColor}

[${DOM_ATTRS.MESSAGES_HOST}]{container-type:inline-size;display:flex;flex-direction:column;min-height:100%;padding-bottom:24px;box-sizing:border-box}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}][${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"] [${DOM_ATTRS.MESSAGES_HOST}]{animation:dswb-fade-in 140ms ease-out}
.${CLS.MSG_ROOT}{display:flex;flex-direction:column;gap:4px}
.${CLS.MSG_BAR}{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 10px 5px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.${CLS.MSG_BAR_META}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${CLS.MSG_BAR_COUNT}{flex:none;opacity:.85}
.${CLS.MSG_SEC}{display:flex;flex-direction:column;gap:2px}
.${CLS.MSG_SEC}+.${CLS.MSG_SEC}{margin-top:6px}
.${CLS.MSG_SEC_HEAD}{display:flex;align-items:center;gap:6px;padding:4px 10px 3px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary)}
.${CLS.MSG_SEC_HEAD}::after{content:"";flex:1;height:.5px;background:color-mix(in srgb,var(--dsw-alias-border-l1) 75%,transparent)}
.${CLS.MSG_SEC_COUNT}{font-variant-numeric:tabular-nums;opacity:.85}
.${CLS.MSG_LIST}{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.${CLS.MSG_ITEM}{position:relative;content-visibility:auto;contain-intrinsic-size:auto 52px}
.${CLS.MSG_ITEM}::after{content:"";position:absolute;left:30px;right:10px;bottom:0;height:.5px;background:color-mix(in srgb,var(--dsw-alias-border-l1) 50%,transparent);pointer-events:none}
.${CLS.MSG_ITEM}:last-child::after,.${CLS.MSG_ITEM}:has(> .${CLS.MSG_ROW}:hover)::after,.${CLS.MSG_ITEM}:has(> .${CLS.MSG_ROW}:focus-visible)::after,.${CLS.MSG_ITEM}:has(> .${CLS.MSG_ROW_ACTIVE})::after,.${CLS.MSG_ITEM}:has(+ .${CLS.MSG_ITEM} > .${CLS.MSG_ROW}:hover)::after,.${CLS.MSG_ITEM}:has(+ .${CLS.MSG_ITEM} > .${CLS.MSG_ROW}:focus-visible)::after,.${CLS.MSG_ITEM}:has(+ .${CLS.MSG_ITEM} > .${CLS.MSG_ROW_ACTIVE})::after{opacity:0}

.${CLS.MSG_ROW}{position:relative;appearance:none;display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:7px 9px 7px 8px;border:0;border-inline:var(--dsh-sidebar-paint-inset,3px) solid transparent;border-radius:var(--dsw-radius-md,10px);background:transparent;background-clip:padding-box;text-align:left;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color 120ms ease,transform 80ms ease}
@media (hover:hover){.${CLS.MSG_ROW}:hover{background-color:var(--dsw-alias-interactive-bg-hover)}}
.${CLS.MSG_ROW}:active{transform:scale(.992)}
.${CLS.MSG_ROW}:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f6ef7));outline-offset:-2px}
.${CLS.MSG_ROW_ACTIVE}{background-color:var(--dsw-alias-interactive-bg-hover)}
.${CLS.MSG_ROW_ACTIVE}::before{content:"";position:absolute;left:1px;top:8px;bottom:8px;width:2.5px;border-radius:999px;background:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7))}

.${CLS.MSG_RAIL}{flex:none;width:14px;height:19px;display:inline-flex;align-items:center;justify-content:center}
.${CLS.MSG_DOT}{width:6px;height:6px;border-radius:50%;flex:none}
.${CLS.MSG_DOT_WAIT}{background:var(--dsw-alias-state-warn-primary,#eab308);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 18%,transparent)}
.${CLS.MSG_DOT_ERR}{background:var(--dsw-alias-state-error-primary,#dc2626);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 16%,transparent)}
.${CLS.MSG_DOT_UNREAD}{background:var(--dsw-alias-state-success-primary,#2f8f4e);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 16%,transparent)}
.${CLS.MSG_DOT_IDLE}{width:4px;height:4px;background:var(--dsw-alias-state-idle-primary,var(--dsw-alias-border-l3));opacity:.55}

.${CLS.MSG_SPINNER}{flex:none;display:block;color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7))}
.${CLS.MSG_SPINNER} g{transform-origin:center;animation:${CLS.SPIN} 1.5s linear infinite}
.${CLS.MSG_SPINNER_TRACK}{fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;opacity:.24}
.${CLS.MSG_SPINNER_ARC}{fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-dasharray:12 150;animation:dswb-arc-dash 1.5s ease-in-out infinite}

.${CLS.MSG_BODY}{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.${CLS.MSG_TOP}{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.${CLS.MSG_TITLE}{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;line-height:19px;letter-spacing:-.008em;font-weight:430;color:var(--dsw-alias-label-secondary)}
.${CLS.MSG_ROW_ACTIVE} .${CLS.MSG_TITLE},.${CLS.MSG_ROW}:hover .${CLS.MSG_TITLE}{color:var(--dsw-alias-label-primary)}
.${CLS.MSG_ROW_UNREAD} .${CLS.MSG_TITLE},.${CLS.MSG_ROW_RUNNING} .${CLS.MSG_TITLE},.${CLS.MSG_ROW_WAITING} .${CLS.MSG_TITLE},.${CLS.MSG_ROW_FAILED} .${CLS.MSG_TITLE}{color:var(--dsw-alias-label-primary);font-weight:560}
.${CLS.MSG_TIME}{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}

.${CLS.MSG_META}{display:flex;align-items:center;gap:6px;min-width:0}
.${CLS.MSG_WS}{display:inline-flex;align-items:center;gap:4px;flex:0 1 auto;min-width:0;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.${CLS.MSG_WS} svg{flex:none;opacity:.72}
.${CLS.MSG_WS_TEXT}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${CLS.MSG_TAGS}{flex:none;margin-left:auto;display:inline-flex;align-items:center;gap:4px}
.${CLS.TAG}{display:inline-flex;align-items:center;height:16px;padding:0 5px;box-sizing:border-box;border-radius:999px;font-size:10.5px;font-weight:550;line-height:1;white-space:nowrap}
.${CLS.TAG_WARN}{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 72%,var(--dsw-alias-label-primary));border:.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#eab308) 12%,transparent)}
.${CLS.TAG_RUN}{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7));background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-450,#4f6ef7)) 12%,transparent)}
.${CLS.TAG_ERR}{color:var(--dsw-alias-state-error-primary,#dc2626);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 12%,transparent)}
.${CLS.TAG_UNREAD}{color:var(--dsw-alias-state-success-primary,#2f8f4e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f8f4e) 12%,transparent)}

.${CLS.MSG_SUMMARY}{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);opacity:.86;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.${CLS.LOAD_MORE}{appearance:none;display:flex;align-items:center;justify-content:center;width:calc(100% - 12px);height:32px;margin:8px 6px 0;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,color 140ms ease}
@media (hover:hover){.${CLS.LOAD_MORE}:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}}
.${CLS.LOAD_MORE}:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f6ef7));outline-offset:1px}

.${CLS.EMPTY}{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:56px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.${CLS.EMPTY_TITLE}{font-size:13px;line-height:19px}

[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]){scroll-padding-top:38px}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"],
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [role="tree"]>div>[role="treeitem"][data-row-key^="workspace:"][aria-expanded="true"],
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [role="group"]>div>[role="treeitem"][data-row-key^="workspace:"][aria-expanded="true"]{display:block;position:sticky;top:0;z-index:4;transition:opacity 120ms ease}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_DIRECT}="true"],
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [role="tree"]>div>[role="treeitem"][data-row-key^="workspace:"][aria-expanded="true"],
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [role="group"]>div>[role="treeitem"][data-row-key^="workspace:"][aria-expanded="true"]{display:flex}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"]::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1));transition:box-shadow 140ms ease,background-color 140ms ease}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_DIRECT}="true"]::before{inset:0 calc(-1 * var(--dsh-sidebar-paint-inset,3px))}
html[data-platform='darwin'] [${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"]:not([${DOM_ATTRS.STICKY_STUCK}="true"])::before{background:transparent}
html[data-platform='darwin'] [${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"][${DOM_ATTRS.STICKY_STUCK}="true"]:not([${DOM_ATTRS.STICKY_COVERED}="true"])::before{background:color-mix(in srgb,var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1)) 84%,transparent);backdrop-filter:blur(18px) saturate(145%)}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"][${DOM_ATTRS.STICKY_STUCK}="true"]:not([${DOM_ATTRS.STICKY_COVERED}="true"]){z-index:5}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"][${DOM_ATTRS.STICKY_STUCK}="true"]:not([${DOM_ATTRS.STICKY_COVERED}="true"])::before{box-shadow:0 1px 0 color-mix(in srgb,var(--dsw-alias-border-l2) 72%,transparent),0 6px 12px -6px rgb(0 0 0/.16)}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"][${DOM_ATTRS.STICKY_STUCK}="true"]:not([${DOM_ATTRS.STICKY_COVERED}="true"]) [role="treeitem"][data-row-key^="workspace:"],
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_DIRECT}="true"][${DOM_ATTRS.STICKY_STUCK}="true"]:not([${DOM_ATTRS.STICKY_COVERED}="true"]){font-weight:560;color:var(--dsw-alias-label-primary)}
[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}]:not([${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"]) [${DOM_ATTRS.STICKY_HOST}="true"][${DOM_ATTRS.STICKY_COVERED}="true"]:not(:focus-within){opacity:0;pointer-events:none}

@container (max-width:225px){.${CLS.MSG_ROW}{padding:6px 6px 6px 5px;gap:6px}.${CLS.MSG_TITLE}{font-size:13px}.${CLS.TAG}{padding:0 4px;font-size:10px}}

@media (prefers-reduced-motion:reduce){
  .${CLS.SEG_THUMB},.${CLS.SEG_TAB},.${CLS.MSG_ROW},.${CLS.LOAD_MORE},[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}] [${DOM_ATTRS.STICKY_HOST}="true"],[${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}] [${DOM_ATTRS.STICKY_HOST}="true"]::before{transition:none}
  [${DOM_ATTRS.NATIVE_LIST_AREA_ATTR}][${DOM_ATTRS.VIEW}="${DOM_ATTRS.VIEW_MESSAGES}"] [${DOM_ATTRS.MESSAGES_HOST}]{animation:none}
  .${CLS.MSG_ROW}:active{transform:none}
  .${CLS.MSG_SPINNER} g,.${CLS.MSG_SPINNER_ARC}{animation:none}
  .${CLS.MSG_SPINNER_ARC}{stroke-dasharray:18 150;stroke-dashoffset:-3}
}
`.trim()

/**
 * Escape one value for a double-quoted CSS attribute selector.
 * @param {string} value - raw id or key.
 * @returns {string} CSS-escaped value.
 */
export function quoteCssAttr(value) {
  let escaped = ''
  for (const char of String(value)) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\\' || char === '"') escaped += `\\${char}`
    else if (code < 0x20 || code === 0x7f) escaped += `\\${code.toString(16)} `
    else escaped += char
  }
  return escaped
}

function fallbackSelectors(keys, suffix) {
  return keys
    .map(key => `[data-row-key="${DOM_ATTRS.WS_ROW_PREFIX}${quoteCssAttr(key)}"]:not([${DOM_ATTRS.WS_ROW_FLAG}="true"])${suffix}`)
    .join(',')
}

/**
 * Fallback pseudo-element rules when portal attachment has not occurred.
 * Rows with `data-dswb-ws-ready="true"` render rich portal counters instead.
 */
export function rowFallbackCss(activity) {
  if (!activity) return ''
  const parts = []

  if (Array.isArray(activity.waiting) && activity.waiting.length > 0) {
    const waiting = fallbackSelectors(activity.waiting, '::after')
    parts.push(
      `${waiting}{content:"";flex:none;box-sizing:border-box;width:6px;height:6px;`,
      'margin-inline-start:2px;border-radius:50%;',
      'background:var(--dsw-alias-state-warn-primary);',
      'box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 16%,transparent)}',
    )
  }

  if (Array.isArray(activity.running) && activity.running.length > 0) {
    const running = fallbackSelectors(activity.running, '::after')
    parts.push(
      `${running}{content:"";flex:none;box-sizing:border-box;width:10px;height:10px;`,
      'margin-inline-start:2px;background-color:var(--dsw-static-deepseek-450);',
      `-webkit-mask-image:${RING};mask-image:${RING};`,
      '-webkit-mask-size:100% 100%;mask-size:100% 100%;',
      '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;',
      `animation:${CLS.SPIN} 1.5s linear infinite}`,
      `@media (prefers-reduced-motion:reduce){${running}{animation:none;opacity:.7}}`,
    )
  }

  if (Array.isArray(activity.done) && activity.done.length > 0) {
    const done = fallbackSelectors(activity.done, '::after')
    parts.push(
      `${done}{content:"";flex:none;box-sizing:border-box;width:6px;height:6px;`,
      'margin-inline-start:2px;border-radius:50%;',
      'background:var(--dsw-alias-state-success-primary);',
      'box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}',
    )
  }

  return parts.join('')
}
