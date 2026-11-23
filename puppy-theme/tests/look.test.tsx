import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { GLASS, lookColors, lookFor } from '../hooks/look'
import { PALETTE } from '../hooks/palette'
import { DEFAULT_PREFS, parsePrefs } from '../hooks/prefs'
import { drawScene, SCENE_ID } from '../hooks/scene'
import { BOOKMARK, STYLES, TAPE } from '../hooks/style'

// WCAG contrast of two colors; an 8-digit hex is laid over `under` first
const rgb = (hex: string, under = '#000000'): number[] => {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  const a = hex.length === 9 ? ch(hex, 3) / 255 : 1
  return [0, 1, 2].map(i => ch(hex, i) * a + ch(under, i) * (1 - a))
}
const lum = (c: number[]) =>
  c.map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0)
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

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

test('each message style keeps its words at 3:1 on every color it draws, in both modes', () => {
  for (const mode of [PALETTE.light, PALETTE.dark]) {
    const words = rgb(mode.text)
    expect(contrast(words, rgb(TAPE, mode.card))).toBeGreaterThanOrEqual(3)
    expect(contrast(words, rgb(BOOKMARK))).toBeGreaterThanOrEqual(3)
    expect(contrast(words, rgb(mode.edge))).toBeGreaterThanOrEqual(3)
  }
  // every raw color a drawing uses is one of the checked ones
  const raw = JSON.stringify(STYLES).match(/#[0-9a-f]{6,8}/gi) ?? []
  expect([...new Set(raw)].sort()).toEqual(['#00000024', BOOKMARK, TAPE].sort())
  expect(JSON.stringify(STYLES).toLowerCase()).not.toMatch(/#f08a3c/)
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
  expect(full.backdrop).toMatchObject({ scene: SCENE_ID, glass: GLASS.frosted })
  expect(lookFor({ ...DEFAULT_PREFS, glass: false }).backdrop).toMatchObject({ glass: GLASS.clear })
  expect(full.style).toBeDefined()
  expect(Object.keys(full.sound?.cues ?? {})).toHaveLength(7)

  expect(lookFor({ ...DEFAULT_PREFS, messages: 'tape' }).style?.UserMessage).toHaveLength(2)
  expect(lookFor({ ...DEFAULT_PREFS, messages: 'bookmark' }).style).toBe(STYLES.bookmark)

  const quiet = lookFor({
    ...DEFAULT_PREFS,
    wall: 'plain',
    messages: 'app',
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
  expect(old.messages).toBe('pixel')
  expect(old.glass).toBe(true)
  // the on/off switch an earlier build kept turns into a pick
  expect(parsePrefs({ style: false }).messages).toBe('app')
  expect(parsePrefs({ style: true }).messages).toBe('pixel')
  expect(parsePrefs({ messages: 'tape', style: false }).messages).toBe('tape')
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
