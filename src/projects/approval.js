import { failure } from '../tools.js'

export async function requestApproval(ctx, agent, request) {
  const approval = ctx.get?.('approval')
  if (!approval || !request.callId) {
    throw failure('APPROVAL_UNAVAILABLE', 'Native DSH approval is unavailable for this action.')
  }
  return (await approval.request({ agent, ...request })) === 'allowed-once'
}
