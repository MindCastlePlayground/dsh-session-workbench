const EVENT = {
  USER: 'user/message',
  ASSISTANT: 'assistant/message',
  TURN_START: 'turn/start',
  TURN_END: 'turn/end',
  TITLE: 'session/title',
}

const MAX_TEXT = 4000

export function historyPage(events, inherited, before, limit) {
  const messages = []
  for (let i = events.length - 1; i >= inherited; i--) {
    const event = events[i]
    if (event.seq >= before) continue
    const message = visibleMessage(event)
    if (!message) continue
    if (messages.length === limit) {
      const next = messages.at(-1).seq
      return { messages: messages.reverse(), next_before_seq: next }
    }
    messages.push(message)
  }
  return { messages: messages.reverse(), next_before_seq: null }
}

function visibleMessage(event) {
  const assistant = event.type === EVENT.ASSISTANT
  if (!assistant && event.type !== EVENT.USER) return null
  const message = assistant ? event.data.message : event.data
  const source = message.source
  if (!assistant && source?.kind !== 'user' && source?.kind !== 'agent-message') return null
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('')
  if (!text) return null
  return {
    seq: event.seq,
    role: assistant ? 'assistant' : 'user',
    text: text.slice(0, MAX_TEXT),
    ...(text.length > MAX_TEXT && { truncated: true }),
    ...(event.data.interrupted === true && { interrupted: true }),
    ...(source?.kind === 'agent-message' && { sender_session_id: source.senderSessionId }),
  }
}

export function recentTurn(events, inherited) {
  for (let i = events.length - 1; i >= inherited; i--) {
    const event = events[i]
    if (event.type === EVENT.TURN_END) return turnEnd(event)
  }
  return {}
}

export function messageTurn(events, inherited, id, sender) {
  // A send receipt identifies an inbox item. Only admission to a turn proves it reached the model history.
  let closing
  for (let i = events.length - 1; i >= inherited; i--) {
    const event = events[i]
    if (event.type === EVENT.TURN_END || event.type === EVENT.TURN_START) closing = event
    if (isRelay(event, id, sender)) {
      return {
        message_seq: event.seq,
        ...(closing?.type === EVENT.TURN_END ? turnEnd(closing) : {}),
      }
    }
  }
  return null
}

function isRelay(event, id, sender) {
  return event.type === EVENT.USER
    && event.data.id === id
    && event.data.source?.kind === 'agent-message'
    && event.data.source.senderSessionId === sender
}

function turnEnd(event) {
  return {
    turn: event.data.turn,
    turn_end_seq: event.seq,
    turn_outcome: event.data.reason.kind,
  }
}

export function sessionTitle(events) {
  return events.findLast(event => event.type === EVENT.TITLE)?.data.title ?? null
}
