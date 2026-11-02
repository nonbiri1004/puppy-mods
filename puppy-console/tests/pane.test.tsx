import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const T = Date.parse('2026-10-28T12:00:00+08:00')
const DAY = 24 * 3_600_000
const at = (ms: number) => new Date(T - ms).toISOString()
const status = (over: object) => JSON.stringify({
  format: 'pipeline-status', version: 1, pipeline: 'music', updated: at(60_000), state: 'running', headline: '05 · 42/70 usable', ...over,
})
const RUN = { command: 'console', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'puppy-console',
  component: 'Pane',
  requestId: 'puppy-console',
  props: { title: 'console', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
// The text an element description shows, its nested Texts included.
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(textOf).join('')
const rows = (bodyRows: number, bodyColumns = 80) => ({ ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } })

// The engine around the pane: a status folder /s holding `files` (changeable), the pane's
// open/closed record, toasts, and a store in a Map the test can look into.
function world(on: On, files: Record<string, string>, kept: Record<string, unknown> = {}) {
  const w = {
    files,
    reads: 0,
    panesAsked: 0,
    toasts: [] as string[],
    isOpen: false,
    isPanesBroken: false,
    opened: [] as Record<string, unknown>[],
    // the conversations folder ~/.claude/console/sessions, by file name
    sessions: {} as Record<string, string>,
    // each conversation file's time (default: now), and how many times each was read
    sessionTimes: {} as Record<string, number>,
    sessionReads: {} as Record<string, number>,
    store: new Map(Object.entries(kept)),
  }
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.list', (_, e) => {
    if (e.path === '/home/me/.claude/console/sessions')
      return { value: Object.keys(w.sessions).map(name => ({ name, kind: 'file', size: 1, mtimeMs: w.sessionTimes[name] ?? T, isLink: false })) }
    if (e.path !== '/s') return { value: [] }
    w.reads++
    return { value: Object.keys(w.files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const session = e.path.startsWith('/home/me/.claude/console/sessions/') ? e.path.split('/').pop()! : null
    if (session) w.sessionReads[session] = (w.sessionReads[session] ?? 0) + 1
    const text = session
      ? w.sessions[session]
      : w.files[e.path.replace('/s/', '')]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
  on('ui.toast', (_, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.open', (_, e) => { w.isOpen = true; w.opened.push(e as unknown as Record<string, unknown>); return { value: { isPlaced: true } } })
  on('ui.panes', () => {
    w.panesAsked++
    if (w.isPanesBroken) throw new Error('no answer')
    return { value: w.isOpen ? [{ id: 'puppy-console', title: 'console', isShown: true, isFocused: false, isPlaced: true }] : [] }
  })
  on('store.get', (_, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_, e) => { w.store.set(e.key, e.value); return { value: undefined } })
  on('store.delete', (_, e) => { w.store.delete(e.key); return { value: undefined } })
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('command.register', () => ({ value: { command: 'console' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { w, clock }
}

test('the folder is read only while the pane is open', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({}) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(120_000)
  expect(w.reads).toBe(0)                       // a conversation without the pane reads nothing

  await $.command.run(RUN)
  expect(w.reads).toBe(1)                       // opening reads at once
  await clock.advance(60_000)
  expect(w.reads).toBe(2)                       // then every minute

  // a second /console starts the timer over: still one tick a minute, not two
  await $.command.run(RUN)
  const [reads, asked] = [w.reads, w.panesAsked]
  await clock.advance(60_000)
  expect(w.reads - reads).toBe(1)
  expect(w.panesAsked - asked).toBe(1)

  // closed: the next tick sees it gone and stops; nothing is read again
  w.isOpen = false
  const closedAt = w.reads
  await clock.advance(60_000)
  const askedAfter = w.panesAsked
  await clock.advance(180_000)
  expect(w.reads).toBe(closedAt)
  expect(w.panesAsked).toBe(askedAfter)        // the timer is gone, not just idle
})

test('a reload with the pane still up reads again and keeps reading', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({}) })
  w.isOpen = true
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(w.reads).toBe(1)
  await clock.advance(60_000)
  expect(w.reads).toBe(2)
})

for (const notify of ['on', 'off'] as const)
test(`a toast only while the pane is open (notices ${notify})`, { options: { status_dir: '/s', notify } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({ state: 'running' }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  expect(w.toasts).toEqual([])

  w.files['music.json'] = status({ state: 'waiting', waiting: [{ id: 'l7', text: 'hear song 7' }] })
  await clock.advance(60_000)
  expect(w.toasts).toEqual(notify === 'on' ? ['音樂 · 等你：hear song 7'] : [])
  await clock.advance(60_000)
  expect(w.toasts).toHaveLength(notify === 'on' ? 1 : 0)   // once, not every minute

  // closed: nothing read, nothing told
  w.isOpen = false
  w.files['music.json'] = status({ state: 'error', headline: 'comfy is down' })
  await clock.advance(180_000)
  expect(w.toasts).toHaveLength(notify === 'on' ? 1 : 0)
})

test('opening the pane shows what changed, without a toast', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({ state: 'running' }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  w.isOpen = false
  await clock.advance(60_000)
  w.files['music.json'] = status({ state: 'waiting', waiting: [{ id: 'l7', text: 'hear song 7' }] })
  await $.command.run(RUN)
  expect(w.toasts).toEqual([])
})

// Every Text in the pane, its nested Texts included, in drawing order.
const textsOf = async (ui: { findAll: (q: object) => Promise<unknown[]> }) => (await ui.findAll({ type: 'Text' })).map(textOf)
const isPuppy = (s: { props: Record<string, unknown> }) => /^白白/.test(String(s.props.alt))

test('the terminal puppy shows only when the pane has 26 rows or more', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'music.json': status({}) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const [bodyRows, isShown] of [[20, false], [25, false], [26, true], [40, true]] as const) {
    await ui.redraw(rows(bodyRows))
    expect(Boolean(await ui.find({ key: 'puppy' }))).toBe(isShown)
    // never a smaller puppy: all 13 rows, or none
    expect((await ui.find({ key: 'puppy' }))?.children ?? []).toHaveLength(isShown ? 13 : 0)
  }
  // every row has text, the blank ones a space: an empty Text takes no row on the terminal,
  // so the puppy would be 9 to 12 rows tall and the lines below would jump with the mood
  await ui.redraw(rows(40))
  const rowTexts = ((await ui.find({ key: 'puppy' }))?.children ?? []).map(textOf)
  expect(rowTexts).toHaveLength(13)
  expect(rowTexts.filter(t => t.length === 0)).toHaveLength(0)
  // too narrow for its 34 columns: left out, never wrapped
  for (const [bodyColumns, isShown] of [[24, false], [33, false], [34, true]] as const) {
    await ui.redraw(rows(40, bodyColumns))
    expect(Boolean(await ui.find({ key: 'puppy' }))).toBe(isShown)
  }
  await ui.unmount()

  // the desktop draws its puppy as a picture, whatever the rows
  const desk = await $.ui.mount({ ...PANE, props: rows(40), surface: 'desktop' })
  expect(await desk.find({ key: 'puppy' })).toBeFalsy()
  await desk.redraw(rows(10))
  expect((await desk.findAll({ type: 'Svg' })).some(isPuppy)).toBe(true)
  await desk.unmount()
})

const COUNTS = { collected: 412, new: 58, scored: 58, sent: 9, unsent: 2, pending: 27 }

for (const surface of ['terminal', 'desktop'] as const)
test(`a collector that waits with nothing to name: a card with its headline, no picture (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'collector-tech-news.json': status({ pipeline: 'collector-tech-news', state: 'waiting', headline: '收集 412 · 新 58 · 送進 Notion 9', detail: { counts: COUNTS, errors: [] } }),
    'collector-old.json': status({ pipeline: 'collector-old', state: 'waiting', headline: 'an older file', detail: { errors: ['x'] } }),
  })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  expect(await textsOf(ui)).toContain('2 件等你')
  expect(textOf(await ui.find({ key: 'card-collector-tech-news' }))).toMatch(/收集 412 · 新 58/)
  expect(textOf(await ui.find({ key: 'card-collector-old' }))).toMatch(/an older file/)
  // no picture: with something waiting, no puppy
  expect(await ui.findAll({ type: 'Svg' })).toEqual([])
  await ui.unmount()
})

const VIDEO = status({
  pipeline: 'ai-video', state: 'waiting', headline: '2 open', host: 'studio-mac',
  last_output: { label: '電車 final.mp4', at: at(2 * DAY) },
  detail: { spend_usd: 0.49, cap_usd: 42.5, jobs: [
    { job: 'baibai/ep04', stage: 'final', spend_usd: 0.2, cap_usd: 10 },
    { job: 'baibai/ep05', stage: 'clips', spend_usd: 0.29, cap_usd: 10 },
  ] },
})

const conversation = (over: object) => JSON.stringify({
  format: 'session-status', version: 1, id: 'a', updated: at(60_000), state: 'waiting',
  title: 'console sessions', recap: 'Card added.', ask: 'Open a PR?', ...over,
})

test('the terminal pane asks for room for the puppy and the list', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { 'music.json': status({}) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  expect(w.opened[0]).toMatchObject({ id: 'puppy-console', rows: 40 })
})

test('a failed question about the panes does not stop the reading', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({}) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  w.isPanesBroken = true
  const before = w.reads
  await clock.advance(120_000)
  expect(w.reads - before).toBe(2)
})

test('a file caught mid-write keeps its last card, and its notice is not told twice', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, { 'music.json': status({ state: 'running' }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  w.files['music.json'] = status({ state: 'waiting', updated: at(0), waiting: [{ id: 'l7', text: 'hear song 7' }] })
  await clock.advance(60_000)
  expect(w.toasts).toHaveLength(1)
  w.files['music.json'] = '{"format": "pipeline-st'
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(textOf(await ui.find({ key: 'card-music' }))).toMatch(/hear song 7/)
  expect(await ui.find({ type: 'Text', text: /^略過 music\.json：/ })).toBeTruthy()
  await ui.unmount()
  w.files['music.json'] = status({ state: 'waiting', updated: at(0), waiting: [{ id: 'l7', text: 'hear song 7' }] })
  await clock.advance(60_000)
  expect(w.toasts).toHaveLength(1)
})

test('a quiet card: says it without guessing why; a new waiting item still toasts; an error stays an error', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, {
    'music.json': status({ state: 'waiting', stale_after_sec: 60, updated: at(DAY), host: 'manaka-air', waiting: [{ id: 'a', text: 'hear song 1' }] }),
    'ai-video.json': status({ pipeline: 'ai-video', state: 'error', stale_after_sec: 60, updated: at(DAY), headline: 'tts failed' }),
    'collector-x.json': status({ pipeline: 'collector-x', state: 'running', stale_after_sec: 60, updated: at(DAY), headline: 'collecting' }),
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // quiet but waiting: still a card; an error keeps its error card
  expect(textOf(await ui.find({ key: 'card-music' }))).toMatch(/hear song 1/)
  expect((await ui.find({ key: 'card-ai-video' }))?.props.borderColor).toBe('error')
  // quiet with nothing waiting: its line says 沒消息, and no guess why
  expect(textOf(await ui.find({ key: 'pipelines' }))).toMatch(/收集 x：沒消息/)
  expect((await textsOf(ui)).some(t => /asleep|睡/.test(t))).toBe(false)
  await ui.unmount()
  w.files['music.json'] = status({ state: 'waiting', stale_after_sec: 60, updated: at(DAY), host: 'manaka-air', waiting: [{ id: 'a', text: 'hear song 1' }, { id: 'b', text: 'hear song 2' }] })
  await clock.advance(60_000)
  expect(w.toasts).toEqual(['音樂 · 新的：hear song 2'])
})

test('a waiting item says how long it has waited', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'music.json': status({ state: 'waiting', waiting: [{ id: 'a', text: 'hear song 1', since: at(2 * DAY) }] }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const row = await ui.find({ key: 'item:music:a' })
  expect((await ui.findAll({ type: 'Text' })).filter(t => textOf(t) === '2 天')).toHaveLength(1)
  expect(textOf(row)).toBe('hear song 12 天')
  await ui.unmount()
})

test('the desktop puppy is drawn interactive, so it moves', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const puppy = (await ui.findAll({ type: 'Svg' })).find(isPuppy)
  expect(puppy?.props.isInteractive).toBe(true)
  expect(puppy?.props.alt).toBe('白白在睡覺')
  await ui.unmount()
})

test('a conversation file is read again only when it changed; one past two weeks is not read', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, {})
  w.sessions['a.json'] = conversation({ id: 'a' })
  w.sessions['old.json'] = conversation({ id: 'old', updated: at(20 * DAY) })
  w.sessionTimes['old.json'] = T - 20 * DAY
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  await clock.advance(60_000)
  expect(w.sessionReads['a.json']).toBe(1)
  expect(w.sessionReads['old.json']).toBeUndefined()
  w.sessions['a.json'] = conversation({ id: 'a', ask: 'Merge?' })
  w.sessionTimes['a.json'] = T + 1
  await clock.advance(60_000)
  expect(w.sessionReads['a.json']).toBe(2)
})

test('a conversation file that does not parse is named, and its last read still shows', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, {})
  w.sessions['a.json'] = conversation({ id: 'a', isAppTitle: true, title: 'console sessions' })
  w.sessions['b.json'] = '{"format": "session-st'
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  w.sessions['a.json'] = '{"format": "session-st'
  w.sessionTimes['a.json'] = T + 1
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = await textsOf(ui)
  expect(texts.some(t => /^略過 sessions\/b\.json：/.test(t))).toBe(true)
  expect(texts.some(t => /^略過 sessions\/a\.json：.*showing the last read/.test(t))).toBe(true)
  await ui.unmount()
})

const ACTIONS = [
  { label: 'play', open: '/v/ep04/final.mp4' },
  { label: 'send back', fill: 'ep04 final goes back because: ' },
]

for (const surface of ['terminal', 'desktop'] as const)
test(`three things wait: the count, then the pipelines' items with their buttons, no conversations (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', headline: '1 job at final', waiting: [{ id: 'f', text: 'check ep04', actions: ACTIONS }] }),
    'music.json': status({ state: 'waiting', headline: '05 · pick the next batch' }),
  })
  w.sessions['a.json'] = conversation({ id: 'a', isAppTitle: true })
  w.sessions['r.json'] = conversation({ id: 'r', isAppTitle: true, title: 'busy one', state: 'running', ask: null })
  w.sessions['d.json'] = conversation({ id: 'd', isAppTitle: true, title: 'fix the bowl', state: 'done', ask: null })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  const texts = await textsOf(ui)
  expect(texts).toContain('2 件等你')
  const list = texts.join('\n')
  expect(list).not.toContain('Open a PR?')
  expect(textOf(await ui.find({ key: 'card-ai-video' }))).toMatch(/check ep04/)
  expect(textOf(await ui.find({ key: 'card-music' }))).toMatch(/05 · pick the next batch/)
  const order = ['check ep04', '05 · pick the next batch'].map(t => list.indexOf(t))
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect((await ui.find({ key: 'act:ai-video:f:0' }))?.text).toBe('play')
  expect((await ui.find({ key: 'act:ai-video:f:1' }))?.text).toBe('send back…')
  // no conversation is listed anywhere: the app's sidebar has them; the recap stays in its conversation
  expect(texts.some(t => /busy one|fix the bowl|Card added/.test(t))).toBe(false)
  expect(await ui.find({ key: 'conversations' })).toBeFalsy()
  expect(await ui.find({ key: 'empty' })).toBeFalsy()
  await ui.unmount()
})

test('two pipelines wait: the count, each flow\'s title, trails and card with its buttons', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'ai-video.json': status({
      pipeline: 'ai-video', state: 'waiting', headline: '1 job at final',
      detail: { jobs: [{ job: 'baibai/ep04', stage: 'final', spend_usd: 0, cap_usd: 1 }] },
      waiting: [{ id: 'f', text: 'check ep04', since: at(DAY), actions: ACTIONS }],
    }),
    'music.json': status({
      state: 'waiting', headline: '05 · 3 to hear',
      detail: { generating: false, batches: [{ name: '05', generated: 88, ok: 42, target_usable: 70, needs_listen: 2, strip: '' }] },
      waiting: [{ id: 'l1', text: 'hear song 1' }, { id: 'l2', text: 'hear song 2' }],
    }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui)
  expect(texts).toContain('3 件等你')
  expect(texts).toContain('影片 · ep04')
  expect(texts).toContain('音樂 · 05')
  expect(texts).toContain('✓ 企劃 ─ ✓ 片段 ─ ✓ 配音 ─ ✓ 合成')
  expect(texts).toContain('✓ 歌單 ─ ✓ 生成 88 ─ ✓ 檢查')
  expect(texts).toContain('○ 可用 42 / 70')
  const video = await ui.find({ key: 'card-ai-video' })
  expect(video?.props.borderColor).toBe('warning')
  expect(textOf(video)).toMatch(/^成品等你 · 24 小時check ep04/)
  expect(textOf(await ui.find({ key: 'card-music' }))).toMatch(/^你來聽等你/)
  expect((await ui.find({ key: 'act:ai-video:f:0' }))?.text).toBe('play')
  expect((await ui.find({ key: 'act:ai-video:f:1' }))?.text).toBe('send back…')
  expect(await ui.find({ key: 'pipelines' })).toBeFalsy()
  // a thin line joins the steps to the card, and the card to the steps after it
  expect(texts.filter(t => t === '│')).toHaveLength(3)
  // the marks carry the step's color: done green, running blue, not reached grey
  const marks = (await ui.findAll({ type: 'Text' })).filter(t => ['✓', '◐', '○'].includes(textOf(t)))
  expect(marks.filter(t => textOf(t) === '✓').every(t => t.props.color === 'success')).toBe(true)
  expect(marks.find(t => textOf(t) === '○')?.props.color).toBeUndefined()
  await ui.unmount()
})

test('a pipeline with no steps known to the mod: its name heads the card, said once', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'collector-tech.json': status({ pipeline: 'collector-tech', title: '科技頻道選題', state: 'waiting', headline: '11 to review', waiting: [{ id: 'n', text: '在 Notion 審核 11 則', since: at(2 * DAY) }] }),
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const card = textOf(await ui.find({ key: 'card-collector-tech' }))
  expect(card).toMatch(/^科技頻道選題等你 · 2 天在 Notion 審核 11 則/)
  expect((await textsOf(ui)).filter(t => t === '科技頻道選題')).toHaveLength(1)
  expect((await textsOf(ui)).includes('│')).toBe(false)
  await ui.unmount()
})

test('nothing waits: each pipeline is one grey line, idle ones with their last output', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'ai-video.json': status({ pipeline: 'ai-video', state: 'idle', headline: 'nothing open', last_output: { label: '電車 final.mp4', at: at(2 * DAY) } }),
    'music.json': status({ state: 'running' }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(textOf(await ui.find({ key: 'empty' }))).toMatch(/都處理完了$/)
  const lines = textOf(await ui.find({ key: 'pipelines' }))
  expect(lines).toContain('✓ 影片：閒置 · 上次 電車 final.mp4，2 天前')
  expect(lines).toContain('◐ 音樂：跑中 · 05 · 42/70 usable')
  expect(lines).not.toContain('nothing open')
  expect(await ui.find({ key: 'card-ai-video' })).toBeFalsy()
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const)
test(`nothing waits: the puppy and "都處理完了", no count (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { 'music.json': status({}) })
  w.sessions['d.json'] = conversation({ id: 'd', state: 'done', ask: null })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  const texts = await textsOf(ui)
  expect(textOf(await ui.find({ key: 'empty' }))).toMatch(/都處理完了$/)
  expect(texts).toContain('剛剛看過')
  expect(texts.some(t => /件等你/.test(t))).toBe(false)
  expect(await ui.find({ key: 'card-music' })).toBeFalsy()
  // the pipelines that wait for nothing: one grey line each
  expect(textOf(await ui.find({ key: 'pipelines' }))).toBe('◐ 音樂：跑中 · 05 · 42/70 usable')
  if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(isPuppy)).toBe(true)
  else expect(await ui.find({ key: 'puppy' })).toBeTruthy()
  await ui.unmount()
})

test('a pipeline in error: its card has an error border, 出錯 in the error color, and the headline', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'error', updated: at(3 * 3_600_000), headline: 'tts failed' }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(ui)).toContain('1 件等你')
  const card = await ui.find({ key: 'card-ai-video' })
  expect(card?.props.borderColor).toBe('error')
  expect(textOf(card)).toBe('影片出錯 · 3 小時tts failed')
  expect((await ui.findAll({ type: 'Text' })).some(t => t.props.color === 'error' && textOf(t) === '出錯')).toBe(true)
  await ui.unmount()
})

test('a card\'s wait is its oldest item by time, whatever offset each time is written in', { options: { status_dir: '/s' } }, async ($, on) => {
  // T is 04:00 UTC: 02:00Z waited 2h, 09:00+08:00 (01:00Z) waited 3h, though it sorts later as text
  world(on, {
    'ai-video.json': status({
      pipeline: 'ai-video', state: 'waiting', headline: '2 open',
      waiting: [
        { id: 'f1', text: 'a', since: '2026-10-28T02:00:00Z' },
        { id: 'f2', text: 'b', since: '2026-10-28T09:00:00+08:00' },
      ],
    }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(textOf(await ui.find({ key: 'card-ai-video' }))).toMatch(/^影片等你 · 3 小時a/)
  await ui.unmount()
})

test('more than 5 items in a card end in "▸ 還有 N 件", which opens the rest', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'music.json': status({ state: 'waiting', waiting: Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, text: `hear song ${i}` })) }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const cardOf = async () => textOf(await ui.find({ key: 'card-music' }))
  expect(await textsOf(ui)).toContain('11 件等你')
  expect((await ui.find({ key: 'more-music' }))?.text).toBe('▸ 還有 6 件')
  expect(await cardOf()).toMatch(/hear song 4/)
  expect(await cardOf()).not.toMatch(/hear song 5/)
  await ui.press({ key: 'more-music' })
  for (let i = 5; i < 11; i++) expect(await cardOf()).toMatch(`hear song ${i}`)
  expect((await ui.find({ key: 'more-music' }))?.text).toBe('▾ 收起')
  expect(w.store.get('more:music')).toBe(true)
  await ui.unmount()
})

// The engine a button reaches: what a path leads to, the system's `open`, and the prompt box.
function buttons(on: On, leadsTo: Record<string, { kind: 'file' | 'dir' | 'other'; realPath: string }>, draft = '') {
  const b = { runs: [] as string[][], fills: [] as { text: string; mode?: string }[], exitCode: 0, refusal: undefined as undefined | 'dialog' }
  on('fs.stat', (_, e) => {
    const to = leadsTo[e.path]
    if (!to) return { deny: 'ENOENT: no such file' }
    return { value: { kind: to.kind, size: 1, mtimeMs: 0, isLink: to.realPath !== e.path, realPath: to.realPath } }
  })
  on('process.run', (_, e) => { b.runs.push([...e.argv]); return { value: { exitCode: b.exitCode, stdout: '', stderr: b.exitCode ? 'The file does not exist.' : '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    if (b.refusal) return { isFilled: false, refusal: b.refusal }
    b.fills.push({ text: e.text, mode: e.mode })
    return { isFilled: true }
  })
  return b
}

const noteOf = async (ui: { findAll: (q: object) => Promise<unknown[]> }) => (await textsOf(ui)).join('\n')

test('a button opens a file with the system\'s own app, and says so', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', waiting: [{ id: 'f', text: 'check ep04', actions: ACTIONS }] }) })
  const b = buttons(on, { '/v/ep04/final.mp4': { kind: 'file', realPath: '/v/ep04/final.mp4' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'act:ai-video:f:0' })
  expect(b.runs).toEqual([['open', '/v/ep04/final.mp4']])
  expect(await noteOf(ui)).toMatch(/已打開 final\.mp4/)
  b.exitCode = 1
  await ui.press({ key: 'act:ai-video:f:0' })
  expect(await noteOf(ui)).toMatch(/打不開 \/v\/ep04\/final\.mp4：The file does not exist\./)
  await ui.unmount()
})

test('a path that leads to an app, or nowhere, is not opened', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', waiting: [
    { id: 'f', text: 'check ep04', actions: [{ label: 'play', open: '/v/final.mp4' }] },
    { id: 'g', text: 'check ep05', actions: [{ label: 'play', open: '/v/gone.mp4' }] },
  ] }) })
  const b = buttons(on, { '/v/final.mp4': { kind: 'dir', realPath: '/Applications/Calculator.app' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'act:ai-video:f:0' })
  expect(await noteOf(ui)).toMatch(/不開 \/v\/final\.mp4/)
  await ui.press({ key: 'act:ai-video:g:0' })
  expect(await noteOf(ui)).toMatch(/打不開 \/v\/gone\.mp4：.*ENOENT/)
  expect(b.runs).toEqual([])
  await ui.unmount()
})

for (const draft of ['', 'and also'])
test(`a fill button starts a message in the prompt box (draft "${draft}")`, { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', waiting: [{ id: 'f', text: 'check ep04', actions: ACTIONS }] }) })
  const b = buttons(on, {}, draft)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'act:ai-video:f:1' })
  // an empty box takes the words; words already typed are kept, the new ones go on a line after them
  expect(b.fills).toEqual(draft ? [{ text: '\nep04 final goes back because: ', mode: 'append' }] : [{ text: 'ep04 final goes back because: ', mode: 'replace' }])
  expect(await noteOf(ui)).toMatch(/已放進輸入框：寫完再送出/)
  // a box that does not take it (a hook kept it out; the engine's own refusals say why) is said
  b.refusal = 'dialog'
  await ui.press({ key: 'act:ai-video:f:1' })
  expect(await noteOf(ui)).toMatch(/輸入框沒有收下/)
  await ui.unmount()
})
