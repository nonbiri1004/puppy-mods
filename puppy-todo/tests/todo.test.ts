import { expect, test } from 'claude-code/testing'

import type { Item } from '../types'
import { deleteItem, isForGithub, listOf, newId, parseItem, projectOf, reopen, tick } from '../hooks/todo'

const NOW = Date.parse('2026-10-27T10:00:00Z')
const AT = new Date(NOW).toISOString()
const item = (over: Partial<Item>): Item => ({ id: 'a', text: 'a', project: 'p', kind: 'todo', status: 'open', createdAt: '', ...over })

test('ids sort by time and stay short', () => {
  expect(newId(Date.parse('2026-10-24T14:32:00'), () => 0)).toBe('20261024-1432-0000')
})

test('a worktree belongs to its repo', () => {
  expect(projectOf('/x/my-app/.claude/worktrees/fix-1')).toBe('my-app')
  expect(projectOf('/x/my-app/')).toBe('my-app')
})

test('files from older versions are read loosely: unknown fields kept, broken ones dropped', () => {
  const old = parseItem(
    JSON.stringify({ id: 'x', text: ' merge it ', project: 'app', status: 'open', source: { type: 'github-pr' }, session: { id: 's' }, by: 'claude' }),
  )
  expect(old?.text).toBe('merge it')
  expect((old as Record<string, unknown>).source).toEqual({ type: 'github-pr' })
  expect(parseItem(JSON.stringify({ id: 'y', text: 'no project' }))?.project).toBe('misc')
  expect(parseItem('{"id": "z", "text": "  "}')).toBe(null)
  expect(parseItem('not json')).toBe(null)
  expect(parseItem(JSON.stringify({ id: 'w', text: 't', declaration: null }))?.declaration).toBe(undefined)
})

test('a tick is the person; open again clears it; delete keeps the file and everything in it', () => {
  const done = tick({ ...item({ id: 't' }), link: 'https://x' } as Item, AT)
  expect(done).toMatchObject({ status: 'done', doneAt: AT, declaration: { by: 'person', at: AT }, link: 'https://x' })
  const back = reopen(done, AT)
  expect(back.status).toBe('open')
  expect(back.declaration).toBe(undefined)
  expect(back.doneAt).toBe(undefined)
  expect(back.reopenedAt).toBe(AT)
  expect(deleteItem(item({ id: 'd', text: 'keep me' }), AT)).toMatchObject({ text: 'keep me', deletedAt: AT, deletedBy: 'person' })
})

test('the list: open oldest first, done newest first for three days, deleted never', () => {
  const { open, done } = listOf(
    [
      item({ id: '20261027-0900-b' }),
      item({ id: '20261026-0900-a' }),
      item({ id: '20261020-0900-gone', deletedAt: AT }),
      item({ id: 'd1', status: 'done', doneAt: '2026-10-27T08:00:00Z' }),
      item({ id: 'd2', status: 'done', doneAt: '2026-10-26T08:00:00Z' }),
      item({ id: 'old', status: 'done', doneAt: '2026-10-20T08:00:00Z' }),
      // an old file says done but never said when: only the file keeps it
      item({ id: 'when', status: 'done' }),
    ],
    NOW,
  )
  expect(open.map(i => i.id)).toEqual(['20261026-0900-a', '20261027-0900-b'])
  expect(done.map(i => i.id)).toEqual(['d1', 'd2'])
})

test('Codex #2: an old done item that kept its time only in declaration.at still shows under done', () => {
  const { open, done } = listOf([item({ id: 'old-done', status: 'done', declaration: { by: 'person', at: '2026-10-27T08:00:00Z' } })], NOW)
  expect(open).toEqual([])
  expect(done.map(i => i.id)).toEqual(['old-done'])
})

test('Codex #1: an item an older version left for GitHub to tick is not shown', () => {
  const pr = { ...item({ id: 'pr' }), source: { type: 'github-pr', host: 'github.com', repo: 'you/app', number: 8 }, completion: { mode: 'source' } } as Item
  const byMode = { ...item({ id: 'mode' }), completion: { mode: 'source' } } as Item
  const linked = { ...item({ id: 'link' }), link: 'https://github.com/you/app/pull/8', completion: { mode: 'declared' } } as Item
  expect([pr, byMode, linked].map(isForGithub)).toEqual([true, true, false])
  expect(listOf([pr, byMode, linked], NOW).open.map(i => i.id)).toEqual(['link'])
})
