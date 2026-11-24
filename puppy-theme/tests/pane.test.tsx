import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { ThemeSetArgs } from 'claude-code'


const PANE = {
  plugin: 'puppy-theme',
  component: 'Pane',
  requestId: 'look',
  props: {
    title: 'look',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Stands for the engine: a store, a theme, a command and a pane.
const engine = (on: Parameters<TestBody>[1], stored: unknown) => {
  const store = new Map<string, unknown>(stored === undefined ? [] : [['prefs', stored]])
  const sets: ThemeSetArgs[] = []
  const logs: unknown[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('ui.log', (_, e) => {
    logs.push(e)
    return { value: undefined }
  })
  let clears = 0
  on('theme.clear', () => {
    clears += 1
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('clock.now', () => ({ value: new Date(2026, 10, 24, 12, 0).getTime() }))
  on('clock.every', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { store, sets, logs, clears: () => clears }
}

test('a session starts in what the pane kept', async ($, on) => {
  const { sets, logs } = engine(on, { wall: 'plain', messages: 'tape', cues: { tool: false } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]?.backdrop).toBeUndefined()
  expect(Object.keys(sets[0]?.sound?.cues ?? {})).not.toContain('tool')
  expect(sets[0]?.style?.UserMessage).toHaveLength(2)
  expect(logs).toEqual([])
})

test('with nothing kept, a session starts with the default look (a day sky at noon)', async ($, on) => {
  const { sets } = engine(on, undefined)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets[0]?.backdrop).toMatchObject({ scene: 'puppy-sky-baibai-day-clear' })
})

test('a theme not drawn yet writes to the debug log only, not the chat', async ($, on) => {
  const logs: { text: string; to?: string }[] = []
  on('store.get', () => ({ value: undefined }))
  on('ui.log', (_, e) => {
    logs.push(e)
    return { value: undefined }
  })
  on('theme.set', () => ({ value: { isDrawn: false as const, reason: 'no attached desktop client yet' } }))
  on('clock.now', () => ({ value: new Date(2026, 10, 24, 12, 0).getTime() }))
  on('clock.every', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const notDrawn = logs.filter(l => l.text.includes('not drawn'))
  expect(notDrawn).toHaveLength(1)
  expect(notDrawn[0]?.to).toBe('debug')
})

test('a build that refuses style or sound still gets colors and the backdrop', async ($, on) => {
  const sets: Record<string, unknown>[] = []
  const logs: unknown[] = []
  on('store.get', () => ({ value: undefined }))
  on('ui.log', (_, e) => {
    logs.push(e)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    if ('sound' in e) {
      throw new Error('sound is not taken here')
    }
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('clock.now', () => ({ value: new Date(2026, 10, 24, 12, 0).getTime() }))
  on('clock.every', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]).toHaveProperty('colors')
  expect(sets[0]).not.toHaveProperty('style')
  expect(sets[0]).toHaveProperty('backdrop')
  expect(JSON.stringify(logs)).toContain('colors only')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane has its cards and each press is kept and worn (${surface})`, async ($, on) => {
    const { store, sets } = engine(on, undefined)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const card of ['card-reset', 'card-colors', 'card-wall', 'card-messages', 'card-sounds']) {
      expect(await ui.find({ key: card })).toBeTruthy()
    }
    const note = await ui.find({ type: 'Text', text: /desktop app|this computer/ })
    expect(note?.text).toMatch(surface === 'terminal' ? /desktop app/ : /this computer/)

    await ui.press({ key: 'colors-eyecare' })
    await ui.press({ key: 'glass-frosted' })
    expect(sets.at(-1)?.backdrop).toMatchObject({ glass: { blur: 2, opacity: 0.05 } })
    await ui.press({ key: 'glass-clear' })
    expect(sets.at(-1)?.backdrop).toMatchObject({ glass: { blur: 0, opacity: 0.05 } })
    await ui.press({ key: 'wall-plain' })
    await ui.press({ key: 'messages-bookmark' })
    expect(sets.at(-1)?.style?.UserMessage).toMatchObject({ paddingY: 12 })
    await ui.press({ key: 'messages-app' })
    await ui.press({ key: 'cue-tool' })
    await ui.press({ key: 'sounds-rain' })

    expect(store.get('prefs')).toMatchObject({
      colors: 'eyecare',
      wall: 'plain',
      glass: false,
      messages: 'app',
      sounds: 'rain',
      cues: { tool: false, send: true },
    })
    const last = sets.at(-1)
    expect(last?.backdrop).toBeUndefined()
    expect(last?.style).toBeUndefined()
    expect(Object.keys(last?.sound?.cues ?? {})).not.toContain('tool')
    expect((await ui.find({ type: 'Text', text: /6 of 7/ }))?.text).toBe('rain · 6 of 7')
    expect(last?.sound?.cues?.send?.layers[0]).toMatchObject({ notes: ['E5', 'A5'] })
    await ui.unmount()
  })
}

test('the look turns off to the app\'s own and back, and reset brings the defaults', async ($, on) => {
  const { store, sets, clears } = engine(on, { wall: 'plain', messages: 'app', sounds: 'chip' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'card-reset' })).toBeTruthy()

  const before = sets.length
  await ui.press({ key: 'on' })
  expect(clears()).toBe(1)
  expect(sets.length).toBe(before)
  expect(store.get('prefs')).toMatchObject({ on: false, wall: 'plain', sounds: 'chip' })

  await ui.press({ key: 'reset' })
  expect(store.get('prefs')).toMatchObject({ on: true, colors: 'baibai', wall: 'sky', glass: false, messages: 'pixel', sounds: 'lofi' })
  expect(sets.at(-1)?.backdrop).toMatchObject({ scene: 'puppy-sky-baibai-day-clear' })
  await ui.unmount()
})

test('a session that kept the look off starts with no theme, and clears no other mod\'s', async ($, on) => {
  const { sets, clears } = engine(on, { on: false })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(0)
  expect(clears()).toBe(0)
})

test('an open session takes picks another session stored, and the sky follows the hour', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 10, 24, 16, 59, 50).getTime() })
  const store = new Map<string, unknown>()
  const sets: ThemeSetArgs[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('command.register', () => ({ value: { command: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]?.backdrop).toMatchObject({ scene: 'puppy-sky-baibai-day-clear' })

  // nothing changed: no new look
  await clock.advance(5_000)
  expect(sets).toHaveLength(1)

  // another session's /look stores the bookmark style
  store.set('prefs', { messages: 'bookmark' })
  await clock.advance(5_000)
  expect(sets).toHaveLength(2)
  expect(sets[1]?.style?.UserMessage).toMatchObject({ paddingY: 12 })

  // 17:00 is dusk
  await clock.advance(5_000)
  expect(sets.at(-1)?.backdrop).toMatchObject({ scene: 'puppy-sky-baibai-dusk-clear' })
})

// An engine with a clock that moves only when the test says, for the watch.
// themeSet may throw to refuse a look; stateSet, when given, runs before each
// write of the session's state (it may wait, or return a reason to refuse it), over a state kept here.
type Extra = { themeSet?: (e: ThemeSetArgs) => void; stateSet?: () => Promise<string | void> | string | void }
const watched = (on: Parameters<TestBody>[1], stored: unknown, at: Date, extra: Extra = {}) => {
  const clock = mock.clock(on, { now: at.getTime() })
  const store = new Map<string, unknown>(stored === undefined ? [] : [['prefs', stored]])
  const sets: ThemeSetArgs[] = []
  let clears = 0
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    extra.themeSet?.(e)
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('theme.clear', () => {
    clears += 1
    return { value: { isDrawn: false as const, reason: 'cleared' } }
  })
  if (extra.stateSet !== undefined) {
    const stateSet = extra.stateSet
    const state = new Map<string, { value: unknown; version: number }>()
    on('state.get', (_, e) => ({ value: state.get(`${e.plugin}/${e.key}`) ?? { value: undefined, version: 0 } }))
    on('state.set', async (_, e) => {
      const refused = await stateSet()
      if (typeof refused === 'string') return { deny: refused }
      const name = `${e.plugin}/${e.key}`
      const was = state.get(name) ?? { value: undefined, version: 0 }
      if (e.ifVersion !== undefined && e.ifVersion !== was.version) return { value: { isSet: false as const, version: was.version } }
      state.set(name, { value: e.value, version: was.version + 1 })
      return { value: { isSet: true as const, version: was.version + 1 } }
    })
  }
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { clock, store, sets, clears: () => clears }
}

test('with the look off, the hour crossing wears nothing and clears nothing', async ($, on) => {
  const { clock, sets, clears } = watched(on, { on: false }, new Date(2026, 10, 24, 16, 59, 50))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(15_000)
  expect(sets).toHaveLength(0)
  expect(clears()).toBe(0)
})

test('with the plain wall, the hour crossing wears nothing new', async ($, on) => {
  const { clock, sets } = watched(on, { wall: 'plain' }, new Date(2026, 10, 24, 16, 59, 50))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(15_000)
  expect(sets).toHaveLength(1)
})

test('a press in this session is worn once: the watch does not wear it again', async ($, on) => {
  const { clock, sets } = watched(on, undefined, new Date(2026, 10, 24, 12, 0))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'messages-tape' })
  expect(sets).toHaveLength(2)
  await clock.advance(15_000)
  expect(sets).toHaveLength(2)
  await ui.unmount()
})

test('a press keeps what another session stored a moment ago', async ($, on) => {
  const { store } = watched(on, undefined, new Date(2026, 10, 24, 12, 0))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // another session picks eye care; this one has not seen it yet, then presses a cue
  store.set('prefs', { ...(store.get('prefs') as object), colors: 'eyecare', font: 'from a newer version' })
  await ui.press({ key: 'cue-tool' })
  expect(store.get('prefs')).toMatchObject({ colors: 'eyecare', font: 'from a newer version', cues: { tool: false } })
  await ui.unmount()
})

test('picks from another session show in this pane, and turning off there clears here once', async ($, on) => {
  const { clock, store, sets, clears } = watched(on, undefined, new Date(2026, 10, 24, 12, 0))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  store.set('prefs', { messages: 'bookmark' })
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(JSON.stringify(await ui.find({ key: 'messages-bookmark' }))).toContain('●')
  await ui.unmount()

  store.set('prefs', { messages: 'bookmark', on: false })
  await clock.advance(15_000)
  expect(clears()).toBe(1)
  const worn = sets.length
  store.set('prefs', { messages: 'bookmark', on: true })
  await clock.advance(5_000)
  expect(sets.length).toBe(worn + 1)
  expect(clears()).toBe(1)
})

test('a round whose wear fails is tried again on the next', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 10, 24, 12, 0).getTime() })
  const store = new Map<string, unknown>()
  const sets: ThemeSetArgs[] = []
  let refuse = false
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('theme.set', (_, e) => {
    if (refuse) throw new Error('busy')
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  store.set('prefs', { messages: 'tape' })
  refuse = true
  await clock.advance(5_000)
  refuse = false
  await clock.advance(5_000)
  expect(sets.at(-1)?.style?.UserMessage).toHaveLength(2)
})

test('a refused whole look falls back to colors, and the next wear tries the whole look again', async ($, on) => {
  let refuseOnce = true
  const { sets } = watched(on, undefined, new Date(2026, 10, 24, 12, 0), {
    themeSet: e => {
      if ('style' in e && refuseOnce) {
        refuseOnce = false
        throw new Error('busy for a moment')
      }
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets.at(-1)).not.toHaveProperty('style')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'messages-tape' })
  expect(sets.at(-1)?.style?.UserMessage).toHaveLength(2)
  await ui.unmount()
})

test('a turn off whose pane copy fails to update is still cleared by the watch', async ($, on) => {
  let refuse = false
  const { clock, store, clears } = watched(on, undefined, new Date(2026, 10, 24, 12, 0), {
    stateSet: () => {
      if (refuse) {
        refuse = false
        return 'state busy'
      }
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  refuse = true
  try {
    await ui.press({ key: 'on' })
  } catch {
    // the press reports the failure
  }
  expect(store.get('prefs')).toMatchObject({ on: false })
  await clock.advance(5_000)
  expect(clears()).toBe(1)
  await ui.unmount()
})

test('with the look off all along, a press during a sync round never clears', async ($, on) => {
  // hold the watch's next pane update until the press is done
  let release: () => void = () => {}
  let hold = false
  const { clock, store, sets, clears } = watched(on, { on: false }, new Date(2026, 10, 24, 12, 0), {
    stateSet: async () => {
      if (hold) {
        hold = false
        await new Promise<void>(r => {
          release = r
        })
      }
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  hold = true
  store.set('prefs', { on: false, colors: 'eyecare' })
  await clock.advance(5_000)
  await ui.press({ key: 'glass-frosted' })
  release()
  await clock.advance(10_000)
  expect(sets).toHaveLength(0)
  expect(clears()).toBe(0)
  await ui.unmount()
})
