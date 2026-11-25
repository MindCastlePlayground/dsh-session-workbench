import { apply as applyManager, inject as managerServices } from './manager/index.js'
import { apply as applySearch, inject as searchServices, registerSearchTools } from './search/host.js'
import { applyCoordination, coordinationServices } from './coordination/index.js'
import { applyProjects, projectServices } from './projects/index.js'

import { registerManagerAgentTools } from './manager/agent-tools.js'
import { requestApproval } from './projects/approval.js'

export const name = 'dsh-session-workbench'
export const inject = [...new Set([...managerServices, ...searchServices])]

export function apply(ctx) {
  const moves = applyManager(ctx)
  const search = applySearch(ctx, { deletedSessionIds: moves.deletedSessionIds, readMetadata: moves.searchMetadata })
  ctx.inject(['tools'], (scope) => {
    registerSearchTools(scope, search)
    scope.effect(() => registerManagerAgentTools(scope, moves.routeHandlers, {
      approve: (agent, details, signal) => requestApproval(scope, agent, {
        callId: details.callId, toolName: details.toolName, signal,
        reason: 'Session workbench action: ' + details.action,
        displayReason: { en: [details.action, ...details.sessionIds, details.request.targetPath].filter(Boolean).join(' · ') },
      }),
    }), 'session-workbench: manager tools')
  })
  ctx.inject(coordinationServices, applyCoordination)
  ctx.inject(projectServices, (services) => applyProjects(services, moves))
}
