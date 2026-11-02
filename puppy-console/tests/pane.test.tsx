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
const listOf = async (ui: { find: (q: object) => Promise<unknown> }) => textOf(await ui.find({ key: 'list' }))
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
test(`a collector's details: the same lines on both surfaces, no picture (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'collector-tech-news.json': status({ pipeline: 'collector-tech-news', state: 'waiting', headline: '收集 412 · 新 58 · 送進 Notion 9', detail: { counts: COUNTS, errors: [] } }),
    'collector-old.json': status({ pipeline: 'collector-old', state: 'waiting', headline: 'an older file', detail: { errors: ['x'] } }),
  })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  // waiting with no item to name: one row each
  expect(await listOf(ui)).toMatch(/收集 tech-news：收集 412/)
  expect(await listOf(ui)).toMatch(/收集 old：an older file/)
  await ui.press({ key: 'show-pipelines' })
  const texts = await textsOf(ui)
  expect(texts).toContain('這次 收集 412 · 新 58 · 評分 58 · 送出 9')
  expect(texts).toContain('notion 待審 27 · 未送 2')
  // no picture: its numbers are all in the lines (and with something waiting, no puppy)
  expect(await ui.findAll({ type: 'Svg' })).toEqual([])
  // an older file without counts: its headline, no lines
  expect(await ui.find({ type: 'Text', text: 'an older file' })).toBeTruthy()
  expect(texts.filter(t => /^這次 收集/.test(t))).toHaveLength(1)
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

test('a pipeline\'s details are text on both surfaces: its summary, its jobs, and the computer', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { 'ai-video.json': VIDEO })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Text', text: /^企劃 / })).toBeFalsy()
  await desk.press({ key: 'show-pipelines' })
  expect(w.store.get('more:pipelines')).toBe(true)
  await desk.unmount()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = await textsOf(ui)
    expect(texts).toContain('企劃 0 › 片段 1 › 配音 0 › 合成 0 › 成品 1 › 完成 0')
    expect(texts).toContain('花了 $0.49 / $42.50')
    expect(texts).toContain('片段：ep05')
    expect(texts).toContain('成品（你）：ep04')
    expect(texts).toContain('在 studio-mac')
    expect(texts).toContain('上次：電車 final.mp4 · 2 天前')
    // no pictures in the pane any more
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    await ui.unmount()
  }
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await term.press({ key: 'show-pipelines' })
  expect(w.store.has('more:pipelines')).toBe(false)
  expect(await term.find({ type: 'Text', text: /^企劃 / })).toBeFalsy()
  await term.unmount()
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
  expect(await listOf(ui)).toMatch(/hear song 7/)
  expect(textOf(await ui.find({ key: 'show-pipelines' }))).toMatch(/音樂：等你/)
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
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const line = textOf(await ui.find({ key: 'show-pipelines' }))
  expect(line).toMatch(/音樂：沒消息/)
  expect(line).toMatch(/影片：出錯/)
  await ui.press({ key: 'show-pipelines' })
  const texts = await textsOf(ui)
  expect(texts).toContain('24 小時沒有更新（manaka-air）')
  expect(texts.some(t => /asleep|睡/.test(t))).toBe(false)
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
  const row = await ui.find({ key: 'row:i:music:a' })
  expect((await ui.findAll({ type: 'Text' })).filter(t => textOf(t) === '2 天')).toHaveLength(1)
  expect(textOf(row)).toBe('hear song 12 天')
  await ui.unmount()
})

test('a video job at a stage with no column is named, not drawn as plan', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', detail: { jobs: [{ job: 'baibai/電車', stage: 'deliver', spend_usd: 0, cap_usd: 1 }] } }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'show-pipelines' })
  expect(await textsOf(ui)).toContain('其他階段 · deliver: 電車')
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
  const list = await listOf(ui)
  expect(list).not.toContain('Open a PR?')
  const order = ['check ep04', '音樂：05 · pick the next batch'].map(t => list.indexOf(t))
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect((await ui.find({ key: 'act:i:ai-video:f:0' }))?.text).toBe('play')
  expect((await ui.find({ key: 'act:i:ai-video:f:1' }))?.text).toBe('send back…')
  // no conversation is listed anywhere: the app's sidebar has them; the recap stays in its conversation
  expect(texts.some(t => /busy one|fix the bowl|Card added/.test(t))).toBe(false)
  expect(await ui.find({ key: 'conversations' })).toBeFalsy()
  expect(await ui.find({ key: 'empty' })).toBeFalsy()
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
  expect(await ui.find({ key: 'list' })).toBeFalsy()
  if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(isPuppy)).toBe(true)
  else expect(await ui.find({ key: 'puppy' })).toBeTruthy()
  await ui.unmount()
})

test('the pipelines line: Chinese names and states, only 等你 and 出錯 in color; pressed, it opens the details', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'ai-video.json': status({ pipeline: 'ai-video', state: 'idle', headline: 'nothing open' }),
    'music.json': status({ state: 'running', progress: { done: 42, total: 70 } }),
    'collector-jobs.json': status({ pipeline: 'collector-jobs', state: 'waiting', headline: 'jobs: 3 new', waiting: [{ id: 'j', text: 'read 3 jobs' }] }),
    'broken.json': status({ pipeline: 'broken', title: 'Broken', state: 'error', headline: 'comfy is down' }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const button = await ui.find({ key: 'show-pipelines' })
  const line = textOf(button)
  for (const part of ['影片：閒置', '音樂：跑中 42/70', '收集 jobs：等你', 'Broken：出錯']) expect(line).toMatch(part)
  expect(line.startsWith('▸ ')).toBe(true)
  const colored = (await ui.findAll({ type: 'Text' }))
    .filter(t => t.props.color && textOf(t) !== '' && textOf(button).includes(textOf(t)) && ['等你', '出錯', '閒置', '跑中'].includes(textOf(t)))
    .map(t => [textOf(t), t.props.color])
  expect(colored).toEqual(expect.arrayContaining([['等你', 'warning'], ['出錯', 'error']]))
  expect(colored.some(([t]) => t === '閒置' || t === '跑中')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'nothing open' })).toBeFalsy()
  await ui.press({ key: 'show-pipelines' })
  expect(w.store.get('more:pipelines')).toBe(true)
  expect(textOf(await ui.find({ key: 'show-pipelines' })).startsWith('▾ ')).toBe(true)
  for (const p of ['ai-video', 'music', 'collector-jobs', 'broken']) expect(await ui.find({ key: `pipe-detail-${p}` })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'nothing open' })).toBeTruthy()
  await ui.unmount()
})

test('a pipeline in error with nothing to name gets its own row, 出錯 in the error color', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'error', updated: at(3 * 3_600_000), headline: 'tts failed' }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(ui)).toContain('1 件等你')
  const row = await ui.find({ key: 'row:s:ai-video' })
  expect(textOf(row)).toBe('出錯 影片：tts failed3 小時')
  expect((await ui.findAll({ type: 'Text' })).some(t => t.props.color === 'error' && textOf(t) === '出錯 ')).toBe(true)
  await ui.unmount()
})

const FINAL = (job: string) => [
  { label: '打開成片資料夾', open: `/v/${job}/out/` },
  { label: '核准', fill: `approve baibai/${job} final` },
]

test('a pipeline\'s items in one group are one row that opens in place; ungrouped, unknown and lone ones show as before', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = world(on, {
    'ai-video.json': status({
      pipeline: 'ai-video', state: 'waiting', headline: '4 open',
      waiting_groups: [{ id: 'final-review', label: '成片待審' }, { id: 'clip-input', label: '放素材' }],
      waiting: [
        { id: 'f1', text: '看過成片，approve baibai/ep04 final', group: 'final-review', since: at(DAY), actions: FINAL('ep04') },
        { id: 'i1', text: '把鏡頭放進 inbox/', group: 'clip-input', actions: [{ label: '打開 inbox', open: '/v/senpai01/inbox/' }] },
        { id: 'f2', text: '看過成片，approve baibai/指令 final', group: 'final-review', since: at(3_600_000), actions: FINAL('指令') },
        { id: 'f3', text: '看過成片，approve baibai/手勢 final', group: 'final-review', actions: FINAL('手勢') },
        { id: 'x1', text: 'a group nobody named', group: 'nope' },
      ],
    }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // a group is one thing
    expect(await textsOf(ui)).toContain('3 件等你')
    expect((await ui.find({ key: 'group:ai-video:final-review' }))?.text).toBe('▸ 成片待審 ×3')
    expect(textOf(await ui.find({ key: 'grp:g:ai-video:final-review' }))).toMatch(/24 小時$/)
    const list = await listOf(ui)
    expect(list).not.toMatch(/approve baibai\/ep04/)
    expect(await ui.find({ key: 'act:i:ai-video:f1:0' })).toBeFalsy()
    // a group of one, and a group the file never named, show their item as before
    expect(list).toMatch(/把鏡頭放進 inbox\//)
    expect((await ui.find({ key: 'act:i:ai-video:i1:0' }))?.text).toBe('打開 inbox')
    expect(list).toMatch(/a group nobody named/)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'group:ai-video:final-review' })
  expect((await ui.find({ key: 'group:ai-video:final-review' }))?.text).toBe('▾ 成片待審 ×3')
  expect(await listOf(ui)).toMatch(/approve baibai\/ep04/)
  expect((await ui.find({ key: 'act:i:ai-video:f3:1' }))?.text).toBe('核准…')
  expect(await textsOf(ui)).toContain('3 件等你')
  expect(w.store.get('group:ai-video:final-review')).toBe(true)
  // the minute's read keeps it open
  await clock.advance(60_000)
  expect(await ui.find({ key: 'act:i:ai-video:f3:1' })).toBeTruthy()
  await ui.unmount()
})

test('a group\'s wait is its oldest item by time, whatever offset each time is written in', { options: { status_dir: '/s' } }, async ($, on) => {
  // T is 04:00 UTC: 02:00Z waited 2h, 09:00+08:00 (01:00Z) waited 3h, though it sorts later as text
  world(on, {
    'ai-video.json': status({
      pipeline: 'ai-video', state: 'waiting', headline: '2 open',
      waiting_groups: [{ id: 'final-review', label: '成片待審' }],
      waiting: [
        { id: 'f1', text: 'a', group: 'final-review', since: '2026-10-28T02:00:00Z' },
        { id: 'f2', text: 'b', group: 'final-review', since: '2026-10-28T09:00:00+08:00' },
      ],
    }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(textOf(await ui.find({ key: 'grp:g:ai-video:final-review' }))).toMatch(/3 小時$/)
  await ui.unmount()
})

test('more than 8 rows end in "▸ 還有 N 件", which opens the rest', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'music.json': status({ state: 'waiting', waiting: Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, text: `hear song ${i}` })) }),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('11 件等你')
  expect((await ui.find({ key: 'more-all' }))?.text).toBe('▸ 還有 3 件')
  let list = await listOf(ui)
  expect(list).toMatch(/hear song 7/)
  expect(list).not.toMatch(/hear song 8/)
  await ui.press({ key: 'more-all' })
  list = await listOf(ui)
  for (let i = 8; i < 11; i++) expect(list).toMatch(`hear song ${i}`)
  expect((await ui.find({ key: 'more-all' }))?.text).toBe('▾ 收起')
  expect(w.store.get('more:all')).toBe(true)
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
  await ui.press({ key: 'act:i:ai-video:f:0' })
  expect(b.runs).toEqual([['open', '/v/ep04/final.mp4']])
  expect(await noteOf(ui)).toMatch(/已打開 final\.mp4/)
  b.exitCode = 1
  await ui.press({ key: 'act:i:ai-video:f:0' })
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
  await ui.press({ key: 'act:i:ai-video:f:0' })
  expect(await noteOf(ui)).toMatch(/不開 \/v\/final\.mp4/)
  await ui.press({ key: 'act:i:ai-video:g:0' })
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
  await ui.press({ key: 'act:i:ai-video:f:1' })
  // an empty box takes the words; words already typed are kept, the new ones go on a line after them
  expect(b.fills).toEqual(draft ? [{ text: '\nep04 final goes back because: ', mode: 'append' }] : [{ text: 'ep04 final goes back because: ', mode: 'replace' }])
  expect(await noteOf(ui)).toMatch(/已放進輸入框：寫完再送出/)
  // a box that does not take it (a hook kept it out; the engine's own refusals say why) is said
  b.refusal = 'dialog'
  await ui.press({ key: 'act:i:ai-video:f:1' })
  expect(await noteOf(ui)).toMatch(/輸入框沒有收下/)
  await ui.unmount()
})
