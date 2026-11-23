import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { lookColors, lookFor } from '../hooks/look'
import { PALETTE } from '../hooks/palette'
import { DEFAULT_PREFS, parsePrefs } from '../hooks/prefs'
import { drawScene, SCENE_ID } from '../hooks/scene'

const backdrop = (scene: string) =>
  ({ plugin: 'puppy-theme', component: 'Backdrop', props: { plugin: 'puppy-theme', scene, glass: { blur: 20, opacity: 0.6 } } }) as const

test('the colors use only names the app knows, and Desktop paints them', () => {
  const { colors, problems } = lookColors()
  expect(problems.filter(line => line.startsWith("Desktop won't paint"))).toEqual([])
  // checkColors also lists the soft contrast lines; keep only the ones that
  // would paint nothing or stop the theme
  const hard = checkColors(colors).filter(line => !/ is [\d.]+:1 in (light|dark) mode/.test(line))
  expect(hard).toEqual([])
})

test('the warm greys carry no orange: in the brand it is the headphones alone', () => {
  expect(JSON.stringify(PALETTE).toLowerCase()).not.toMatch(/#f08a3c|#d65d0e|#fe8019|#af3a03/)
})

test('the scene is pure vector, slow and small enough', () => {
  const scene = drawScene()
  expect(scene.length).toBeLessThan(131_072)
  expect(scene).not.toMatch(/<image|<text|<foreignObject|href|CDATA|undefined/)
  expect(scene).toContain('crispEdges')
  // every animation lasts 7 seconds or more: nothing flashes
  for (const [, s] of scene.matchAll(/(\d+(?:\.\d+)?)s (?:ease|linear)/g)) {
    expect(Number(s)).toBeGreaterThanOrEqual(7)
  }
})

test('the look follows each pick', () => {
  const full = lookFor(DEFAULT_PREFS)
  expect(full.backdrop).toMatchObject({ scene: SCENE_ID })
  expect(full.style).toBeDefined()
  expect(Object.keys(full.sound?.cues ?? {})).toHaveLength(7)

  const quiet = lookFor({
    ...DEFAULT_PREFS,
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
  // 'palette' is a field an earlier build kept: it is dropped, like any unknown one
  const old = parsePrefs({ palette: 'gruvbox', wall: 'app', cards: false, cues: { tool: false, beep: true } })
  expect(old).not.toHaveProperty('palette')
  expect(old.wall).toBe('sky')
  expect(old.style).toBe(true)
  expect(old.cues.tool).toBe(false)
  expect(old.cues.send).toBe(true)
  expect(old.cues).not.toHaveProperty('beep')
})

test('the backdrop draws our scene on the desktop and leaves others alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...backdrop(SCENE_ID), surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeTruthy()
  // drawn as an image, so a click on the wall reaches the app (its click cue)
  expect((svg as { props?: { isInteractive?: boolean } } | undefined)?.props?.isInteractive).toBeUndefined()
  await ui.unmount()
  const other = await $.ui.mount({ ...backdrop('pond'), surface: 'desktop' })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})
