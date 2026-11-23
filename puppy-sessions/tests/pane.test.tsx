import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const T = Date.parse('2026-11-23T12:00:00+08:00')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (ms: number) => new Date(T - ms).toISOString()
const SESSIONS = '/home/me/.claude/puppy-sessions'
const APP = '/home/me/Library/Application Support/Claude/claude-code-sessions'
const CODEX = '/home/me/.codex/sessions'
const RUN = { command: 'sessions', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'puppy-sessions',
  component: 'Pane',
  requestId: 'puppy-sessions',
  props: { title: 'sessions', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const rows = (bodyRows: number, bodyColumns = 80) => ({ ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } })
// The text an element description shows, its nested Texts included.
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(textOf).join('')
const textsOf = async (ui: { findAll: (q: object) => Promise<unknown[]> }) => (await ui.findAll({ type: 'Text' })).map(textOf)
const isPuppy = (s: { props: Record<string, unknown> }) => /^白白/.test(String(s.props.alt))

const conv = (over: Record<string, unknown>) => JSON.stringify({
  format: 'session-status', version: 1, id: 'a', updated: at(60_000), state: 'done',
  title: 'fix the bowl', isAppTitle: true, recap: 'Bowl fixed. Tests pass.', ask: null, ...over,
})
const codexLine = (pct: number, when: number) => JSON.stringify({ timestamp: new Date(when).toISOString(), type: 'event_msg', payload: { type: 'token_count', rate_limits: {
  primary: { used_percent: pct, window_minutes: 300, resets_at: (T + HOUR) / 1000 }, secondary: { used_percent: 98, window_minutes: 10080, resets_at: (T + 3 * DAY) / 1000 },
} } })

// The engine around the pane: the conversations' folder (`files`, by name, changeable), the
// desktop app's session files (`app`, by appSession), Codex's runs, the engine's own rate limits,
// the prompt box, toasts and a store.
function world(on: On) {
  const w = {
    files: {} as Record<string, string>,
    times: {} as Record<string, number>,
    listError: null as string | null,
    lists: 0,
    app: {} as Record<string, string>,
    codex: {} as Record<string, string>,
    rateLimits: [] as { kind: string; percentUsed: number; resetsAt?: string }[],
    toasts: [] as string[],
    box: '',
    fills: [] as { text: string; mode: string }[],
    isOpen: false,
    panesAsked: 0,
    opened: [] as Record<string, unknown>[],
    selfId: 'me',
    store: new Map<string, unknown>([['migrated:console', true]]),
  }
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  const entry = (name: string, kind: 'file' | 'dir', size = 1, mtimeMs = T) => ({ name, kind, size, mtimeMs, isLink: false })
  on('fs.list', (_, e) => {
    if (e.path === SESSIONS) {
      w.lists++
      if (w.listError) return { deny: w.listError }
      return { value: Object.keys(w.files).map(n => entry(n, 'file', 1, w.times[n] ?? T)) }
    }
    if (e.path.startsWith(CODEX)) {
      const dir = `${e.path}/`
      const below = Object.keys(w.codex).filter(p => p.startsWith(dir)).map(p => p.slice(dir.length))
      if (!below.length) return { deny: 'ENOENT: no such file or directory' }
      const names = [...new Set(below.map(p => p.split('/')[0]!))]
      return { value: names.map(n => (below.includes(n) ? entry(n, 'file', w.codex[dir + n]!.length) : entry(n, 'dir'))) }
    }
    return { deny: 'ENOENT: no such file or directory' }
  })
  on('fs.stat', (_, e) => (e.path.startsWith(APP) && w.app[e.path.slice(APP.length + 1, -'.json'.length)] != null
    ? { value: { kind: 'file', size: 1, mtimeMs: T, realPath: e.path } as never }
    : { deny: 'ENOENT: no such file or directory' }))
  on('fs.read', (_, e) => {
    const text = e.path.startsWith(`${SESSIONS}/`) ? w.files[e.path.slice(SESSIONS.length + 1)]
      : e.path.startsWith(`${APP}/`) ? w.app[e.path.slice(APP.length + 1, -'.json'.length)]
      : w.codex[e.path]
    if (text == null) throw new Error('ENOENT: missing')
    const { offset, length } = e as { offset?: number; length?: number }
    return { value: offset != null ? text.slice(offset, offset + (length ?? text.length)) : text }
  })
  on('session.usage', () => ({ value: { startedAt: T, context: {} as never, rateLimits: w.rateLimits } }))
  on('session.id', () => ({ value: w.selfId }))
  on('prompt.read', () => ({ value: { text: w.box } as never }))
  on('prompt.fill', (_, e) => { const { text, mode } = e as { text: string; mode: string }; w.fills.push({ text, mode }); return { isFilled: true } as never })
  on('ui.toast', (_, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.open', (_, e) => { w.isOpen = true; w.opened.push(e as unknown as Record<string, unknown>); return { value: { isPlaced: true } } })
  on('ui.panes', () => {
    w.panesAsked++
    return { value: w.isOpen ? [{ id: 'puppy-sessions', title: 'sessions', isShown: true, isFocused: false, isPlaced: true }] : [] }
  })
  on('store.get', (_, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_, e) => { w.store.set(e.key, e.value); return { value: undefined } })
  on('store.delete', (_, e) => { w.store.delete(e.key); return { value: undefined } })
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { w, clock }
}

const open = async ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop' = 'desktop') => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  return $.ui.mount({ ...PANE, surface })
}

test('/sessions opens the pane, room for the puppy and the list on the terminal', async ($, on) => {
  const { w } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(RUN)).text).toBe('對話總覽已打開。')
  expect(w.opened[0]).toMatchObject({ id: 'puppy-sessions', title: 'sessions', rows: 40 })
})

test('the files are read only while the pane is open, once a minute, one timer', async ($, on) => {
  const { w, clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(120_000)
  expect(w.lists).toBe(0)
  await $.command.run(RUN)
  expect(w.lists).toBe(1)
  await clock.advance(60_000)
  expect(w.lists).toBe(2)
  // a second /sessions starts the timer over: still one read a minute
  await $.command.run(RUN)
  const before = w.lists
  await clock.advance(60_000)
  expect(w.lists - before).toBe(1)
  // closed: the next tick sees it gone and stops
  w.isOpen = false
  await clock.advance(60_000)
  const closedAt = w.lists
  const asked = w.panesAsked
  await clock.advance(180_000)
  expect(w.lists).toBe(closedAt)
  expect(w.panesAsked).toBe(asked)
})

test('a reload with the pane still up reads again and keeps reading', async ($, on) => {
  const { w, clock } = world(on)
  w.isOpen = true
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(w.lists).toBe(1)
  await clock.advance(60_000)
  expect(w.lists).toBe(2)
})

for (const surface of ['terminal', 'desktop'] as const)
test(`the four cards: who waits, one row each, the limits, what may go (${surface})`, async ($, on) => {
  const { w } = world(on)
  const app = (id: string) => `acct/org/local_${id}`
  w.files = {
    'ask.json': conv({ id: 'ask', state: 'waiting', title: '要開 T168 嗎', ask: '要開 T168 嗎？', updated: at(20 * 60_000) }),
    'run.json': conv({ id: 'run', state: 'running', title: 'music batch', recap: '' }),
    'fork.json': conv({ id: 'fork', source: 'fork', title: 'refresh retry', updated: at(2 * HOUR) }),
    // two files of one dispatched task: one row, the newest
    't1.json': conv({ id: 't1', source: 'dispatched', task: 'T172', title: 'puppy-sessions', recap: 'Started.', updated: at(5 * HOUR) }),
    't2.json': conv({ id: 't2', source: 'dispatched', task: 'T172', title: 'puppy-sessions', recap: 'PR opened. Tests pass.', updated: at(30 * 60_000) }),
    'side.json': conv({ id: 'side', title: 'btw: 是什麼', state: 'waiting', ask: 'more?' }),
    'gone.json': conv({ id: 'gone', title: 'archived one', appSession: app('gone'), updated: at(2 * DAY) }),
    'idle.json': conv({ id: 'idle', title: 'old talk', appSession: app('idle'), updated: at(2 * DAY) }),
  }
  w.app = { [app('gone')]: JSON.stringify({ isArchived: true }), [app('idle')]: JSON.stringify({ isArchived: false }) }
  w.rateLimits = [{ kind: 'five_hour', percentUsed: 41.6 }, { kind: 'seven_day', percentUsed: 12 }]
  w.codex = { [`${CODEX}/2026/11/22/run-a.jsonl`]: `${codexLine(22, T - 3 * HOUR)}\n` }
  const ui = await open($, surface)
  const texts = await textsOf(ui)
  expect(texts).toContain('1 個對話等你')

  const waiting = textOf(await ui.find({ key: 'card-waiting' }))
  expect(waiting).toContain('要開 T168 嗎')
  expect(waiting).toContain('20 分鐘')
  expect(waiting).not.toContain('btw')            // a side chat is never listed

  const list = textOf(await ui.find({ key: 'card-conversations' }))
  expect(list).toContain('music batch')
  expect(list).toContain('跑中')
  expect(list).toContain('refresh retry')         // a fork is listed (0.12 hid it)
  expect(list).toContain('閒著 · 2 小時')
  expect(list).toContain('T172 puppy-sessions · PR opened.')
  expect(list).not.toContain('Started.')          // one row for the task, the newest file
  expect(list).not.toContain('Tests pass')        // a recap's first sentence only
  expect(list).not.toContain('archived one')      // archived in the app: done with
  expect(list).toContain('old talk')
  expect(list).not.toContain('要開 T168')         // said once, in the top card
  // the running one's word carries success; others stay grey
  expect((await ui.findAll({ type: 'Text' })).some(t => t.props.color === 'success' && textOf(t) === '跑中')).toBe(true)

  const usage = textOf(await ui.find({ key: 'card-usage' }))
  expect(usage).toContain('5 小時 42%')
  expect(usage).toContain('一週 12%')
  expect(usage).toMatch(/5 小時 22% · \d\d:\d\d 重置/)
  expect(usage).toContain('Codex · 3 小時前')

  const clean = textOf(await ui.find({ key: 'card-clean' }))
  expect(clean).toContain('可以清1 個')
  expect(clean).toContain('old talk')
  expect(clean).toContain('閒了 2 天')
  expect(clean).not.toContain('archived one')
  // something waits: no puppy
  expect((await ui.findAll({ type: 'Svg' })).filter(isPuppy)).toEqual([])
  await ui.unmount()
})

test('"整理…" puts the request in the prompt box, after what is already typed; the mod archives nothing', async ($, on) => {
  const { w } = world(on)
  w.files = { 'idle.json': conv({ id: 'idle', title: 'old talk', appSession: 'acct/org/local_idle', updated: at(2 * DAY) }) }
  w.app = { 'acct/org/local_idle': JSON.stringify({ isArchived: false }) }
  const ui = await open($)
  await ui.press({ key: 'clean' })
  expect(w.fills).toEqual([{ text: '請封存這些對話：old talk（local_idle）；動手前先列給我確認。', mode: 'replace' }])
  expect(await textsOf(ui)).toContain('已放進輸入框：看過再送出')
  w.box = 'draft'
  await ui.press({ key: 'clean' })
  expect(w.fills[1]).toEqual({ text: '\n請封存這些對話：old talk（local_idle）；動手前先列給我確認。', mode: 'append' })
  await ui.unmount()
})

test('an app file that does not say isArchived: no number, one dim line, never a guess', async ($, on) => {
  const { w } = world(on)
  w.files = {
    'a.json': conv({ id: 'a', title: 'one', appSession: 'acct/org/local_a', updated: at(2 * DAY) }),
    'b.json': conv({ id: 'b', title: 'two', appSession: 'acct/org/local_b', updated: at(2 * DAY) }),
  }
  w.app = { 'acct/org/local_a': JSON.stringify({ archived: 'maybe' }) }   // b has no file at all
  const ui = await open($)
  expect(await ui.find({ key: 'card-clean' })).toBeFalsy()
  expect(await textsOf(ui)).toContain('2 個做完的對話讀不到桌面 app 的封存狀態，沒列進可以清')
  await ui.unmount()
})

test('nothing waits: the puppy and one sentence; it types while a conversation runs', async ($, on) => {
  const { w } = world(on)
  w.files = { 'run.json': conv({ id: 'run', state: 'running' }) }
  const ui = await open($)
  expect(await textsOf(ui)).toContain('沒有對話在等你')
  expect((await ui.findAll({ type: 'Svg' })).find(isPuppy)?.props.alt).toBe('白白在打筆電')
  await ui.unmount()
})

test('the terminal puppy shows only when the pane has 26 rows and 34 columns', async ($, on) => {
  world(on)
  const ui = await open($, 'terminal')
  for (const [bodyRows, isShown] of [[25, false], [26, true]] as const) {
    await ui.redraw(rows(bodyRows))
    expect(Boolean(await ui.find({ key: 'puppy' }))).toBe(isShown)
  }
  await ui.redraw(rows(40))
  const rowTexts = ((await ui.find({ key: 'puppy' }))?.children ?? []).map(textOf)
  expect(rowTexts).toHaveLength(13)
  expect(rowTexts.filter(t => t.length === 0)).toHaveLength(0)
  await ui.redraw(rows(40, 33))
  expect(await ui.find({ key: 'puppy' })).toBeFalsy()
  await ui.unmount()
})

test('no readings yet: Claude says so; no ~/.codex: no Codex line at all', async ($, on) => {
  world(on)
  const ui = await open($)
  const usage = textOf(await ui.find({ key: 'card-usage' }))
  expect(usage).toContain('Claude：還沒有讀數')
  expect(usage).not.toContain('Codex')
  await ui.unmount()
})

test('a Codex reading past its reset says 已重置', async ($, on) => {
  const { w } = world(on)
  w.codex = { [`${CODEX}/2026/11/20/old.jsonl`]: JSON.stringify({ timestamp: at(3 * DAY), payload: { rate_limits: { primary: { used_percent: 90, window_minutes: 300, resets_at: (T - 2 * DAY) / 1000 } } } }) }
  const ui = await open($)
  expect(textOf(await ui.find({ key: 'card-usage' }))).toContain('5 小時 已重置')
  await ui.unmount()
})

test('past five rows, a dim button opens the rest, and stays open', async ($, on) => {
  const { w } = world(on)
  for (let i = 0; i < 7; i++) w.files[`c${i}.json`] = conv({ id: `c${i}`, title: `talk ${i}`, updated: at((i + 1) * 60_000) })
  const ui = await open($)
  expect(textOf(await ui.find({ key: 'card-conversations' }))).not.toContain('talk 6')
  expect((await ui.find({ key: 'more-conversations' }))?.props.label).toBe('▸ 還有 2 個')
  await ui.press({ key: 'more-conversations' })
  expect(textOf(await ui.find({ key: 'card-conversations' }))).toContain('talk 6')
  expect(w.store.get('more:conversations')).toBe(true)
  await ui.unmount()
})

for (const notify of ['on', 'off'] as const)
test(`a toast when another conversation starts waiting, once (notices ${notify})`, { options: { notify } }, async ($, on) => {
  const { w, clock } = world(on)
  w.files = { 'b.json': conv({ id: 'b', state: 'running', title: 'other' }), 'me.json': conv({ id: 'me', state: 'running', title: 'this one' }) }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  w.files['b.json'] = conv({ id: 'b', state: 'waiting', title: 'other', ask: 'Merge?' })
  w.files['me.json'] = conv({ id: 'me', state: 'waiting', title: 'this one', ask: 'Go?' })
  w.times = { 'b.json': T + 1, 'me.json': T + 1 }
  await clock.advance(60_000)
  // this conversation's own question is in front of you already
  expect(w.toasts).toEqual(notify === 'on' ? ['other 在等你：Merge?'] : [])
  await clock.advance(60_000)
  expect(w.toasts).toHaveLength(notify === 'on' ? 1 : 0)
})

test('a file that is not a conversation is named; a folder that cannot be read is said', async ($, on) => {
  const { w, clock } = world(on)
  w.files = { 'x.json': conv({ id: 'y' }), 'bad.json': '{' }
  const ui = await open($)
  const texts = await textsOf(ui)
  expect(texts.some(t => /^略過 x\.json：its "id" is y/.test(t))).toBe(true)
  expect(texts.some(t => /^略過 bad\.json/.test(t))).toBe(true)
  w.listError = 'EACCES: permission denied'
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect((await textsOf(ui)).some(t => /^讀不到對話資料夾：.*EACCES: permission denied$/.test(t))).toBe(true)
  await ui.unmount()
})

test('conversations off: nothing is listed, and the pane says why', { options: { conversations: 'off' } }, async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': conv({ id: 'a', state: 'waiting', ask: 'x?' }) }
  const ui = await open($)
  expect(w.lists).toBe(0)
  expect((await textsOf(ui)).some(t => t.startsWith('conversations 關著'))).toBe(true)
  await ui.unmount()
})
