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
function conversation(on: On) {
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
  }
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.list', () => ({ value: [] }))
  on('fs.read', (_, e) => {
    const text = w.written[e.path]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
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
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; message?: string }
    if (call.tool === 'PushNotification') w.pushes.push(call.message ?? '')
    return { result: null } as never
  })
  on('classic.SessionStart', () => ({}) as never)
  on('classic.UserPromptSubmit', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'console' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'puppy-console', title: 'console', isShown: true, isFocused: false, isPlaced: true }] }))
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const file = () => parseConversation(w.written[`/home/me/.claude/console/sessions/${w.id}.json`]!)
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

test('a fork is marked, never pushed, and its first turn keeps its own title', async ($, on) => {
  const { w, clock, file } = conversation(on)
  w.id = 'f1'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'fork', session_id: 'f1', session_title: 'btw: 是指那個refresh嗎' })
  await $.turn.start({ text: '是指那個refresh嗎', turnId: 't1' })
  await $.tool.call(wrapUpCall({ recap: 'Yes.', ask: 'Anything else?' }) as never)
  await $.turn.complete(answer('t1'))
  await clock.settle()
  expect(file()).toMatchObject({ isFork: true, state: 'waiting', title: 'btw: 是指那個refresh嗎' })
  expect(w.pushes).toEqual([])
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
  expect(file()).toMatchObject({ isFork: true, state: 'waiting', title: 'btw: 評分的是誰' })
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
  expect(parseConversation(w.written['/home/me/.claude/console/sessions/abc.json']!).recap).toBe('Old topic done.')
  expect(w.written['/home/me/.claude/console/sessions/def.json']).toBeUndefined()
})

const PANE = {
  plugin: 'puppy-console', component: 'Pane', requestId: 'puppy-console', surface: 'terminal',
  props: { title: 'console', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('a write that fails is said in this conversation\'s pane, and the next good one clears it', { options: { status_dir: '/s' } }, async ($, on) => {
  const { w, clock } = conversation(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'console', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
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
