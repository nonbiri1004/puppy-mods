import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { ThemeSetArgs } from 'claude-code'

import { sceneId } from '../hooks/scene'

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
  on('command.register', () => ({ value: { command: 'look' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { store, sets, logs }
}

test('a session starts in what the pane kept', async ($, on) => {
  const { sets, logs } = engine(on, { palette: 'gruvbox', wall: 'plain', style: true, cues: { tool: false } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]?.backdrop).toBeUndefined()
  expect(Object.keys(sets[0]?.sound?.cues ?? {})).not.toContain('tool')
  expect(logs).toEqual([])
})

test('with nothing kept, a session starts warm with the night sky', async ($, on) => {
  const { sets } = engine(on, undefined)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets[0]?.backdrop).toMatchObject({ scene: sceneId('warm') })
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
  test(`the pane has its four cards and each press is kept and worn (${surface})`, async ($, on) => {
    const { store, sets } = engine(on, undefined)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const card of ['card-palette', 'card-wall', 'card-messages', 'card-sounds']) {
      expect(await ui.find({ key: card })).toBeTruthy()
    }
    const note = await ui.find({ type: 'Text', text: /desktop app|this computer/ })
    expect(note?.text).toMatch(surface === 'terminal' ? /desktop app/ : /this computer/)

    await ui.press({ key: 'palette-gruvbox' })
    await ui.press({ key: 'wall-plain' })
    await ui.press({ key: 'style' })
    await ui.press({ key: 'cue-tool' })

    expect(store.get('prefs')).toMatchObject({
      palette: 'gruvbox',
      wall: 'plain',
      style: false,
      cues: { tool: false, send: true },
    })
    const last = sets.at(-1)
    expect(last?.backdrop).toBeUndefined()
    expect(last?.style).toBeUndefined()
    expect(Object.keys(last?.sound?.cues ?? {})).not.toContain('tool')
    expect((await ui.find({ type: 'Text', text: /6 of 7/ }))?.text).toBe('6 of 7')
    await ui.unmount()
  })
}

test('▶ lends the wall click to a cue until ■, on the desktop only', async ($, on) => {
  const { sets } = engine(on, undefined)
  // the minute never ends here: the timer's dispatch stays pending
  const fired: (() => void)[] = []
  on('clock.after', () => new Promise<{ value: undefined }>(resolve => fired.push(() => resolve({ value: undefined }))))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'play-cue-done' })
  expect(sets.at(-1)?.sound?.cues?.click?.layers[0]).toMatchObject({ notes: ['A5', 'F5', 'D5'] })
  expect((await ui.find({ type: 'Text', text: /^click the wall$/ }))?.text).toBe('click the wall')
  expect(await ui.find({ type: 'Text', text: /left to right/ })).toBeTruthy()

  await ui.press({ key: 'play-cue-done' })
  expect(sets.at(-1)?.sound?.cues?.click?.layers[0]).toMatchObject({ notes: ['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'A5'] })
  expect(await ui.find({ type: 'Text', text: /^click the wall$/ })).toBeUndefined()

  // after a minute the wall's own click comes back by itself
  await ui.press({ key: 'play-cue-tool' })
  expect(sets.at(-1)?.sound?.cues?.click).toEqual(sets.at(-1)?.sound?.cues?.tool)
  fired.at(-1)?.()
  const isOwnClick = () => (sets.at(-1)?.sound?.cues?.click?.layers[0] as { notes?: unknown } | undefined)?.notes
  for (let i = 0; i < 50 && JSON.stringify(isOwnClick()) !== JSON.stringify(['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'A5']); i++) {
    await ui.find({ key: 'card-sounds' })
  }
  expect(fired.length).toBeGreaterThan(0)
  expect(sets.at(-1)?.sound?.cues?.click?.layers[0]).toMatchObject({ notes: ['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'A5'] })
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ key: 'play-cue-done' })).toBeUndefined()
  await term.unmount()
})
