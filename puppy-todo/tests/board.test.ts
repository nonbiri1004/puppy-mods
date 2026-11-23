import { expect, test } from 'claude-code/testing'

import { dueOf, entriesOf, folderTag, isLink, linkLabel, oldestSince, parseBoard, staleLine, STALE_MS } from '../hooks/board'

const NOW = Date.parse('2026-11-23T10:00:00+08:00')
const file = (over: Record<string, unknown>) =>
  JSON.stringify({ format: 'pipeline-status', version: 1, pipeline: 'dispatch', title: '任務板', updated: '2026-11-23T09:48:00+08:00', state: 'waiting', headline: 'x', ...over })

test('a status file becomes a card: only title, updated, waiting and waiting_groups are read', () => {
  const b = parseBoard('dispatch.json', file({
    waiting_groups: [{ id: 'a', label: '等合併' }, { id: 'no-label' }, { id: 'long', label: 'x'.repeat(41) }],
    waiting: [
      { id: 'pr-98', text: '合併 projects-map#98', group: 'a', since: '2026-11-20T09:00:00+08:00', url: 'https://github.com/nonbiri1004/projects-map/pull/98', due: '2026-11-30' },
      { text: '只有字' },
      { id: 'bad', text: '壞欄位', since: 'yesterday', url: 'javascript:alert(1)', due: 'soon', actions: [{ label: 'x', open: '/a.mp4' }] },
      { id: 'empty', text: '  ' },
      'not an item',
    ],
  }))
  expect(b.title).toBe('任務板')
  expect(b.staleMs).toBe(STALE_MS)
  expect(b.groups).toEqual([{ id: 'a', label: '等合併' }])
  expect(b.items).toEqual([
    { id: 'pr-98', text: '合併 projects-map#98', group: 'a', since: '2026-11-20T09:00:00+08:00', url: 'https://github.com/nonbiri1004/projects-map/pull/98', due: '2026-11-30' },
    { id: '只有字', text: '只有字' },
    // a field of the wrong kind is left out; the item still shows; actions are never read
    { id: 'bad', text: '壞欄位' },
  ])
})

test('a file that is not pipeline-status v1 is not a card', () => {
  expect(() => parseBoard('x.json', '{"format": "pipel')).toThrow()
  expect(() => parseBoard('x.json', JSON.stringify({ format: 'session-status', version: 1 }))).toThrow()
  expect(() => parseBoard('x.json', file({ version: 2 }))).toThrow()
  expect(() => parseBoard('x.json', file({ updated: 'now' }))).toThrow()
  // no title: the pipeline's id
  expect(parseBoard('d.json', file({ title: undefined })).title).toBe('dispatch')
})

test('links: https only; a GitHub pull request or issue reads #N, anything else its host', () => {
  expect(isLink('https://github.com/a/b/pull/98')).toBe(true)
  for (const bad of ['http://x.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://a b', `https://x.com/${'a'.repeat(2048)}`]) {
    expect(isLink(bad)).toBe(false)
  }
  expect(linkLabel('https://github.com/a/b/pull/98')).toBe('#98')
  expect(linkLabel('https://github.com/a/b/issues/7#c')).toBe('#7')
  expect(linkLabel('https://claude.ai/artifact/abc')).toBe('claude.ai')
})

test('a group of two or more folds into one entry where its first item stands', () => {
  const b = parseBoard('d.json', file({
    waiting_groups: [{ id: 'a', label: '等合併' }, { id: 'b', label: '自己動手' }],
    waiting: [
      { id: '1', text: 'one', group: 'a', since: '2026-11-21T00:00:00+08:00' },
      { id: '2', text: 'two' },
      { id: '3', text: 'three', group: 'a', since: '2026-11-19T00:00:00+08:00' },
      { id: '4', text: 'four', group: 'b' },
      { id: '5', text: 'five', group: 'nope' },
    ],
  }))
  const entries = entriesOf(b)
  expect(entries.map(en => ('group' in en ? `${en.group.id}×${en.items.length}` : en.item.id))).toEqual(['a×2', '2', '4', '5'])
  const first = entries[0]!
  expect('group' in first && oldestSince(first.items)).toBe('2026-11-19T00:00:00+08:00')
})

test('stale after a day, or after the writer\'s own stale_after_sec', () => {
  const b = parseBoard('d.json', file({ updated: '2026-11-22T08:00:00+08:00', waiting: [{ text: 'x' }] }))
  expect(staleLine(b, NOW)).toBe('任務板 26 小時沒更新')
  expect(staleLine({ ...b, updated: '2026-11-23T09:00:00+08:00' }, NOW)).toBeNull()
  expect(staleLine({ ...b, updated: '2026-11-18T09:00:00+08:00' }, NOW)).toBe('任務板 5 天沒更新')
  const quick = parseBoard('d.json', file({ stale_after_sec: 600, updated: '2026-11-23T09:48:00+08:00' }))
  expect(staleLine(quick, NOW)).toBe('任務板 12 分鐘沒更新')
})

test('due: a bare date lasts to its end; the words name the day', () => {
  const day = (s: string) => new Date(`${s}T00:00:00`).getTime()
  expect(dueOf('2026-11-30', day('2026-11-23'))).toEqual({ text: '到 11/30', isPast: false })
  expect(dueOf('2026-11-23', day('2026-11-23') + 3_600_000)).toEqual({ text: '到 11/23', isPast: false })
  expect(dueOf('2026-11-22', day('2026-11-23') + 1).isPast).toBe(true)
})

test('the tag is the folder\'s own name', () => {
  expect(folderTag('/x/產線狀態/主控/')).toBe('主控')
  expect(folderTag('/x/status')).toBe('status')
})
