import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectActivity } from '../src/workspace-status/activity.js'

test('messages prioritize running sessions and count native unread independently', () => {
  const items = [
    { workspaceId: 'alpha', title: 'Alpha', sessionIds: ['parent', 'recent', 'archived', 'pending'] },
  ]
  const sessions = {
    parent: { id: 'parent', updatedAt: 10 },
    child1: { id: 'child1', origin: 'subagent', parentId: 'parent', running: true },
    child2: { id: 'child2', origin: 'subagent', parentId: 'parent', running: true },
    recent: { id: 'recent', updatedAt: 40 },
    pending: { id: 'pending', updatedAt: 20, running: true },
    archived: { id: 'archived', updatedAt: 50, running: true },
    ungrouped: { id: 'ungrouped', updatedAt: 30 },
    blank: { id: 'blank', updatedAt: 60, blank: true },
  }
  const statuses = new Map([
    ['parent', { running: false, completionUnread: true }],
    ['pending', { running: true, pendingInteraction: 'approval' }],
    ['recent', { completionUnread: true, completionFailed: true }],
    ['archived', { completionUnread: true }],
  ])

  const { counts, rows } = projectActivity(items, sessions, statuses, ['archived'])

  assert.deepEqual(rows.map(row => row.id), ['parent', 'pending', 'recent', 'ungrouped'])
  assert.deepEqual(counts.get('alpha'), { running: 1, unread: 2, waiting: 1 })
  assert.equal(rows[0].running, true)
  assert.equal(rows[1].waiting, true)
  assert.equal(rows[1].unread, false)
  assert.equal(rows[2].failed, true)
  assert.equal(rows[2].workspaceTitle, 'Alpha')
})

test('blocked sessions and unread marks count independently of active work', () => {
  const items = [{ workspaceId: 'alpha', title: 'Alpha', sessionIds: ['blocked', 'active', 'manual', 'complete'] }]
  const sessions = {
    blocked: { id: 'blocked', running: true },
    active: { id: 'active', running: true },
    manual: { id: 'manual' },
    complete: { id: 'complete' },
    child: { id: 'child', origin: 'subagent', parentId: 'blocked' },
    ungrouped: { id: 'ungrouped', blank: true },
  }
  const statuses = new Map([
    ['blocked', { pendingInteraction: { kind: 'approval' } }],
    ['child', { pendingInteraction: { kind: 'question' } }],
    ['manual', { completionUnread: true }],
    ['complete', { completionUnread: true }],
    ['ungrouped', { pendingInteraction: { kind: 'plan-review' } }],
  ])

  const { counts, rows } = projectActivity(items, sessions, statuses, [])
  assert.deepEqual(counts.get('alpha'), { running: 1, unread: 2, waiting: 1 })
  assert.deepEqual(counts.get(''), { running: 0, unread: 0, waiting: 1 })
  assert.equal(rows.some(row => row.id === 'child'), false)
  statuses.delete('blocked')
  assert.deepEqual(projectActivity(items, sessions, statuses, []).counts.get('alpha'), {
    running: 1, unread: 2, waiting: 1,
  })
  statuses.delete('child')
  assert.deepEqual(projectActivity(items, sessions, statuses, []).counts.get('alpha'), {
    running: 2, unread: 2, waiting: 0,
  })
})
