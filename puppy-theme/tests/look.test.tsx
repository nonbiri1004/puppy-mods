import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { colorsFor, lookFor } from '../hooks/look'
import { PALETTES, type PaletteName } from '../hooks/palette'
import { DEFAULT_PREFS, parsePrefs } from '../hooks/prefs'
import { sceneFor, sceneId } from '../hooks/scene'
import { SOUND } from '../hooks/sound'

const NAMES = Object.keys(PALETTES) as PaletteName[]
const backdrop = (scene: string) =>
  ({ plugin: 'puppy-theme', component: 'Backdrop', props: { plugin: 'puppy-theme', scene, glass: { blur: 20, opacity: 0.6 } } }) as const

test('every palette uses only names the app knows, and Desktop paints it', () => {
  for (const name of NAMES) {
    const { colors, problems } = colorsFor(name)
    expect(problems.filter(line => line.startsWith("Desktop won't paint"))).toEqual([])
    // checkColors also lists the soft contrast lines; keep only the ones that
    // would paint nothing or stop the theme
    const hard = checkColors(colors).filter(line => !/ is [\d.]+:1 in (light|dark) mode/.test(line))
    expect(hard).toEqual([])
  }
})

test('the warm greys carry no orange: in the brand it is the headphones alone', () => {
  // gruvbox keeps its own orange (the person's choice, 2026-11-23)
  expect(JSON.stringify(PALETTES.warm).toLowerCase()).not.toMatch(/#f08a3c|#d65d0e|#fe8019|#af3a03/)
})

test('the scenes are pure vector, slow and small enough', () => {
  for (const name of NAMES) {
    const scene = sceneFor(name)
    expect(scene.length).toBeLessThan(131_072)
    expect(scene).not.toMatch(/<image|<text|<foreignObject|href|CDATA|undefined/)
    expect(scene).toContain('crispEdges')
    // every animation lasts 7 seconds or more: nothing flashes
    for (const [, s] of scene.matchAll(/(\d+(?:\.\d+)?)s (?:ease|linear)/g)) {
      expect(Number(s)).toBeGreaterThanOrEqual(7)
    }
  }
})

test('the look follows each pick', () => {
  const full = lookFor(DEFAULT_PREFS)
  expect(full.backdrop).toMatchObject({ scene: sceneId('warm') })
  expect(full.style).toBeDefined()
  expect(Object.keys(full.sound?.cues ?? {})).toHaveLength(7)

  const quiet = lookFor({
    ...DEFAULT_PREFS,
    palette: 'gruvbox',
    wall: 'plain',
    style: false,
    cues: { ...DEFAULT_PREFS.cues, tool: false, click: false },
  })
  expect(quiet.backdrop).toBeUndefined()
  expect(quiet.style).toBeUndefined()
  expect(Object.keys(quiet.sound?.cues ?? {}).sort()).toEqual(['ask', 'compact', 'done', 'error', 'send'])
  expect(quiet.sound?.ambience).toBeDefined()
})

test('what an earlier version stored is read field by field', () => {
  expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS)
  expect(parsePrefs('junk')).toEqual(DEFAULT_PREFS)
  const old = parsePrefs({ palette: 'gruvbox', wall: 'app', cards: false, cues: { tool: false, beep: true } })
  expect(old.palette).toBe('gruvbox')
  expect(old.wall).toBe('sky')
  expect(old.style).toBe(true)
  expect(old.cues.tool).toBe(false)
  expect(old.cues.send).toBe(true)
  expect(old.cues).not.toHaveProperty('beep')
})

test('the backdrop draws our scenes on the desktop and leaves others alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const name of NAMES) {
    const ui = await $.ui.mount({ ...backdrop(sceneId(name)), surface: 'desktop' })
    expect(await ui.find({ type: 'Svg' })).toBeTruthy()
    await ui.unmount()
  }
  const other = await $.ui.mount({ ...backdrop('pond'), surface: 'desktop' })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})

test('while a cue is listened to, the wall click plays it, one note a click', () => {
  const look = lookFor(DEFAULT_PREFS, 'done')
  const click = look.sound?.cues?.click
  const done = SOUND.cues?.done
  expect(click?.layers).toHaveLength(done?.layers.length ?? -1)
  expect(click?.layers.every(l => !('step' in l))).toBe(true)
  expect(click?.layers[0]).toMatchObject({ wave: 'bell', notes: ['A5', 'F5', 'D5'] })
  // the other cues stay as they are
  expect(look.sound?.cues?.done).toEqual(done)
  // a click turned off still plays while listening
  const off = lookFor({ ...DEFAULT_PREFS, cues: { ...DEFAULT_PREFS.cues, click: false } }, 'tool')
  expect(off.sound?.cues?.click).toEqual(SOUND.cues?.tool)
})
