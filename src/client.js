import React from 'react'
import { apply as applyManager, inject as managerServices } from './manager/client/index.jsx'
import { createSearchClient } from './search/client.js'

const search = createSearchClient(React)
export const inject = [...new Set([...managerServices, ...search.inject])]

export function apply(ctx) {
  applyManager(ctx)
  search.apply(ctx)
}
