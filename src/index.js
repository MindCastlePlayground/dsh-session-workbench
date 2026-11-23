import { apply as applyManager, inject as managerServices } from './manager/index.js'
import { apply as applySearch, inject as searchServices } from './search/host.js'
import { applyCoordination, coordinationServices } from './coordination/index.js'
import { applyProjects, projectServices } from './projects/index.js'

export const name = 'dsh-session-workbench'
export const inject = [...new Set([...managerServices, ...searchServices])]

export function apply(ctx) {
  const moves = applyManager(ctx)
  applySearch(ctx)
  ctx.inject(coordinationServices, applyCoordination)
  ctx.inject(projectServices, (services) => applyProjects(services, moves))
}
