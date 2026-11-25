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

  assert.deepEqual(rows.map(row => row.id), ['pending', 'parent', 'recent', 'ungrouped'])
  assert.deepEqual(counts.get('alpha'), { running: 2, unread: 2 })
  assert.equal(rows[0].waiting, true)
  assert.equal(rows[1].unread, true)
  assert.equal(rows[2].failed, true)
  assert.equal(rows[2].workspaceTitle, 'Alpha')
})
