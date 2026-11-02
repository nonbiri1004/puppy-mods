import { expect, mock, test } from 'claude-code/testing'

import { byStage, collectorCounts, cut, MAX_SQUARES, picture, unknownStages } from '../hooks/draw'
import { ago, alerts, expandHome, isOpenable, MAX_ACTIONS, parseActions, isStale, markOf, parseStatus, pipeName, sortCards, textBar, waited } from '../hooks/format'
import { lineText, view } from '../hooks/view'
import type { Snapshot, Status } from '../types'

const base = {
  format: 'pipeline-status',
  version: 1,
  pipeline: 'music',
  updated: '2026-10-24T22:00:00+08:00',
  state: 'running',
  headline: '05 · 42/70 usable',
}
const file = (over: object) => JSON.stringify({ ...base, ...over })

test('a status file parses; a wrong one says why', () => {
  const s = parseStatus(file({ waiting: [{ id: 'l7', text: 'hear song 7' }, 'junk'] }))
  expect(s.pipeline).toBe('music')
  expect(s.waiting).toEqual([{ id: 'l7', text: 'hear song 7' }])
  expect(() => parseStatus('{"schema":1}')).toThrow(/pipeline-status/)
  expect(() => parseStatus(file({ version: 2 }))).toThrow(/version 2/)
  expect(() => parseStatus(file({ state: 'busy' }))).toThrow(/state/)
  expect(() => parseStatus('{"format": "pipel')).toThrow(/not json/)
})

test('a field of the wrong type is dropped, not fatal', () => {
  const odd = parseStatus(file({ title: 42, next: 7, progress: { done: 'x' }, last_output: { label: 1 } }))
  expect([odd.title, odd.next, odd.progress, odd.last_output]).toEqual([undefined, null, null, null])
  expect(sortCards([odd, parseStatus(file({ pipeline: 'b', title: 'b' }))]).map(s => s.pipeline)).toEqual(['b', 'music'])
  expect(picture(parseStatus(file({ detail: { batches: [{ name: 'x', strip: 5 }] } })), false)).toBeTruthy()
})

test('waiting groups: an odd group or a group name of the wrong type is dropped, never the item', () => {
  const s = parseStatus(file({
    waiting_groups: [{ id: 'final-review', label: '成片待審' }, { id: 'no-label' }, { label: 'no id' }, { id: 'long', label: 'x'.repeat(41) }, 'junk'],
    waiting: [{ id: 'a', text: 'a', group: 'final-review' }, { id: 'b', text: 'b', group: 7 }],
  }))
  expect(s.waiting_groups).toEqual([{ id: 'final-review', label: '成片待審' }])
  expect(s.waiting).toEqual([{ id: 'a', text: 'a', group: 'final-review' }, { id: 'b', text: 'b' }])
  expect(parseStatus(file({ waiting_groups: 'x' })).waiting_groups).toEqual([])
})

test('a huge batch keeps its squares a size and the svg small', () => {
  for (const c of ['e', 'o']) {
    const pic = picture(parseStatus(file({ detail: { batches: [{ name: 'x', strip: c.repeat(5000) }] } })), false)!
    expect(pic.source.length).toBeLessThan(131072)
    expect(pic.source).not.toMatch(/(width|height)="-/)
    expect(pic.source).toContain(`newest ${MAX_SQUARES} of 5000`)
  }
})

test('labels are cut by width; a CJK character counts as two', () => {
  expect(cut('demo_本機測試', 12)).toBe('demo_本機測…')
  // an emoji is one code point: never split into half a surrogate pair
  expect(cut('ab😀cd', 4)).toBe('ab😀…')
  expect(cut('ab😀cd', 3)).toBe('ab…')
  expect(cut('ab😀cd', 5)).toBe('ab😀cd')
  expect(cut('ep03', 12)).toBe('ep03')
  expect(cut('手勢模特兒', 12)).toBe('手勢模特兒')
  expect(cut('abcdefghijklmn', 12)).toBe('abcdefghijk…')
})

test('alerts: a card turning waiting, error or quiet, and new waiting items', () => {
  const t = Date.parse(base.updated)
  const snap = (at: number, ...cards: object[]): Snapshot =>
    ({ dir: '/s', cards: cards.map(c => parseStatus(file(c))), conversations: [], conversationsError: null, problems: [], dirError: null, loadedAt: at })
  const running = snap(t, { state: 'running', stale_after_sec: 360 })
  expect(alerts(null, running)).toEqual([])                                   // first read: baseline
  expect(alerts(running, snap(t + 60_000, { state: 'running', stale_after_sec: 360 }))).toEqual([])
  expect(alerts(running, snap(t, { state: 'waiting', waiting: [{ id: 'a', text: 'hear #7' }] })))
    .toEqual(['音樂 · 等你：hear #7'])
  expect(alerts(running, snap(t, { state: 'error', headline: 'comfy is down' }))).toEqual(['音樂 · 出錯：comfy is down'])
  expect(alerts(running, snap(t + 600_000, { state: 'running', stale_after_sec: 360 }))[0]).toMatch(/^音樂 · 沒消息：10 分鐘沒有更新（它的電腦）$/)
  const w1 = snap(t, { state: 'waiting', waiting: [{ id: 'a', text: 'hear #7' }] })
  expect(alerts(w1, snap(t, { state: 'waiting', waiting: [{ id: 'a', text: 'hear #7' }] }))).toEqual([])   // nothing new
  expect(alerts(w1, snap(t, { state: 'waiting', waiting: [{ id: 'a', text: 'hear #7' }, { id: 'b', text: 'hear #9' }] })))
    .toEqual(['音樂 · 新的：hear #9'])
  expect(alerts(running, snap(t, { state: 'idle' }))).toEqual([])               // back to idle is not news
})

test('stale only after the time the writer promised', () => {
  const s = parseStatus(file({ stale_after_sec: 360 }))
  const t = Date.parse(base.updated)
  expect(isStale(s, t + 300_000)).toBe(false)
  expect(isStale(s, t + 400_000)).toBe(true)
  expect(isStale(parseStatus(file({})), t + 9e9)).toBe(false)
})

test('cards that need you come first', () => {
  const mk = (pipeline: string, state: string) => parseStatus(file({ pipeline, state }))
  const order = sortCards([mk('b', 'idle'), mk('a', 'running'), mk('c', 'waiting'), mk('d', 'error')])
  expect(order.map(s => s.pipeline)).toEqual(['c', 'd', 'a', 'b'])
})

test('text bar and home folder', () => {
  expect(textBar({ done: 42, total: 70, unit: 'songs' })).toBe('▓▓▓▓▓▓░░░░ 42/70 songs')
  expect(textBar({ done: 3, total: null })).toBe('3')
  expect(expandHome('~/x/y', '/Users/a')).toBe('/Users/a/x/y')
  expect(expandHome('/abs', '/Users/a')).toBe('/abs')
})

test('video jobs group by stage', () => {
  const j = (job: string, stage: Status['state'] | string) => ({ job, stage, spend_usd: 0, cap_usd: 10 }) as never
  const lanes = byStage([j('a/1', 'final'), j('a/2', 'done'), j('a/3', 'final')])
  expect(lanes.final.map(x => (x as { job: string }).job)).toEqual(['a/1', 'a/3'])
  expect(lanes.plan).toEqual([])
})

const PANE = {
  plugin: 'puppy-console',
  component: 'Pane',
  requestId: 'puppy-console',
  props: {
    title: 'console',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane draws one card per file and names the files it skipped', { options: { status_dir: '~/status' } }, async ($, on) => {
  const files: Record<string, string> = {
    '/home/me/status/music.json': file({ waiting: [{ id: 'l7', text: 'hear song 7' }], next: 'hear song 7' }),
    '/home/me/status/ai-video.json': file({
      pipeline: 'ai-video', state: 'idle', headline: '3 jobs, all done',
      detail: { spend_usd: 1, cap_usd: 10, jobs: [{ job: 'baibai/ep04', stage: 'final', spend_usd: 1, cap_usd: 10 }] },
    }),
    '/home/me/status/old.json': '{"schema": 1}',
  }
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on, { now: Date.parse(base.updated) + 60_000 })
  on('fs.list', () => ({
    value: ['music.json', 'ai-video.json', 'old.json', '.music.json.tmp', 'notes.txt'].map(name => ({
      name, kind: 'file', size: 1, mtimeMs: 0, isLink: false,
    })),
  }))
  on('fs.read', (_, e) => {
    const text = files[(e as { path: string }).path]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
  on('command.register', () => ({ value: { command: 'console' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'console', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  // the details are open from here on: pressed once, kept for the next mount
  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await first.press({ key: 'show-pipelines' })
  await first.unmount()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /42\/70 usable/ }))?.text).toBe('05 · 42/70 usable')
    expect(await ui.findAll({ type: 'Text', text: /hear song 7/ })).toHaveLength(1)   // "next" repeating a waiting item is not shown
    expect(await ui.find({ type: 'Text', text: /3 jobs, all done/ })).toBeTruthy()
    // the summary is the same text on both surfaces; the job names wait in the folded details
    expect((await ui.find({ type: 'Text', text: /^企劃 / }))?.text).toBe('企劃 0 › 片段 0 › 配音 0 › 合成 0 › 成品 1 › 完成 0')
    expect((await ui.find({ type: 'Text', text: /^略過 old\.json/ }))?.text).toMatch(/pipeline-status/)
    expect(await ui.find({ type: 'Text', text: /tmp/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('no folder set: the pane says where to set it', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on, { now: Date.parse(base.updated) + 60_000 })
  on('command.register', () => ({ value: { command: 'console' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'console', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^讀不到狀態資料夾/ }))?.text).toBe('讀不到狀態資料夾：no status folder set')
  expect(await ui.find({ type: 'Text', text: /\/config → puppy-console → status folder/ })).toBeTruthy()
  await ui.unmount()
})

const collector = (detail: object, pipeline = 'collector-tech-news') =>
  parseStatus(file({ pipeline, state: 'waiting', detail }))
const COUNTS = { collected: 412, new: 58, scored: 58, sent: 9, unsent: 2, pending: 27 }

const summaryOf = (s: Status) => view(s, Date.parse(base.updated)).summary.map(lineText)

test('a collector card: this run\'s counts side by side, no arrows (not a funnel), then what waits in notion', () => {
  const s = collector({ counts: COUNTS, errors: [] })
  expect(summaryOf(s)).toEqual([
    '這次 收集 412 · 新 58 · 評分 58 · 送出 9',
    'notion 待審 27 · 未送 2',
  ])
  // the review waits for you; its numbers are the whole story, so no picture in the details
  expect(view(s, 0).summary[1]!.parts[0]!.isYou).toBe(true)
  expect(picture(s, false)).toBeNull()
})

test('a collector card: notion not read, and the 100 cap', () => {
  const unread = collector({ counts: { ...COUNTS, unsent: 0, pending: null } })
  expect(summaryOf(unread)[1]).toBe('notion 待審 ?（讀不到 notion） · 未送 0')
  expect(view(unread, 0).summary[1]!.parts[0]!.isYou).toBe(false)
  for (const pending of [100, 140]) expect(summaryOf(collector({ counts: { ...COUNTS, pending } }))[1]).toMatch(/^notion 待審 100\+/)
  // a stage number that is missing or odd counts as 0
  expect(collectorCounts(collector({ counts: { collected: 3, new: 'x' } }))).toEqual({ collected: 3, new: 0, scored: 0, sent: 0, unsent: 0, pending: null })
})

test('an older collector file (no counts) gives its progress, like any pipeline', () => {
  for (const detail of [{ errors: ['x'] }, { counts: [] }, { counts: { collected: 'x' } }]) {
    expect(summaryOf(collector(detail))).toEqual([])
    expect(summaryOf(parseStatus(file({ pipeline: 'collector-x', detail, progress: { done: 3, total: 10 } })))).toEqual(['▓▓▓░░░░░░░ 3/10'])
  }
  // only the prefix "collector-" is a collector
  for (const pipeline of ['info-collector', 'collectors']) expect(summaryOf(collector({ counts: COUNTS }, pipeline))).toEqual([])
})

test('a music card: the batch, then its songs; the songs to hear wait for you', () => {
  const s = parseStatus(file({ detail: { comfy: { up: true, running: 1, pending: 0 }, batches: [{ name: '06_讀書', generated: 70, ok: 19, needs_listen: 41, rejected: 10, errors: 2, avg_gen_sec: 840 }] } }))
  const v = view(s, 0)
  expect(v.summary.map(lineText)).toEqual(['06_讀書', '做了 70 · 可用 19 · 待聽 41 · 退回 10 · 失敗 2 · 每首 14 分鐘'])
  expect(v.summary[1]!.parts.filter(p => p.isYou).map(p => p.text)).toEqual(['待聽 41'])
  expect(v.detailText).toEqual(['comfy 開著'])
  // nothing to hear: nothing marked
  const heard = parseStatus(file({ detail: { batches: [{ name: 'x', generated: 3, ok: 3, needs_listen: 0 }] } }))
  expect(view(heard, 0).summary[1]!.parts.some(p => p.isYou)).toBe(false)
})

test('the details: the computer, the last output, and a "next" that is not already waiting', () => {
  const t = Date.parse(base.updated)
  const s = parseStatus(file({ host: 'studio-mac', last_output: { label: 'song #136', at: base.updated }, next: 'hear song 7', waiting: [{ id: 'a', text: 'hear song 7' }] }))
  expect(view(s, t + 2 * 3_600_000).facts).toEqual(['在 studio-mac', '上次：song #136 · 2 小時前'])
  expect(view(parseStatus(file({ next: 'make 10 more' })), t).facts).toEqual(['下一步：make 10 more'])
})

test('time in one unit, as a glance needs it', () => {
  const m = 60_000
  expect(ago(20_000)).toBe('剛剛')
  expect(ago(5 * m)).toBe('5 分鐘前')
  expect(ago(59 * m)).toBe('59 分鐘前')
  expect(ago(61 * m)).toBe('1 小時前')
  expect(ago(8 * 60 * m + 1 * m)).toBe('8 小時前')
  expect(ago(47 * 60 * m + 59 * m)).toBe('47 小時前')
  expect(ago(48 * 60 * m)).toBe('2 天前')
  expect(waited(5 * m)).toBe('5 分鐘')
  expect(waited(20_000)).toBe('剛剛')
})

test('the pane names the pipelines it knows in Chinese; any other goes by its title', () => {
  expect(pipeName(parseStatus(file({ pipeline: 'ai-video' })))).toBe('影片')
  expect(pipeName(parseStatus(file({})))).toBe('音樂')
  expect(pipeName(parseStatus(file({ pipeline: 'collector-jobs' })))).toBe('收集 jobs')
  expect(pipeName(parseStatus(file({ pipeline: 'other', title: 'Other' })))).toBe('Other')
})

test('a pipeline name holds only a-z, 0-9 and -; a waiting item with no id is known by its words', () => {
  expect(() => parseStatus(file({ pipeline: 'Music Box' }))).toThrow(/a-z/)
  expect(parseStatus(file({ pipeline: 'collector-tech-news' })).pipeline).toBe('collector-tech-news')
  expect(parseStatus(file({ waiting: [{ text: 'hear song 7' }] })).waiting).toEqual([{ id: 'hear song 7', text: 'hear song 7' }])
})

test('a stale error stays an error; a stale card otherwise is quiet', () => {
  const t = Date.parse(base.updated)
  expect(markOf(parseStatus(file({ state: 'error', stale_after_sec: 60 })), t + 3_600_000)).toBe('error')
  expect(markOf(parseStatus(file({ state: 'waiting', stale_after_sec: 60 })), t + 3_600_000)).toBe('quiet')
  expect(markOf(parseStatus(file({ state: 'running', stale_after_sec: 60 })), t)).toBe('running')
})

test('video: every stage in one row, the review gates marked when a job waits there; a stage outside the list is named', () => {
  const jobs = [
    { job: 'baibai/ep04', stage: 'final', spend_usd: 0, cap_usd: 1 },
    { job: 'baibai/電車', stage: 'deliver', spend_usd: 0, cap_usd: 1 },
    { job: 'baibai/ep05', stage: 'clips', spend_usd: 0, cap_usd: 1 },
  ]
  const s = parseStatus(file({ pipeline: 'ai-video', detail: { jobs, spend_usd: 0.49, cap_usd: 42.5 }, waiting: [{ id: 'w', text: 'approve baibai/ep04 final' }] }))
  const lanes = byStage(jobs as never)
  expect(lanes.plan).toEqual([])
  expect(Object.values(lanes).flat()).toHaveLength(2)
  expect(unknownStages(s)).toEqual(['deliver: 電車'])
  const v = view(s, 0)
  expect(v.summary.map(lineText)).toEqual(['企劃 0 › 片段 1 › 配音 0 › 合成 0 › 成品 1 › 完成 0', '花了 $0.49 / $42.50'])
  // plan is a gate too, but nothing waits there
  expect(v.summary[0]!.parts.filter(p => p.isYou).map(p => p.text)).toEqual(['成品 1'])
  // the details name every job, whatever "for you" already says
  expect(v.detailText).toEqual(['片段：ep05', '成品（你）：ep04'])
})

test('a video detail of an odd shape names nothing and throws nothing', () => {
  for (const jobs of [{}, [null, 3, { stage: 'deliver' }], 'x']) {
    const s = parseStatus(file({ pipeline: 'ai-video', detail: { jobs } }))
    expect(unknownStages(s)).toEqual([])
  }
})

test('a waiting item keeps only buttons with a short label and exactly one of open or fill', () => {
  const s = parseStatus(file({ waiting: [{ id: 'f', text: 'check ep04', actions: [
    { label: 'play', open: '/v/ep04/final.mp4' },
    { label: 'send back', fill: 'ep04 final goes back because: ' },
    { label: 'both', open: '/v/a.mp4', fill: 'x' },
    { label: '', open: '/v/a.mp4' },
    { label: 'x'.repeat(25), open: '/v/a.mp4' },
    { label: 'empty', fill: '  ' },
    'junk',
  ] }] }))
  expect(s.waiting![0]!.actions).toEqual([
    { label: 'play', open: '/v/ep04/final.mp4' },
    { label: 'send back', fill: 'ep04 final goes back because: ' },
  ])
  // no buttons: no actions key at all, so an item reads as before
  expect(parseStatus(file({ waiting: [{ id: 'a', text: 'b', actions: 'no' }] })).waiting).toEqual([{ id: 'a', text: 'b' }])
  expect(parseActions(Array.from({ length: 9 }, (_, i) => ({ label: `f${i}`, fill: 'x' })))).toHaveLength(MAX_ACTIONS)
})

test('the pane opens only things to look at or listen to, by a full path', () => {
  for (const ok of ['/v/ep04.mp4', '~/Music/06/12.wav', '/v/batch 06/', '/p/board.PNG', '/d/a.pdf'])
    expect([ok, isOpenable(ok)]).toEqual([ok, true])
  for (const no of ['v/ep04.mp4', '/Applications/Calculator.app', '/Applications/Calculator.app/', '/x/run.command',
    '/x/a.app/Contents/Resources/icon.png', '/v/../etc/a.mp4', '/x/script.sh', '/x/page.html', '/x/a.mp4\0', '-a/x.mp4'])
    expect([no, isOpenable(no)]).toEqual([no, false])
})
