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
  expect(w.toasts).toEqual(notify === 'on' ? ['music · waiting: hear song 7'] : [])
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

// music waits for you and is fresh; the jobs collector is idle and five days old; ai-video is
// ten days old but still has something waiting, so it never folds away.
const PIPELINES = {
  'music.json': status({ state: 'waiting', waiting: [{ id: 'l7', text: 'hear song 7' }] }),
  'collector-jobs.json': status({ pipeline: 'collector-jobs', state: 'idle', updated: at(5 * DAY), headline: 'jobs: 3 new' }),
  'ai-video.json': status({ pipeline: 'ai-video', state: 'idle', updated: at(10 * DAY), headline: '1 job at final', waiting: [{ id: 'f', text: 'check ep04' }] }),
  'broken.json': status({ pipeline: 'broken', state: 'error', updated: at(30 * DAY), headline: 'comfy is down' }),
}

for (const surface of ['terminal', 'desktop'] as const)
test(`an old card folds into "older" at the bottom; one that waits for you never does (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { ...PIPELINES })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })

  for (const p of ['music', 'ai-video', 'broken']) expect(await ui.find({ key: `card-${p}` })).toBeTruthy()
  expect(await ui.find({ key: 'card-collector-jobs' })).toBeFalsy()
  expect((await ui.find({ key: 'show-older' }))?.props.label).toBe('▸ older 1')

  await ui.press({ key: 'show-older' })
  expect((await ui.find({ key: 'show-older' }))?.props.label).toBe('▾ older 1')
  expect(w.store.get('isShowingOlder')).toBe(true)
  // inside the group a card starts folded: its name, no body
  expect(await ui.find({ key: 'card-collector-jobs' })).toBeTruthy()
  expect((await ui.find({ key: 'fold-collector-jobs' }))?.text).toMatch(/^▸ collector-jobs/)
  expect(await ui.find({ type: 'Text', text: 'jobs: 3 new' })).toBeFalsy()

  await ui.press({ key: 'fold-collector-jobs' })
  expect(await ui.find({ type: 'Text', text: 'jobs: 3 new' })).toBeTruthy()
  expect(w.store.get('fold:collector-jobs')).toBe(false)

  // the older group sits after the current cards
  const keys = (await ui.findAll({ type: 'Box' })).map(b => b.key).filter(Boolean)
  expect(keys.indexOf('older')).toBeGreaterThan(keys.indexOf('card-broken'))
  await ui.unmount()
})

test('a card folds to its header line and opens again; the store remembers', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { ...PIPELINES })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'fold-music' }))?.text).toMatch(/^▾ music/)
  expect(await ui.find({ type: 'Text', text: '05 · 42/70 usable' })).toBeTruthy()

  await ui.press({ key: 'fold-music' })
  expect((await ui.find({ key: 'fold-music' }))?.text).toMatch(/^▸ music/)
  expect(await ui.find({ type: 'Text', text: '05 · 42/70 usable' })).toBeFalsy()
  // folded, the line keeps to the state and the time; what waits for you is in "for you"
  expect(textOf(await ui.find({ key: 'card-music' }))).toMatch(/waiting · 1m ago$/)
  expect(textOf(await ui.find({ key: 'card-for-you' }))).toMatch(/hear song 7/)
  expect(w.store.get('fold:music')).toBe(true)

  await ui.press({ key: 'fold-music' })
  expect(await ui.find({ type: 'Text', text: '05 · 42/70 usable' })).toBeTruthy()
  expect(w.store.has('fold:music')).toBe(false)   // back to the default: nothing kept
  await ui.unmount()
})

test('folds made earlier (another conversation, a restart) are read when the pane opens', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { ...PIPELINES }, { 'fold:music': true, 'fold:collector-jobs': false, isShowingOlder: true, 'fold:gone': true, other: 1 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // music waits for you, yet stays folded: the person's fold wins
  expect((await ui.find({ key: 'fold-music' }))?.text).toMatch(/^▸ music/)
  expect(await ui.find({ type: 'Text', text: '05 · 42/70 usable' })).toBeFalsy()
  expect((await ui.find({ key: 'show-older' }))?.props.label).toBe('▾ older 1')
  expect(await ui.find({ type: 'Text', text: 'jobs: 3 new' })).toBeTruthy()
  await ui.unmount()
})

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
  // so the puppy would be 9 to 12 rows tall and the cards below would jump with the mood
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

  // the desktop draws its puppy as a picture beside the first row, whatever the rows
  const desk = await $.ui.mount({ ...PANE, props: rows(40), surface: 'desktop' })
  expect(await desk.find({ key: 'puppy' })).toBeFalsy()
  await desk.redraw(rows(10))
  expect((await desk.findAll({ type: 'Svg' })).some(s => /^the puppy/.test(String(s.props.alt)))).toBe(true)
  await desk.unmount()
})

const COUNTS = { collected: 412, new: 58, scored: 58, sent: 9, unsent: 2, pending: 27 }

for (const surface of ['terminal', 'desktop'] as const)
test(`a collector card: the same lines on both surfaces, the review in the warning color (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {
    'collector-tech-news.json': status({ pipeline: 'collector-tech-news', state: 'waiting', headline: '收集 412 · 新 58 · 送進 Notion 9', detail: { counts: COUNTS, errors: [] } }),
    'collector-old.json': status({ pipeline: 'collector-old', state: 'waiting', headline: 'an older file', detail: { errors: ['x'] } }),
  })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  expect((await ui.find({ type: 'Text', text: /collected 412/ }))?.text).toBe('this run: collected 412 · new 58 · scored 58 · sent 9')
  expect((await ui.find({ type: 'Text', text: /^to review/ }))?.text).toBe('to review in notion 27 · unsent 2')
  expect((await ui.findAll({ type: 'Text' })).filter(t => t.props.color === 'warning').map(t => t.text)).toContain('to review in notion 27')
  // no picture: its numbers are all in the lines
  expect((await ui.findAll({ type: 'Svg' })).filter(s => !/^the puppy/.test(String(s.props.alt)))).toEqual([])
  // an older file without counts: the card as before, no lines
  expect(await ui.find({ type: 'Text', text: 'an older file' })).toBeTruthy()
  expect(await ui.findAll({ type: 'Text', text: /^this run: collected/ })).toHaveLength(1)
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

test('a card shows its summary; "▸ details" holds the picture or the same facts as text, and the computer', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, { 'ai-video.json': VIDEO })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^plan / }))?.text).toBe('plan 0 › clips 1 › voice 0 › compose 0 › final 1 › done 0')
    expect(await ui.find({ type: 'Text', text: 'spent $0.49 of $42.50' })).toBeTruthy()
    // the header keeps to the state and the time
    expect(textOf(await ui.find({ key: 'card-ai-video' }))).not.toMatch(/studio-mac|for you/)
    expect((await ui.find({ key: 'show-details-ai-video' }))?.text).toBe('▸ details')
    expect(await ui.find({ type: 'Text', text: /ep05/ })).toBeFalsy()
    await ui.unmount()
  }
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desk.press({ key: 'show-details-ai-video' })
  expect(w.store.get('details:ai-video')).toBe(true)
  expect((await desk.findAll({ type: 'Svg' })).map(s => String(s.props.alt))).toContain('2 jobs, 1 at a review gate')
  expect(await desk.find({ type: 'Text', text: /ep05/ })).toBeFalsy()
  expect(await desk.find({ type: 'Text', text: 'on studio-mac' })).toBeTruthy()
  expect(await desk.find({ type: 'Text', text: 'last: 電車 final.mp4 · 2d ago' })).toBeTruthy()
  await desk.unmount()
  // the terminal: the same details as text, and open there too
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ key: 'show-details-ai-video' }))?.text).toBe('▾ details')
  expect(await term.find({ type: 'Text', text: 'clips: ep05' })).toBeTruthy()
  expect(await term.find({ type: 'Text', text: 'final (you): ep04' })).toBeTruthy()
  expect(await term.find({ type: 'Text', text: 'on studio-mac' })).toBeTruthy()
  await term.press({ key: 'show-details-ai-video' })
  expect(w.store.has('details:ai-video')).toBe(false)
  await term.unmount()
})

const conversation = (over: object) => JSON.stringify({
  format: 'session-status', version: 1, id: 'a', updated: at(60_000), state: 'waiting',
  title: 'console sessions', recap: 'Card added.', ask: 'Open a PR?', ...over,
})

test('the terminal pane asks for room for the puppy and the cards', { options: { status_dir: '/s' } }, async ($, on) => {
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
  expect(await ui.find({ key: 'card-music' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /skipped music\.json/ })).toBeTruthy()
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
  const texts = (await ui.findAll({ type: 'Text' })).map(t => textOf(t))
  expect(texts.some(t => t === 'quiet · no update for 24h from manaka-air')).toBe(true)
  expect(texts.some(t => /asleep/.test(t))).toBe(false)
  expect(texts.some(t => /^error · /.test(t) || t === 'error')).toBe(true)
  await ui.unmount()
  w.files['music.json'] = status({ state: 'waiting', stale_after_sec: 60, updated: at(DAY), host: 'manaka-air', waiting: [{ id: 'a', text: 'hear song 1' }, { id: 'b', text: 'hear song 2' }] })
  await clock.advance(60_000)
  expect(w.toasts).toEqual(['music · new: hear song 2'])
})

test('a waiting item says how long it has waited', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'music.json': status({ state: 'waiting', waiting: [{ id: 'a', text: 'hear song 1', since: at(2 * DAY) }] }) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).map(t => textOf(t))).toContain('· hear song 1 · 2d')
  await ui.unmount()
})

test('a video job at a stage with no column is named, not drawn as plan', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', detail: { jobs: [{ job: 'baibai/電車', stage: 'deliver', spend_usd: 0, cap_usd: 1 }] } }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'other stage · deliver: 電車' })).toBeTruthy()
  await ui.unmount()
})

test('the desktop puppy is drawn interactive, so it moves', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const puppy = (await ui.findAll({ type: 'Svg' })).find(s => /^the puppy/.test(String(s.props.alt)))
  expect(puppy?.props.isInteractive).toBe(true)
  await ui.unmount()
})

test('no conversations yet: the card says so', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^no conversations yet/ })).toBeTruthy()
  await ui.unmount()
})

test('on the terminal a conversation row is cut to the card, and waiting ones stand apart', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {})
  w.sessions['a.json'] = conversation({ id: 'a', isAppTitle: true, title: '這是一個很長很長的對話名稱'.repeat(4), recap: 'r'.repeat(200) })
  w.sessions['b.json'] = conversation({ id: 'b', title: 'second', updated: at(120_000) })
  w.sessions['c.json'] = conversation({ id: 'c', title: 'busy', state: 'running', ask: null })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, props: rows(40, 60), surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => textOf(t))
  const width = (t: string) => [...t].reduce((n, c) => n + (/[⺀-꓏가-힣＀-｠]/.test(c) ? 2 : 1), 0)
  const name = texts.find(t => t.startsWith('這是'))!
  expect(name.endsWith('…')).toBe(true)
  expect(width(name) + 1 + width('1m ago')).toBeLessThanOrEqual(56)
  // the recap is in the conversation, not in "for you"
  expect(texts.some(t => t.startsWith('rrr'))).toBe(false)
  expect(texts.some(t => t === '· busy')).toBe(true)
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

test('on the terminal the waiting conversations have a blank row between them', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {})
  w.sessions['a.json'] = conversation({ id: 'a' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  for (const [surface, gap] of [['terminal', 1], ['desktop', 'xs']] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'needs' }))?.props.gap).toBe(gap)
    await ui.unmount()
  }
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
  const texts = (await ui.findAll({ type: 'Text' })).map(t => textOf(t))
  expect(texts.some(t => /^skipped sessions\/b\.json: /.test(t))).toBe(true)
  expect(texts.some(t => /^skipped sessions\/a\.json: .*showing the last read/.test(t))).toBe(true)
  expect(texts.some(t => t.startsWith('console sessions'))).toBe(true)
  await ui.unmount()
})

const ACTIONS = [
  { label: 'play', open: '/v/ep04/final.mp4' },
  { label: 'send back', fill: 'ep04 final goes back because: ' },
]

test('"for you" comes first: the asking conversations, then each pipeline\'s waiting items with their buttons', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', headline: '1 job at final', waiting: [{ id: 'f', text: 'check ep04', actions: ACTIONS }] }),
    'music.json': status({}),
  })
  w.sessions['a.json'] = conversation({ id: 'a' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => textOf(t))
    expect(texts.indexOf('for you')).toBeLessThan(texts.indexOf('1 job at final'))
    const forYou = textOf(await ui.find({ key: 'card-for-you' }))
    // each part counts its own things, and the card adds up no total
    expect(forYou).toMatch(/conversations · 1/)
    expect(forYou).toMatch(/ai-video · 1/)
    expect(forYou).not.toMatch(/waiting/)
    expect(forYou).toMatch(/Open a PR\?/)
    expect(forYou).toMatch(/check ep04/)
    // said once: no conversations card, and the pipeline card does not count it again
    expect(await ui.find({ key: 'conversations' })).toBeFalsy()
    expect(textOf(await ui.find({ key: 'card-ai-video' }))).not.toMatch(/check ep04|for you/)
    expect((await ui.find({ key: 'act:ai-video:f:0' }))?.text).toBe('play')
    expect((await ui.find({ key: 'act:ai-video:f:1' }))?.text).toBe('send back…')
    await ui.unmount()
  }
})

// Shaped like the person's real files on 11/1: an app-named conversation with a long recap, and
// one the app never named (its title is the "new conversation" fallback).
const asking = {
  'a.json': conversation({ id: 'a', isAppTitle: true, title: '產線程式健檢，寫 SPEC', recap: '已經查完 youtube 的授權，token 七天會過期，所以每週要重新登入一次。', ask: '你跑完 --reauth 之後，要我更新 README 嗎？' }),
  'b.json': conversation({ id: 'b', title: 'new conversation', recap: '10/29 的兩張圖還沒發布。', ask: '要發嗎？' }),
}

for (const surface of ['terminal', 'desktop'] as const)
test(`"for you" gives each question two lines at most; one the app never named goes by its question (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {})
  Object.assign(w.sessions, asking)
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface })
  const forYou = textOf(await ui.find({ key: 'card-for-you' }))
  expect(forYou).toMatch(/產線程式健檢，寫 SPEC/)
  expect(forYou).toMatch(/→ 你跑完 --reauth/)
  expect(forYou).toMatch(/要發嗎？/)
  // the recap is in the conversation; a name the app never gave says nothing
  expect(forYou).not.toMatch(/token 七天/)
  expect(forYou).not.toMatch(/new conversation/)
  // its question is its name, so it is not said twice
  expect(forYou.match(/要發嗎？/g)).toHaveLength(1)
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const)
test(`a long question that stands as the name is shown whole (${surface})`, { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {})
  const ask = '所有測試已經通過而且變更都已整理完成，現在要部署到正式環境，還是先部署到測試環境？'
  w.sessions['a.json'] = conversation({ id: 'a', title: 'new conversation', project: 'puppy-mods', ask })
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, props: rows(40, 60), surface })
  const shown = (await ui.findAll({ type: 'Text' })).filter(t => textOf(t).includes(ask))
  expect(shown.length).toBeGreaterThan(0)
  // not cut on the terminal, not cut at the edge on the desktop
  expect(shown.some(t => textOf(t).includes('…') || t.props.wrap === 'truncate-end')).toBe(false)
  await ui.unmount()
})

test('a question waiting more than a day folds into "older" in "for you"; an error never does', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {})
  w.sessions['new.json'] = conversation({ id: 'new', isAppTitle: true, title: 'today', ask: 'Ship it?' })
  w.sessions['old.json'] = conversation({ id: 'old', isAppTitle: true, title: 'old one', ask: 'Merge?', updated: at(3 * DAY) })
  w.sessions['err.json'] = conversation({ id: 'err', isAppTitle: true, title: 'broke', state: 'error', ask: null, updated: at(3 * DAY) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const forYou = textOf(await ui.find({ key: 'card-for-you' }))
    expect(forYou).toMatch(/conversations · 3/)
    expect(forYou).toMatch(/Ship it\?/)
    expect(forYou).toMatch(/broke/)
    expect(forYou).not.toMatch(/Merge\?/)
    expect((await ui.find({ key: 'show-older-needs' }))?.text).toMatch(/^▸ older 1/)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'show-older-needs' })
  expect(textOf(await ui.find({ key: 'card-for-you' }))).toMatch(/Merge\?/)
  expect(w.store.get('isShowingOlderNeeds')).toBe(true)
  await ui.unmount()
})

const FINAL = (job: string) => [
  { label: '打開成片資料夾', open: `/v/${job}/out/` },
  { label: '核准', fill: `approve baibai/${job} final` },
]

test('a pipeline\'s items in one group fold into one line; ungrouped, unknown and lone ones show as before', { options: { status_dir: '/s' } }, async ($, on) => {
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
    const forYou = textOf(await ui.find({ key: 'card-for-you' }))
    // every item still counts
    expect(forYou).toMatch(/ai-video · 5/)
    expect((await ui.find({ key: 'group:ai-video:final-review' }))?.text).toMatch(/^▸ 成片待審 ×3 · 24h/)
    expect(forYou).not.toMatch(/approve baibai\/ep04/)
    expect(await ui.find({ key: 'act:ai-video:f1:0' })).toBeFalsy()
    // a group of one, and a group the file never named, show their item as before
    expect(forYou).toMatch(/把鏡頭放進 inbox\//)
    expect((await ui.find({ key: 'act:ai-video:i1:0' }))?.text).toBe('打開 inbox')
    expect(forYou).toMatch(/a group nobody named/)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'group:ai-video:final-review' })
  expect(textOf(await ui.find({ key: 'card-for-you' }))).toMatch(/approve baibai\/ep04/)
  expect((await ui.find({ key: 'act:ai-video:f3:1' }))?.text).toBe('核准…')
  expect(w.store.get('group:ai-video:final-review')).toBe(true)
  // the minute's read keeps it open
  await clock.advance(60_000)
  expect(await ui.find({ key: 'act:ai-video:f3:1' })).toBeTruthy()
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
  expect((await ui.find({ key: 'group:ai-video:final-review' }))?.text).toMatch(/· 3h$/)
  await ui.unmount()
})

test('a list past its limit ends in a "▸ N more" button that opens the rest', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w } = world(on, {
    'music.json': status({ state: 'waiting', waiting: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, text: `hear song ${i}` })) }),
  })
  for (let i = 0; i < 8; i++) w.sessions[`q${i}.json`] = conversation({ id: `q${i}`, isAppTitle: true, title: `asks ${i}`, ask: `question ${i}?`, updated: at((i + 1) * 60_000) })
  for (let i = 0; i < 7; i++) w.sessions[`r${i}.json`] = conversation({ id: `r${i}`, isAppTitle: true, title: `busy ${i}`, state: 'running', ask: null, updated: at((i + 1) * 60_000) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const [key, label, hidden] of [['more-needs', '▸ 2 more', /question 7\?/], ['more-music', '▸ 2 more', /hear song 6/], ['more-running', '▸ 2 more running', /busy 6/]] as const) {
    expect((await ui.find({ key }))?.text).toBe(label)
    expect((await ui.findAll({ type: 'Text' })).some(t => hidden.test(textOf(t)))).toBe(false)
    await ui.press({ key })
    expect((await ui.find({ key }))?.text).toBe(label.replace('▸', '▾'))
    expect((await ui.findAll({ type: 'Text' })).some(t => hidden.test(textOf(t)))).toBe(true)
  }
  expect(w.store.get('more:needs')).toBe(true)
  expect(w.store.get('more:music')).toBe(true)
  // the running ones have no card: quiet rows below the pipelines
  const keys = (await ui.findAll({ type: 'Box' })).map(b => b.key).filter(Boolean)
  expect(keys.indexOf('activity')).toBeGreaterThan(keys.indexOf('card-music'))
  await ui.unmount()
})

test('nothing waits: no "for you" card', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'music.json': status({}) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'card-for-you' })).toBeFalsy()
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

const noteOf = async (ui: { find: (q: object) => Promise<unknown> }) => textOf(await ui.find({ key: 'card-for-you' }))

test('a button opens a file with the system\'s own app, and says so', { options: { status_dir: '/s' } }, async ($, on) => {
  world(on, { 'ai-video.json': status({ pipeline: 'ai-video', state: 'waiting', waiting: [{ id: 'f', text: 'check ep04', actions: ACTIONS }] }) })
  const b = buttons(on, { '/v/ep04/final.mp4': { kind: 'file', realPath: '/v/ep04/final.mp4' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'act:ai-video:f:0' })
  expect(b.runs).toEqual([['open', '/v/ep04/final.mp4']])
  expect(await noteOf(ui)).toMatch(/opened final\.mp4/)
  b.exitCode = 1
  await ui.press({ key: 'act:ai-video:f:0' })
  expect(await noteOf(ui)).toMatch(/can't open \/v\/ep04\/final\.mp4: The file does not exist\./)
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
  expect(await noteOf(ui)).toMatch(/won't open \/v\/final\.mp4/)
  await ui.press({ key: 'act:ai-video:g:0' })
  expect(await noteOf(ui)).toMatch(/can't open \/v\/gone\.mp4: .*ENOENT/)
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
  expect(await noteOf(ui)).toMatch(/in the prompt box: finish it and send/)
  // a box that does not take it (a hook kept it out; the engine's own refusals say why) is said
  b.refusal = 'dialog'
  await ui.press({ key: 'act:ai-video:f:1' })
  expect(await noteOf(ui)).toMatch(/the prompt box didn't take it/)
  await ui.unmount()
})
