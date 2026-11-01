import { expect, mock, test } from 'claude-code/testing'

import { isWrapUp, KEEP_MS, KEEP_WAITING_MS, nameOf, parseConversation, plain, plainLine, recent, RUNNING_MS, shownState, wrapOf } from '../hooks/sessions'

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
  // a question waits two weeks; anything else leaves after three days; a fork never shows
  expect(recent(list, T).map(c => c.id)).toEqual(['w-new', 'w-old', 'w-long', 'run', 'done'])
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
})

const PANE = {
  plugin: 'puppy-console',
  component: 'Pane',
  requestId: 'puppy-console',
  props: { title: 'console', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const entry = (name: string, kind: 'file' | 'dir' = 'file') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })

test('the asking conversations come first, in "for you", with what each one asks', { options: { status_dir: '/s' } }, async ($, on) => {
  const files: Record<string, string> = {
    '/home/me/.claude/console/sessions/a.json': conv({ id: 'a', state: 'waiting', isAppTitle: true, title: 'console sessions', recap: 'Card added.', ask: 'Open a PR?' }),
    '/home/me/.claude/console/sessions/b.json': conv({ id: 'b', state: 'done', title: 'fix the bowl' }),
    '/home/me/.claude/console/sessions/c.json': conv({ id: 'x' }),   // name and id disagree: left out
    '/s/music.json': JSON.stringify({ format: 'pipeline-status', version: 1, pipeline: 'music', updated: new Date(T).toISOString(), state: 'waiting', headline: '05 · 42/70' }),
  }
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on, { now: T + 60_000 })
  on('fs.list', (_, e) => ({
    value: (e as { path: string }).path === '/home/me/.claude/console/sessions'
      ? ['a.json', 'b.json', 'c.json'].map(n => entry(n))
      : [entry('music.json')],
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

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.indexOf('conversations · 1')).toBeGreaterThan(-1)
    expect(texts.indexOf('conversations · 1')).toBeLessThan(texts.indexOf('music'))
    // one waits for you: the puppy sits (a picture on the desktop, its face on the terminal)
    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('the puppy sitting')
    else expect(texts.some(t => /ᴥ/.test(t ?? ''))).toBe(false)
    expect(texts.some(t => /→\s*Open a PR\?/.test(t ?? ''))).toBe(true)
    expect(texts).not.toContain('Card added.')
    // done ones fold behind "▸ done 1" until opened
    expect(texts.some(t => /fix the bowl/.test(t ?? ''))).toBe(false)
    expect((await ui.find({ key: 'show-done' }))?.text).toMatch(/^▸ done 1/)
    await ui.press({ key: 'show-done' })
    expect(await ui.find({ type: 'Text', text: /fix the bowl/ })).toBeTruthy()
    await ui.press({ key: 'show-done' })
    // a file whose id is not its name is left out, with a word
    expect(texts.some(t => /^x\b/.test(t ?? ''))).toBe(false)
    expect(texts.some(t => /skipped sessions\/c\.json/.test(t ?? ''))).toBe(true)
    await ui.unmount()
  }
})

const wrapUpCall = (input: Record<string, unknown>) =>
  ({ tool: 'mcp__ccd_turn__wrap_up', tool_use_id: 'w', ...input }) as Record<string, unknown>

test('a turn writes this conversation\'s own file: running, then where it stands', { options: { status_dir: '~/status' } }, async ($, on) => {
  const written: Record<string, string> = {}
  let id = 'abc'
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.list', () => ({ value: [] }))
  on('fs.read', (_, e) => {
    const text = written[(e as { path: string }).path]
    if (text == null) throw new Error('missing')
    return { value: text }
  })
  on('fs.write', (_, e) => { const { path, text } = e as { path: string; text: string }; written[path] = text; return { value: undefined } })
  on('session.id', () => ({ value: id }))
  let repo: object | null = { root: '/Users/me/dev/puppy-mods', remote: null, internal: false, name: null }
  on('session.repo', () => ({ value: repo as never }))
  on('session.messages', () => ({ value: [user('<system-reminder>x</system-reminder>add the card')] as never }))
  on('tool.call', () => ({ result: null }) as never)
  on('command.register', () => ({ value: { command: 'console' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const file = () => parseConversation(written[`/home/me/.claude/console/sessions/${id}.json`]!)

  await $.turn.start({ text: 'add the card', turnId: 't1' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'running', title: 'add the card', project: 'puppy-mods', recap: '' })

  await $.tool.call(wrapUpCall({ recap: 'Card added.', ask: 'Open a PR?' }) as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'waiting', recap: 'Card added.', ask: 'Open a PR?' })

  // the next turn starts: running, still saying where it stood
  await $.turn.start({ text: 'yes', turnId: 't2' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'running', recap: 'Card added.', ask: null })

  // a turn with no wrap_up of its own keeps the last wrap_up's recap, never its question
  await $.turn.complete({ answer: 'Pushed.\nmore', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'done', recap: 'Card added.', ask: null })

  // a subagent's wrap_up and turns are not this conversation's
  await $.tool.call({ ...wrapUpCall({ recap: 'sub', ask: 'sub?' }), agentId: 'sub' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer', agentId: 'sub' })
  await clock.settle()
  expect(file()).toMatchObject({ state: 'done', recap: 'Card added.' })

  // /clear: a new id, a new file, nothing carried over; outside any repository, no project
  id = 'def'
  repo = null
  await $.turn.start({ text: 'new topic', turnId: 't4' })
  await clock.settle()
  expect(file()).toMatchObject({ id: 'def', state: 'running', recap: '' })
  expect(file().project).toBeUndefined()
})

test('conversations off: nothing is written and no card is drawn', { options: { status_dir: '/s', conversations: 'off' } }, async ($, on) => {
  let writes = 0
  const lists: string[] = []
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.list', (_, e) => { lists.push((e as { path: string }).path); return { value: [] } })
  on('fs.write', () => { writes++; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'console' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'hi', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(writes).toBe(0)
  expect(lists.some(p => p.includes('.claude/console'))).toBe(false)
})

test('with no status folder set, the running conversation still shows, below the error', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on, { now: T + 60_000 })
  on('fs.list', (_, e) => ({ value: (e as { path: string }).path.endsWith('sessions') ? [entry('a.json')] : [] }))
  on('fs.read', () => ({ value: conv({ id: 'a', state: 'running', title: 'busy one' }) }))
  on('command.register', () => ({ value: { command: 'console' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'console', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text).toBe('console opened.')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  const running = texts.findIndex(t => /^· busy one/.test(t))
  expect(running).toBeGreaterThan(texts.findIndex(t => /no status folder set/.test(t)))
  expect(texts.findIndex(t => /no status folder set/.test(t))).toBeGreaterThan(-1)
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('the puppy typing at its laptop')
  await ui.unmount()
})
