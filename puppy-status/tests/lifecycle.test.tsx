import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseConversation } from '../hooks/sessions'

const T = Date.parse('2026-10-30T12:00:00.000Z')
const user = (text: string) => ({ role: 'user' as const, text, toolUses: [] })
const wrapUpCall = (input: Record<string, unknown>) =>
  ({ tool: 'mcp__ccd_turn__wrap_up', tool_use_id: 'w', ...input }) as Record<string, unknown>
const answer = (turnId: string, text = 'ok') => ({ answer: text, durationMs: 1, isAborted: false, turnId, reason: 'answer' as const })

// One conversation's engine: its id (changeable), the files it writes, the pushes it sends and
// the permission verdict for PushNotification.
function conversation(on: On, env: Record<string, string> = {}) {
  const w = {
    id: 'abc',
    written: {} as Record<string, string>,
    pushes: [] as string[],
    verdict: 'allow' as 'allow' | 'ask' | 'deny',
    isWriteBroken: false,
    // what the transcript holds when the file is first written
    messages: [user('add the card')],
    // while set, a write waits for it: the queue is held
    gate: null as Promise<void> | null,
    // $.store, and a hold on a question card's call until the test answers it
    store: new Map<string, unknown>(),
    // a file's time by path (default: now)
    mtimes: {} as Record<string, number>,
    // a read of this path waits until `until`
    readHold: null as { path: string; until: Promise<void> } | null,
    hold: null as ((tool: string) => Promise<void> | null) | null,
  }
  mock.env(on, { HOME: '/home/me', ...env })
  const clock = mock.clock(on, { now: T })
  on('fs.list', (_, e) => {
    const dir = `${e.path}/`
    const names = Object.keys(w.written).filter(p => p.startsWith(dir) && !p.slice(dir.length).includes('/')).map(p => p.slice(dir.length))
    if (!names.length) return { deny: 'ENOENT: no such file or directory' }
    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: w.mtimes[`${dir}${name}`] ?? T, isLink: false })) }
  })
  on('fs.read', async (_, e) => {
    if (w.readHold?.path === e.path) await w.readHold.until
    const text = w.written[e.path]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
  on('fs.exists', (_, e) => ({ value: e.path in w.written }))
  on('fs.write', async (_, e) => {
    if (w.gate) await w.gate
    if (w.isWriteBroken) throw new Error('EACCES: permission denied')
    w.written[e.path] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: w.id }))
  on('session.repo', () => ({ value: null as never }))
  on('session.messages', () => ({ value: w.messages as never }))
  on('tool.check', () => ({ decision: w.verdict }) as never)
  on('tool.call', async (_, e) => {
    const call = e as unknown as { tool: string; message?: string }
    const held = w.hold?.(call.tool)
    if (held) await held
    if (call.tool === 'PushNotification') w.pushes.push(call.message ?? '')
    return { result: null } as never
  })
  on('classic.SessionStart', () => ({}) as never)
  on('classic.UserPromptSubmit', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'my-status' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'puppy-status', title: 'status', isShown: true, isFocused: false, isPlaced: true }] }))
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('store.get', (_, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_, e) => { w.store.set(e.key, e.value); return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const file = () => parseConversation(w.written[`/home/me/.claude/puppy-status/${w.id}.json`]!)
  return { w, clock, file }
}

test('the name is the app\'s own title once the app gives one; a waiting turn sends a push', async ($, on) => {
  const { w, clock, file } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'startup', session_id: 'abc' })

  // no title yet: the first thing typed
  await $.turn.start({ text: 'add the card', turnId: 't1' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'running', title: 'add the card' })
  expect(file().isAppTitle).toBeUndefined()

  // the app has named it: the next prompt carries the title
  await $.classic.UserPromptSubmit({ prompt: 'yes', session_id: 'abc', session_title: '對話儀表板 -> /console' })
  await $.turn.start({ text: 'yes', turnId: 't2' })
  await clock.settle()
  expect(file()).toMatchObject({ title: '對話儀表板 -> /console', isAppTitle: true })

  // it stops to ask: waiting, and a push names the conversation and the question
  await $.tool.call(wrapUpCall({ recap: 'Card added.', ask: 'Open a PR?' }) as never)
  await $.turn.complete(answer('t2'))
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting', ask: 'Open a PR?' })
  expect(w.pushes).toEqual(['對話儀表板 -> /console · Open a PR?'])

  // a turn that ends done sends nothing
  await $.turn.start({ text: 'ok', turnId: 't3' })
  await $.turn.complete(answer('t3', 'Pushed.'))
  await clock.settle()
  expect(w.pushes).toHaveLength(1)

  // the permission check does not allow it: no push, and no dialog is opened
  w.verdict = 'ask'
  await $.turn.start({ text: 'again', turnId: 't4' })
  await $.tool.call(wrapUpCall({ recap: 'Ready.', ask: 'Merge?' }) as never)
  await $.turn.complete(answer('t4'))
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting', ask: 'Merge?' })
  expect(w.pushes).toHaveLength(1)
})

test('push off: no push, the card still says it waits', { options: { push: 'off' } }, async ($, on) => {
  const { w, clock, file } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'add the card', turnId: 't1' })
  await $.tool.call(wrapUpCall({ recap: 'Card added.', ask: 'Open a PR?' }) as never)
  await $.turn.complete(answer('t1'))
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting' })
  expect(w.pushes).toEqual([])
})

test('a fork is marked and listed like any other: it pushes, and its first turn keeps its own title', async ($, on) => {
  const { w, clock, file } = conversation(on)
  w.id = 'f1'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'fork', session_id: 'f1', session_title: '再試一次 refresh' })
  await $.turn.start({ text: '是指那個refresh嗎', turnId: 't1' })
  await $.tool.call(wrapUpCall({ recap: 'Yes.', ask: 'Anything else?' }) as never)
  await $.turn.complete(answer('t1'))
  await clock.settle()
  expect(file()).toMatchObject({ source: 'fork', state: 'waiting', title: '再試一次 refresh' })
  expect(file().isFork).toBeUndefined()
  expect(w.pushes).toEqual(['再試一次 refresh · Anything else?'])
})

// A conversation another one started (the desktop app's start_session): it opens with the app's
// brief, often as a fork carrying the other one's messages. Before 0.13 it was hidden as a fork.
const brief = '<system-reminder>x</system-reminder>\n\nBackground (from the session that started this one):\n主控模式…\n\nTask:\n任務 ID：T172（主控派工）。共用規則：…'

test('a dispatched conversation is marked by its brief, carries its task id, and pushes', async ($, on) => {
  const { w, clock, file } = conversation(on, { CLAUDE_CODE_ACCOUNT_UUID: 'acct-1', CLAUDE_CODE_ORGANIZATION_UUID: 'org-1', CLAUDE_CODE_HOST_SESSION_ID: 'local_d1-host' })
  w.id = 'd1'
  w.messages = [user('the other one\'s first prompt')]
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'fork', session_id: 'd1' })
  await $.turn.start({ text: brief, turnId: 't1' })
  await clock.settle()
  expect(file()).toMatchObject({ source: 'dispatched', task: 'T172', appSession: 'acct-1/org-1/local_d1-host' })
  // the brief names nothing: the copied messages' first prompt does not either
  expect(file().title).toBe('the other one\'s first prompt')

  // the app names it; the task stays, and the source is not lost to the fork
  await $.classic.UserPromptSubmit({ prompt: 'go', session_id: 'd1', session_title: 'puppy-sessions 改版' })
  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.tool.call(wrapUpCall({ recap: 'PR opened.', ask: 'Merge?' }) as never)
  await $.turn.complete(answer('t2'))
  await clock.settle()
  expect(file()).toMatchObject({ source: 'dispatched', task: 'T172', title: 'puppy-sessions 改版', state: 'waiting' })
  expect(w.pushes).toEqual(['T172 puppy-sessions 改版 · Merge?'])
})

test('a question card in the middle of a turn waits for you while it is up, then the turn runs on', async ($, on) => {
  const { w, clock, file } = conversation(on)
  let answerIt = () => {}
  // the engine's own AskUserQuestion: the call comes back once you answer
  w.hold = tool => (tool === 'AskUserQuestion' || tool.endsWith('start_session') ? new Promise<void>(resolve => { answerIt = resolve }) : null)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'plan it', turnId: 't1' })
  await clock.settle()

  const asked = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [{ question: '要用哪個名字？', header: 'Name', options: [] }] } as never)
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting', ask: '要用哪個名字？' })
  expect(w.pushes).toEqual(['plan it · 要用哪個名字？'])
  answerIt()
  await asked
  await clock.settle()
  expect(file()).toMatchObject({ state: 'running', ask: null })

  // an offer of a new session waits too; a session the model just starts does not
  const offered = $.tool.call({ tool: 'mcp__ccd_session__start_session', tool_use_id: 'o1', initiation: 'offer', title: 'Fix the docs' } as never)
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting', ask: '要開新對話嗎：Fix the docs' })
  answerIt()
  await offered
  await clock.settle()
  expect(file().state).toBe('running')

  // a subagent's question is the subagent's: the file keeps running
  const sub = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q2', agentId: 'sub', questions: [{ question: 'sub?' }] } as never)
  await clock.settle()
  expect(file().state).toBe('running')
  answerIt()
  await sub
})

// What the desktop app really does for a side chat (read off its transcripts): it copies the
// other conversation's messages into a new session that does not start as a fork, names it
// "Side chat", then "btw: <the question>".
const copied = [user('@"/Users/me/Library/Messages/Attachments/b9/09/1EBA/平假名配圖總表_A4.pdf"\n\n<pasted_content id="33be">\nそれなら…\n</pasted_content>'), user('ラーメンの教材にして')]

test('a side chat is marked by the app\'s name for it, not only by a fork, and never pushed', async ($, on) => {
  const { w, clock, file } = conversation(on)
  w.id = 's1'
  w.messages = [...copied, user('評分的是誰')]
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', session_id: 's1', session_title: 'Side chat' })
  await $.classic.UserPromptSubmit({ prompt: '評分的是誰', session_id: 's1', session_title: 'btw: 評分的是誰' })
  await $.turn.start({ text: '評分的是誰', turnId: 't1' })
  await $.tool.call(wrapUpCall({ recap: 'The judge model.', ask: 'Change it?' }) as never)
  await $.turn.complete(answer('t1'))
  await clock.settle()
  expect(file()).toMatchObject({ source: 'side', state: 'waiting', title: 'btw: 評分的是誰' })
  expect(w.pushes).toEqual([])
})

test('a conversation on copied messages is named by its own prompt, never the copied first one', async ($, on) => {
  const { w, clock, file } = conversation(on)
  w.id = 's2'
  w.messages = [...copied, user('不過之前其他對話我也沒有看過這個')]
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: '不過之前其他對話我也沒有看過這個', turnId: 't1' })
  await clock.settle()
  expect(file().title).toBe('不過之前其他對話我也沒有看過這個')
})

test('the session ends: a running turn is done; an exit keeps the question, a /clear drops it', async ($, on) => {
  const { clock, file } = conversation(on)
  const end = (reason: 'other' | 'clear') => $.session.end({ reason, sessionId: 'abc', resume: { id: 'abc' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.turn.start({ text: 'long job', turnId: 't1' })
  await clock.settle()
  expect(file().state).toBe('running')
  await end('other')
  expect(file().state).toBe('done')

  await $.turn.start({ text: 'ask me', turnId: 't2' })
  await $.tool.call(wrapUpCall({ recap: 'Ready.', ask: 'Merge?' }) as never)
  await $.turn.complete(answer('t2'))
  await clock.settle()
  await end('other')
  expect(file()).toMatchObject({ state: 'waiting', ask: 'Merge?' })

  await end('clear')
  expect(file()).toMatchObject({ state: 'done', ask: null })
})

test('with no wrap_up ever (the terminal), the recap is a plain line of the answer, without markdown', async ($, on) => {
  const { clock, file } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete(answer('t1', '## **Pushed** to `main`\nmore'))
  await clock.settle()
  expect(file().recap).toBe('Pushed to main')
  await $.turn.start({ text: 'go on', turnId: 't2' })
  await $.turn.complete(answer('t2', 'Merged.'))
  await clock.settle()
  expect(file().recap).toBe('Merged.')
})

test('a turn that ends on an error or a refusal is an error', async ($, on) => {
  const { clock, file } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const reason of ['error', 'refusal'] as const) {
    await $.turn.start({ text: 'go', turnId: `t-${reason}` })
    await $.tool.call(wrapUpCall({ recap: 'Hmm.', ask: 'Retry?' }) as never)
    await $.turn.complete({ ...answer(`t-${reason}`), reason } as never)
    await clock.settle()
    expect(file().state).toBe('error')
  }
})

test('a subagent\'s wrap_up is not this conversation\'s', async ($, on) => {
  const { clock, file } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ ...wrapUpCall({ recap: 'sub', ask: 'sub?' }), agentId: 'sub' } as never)
  await $.turn.complete(answer('t1', 'Main done.'))
  await clock.settle()
  expect(file()).toMatchObject({ state: 'done', recap: 'Main done.', ask: null })
})

test('a /clear between the turn and its write keeps the recap in the old file', async ($, on) => {
  const { w, clock } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  // the queue is held; the recap is queued with id abc; the id changes before the queue reaches it
  let release = () => {}
  w.gate = new Promise<void>(resolve => { release = resolve })
  await $.turn.start({ text: 'go on', turnId: 't2' })
  await $.turn.complete(answer('t2', 'Old topic done.'))
  w.id = 'def'
  w.gate = null
  release()
  await clock.settle()
  expect(parseConversation(w.written['/home/me/.claude/puppy-status/abc.json']!).recap).toBe('Old topic done.')
  expect(w.written['/home/me/.claude/puppy-status/def.json']).toBeUndefined()
})

const PANE = {
  plugin: 'puppy-status', component: 'Pane', requestId: 'puppy-status', surface: 'terminal',
  props: { title: 'status', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const RUN = { command: 'my-status', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

test('a write that fails is said in this conversation\'s pane, and the next good one clears it', async ($, on) => {
  const { w, clock } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN)
  w.isWriteBroken = true
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  let ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /^這個對話寫不進自己的檔：/ })).toBeTruthy()
  await ui.unmount()
  w.isWriteBroken = false
  await $.turn.complete(answer('t1'))
  await clock.settle()
  ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /寫不進自己的檔/ })).toBeFalsy()
  await ui.unmount()
})

test('puppy-console\'s old files are copied over once; the ones already here are kept; the old folder stays', async ($, on) => {
  const { w, clock } = conversation(on)
  const stored = w.store
  const old = '/home/me/.claude/console/sessions'
  w.written[`${old}/a.json`] = 'old a'
  w.written[`${old}/b.json`] = 'old b'
  w.written['/home/me/.claude/puppy-status/b.json'] = 'new b'
  // older than two weeks: never shown, so not copied
  w.written[`${old}/z.json`] = 'old z'
  w.mtimes[`${old}/z.json`] = T - 15 * 24 * 3_600_000
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(w.written['/home/me/.claude/puppy-status/a.json']).toBe('old a')
  expect(w.written['/home/me/.claude/puppy-status/b.json']).toBe('new b')
  expect(w.written['/home/me/.claude/puppy-status/z.json']).toBeUndefined()
  expect(w.written[`${old}/a.json`]).toBe('old a')
  expect(stored.get('migrated:puppy-sessions')).toBe(true)

  // once done, never again: a file the old mod writes later stays where it is
  w.written[`${old}/c.json`] = 'old c'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(w.written['/home/me/.claude/puppy-status/c.json']).toBeUndefined()
})

test('puppy-sessions\' files are copied first; puppy-console\'s fill in only the names puppy-sessions did not have', async ($, on) => {
  const { w, clock } = conversation(on)
  const sessions = '/home/me/.claude/puppy-sessions'
  const consoleDir = '/home/me/.claude/console/sessions'
  w.written[`${sessions}/a.json`] = 'sessions a'
  w.written[`${consoleDir}/a.json`] = 'console a'
  w.written[`${consoleDir}/b.json`] = 'console b'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(w.written['/home/me/.claude/puppy-status/a.json']).toBe('sessions a')
  expect(w.written['/home/me/.claude/puppy-status/b.json']).toBe('console b')
  // both old folders stay as they were
  expect(w.written[`${sessions}/a.json`]).toBe('sessions a')
  expect(w.store.get('migrated:puppy-sessions')).toBe(true)
})

test('a copy that fails is said in the pane and tried again at the next start', async ($, on) => {
  const { w, clock } = conversation(on)
  w.written['/home/me/.claude/puppy-sessions/a.json'] = 'sessions a'
  w.isWriteBroken = true
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(w.store.get('migrated:puppy-sessions')).toBeUndefined()
  let ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /^舊名的對話檔沒搬完，下次啟動再試：/ })).toBeTruthy()
  await ui.unmount()
  w.isWriteBroken = false
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(w.written['/home/me/.claude/puppy-status/a.json']).toBe('sessions a')
  expect(w.store.get('migrated:puppy-sessions')).toBe(true)
  ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /沒搬完/ })).toBeFalsy()
  await ui.unmount()
})

test('no old folder: nothing to copy, and it counts as done', async ($, on) => {
  const { w, clock } = conversation(on)
  const stored = w.store
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(stored.get('migrated:puppy-sessions')).toBe(true)
})

test('Codex #2: a conversation\'s first write waits for the copy, and the copy never writes over it', async ($, on) => {
  const { w, clock, file } = conversation(on)
  w.id = 'a'
  const old = '/home/me/.claude/console/sessions'
  w.written[`${old}/a.json`] = JSON.stringify({ format: 'session-status', version: 1, id: 'a', updated: new Date(T - 60_000).toISOString(), state: 'waiting', title: 'old', recap: 'Old recap.', ask: 'Old?' })
  // the old file's read is held: the turn's own write is queued meanwhile
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  w.readHold = { path: `${old}/a.json`, until: held }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'new topic', turnId: 't1' })
  // everything else settles first: the turn's write has had its chance before the copy goes on
  await clock.settle()
  release()
  await clock.settle()
  // the copied file came first, then this turn wrote over it: running, its own prompt
  expect(file()).toMatchObject({ state: 'running', ask: null })
})
