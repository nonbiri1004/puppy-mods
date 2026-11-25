import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const T = Date.parse('2026-11-23T10:00:00+08:00')
const DIR = '/home/me/產線狀態/主控'
const RUN = { command: 'todo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'puppy-todo',
  component: 'Pane',
  requestId: 'puppy-todo',
  props: { title: 'todo', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const board = (over: object) => JSON.stringify({
  format: 'pipeline-status', version: 1, pipeline: 'dispatch', title: '任務板',
  updated: new Date(T - 12 * 60_000).toISOString(), state: 'waiting', headline: 'x',
  waiting_groups: [{ id: 'a', label: '等合併' }],
  waiting: [
    { id: 'pr-98', text: '合併 projects-map#98', group: 'a', since: new Date(T - 3 * 86_400_000).toISOString(), url: 'https://github.com/nonbiri1004/projects-map/pull/98' },
    { id: 'pr-70', text: '合併 projects-map#70', group: 'a', since: new Date(T - 86_400_000).toISOString() },
    { id: 'drive', text: '刪 Drive 舊檔', due: '2026-11-30' },
  ],
  ...over,
})

// the engine around the pane: a status folder holding `files` (changeable), your own items folder
// (empty), the pane's open/closed record, and every write, so a test can see none lands in the folder
function world(on: On, files: Record<string, string>) {
  const w = { files, reads: 0, isOpen: false, isFolderBroken: false, writes: [] as string[] }
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.exists', () => ({ value: false }))
  on('fs.list', (_, e) => {
    if (e.path !== DIR) return { value: [] }
    w.reads++
    if (w.isFolderBroken) return { deny: 'EACCES: permission denied' }
    return { value: Object.keys(w.files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const text = w.files[e.path.replace(`${DIR}/`, '')]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
  on('fs.write', (_, e) => { w.writes.push(e.path); return { value: undefined } })
  on('ui.open', () => { w.isOpen = true; return { value: { isPlaced: true } } })
  on('ui.panes', () => ({ value: w.isOpen ? [{ id: 'puppy-todo', title: 'todo', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('command.register', () => ({ value: { command: 'todo' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/' }))
  return { w, clock }
}

const words = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').join(' | ')

test('no status_dir: only your own list, and nothing is read or timed', async ($, on) => {
  const { w, clock } = world(on, { 'dispatch.json': board({}) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  await clock.advance(180_000)
  expect(w.reads).toBe(0)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await words(ui)).not.toContain('任務板')
  await ui.unmount()
})

test('the folder is read only while the pane is open: on /todo, then every minute', { options: { status_dir: '~/產線狀態/主控' } }, async ($, on) => {
  const { w, clock } = world(on, { 'dispatch.json': board({}) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(120_000)
  expect(w.reads).toBe(0)

  await $.command.run(RUN)
  await clock.settle()
  expect(w.reads).toBe(1)
  await clock.advance(60_000)
  expect(w.reads).toBe(2)

  // a second /todo starts the timer over: one tick a minute, not two
  await $.command.run(RUN)
  await clock.settle()
  const reads = w.reads
  await clock.advance(60_000)
  expect(w.reads - reads).toBe(1)

  // closed: the next tick sees it gone and stops
  w.isOpen = false
  await clock.advance(60_000)
  const closedAt = w.reads
  await clock.advance(180_000)
  expect(w.reads).toBe(closedAt)
  // read-only: nothing was ever written into the status folder
  expect(w.writes.filter(p => p.startsWith(DIR))).toEqual([])
})

test('a card per file: title · count · age, the folder\'s name as its tag, groups folded, links and due days', { options: { status_dir: DIR } }, async ($, on) => {
  const { w, clock } = world(on, { 'dispatch.json': board({}), 'quiet.json': board({ pipeline: 'quiet', title: '沒事', waiting: [] }), 'notes.txt': 'x' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const said = await words(ui)
  expect(said).toContain('任務板 · 主控')
  expect(said).toContain('3 · 12 分鐘前')
  expect(await ui.find({ type: 'Box', key: 'card-board-dispatch.json' })).toBeTruthy()
  // a file with nothing waiting is no card
  expect(said).not.toContain('沒事')
  // no tick or ✕ on a read-only row
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key))
  expect(keys.filter(k => /^(tick|del)-(pr|drive)/.test(k))).toEqual([])
  // the group is one folded row with its oldest wait
  const group = await ui.find({ type: 'Button', key: 'group-dispatch.json:a' })
  expect(group?.text).toBe('▸ 等合併 ×2 · 3 天')
  expect(said).not.toContain('合併 projects-map#98')
  // an item on its own shows with its due day
  expect(said).toContain('刪 Drive 舊檔')
  expect(said).toContain('到 11/30')

  // opening the group shows each item, the link as ↗ #98
  await ui.press({ key: 'group-dispatch.json:a' })
  const link = await ui.find({ type: 'Link', text: '#98' })
  expect(link?.props.href).toBe('https://github.com/nonbiri1004/projects-map/pull/98')
  expect(link?.props.label).toBe('↗ #98')
  expect(await words(ui)).toContain('合併 projects-map#70')
  await ui.unmount()

  // the writer stops listing an item: it is gone on the next read
  w.files['dispatch.json'] = board({ waiting: [{ id: 'drive', text: '刪 Drive 舊檔' }] })
  await clock.advance(60_000)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await words(after)).toContain('1 · 13 分鐘前')
  await after.unmount()
})

test('a file caught mid-write keeps its last card; an old one says so; a folder that can\'t be read says so', { options: { status_dir: DIR } }, async ($, on) => {
  const { w, clock } = world(on, { 'dispatch.json': board({ updated: new Date(T - 26 * 3_600_000).toISOString() }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  await clock.settle()
  w.files['dispatch.json'] = '{"format": "pipeline-sta'
  await clock.advance(60_000)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await words(ui)).toContain('3 · 1 天前')
  expect(await words(ui)).toContain('任務板 26 小時沒更新')
  // the terminal prints a Link's whole address: the short name only
  expect(await ui.find({ type: 'Link' })).toBeFalsy()
  await ui.unmount()

  w.isFolderBroken = true
  await clock.advance(60_000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await words(ui)).toContain(`could not read ${DIR}`)
  // the last cards stay
  expect(await words(ui)).toContain('3 · 1 天前')
  await ui.unmount()
})
