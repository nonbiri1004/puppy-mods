import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { GLASS, lookColors, lookFor } from '../hooks/look'
import { makeColors } from '../hooks/make-colors.js'
import { BRAND, contrast as ratio, deriveEyeCare, paletteFor, PALETTE_NAMES, ROLES } from '../hooks/palette'
import { DEFAULT_PREFS, parsePrefs } from '../hooks/prefs'
import { drawScene, periodOf, readSceneName, sceneName } from '../hooks/scene'
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

for (const name of PALETTE_NAMES) {
  test(`the ${name} colors use only names the app knows, and Desktop paints them`, () => {
    const { colors, problems } = lookColors(name)
    expect(problems.filter(line => line.startsWith("Desktop won't paint"))).toEqual([])
    // checkColors also lists the soft contrast lines; keep only the ones that
    // would paint nothing or stop the theme
    const hard = checkColors(colors).filter(line => !/ is [\d.]+:1 in (light|dark) mode/.test(line))
    expect(hard).toEqual([])
  })
}

// Which gray stop each surface and text takes, as make-colors.js lays them out
// (the anchors come back at these stops, which the test checks too).
const surfaces = (name: (typeof PALETTE_NAMES)[number], mode: 'light' | 'dark') => {
  const p = paletteFor(name)
  const anchors = { 'surface-0': p[mode].wall, 'surface-1': p[mode].card, ...(mode === 'light' ? { 'surface-2': p[mode].card } : {}), 'text-primary': p[mode].text, 'text-muted': p[mode].muted }
  const { theme } = makeColors({ label: name, roles: ROLES, [mode]: { gray: { anchors } } })
  const g = (theme.inputs as Record<string, Record<string, string>>)[mode]!
  const d = mode === 'dark'
  const at = (k: string) => g[k]!
  return {
    s: [at(d ? 'gray-900' : 'gray-20'), at(d ? 'gray-850' : 'gray-10'), at(d ? 'gray-830' : 'gray-0'), at(d ? 'gray-800' : 'gray-0')],
    text: d ? at('gray-50') : at('gray-900'),
    muted: at('gray-400'),
    secondary: at(d ? 'gray-200' : 'gray-600'),
    wall: p[mode].wall,
  }
}

test('tool rows sit in a pixel frame, their words 3:1 on its line in every palette and mode', () => {
  for (const s of Object.values(STYLES)) {
    expect(s.ToolUse).toMatchObject({ color: 'text-secondary', fill: { vector: { viewBox: 12, slice: 4 } } })
  }
  for (const name of PALETTE_NAMES) {
    for (const mode of ['light', 'dark'] as const) {
      const p = paletteFor(name)[mode]
      const t = surfaces(name, mode)
      expect(ratio(t.secondary, p.line)).toBeGreaterThanOrEqual(3)
      expect(ratio(t.secondary, t.s[1]!)).toBeGreaterThanOrEqual(4.5)
    }
  }
})

for (const name of PALETTE_NAMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${name} ${mode}: text-primary is 7:1 on every surface and text-muted 4.5:1 on surface-0 and surface-2`, () => {
      const t = surfaces(name, mode)
      expect(t.s[0]).toBe(t.wall)
      for (const s of t.s) expect(ratio(t.text, s)).toBeGreaterThanOrEqual(7)
      expect(ratio(t.muted, t.s[0]!)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(t.muted, t.s[2]!)).toBeGreaterThanOrEqual(4.5)
    })
  }
}

test('baibai is the brand exactly, and eye care is worked out from it', () => {
  expect(paletteFor('baibai')).toBe(BRAND)
  const eye = deriveEyeCare(BRAND)
  expect(eye.dark.wall).toBe(BRAND.dark.wall) // the charcoal stays
  expect(eye.light.wall).not.toBe(BRAND.light.wall) // a warmer day wall
  expect(ratio(eye.dark.text, eye.dark.wall)).toBeLessThan(ratio(BRAND.dark.text, BRAND.dark.wall))
})

test('the colors carry no orange: in the brand it is the headphones alone', () => {
  const all = JSON.stringify([BRAND, deriveEyeCare(BRAND), ROLES]).toLowerCase()
  expect(all).not.toMatch(/#f08a3c|#e07b35|#d65d0e|#fe8019|#af3a03/)
})

test('each message style keeps its words at 3:1 on every color it draws', () => {
  for (const name of PALETTE_NAMES) {
    for (const mode of [paletteFor(name).light, paletteFor(name).dark]) {
      const words = rgb(mode.text)
      expect(contrast(words, rgb(TAPE, mode.card))).toBeGreaterThanOrEqual(3)
      expect(contrast(words, rgb(mode.edge))).toBeGreaterThanOrEqual(3)
    }
  }
  // the bookmark strip is one slate blue for both modes: it holds 3:1 with the
  // brand's words; eye care's softer dark text falls under, and then the app lays
  // the message's backgroundColor (the card, same as the drawing's middle) under
  // the words alone, so nothing shows. Check in the app.
  for (const mode of [BRAND.light, BRAND.dark]) expect(contrast(rgb(mode.text), rgb(BOOKMARK))).toBeGreaterThanOrEqual(3)
  expect(STYLES.bookmark.UserMessage).toMatchObject({ backgroundColor: 'bg-user-message' })
  // every raw color a drawing uses is one of the checked ones
  const raw = JSON.stringify(STYLES).match(/#[0-9a-f]{6,8}/gi) ?? []
  expect([...new Set(raw)].sort()).toEqual(['#00000024', BOOKMARK, TAPE].sort())
  expect(JSON.stringify(STYLES).toLowerCase()).not.toMatch(/#f08a3c/)
})

const PERIODS = ['dawn', 'day', 'dusk', 'night'] as const

test('every scene is pure vector, slow, small enough and free of orange', () => {
  for (const palette of PALETTE_NAMES) {
    for (const period of PERIODS) {
      for (const weather of ['clear', 'rain'] as const) {
        const scene = drawScene(palette, period, weather)
        expect(scene.length).toBeLessThan(131_072)
        expect(scene).not.toMatch(/<image|<text|<foreignObject|href|CDATA|undefined|NaN|var\(/)
        expect(scene).toContain('crispEdges')
        expect(scene.toLowerCase()).not.toMatch(/#f08a3c|#e07b35/)
        // every animation lasts 7 seconds or more: nothing flashes
        const times = [...scene.matchAll(/(?:animation(?:-duration)?:[a-z-]* ?)(\d+(?:\.\d+)?)s/g)].map(m => Number(m[1]))
        expect(times.length).toBeGreaterThan(0)
        for (const s of times) expect(s).toBeGreaterThanOrEqual(7)
      }
    }
  }
})

test('the sky follows the hour and the rain sounds', () => {
  expect([4, 5, 6, 7, 12, 16, 17, 18, 19, 23, 0].map(periodOf)).toEqual(
    ['night', 'dawn', 'dawn', 'day', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night'],
  )
  const night = drawScene('baibai', 'night', 'clear')
  const day = drawScene('baibai', 'day', 'clear')
  const rain = drawScene('baibai', 'night', 'rain')
  expect(night).toContain('class="m m0')
  expect(night).toContain('class="s s0"')
  expect(day).not.toContain('class="s ')
  expect(day).not.toContain('class="m ')
  expect(rain).toContain('rain-16')
  expect(rain).not.toContain('class="s ')
  // a shooting star rests hidden, so with motion reduced there is none
  expect(night).toMatch(/\.m\{opacity:0;/)
  // the slim frame hangs beside the sidebar, the wide one past 1620 px
  expect(night).toContain('min-width: 1364px')
  expect(night).toContain('x="206" y="84" width="24" height="96" class="frame"')
  expect(lookFor({ ...DEFAULT_PREFS, sounds: 'rain' }, 12).backdrop).toMatchObject({ scene: 'puppy-sky-baibai-day-rain' })
  expect(lookFor({ ...DEFAULT_PREFS, colors: 'eyecare' }, 18).backdrop).toMatchObject({ scene: 'puppy-sky-eyecare-dusk-clear' })
  expect(readSceneName('puppy-sky-eyecare-dawn-rain')).toEqual({ palette: 'eyecare', period: 'dawn', weather: 'rain' })
  expect(readSceneName('framed-night')).toBeUndefined()
  expect(readSceneName('puppy-sky-gruvbox-night-clear')).toBeUndefined()
})

test('the glass never tints the panels, so the brand colors stay exact', () => {
  for (const g of Object.values(GLASS)) {
    // no tint: a see-through rgba() one drew the panels solid black in the app
    expect(g).not.toHaveProperty('tint')
    expect(g.opacity).toBeLessThanOrEqual(0.05)
  }
  expect(GLASS.frosted.blur).toBeGreaterThan(0)
  expect(GLASS.frosted.blur).toBeLessThanOrEqual(2)
  expect(GLASS.clear.blur).toBe(0)
})

test('a day sky gets a shade in dark mode only', () => {
  for (const w of ['clear', 'rain'] as const) {
    const day = drawScene('baibai', 'day', w)
    expect(day).toContain('class="day-shade"')
    // hidden by default, shown inside the dark-mode rule
    expect(day).toMatch(/\.day-shade\{opacity:0\}.*prefers-color-scheme: dark.*\.day-shade\{opacity:0\.4\}/s)
  }
  for (const p of ['dawn', 'dusk', 'night'] as const) expect(drawScene('baibai', p, 'clear')).not.toContain('class="day-shade"')
})

test('the look follows each pick', () => {
  const full = lookFor(DEFAULT_PREFS)
  expect(full.backdrop).toMatchObject({ scene: sceneName('baibai', 'night', 'clear'), glass: GLASS.clear })
  expect(lookFor({ ...DEFAULT_PREFS, glass: true }).backdrop).toMatchObject({ glass: GLASS.frosted })
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
  expect(old.glass).toBe(false)
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
  const ui = await $.ui.mount({ ...backdrop(sceneName('eyecare', 'day', 'rain')), surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeTruthy()
  // drawn as an image, so a click on the wall reaches the app (its click cue)
  expect((svg as { props?: { isInteractive?: boolean } } | undefined)?.props?.isInteractive).toBeUndefined()
  await ui.unmount()
  const other = await $.ui.mount({ ...backdrop('pond'), surface: 'desktop' })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})
