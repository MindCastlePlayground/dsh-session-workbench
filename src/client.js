import React from 'react'
import { apply as applyManager, inject as managerServices } from './manager/client/index.jsx'
import { createSearchClient } from './search/client.js'
import { apply as applyWorkspaceStatus, inject as workspaceStatusServices } from './workspace-status/client.js'

const search = createSearchClient(React)
export const inject = [...new Set([...managerServices, ...search.inject, ...workspaceStatusServices])]

export function apply(ctx) {
  applyManager(ctx)
  search.apply(ctx)
  applyWorkspaceStatus(ctx)
}
