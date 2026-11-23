import { expect, test } from 'claude-code/testing'

import { cleanPrompt, firstSentence, idle, IDLE_MS, isBrief, isWrapUp, KEEP_MS, KEEP_WAITING_MS, merged, nameOf, parseConversation, plain, plainLine, questionOf, recent, rowName, RUNNING_MS, shownState, sourceOf, stateWord, taskOf, wrapOf } from '../hooks/sessions'
import { claudeLimits, codexLimits, limitText, resetText } from '../hooks/usage'

const T = Date.parse('2026-10-27T12:00:00.000Z')
const user = (text: string) => ({ role: 'user' as const, text, toolUses: [] })
const results = { role: 'user' as const, text: '', toolUses: [], toolResults: [{}] }
const said = (text: string, ...toolUses: { tool: string; input: Record<string, unknown> }[]) =>
  ({ role: 'assistant' as const, text, toolUses })
const wrapUp = (input: Record<string, unknown>) => ({ tool: 'mcp__ccd_turn__wrap_up', input })
const conv = (over: object) => JSON.stringify({
  format: 'session-status', version: 1, id: 'a', updated: new Date(T).toISOString(),
  state: 'done', title: 'fix the bowl', recap: 'done.', ask: null, ...over,
})

test('the name is the first thing the person typed, without the app\'s tags', () => {
  const first = '<system-reminder>\nrules\n</system-reminder><command-name>/todo</command-name>\n\n我想到一個就是 console 裡放對話摘要'
  expect(plain(first)).toBe('我想到一個就是 console 裡放對話摘要')
  expect(nameOf([user(first), said('ok'), user('next')])).toBe('我想到一個就是 console 裡放對話摘要')
  expect(nameOf([])).toBe('new conversation')
  expect([...nameOf([user('x'.repeat(200))])]).toHaveLength(60)
  // a message carrying only tool results is not something typed
  expect(nameOf([{ ...results, text: 'tool output' }, user('the real one')])).toBe('the real one')
  // the app's own openers (a compaction summary, another conversation's brief) are skipped
  const summary = 'This session is being continued from a previous conversation that ran out of context.'
  const brief = '<system-reminder>x</system-reminder>\n\nBackground (from the session that started this one):\n背景：…'
  expect(nameOf([user(summary), user(brief), user('看一下 console')])).toBe('看一下 console')
  expect(nameOf([user(summary)])).toBe('new conversation')
})

test('an attached file names a conversation by its file name, never its path', () => {
  const attached = '@"/Users/me/Library/Messages/Attachments/b9/09/1EBA/平假名配圖總表_A4.pdf"\n\n<pasted_content id="33be">\nそれなら…\n</pasted_content>'
  expect(nameOf([user(attached)])).toBe('平假名配圖總表_A4.pdf')
  expect(nameOf([user('@"/Users/me/dev/app/SPEC.md" 這跟 spec 有什麼不同')])).toBe('SPEC.md 這跟 spec 有什麼不同')
  expect(nameOf([user('看一下 @src/app.ts 和 @docs/a.md')])).toBe('看一下 app.ts 和 a.md')
  // an @ inside a link is not a file
  expect(nameOf([user('https://www.threads.com/@mason/post/1 這類')])).toBe('https://www.threads.com/@mason/post/1 這類')
})

test('a reply line loses its markdown marks', () => {
  expect(plainLine('## Done\nmore', 200)).toBe('Done')
  expect(plainLine('**Card added** to `register.tsx`', 200)).toBe('Card added to register.tsx')
  expect(plainLine('```ts\ncode\n```', 200)).toBe('code')
  expect(plainLine('- see [the PR](https://x)', 200)).toBe('see the PR')
})

test('a wrap_up gives the recap and the question', () => {
  expect(isWrapUp('mcp__ccd_turn__wrap_up')).toBe(true)
  expect(isWrapUp('wrap_up_notes')).toBe(false)
  expect(wrapOf({ recap: 'Card added.\nmore', ask: 'Open a PR?' })).toEqual({ recap: 'Card added.', ask: 'Open a PR?' })
  expect(wrapOf({ recap: 'Done.' })).toEqual({ recap: 'Done.', ask: null })
  expect(wrapOf({ ask: 'x?' })).toBeNull()
})

test('a conversation file parses; a wrong one throws', () => {
  expect(parseConversation(conv({ ask: 'PR?', project: 'puppy-mods' }))).toMatchObject({ id: 'a', ask: 'PR?', project: 'puppy-mods' })
  // read back after a reload, the file still says its recap is a wrap_up's, so a later turn keeps it
  expect(parseConversation(conv({ isWrapRecap: true })).isWrapRecap).toBe(true)
  expect(parseConversation(conv({})).isWrapRecap).toBeUndefined()
  expect(() => parseConversation(conv({ format: 'pipeline-status' }))).toThrow()
  expect(() => parseConversation(conv({ state: 'busy' }))).toThrow()
  expect(() => parseConversation('{')).toThrow()
})

test('waiting first, newest first; old ones leave; a forgotten "running" is done', () => {
  const at = (ms: number) => new Date(T - ms).toISOString()
  const list = [
    parseConversation(conv({ id: 'done', state: 'done', updated: at(60_000) })),
    parseConversation(conv({ id: 'w-old', state: 'waiting', updated: at(3_600_000) })),
    parseConversation(conv({ id: 'w-new', state: 'waiting', updated: at(120_000) })),
    parseConversation(conv({ id: 'w-long', state: 'waiting', updated: at(KEEP_MS + 1) })),
    parseConversation(conv({ id: 'gone', state: 'waiting', updated: at(KEEP_WAITING_MS + 1) })),
    parseConversation(conv({ id: 'old-done', state: 'done', updated: at(KEEP_MS + 1) })),
    parseConversation(conv({ id: 'fork', state: 'waiting', isFork: true, updated: at(1_000) })),
    parseConversation(conv({ id: 'run', state: 'running', updated: at(30_000) })),
  ]
  // a question waits two weeks; anything else leaves after three days; a fork shows (0.12 hid it)
  expect(recent(list, T).map(c => c.id)).toEqual(['fork', 'w-new', 'w-old', 'w-long', 'run', 'done'])
  expect(shownState(parseConversation(conv({ state: 'running', updated: at(RUNNING_MS + 1) })), T)).toBe('done')

  // a side chat the app named, from a file written before side chats were marked, never shows;
  // a person who types "btw:" themselves is not one
  const sides = [
    parseConversation(conv({ id: 'btw', title: 'btw: 這是什麼', isAppTitle: true })),
    parseConversation(conv({ id: 'side', title: 'Side chat', isAppTitle: true })),
    parseConversation(conv({ id: 'typed', title: 'btw: 我自己打的' })),
  ]
  expect(recent(sides, T).map(c => c.id)).toEqual(['typed'])
  expect(shownState(parseConversation(conv({ state: 'running', updated: at(RUNNING_MS - 1) })), T)).toBe('running')
  // the fallback is for a crash, hours away, never a guess at a long turn: five hours in is still running
  expect(shownState(parseConversation(conv({ state: 'running', updated: at(5 * 3_600_000) })), T)).toBe('running')
  expect(shownState(parseConversation(conv({ state: 'running', updated: at(7 * 3_600_000) })), T)).toBe('done')
})


test('how a conversation began: a side chat by the app\'s name, an older file\'s isFork as a fork', () => {
  expect(sourceOf(parseConversation(conv({ isFork: true })))).toBe('fork')
  expect(sourceOf(parseConversation(conv({ isFork: true, isAppTitle: true, title: 'btw: x' })))).toBe('side')
  expect(sourceOf(parseConversation(conv({ source: 'dispatched' })))).toBe('dispatched')
  expect(sourceOf(parseConversation(conv({ source: 'nonsense' })))).toBeUndefined()
  expect(sourceOf(parseConversation(conv({})))).toBeUndefined()
  expect(isBrief('<system-reminder>x</system-reminder>\n\nBackground (from the session that started this one):\n…')).toBe(true)
  expect(isBrief('Background music ideas')).toBe(false)
})

test('the task id comes from a dispatch brief, else the title', () => {
  expect(taskOf('任務 ID：T172（主控派工）。')).toBe('T172')
  expect(taskOf('Task ID: t45')).toBe('T45')
  expect(taskOf('T170 todo format')).toBe('T170')
  expect(taskOf('t172-puppy-sessions')).toBe('T172')
  // not inside a word or a longer name
  expect(taskOf('AT172 or GPT-4T')).toBeUndefined()
  expect(taskOf('fix the bowl')).toBeUndefined()
  expect(rowName(parseConversation(conv({ task: 'T172', title: 'puppy-sessions 改版', isAppTitle: true })))).toBe('T172 puppy-sessions 改版')
  expect(rowName(parseConversation(conv({ task: 'T172', title: 'T172 改版', isAppTitle: true })))).toBe('T172 改版')
})

test('an appSession is three plain names, never a path out of the app\'s folder', () => {
  expect(parseConversation(conv({ appSession: 'acct/org/local_ab-12' })).appSession).toBe('acct/org/local_ab-12')
  expect(parseConversation(conv({ appSession: '../../etc/passwd' })).appSession).toBeUndefined()
  expect(parseConversation(conv({ appSession: 'a/b/c' })).appSession).toBeUndefined()
})

test('files of one task, or of one app session, are one row: the one that waits, else the newest', () => {
  const at = (ms: number) => new Date(T - ms).toISOString()
  const list = [
    parseConversation(conv({ id: 't-old', task: 'T9', state: 'waiting', ask: 'Merge?', updated: at(3 * 3_600_000) })),
    parseConversation(conv({ id: 't-new', task: 'T9', state: 'done', updated: at(60_000) })),
    parseConversation(conv({ id: 'app-1', appSession: 'a/o/local_x', state: 'done', updated: at(2 * 3_600_000) })),
    parseConversation(conv({ id: 'app-2', appSession: 'a/o/local_x', state: 'running', updated: at(60_000) })),
    parseConversation(conv({ id: 'alone', state: 'done', updated: at(1000) })),
  ]
  expect(merged(list, T).map(c => c.id).sort()).toEqual(['alone', 'app-2', 't-old'])
  expect(recent(list, T).map(c => c.id)).toEqual(['t-old', 'app-2', 'alone'])
})

test('a row\'s state word: running, done within the hour, then idle; and a recap\'s first sentence', () => {
  const at = (ms: number) => new Date(T - ms).toISOString()
  expect(stateWord(parseConversation(conv({ state: 'running', updated: at(60_000) })), T)).toBe('跑中')
  expect(stateWord(parseConversation(conv({ state: 'done', updated: at(30 * 60_000) })), T)).toBe('做完')
  expect(stateWord(parseConversation(conv({ state: 'done', updated: at(2 * 3_600_000) })), T)).toBe('閒著')
  expect(stateWord(parseConversation(conv({ state: 'error' })), T)).toBe('出錯')
  expect(firstSentence('PR #12 已開。測試全過。')).toBe('PR #12 已開。')
  expect(firstSentence('Card added. Tests pass.')).toBe('Card added.')
  expect(firstSentence('v1.2 shipped')).toBe('v1.2 shipped')
})

test('the ones that may be archived: done, a day untouched, from the desktop app, no side chats', () => {
  const at = (ms: number) => new Date(T - ms).toISOString()
  const app = (id: string) => `a/o/local_${id}`
  const list = [
    parseConversation(conv({ id: 'old', appSession: app('old'), state: 'done', updated: at(3 * IDLE_MS) })),
    parseConversation(conv({ id: 'idle', appSession: app('idle'), state: 'done', updated: at(IDLE_MS + 1) })),
    parseConversation(conv({ id: 'fresh', appSession: app('fresh'), state: 'done', updated: at(IDLE_MS - 1) })),
    parseConversation(conv({ id: 'asks', appSession: app('asks'), state: 'waiting', updated: at(3 * IDLE_MS) })),
    parseConversation(conv({ id: 'term', state: 'done', updated: at(3 * IDLE_MS) })),
    parseConversation(conv({ id: 'side', appSession: app('side'), isAppTitle: true, title: 'Side chat', state: 'done', updated: at(3 * IDLE_MS) })),
  ]
  const ones = idle(list, T)
  expect(ones.map(c => c.id)).toEqual(['old', 'idle'])
  expect(cleanPrompt(ones)).toBe('請封存這些對話：fix the bowl（local_old）、fix the bowl（local_idle）；動手前先列給我確認。')
})

test('a question card: AskUserQuestion, a plan to approve, an offer of a session; nothing else', () => {
  expect(questionOf({ tool: 'AskUserQuestion', questions: [{ question: '用哪個？' }, { question: '第二題' }] })).toBe('用哪個？')
  expect(questionOf({ tool: 'AskUserQuestion' })).toBe('有問題要問你')
  expect(questionOf({ tool: 'ExitPlanMode', plan: 'x' })).toBe('計畫要你核准')
  expect(questionOf({ tool: 'mcp__ccd_session__start_session', initiation: 'offer', title: 'Docs' })).toBe('要開新對話嗎：Docs')
  expect(questionOf({ tool: 'mcp__ccd_session__start_session', initiation: 'user_asked', title: 'Docs' })).toBeNull()
  expect(questionOf({ tool: 'Bash', command: 'ls' })).toBeNull()
})

test('Claude\'s windows and Codex\'s newest reading', () => {
  expect(claudeLimits([{ kind: 'five_hour', percentUsed: 42.5, resetsAt: new Date(T + 3_600_000).toISOString() }, { kind: 'spend_limit', percentUsed: 7 }]))
    .toEqual([{ label: '5 小時', percent: 42.5, resetsAt: T + 3_600_000 }, { label: 'spend_limit', percent: 7 }])
  const line = (pct: number, at: string) => JSON.stringify({ timestamp: at, type: 'event_msg', payload: { type: 'token_count', rate_limits: {
    limit_id: 'codex', primary: { used_percent: pct, window_minutes: 300, resets_at: (T + 3_600_000) / 1000 }, secondary: { used_percent: 98, window_minutes: 10080, resets_at: (T + 3 * 86_400_000) / 1000 },
  } } })
  // the tail starts mid-line; the newest reading wins; a line with no windows is passed over
  const tail = ['ount":3}}', line(10, '2026-10-27T10:00:00Z'), line(22, '2026-10-27T11:00:00Z'), '{"payload":{"rate_limits":null}}', '{"type":"other"}'].join('\n')
  expect(codexLimits(tail)).toEqual({
    readAt: Date.parse('2026-10-27T11:00:00Z'),
    limits: [{ label: '5 小時', percent: 22, resetsAt: T + 3_600_000 }, { label: '一週', percent: 98, resetsAt: T + 3 * 86_400_000 }],
  })
  expect(codexLimits('nothing here')).toBeNull()
})

test('a window resets: a time, a weekday, a date; past it, 已重置 in place of the number', () => {
  expect(resetText(undefined, T)).toBe('')
  expect(resetText(T - 1, T)).toBe('已重置')
  expect(resetText(T + 60_000, T)).toMatch(/^\d\d:\d\d 重置$/)
  expect(resetText(T + 3 * 86_400_000, T)).toMatch(/^週[日一二三四五六] \d\d:\d\d 重置$/)
  expect(resetText(T + 10 * 86_400_000, T)).toMatch(/^\d{1,2}\/\d{1,2} 重置$/)
  expect(limitText({ label: '一週', percent: 97.6, resetsAt: T - 1 }, T)).toBe('一週 已重置')
  expect(limitText({ label: '5 小時', percent: 41.6 }, T)).toBe('5 小時 42%')
})
