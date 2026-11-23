import type { ThemeColors, ThemeSetArgs, ThemeSound } from 'claude-code'

import type { PaletteName, Prefs } from '../types'

import { makeColors } from './make-colors.js'
import { paletteFor, ROLES, type Six } from './palette'
import { CUES } from './prefs'
import { SCENE_ID } from './scene'
import { SOUNDS } from './sound'
import { messageColors, styleFor } from './style'

// The brand gives six colors a mode; makeColors works out the rest (text-secondary,
// the darker surfaces). Light mode's surface-2 is the card: left out, makeColors
// gives pure white, and the brand has no third paper.
const anchors = (m: Six, mode: 'light' | 'dark') => ({
  'surface-0': m.wall,
  'surface-1': m.card,
  ...(mode === 'light' ? { 'surface-2': m.card } : {}),
  'text-primary': m.text,
  'text-muted': m.muted,
})

/** The design-system colors made from a palette, and their contrast notes. */
export const lookColors = (name: PaletteName): { colors: ThemeColors; problems: string[] } => {
  const p = paletteFor(name)
  const { theme, problems } = makeColors({
    label: name === 'eyecare' ? 'lofi puppy · eye care' : 'lofi puppy · baibai',
    roles: ROLES,
    light: { gray: { anchors: anchors(p.light, 'light') } },
    dark: { gray: { anchors: anchors(p.dark, 'dark') } },
  })
  // The four message colors go in after makeColors, which doesn't take them.
  const extra = messageColors(p)
  const colors: ThemeColors = {
    ...theme,
    inputs: {
      ...theme.inputs,
      light: { ...theme.inputs?.light, ...extra.light },
      dark: { ...theme.inputs?.dark, ...extra.dark },
    },
  }
  return { colors, problems }
}

/** The line that would stop Desktop painting the colors, if any. */
export const unpainted = (problems: readonly string[]): string | undefined =>
  problems.find(line => line.startsWith("Desktop won't paint"))

// How the panels sit over the night sky. Frosted: a light blur and a thin veil,
// so the sky still shows and the words on top stay easy to read. Clear: almost
// no veil, the sky at its brightest, but words that cross the frame are harder
// to read. (The app's own 0.6 veil hides the sky under the panels.)
export const GLASS = {
  frosted: { blur: 8, opacity: 0.2 },
  clear: { blur: 0, opacity: 0.05 },
} as const

/** The parts every build takes: colors and, if picked, the night sky. */
export const baseLook = (prefs: Prefs): ThemeSetArgs => ({
  colors: lookColors(prefs.colors).colors,
  ...(prefs.wall === 'sky' ? { backdrop: { scene: SCENE_ID, glass: prefs.glass ? GLASS.frosted : GLASS.clear } } : {}),
})

/** The sound with only the cues the person kept; the ambience stays (the app's speaker turns it off). */
export const soundFor = (prefs: Prefs): ThemeSound => {
  const set = SOUNDS[prefs.sounds]
  return { ...set, cues: Object.fromEntries(CUES.filter(c => prefs.cues[c]).map(c => [c, set.cues?.[c]])) }
}

/** The whole look the person picked. */
export const lookFor = (prefs: Prefs): ThemeSetArgs => ({
  ...baseLook(prefs),
  ...(prefs.messages === 'app' ? {} : { style: styleFor(prefs.messages) }),
  sound: soundFor(prefs),
})
