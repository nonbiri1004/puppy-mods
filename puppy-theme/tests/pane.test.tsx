import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { ThemeSetArgs } from 'claude-code'

import { SCENE_ID } from '../hooks/scene'

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

test('with nothing kept, a session starts warm with the night sky', async ($, on) => {
  const { sets } = engine(on, undefined)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets[0]?.backdrop).toMatchObject({ scene: SCENE_ID })
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
  on('command.register', () => ({ value: { command: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]).toHaveProperty('colors')
  expect(sets[0]).not.toHaveProperty('style')
  expect(JSON.stringify(logs)).toContain('colors only')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane has its cards and each press is kept and worn (${surface})`, async ($, on) => {
    const { store, sets } = engine(on, undefined)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const card of ['card-reset', 'card-wall', 'card-messages', 'card-sounds']) {
      expect(await ui.find({ key: card })).toBeTruthy()
    }
    const note = await ui.find({ type: 'Text', text: /desktop app|this computer/ })
    expect(note?.text).toMatch(surface === 'terminal' ? /desktop app/ : /this computer/)

    await ui.press({ key: 'glass' })
    expect(sets.at(-1)?.backdrop).toMatchObject({ glass: { blur: 0, opacity: 0.05 } })
    await ui.press({ key: 'wall-plain' })
    await ui.press({ key: 'messages-bookmark' })
    expect(sets.at(-1)?.style?.UserMessage).toMatchObject({ paddingY: 12 })
    await ui.press({ key: 'messages-app' })
    await ui.press({ key: 'cue-tool' })
    await ui.press({ key: 'sounds-rain' })

    expect(store.get('prefs')).toMatchObject({
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
  expect(store.get('prefs')).toMatchObject({ on: true, wall: 'sky', glass: true, messages: 'pixel', sounds: 'lofi' })
  expect(sets.at(-1)?.backdrop).toMatchObject({ scene: SCENE_ID })
  await ui.unmount()
})

test('a session that kept the look off starts with no theme', async ($, on) => {
  const { sets, clears } = engine(on, { on: false })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(0)
  expect(clears()).toBe(1)
})
