import type { ThemeColorInputs, ThemeColors, ThemeSetArgs, ThemeSound } from 'claude-code'

import type { PaletteName, Prefs } from '../types'

import { makeColors } from './make-colors.js'
import { type Hex, paletteFor, ROLES, type Six } from './palette'
import { CUES } from './prefs'
import { periodOf, sceneName } from './scene'
import { SOUNDS } from './sound'
import { messageColors, styleFor } from './style'

// The brand gives six colors a mode; four go to makeColors as anchors, and it works
// out the rest (text-secondary, the darker surfaces, border and border-strong).
// line and edge are drawn only in the scene's frame. Light mode's surface-2 is the
// card: left out, makeColors gives pure white, and the brand has no third paper.
const anchors = (m: Six, mode: 'light' | 'dark') => ({
  'surface-0': m.wall,
  'surface-1': m.card,
  ...(mode === 'light' ? { 'surface-2': m.card } : {}),
  'text-primary': m.text,
  'text-muted': m.muted,
})

// The git status colors from the look's own roles, not makeColors' bright system
// defaults (one of them, conflicting, is orange). A dark shade in light mode and a
// light one in dark mode, so each reads at 4.5:1 or more on the cards.
const gitColors = (inputs: ThemeColorInputs | undefined, muted: Hex, mode: 'light' | 'dark'): ThemeColorInputs => {
  const shade = (role: string, light: number, dark: number): Hex => inputs?.[`role-${role}-${mode === 'light' ? light : dark}`] ?? muted
  const added = shade('success', 600, 250)
  const modified = shade('warning', 600, 200)
  const removed = shade('danger', 600, 250)
  return {
    'text-git-added': added,
    'fill-git-added': added,
    'text-git-modified': modified,
    'fill-git-modified': modified,
    'text-git-removed': removed,
    'text-git-closed': removed,
    'text-git-conflicting': removed,
    'text-git-merged': shade('pro', 600, 250),
    'text-git-draft': muted,
  }
}

// lookColors is pure and every wear asks for it, so each palette is worked out once.
const made = new Map<PaletteName, { colors: ThemeColors; problems: string[] }>()

/** The design-system colors made from a palette, and their contrast notes. */
export const lookColors = (name: PaletteName): { colors: ThemeColors; problems: string[] } => {
  const known = made.get(name)
  if (known !== undefined) return known
  const p = paletteFor(name)
  const { theme, problems } = makeColors({
    label: name === 'eyecare' ? 'lofi puppy · eye care' : 'lofi puppy · baibai',
    roles: ROLES,
    light: { gray: { anchors: anchors(p.light, 'light') } },
    dark: { gray: { anchors: anchors(p.dark, 'dark') } },
  })
  // The two message colors a mode go in after makeColors, which doesn't take them.
  const extra = messageColors(p, theme.inputs?.dark?.['gray-800'] ?? p.dark.card)
  const colors: ThemeColors = {
    ...theme,
    inputs: {
      ...theme.inputs,
      light: { ...theme.inputs?.light, ...gitColors(theme.inputs?.light, p.light.muted, 'light'), ...extra.light },
      dark: { ...theme.inputs?.dark, ...gitColors(theme.inputs?.dark, p.dark.muted, 'dark'), ...extra.dark },
    },
  }
  made.set(name, { colors, problems })
  return { colors, problems }
}

/** The line that would stop Desktop painting the colors, if any. */
export const unpainted = (problems: readonly string[]): string | undefined =>
  problems.find(line => line.startsWith("Desktop won't paint"))

// How the panels sit over the framed sky. The veil is kept to 5% in both
// picks: it takes the panel's own color, so more shifts the brand's wall (25%
// showed in dark mode). A tint can't help: it takes one raw color for both
// modes, and a see-through rgba(0,0,0,0) tint drew the panels solid black in
// the app. At 5% the shift is one step, too small to see. Frosted only softens
// the frame a little, as if behind glass (a blur of 8 smeared the 24-point
// frame into a smudge); clear shows it sharp. (The app's own 16-point blur and
// 0.6 veil hide the sky.)
export const VEIL = 0.05
export const GLASS = {
  frosted: { blur: 2, opacity: VEIL },
  clear: { blur: 0, opacity: VEIL },
} as const

/**
 * The parts every build takes: colors and, if picked, the framed sky for this
 * local hour (and rain when the rain sounds are picked).
 */
export const baseLook = (prefs: Prefs, hour = 22): ThemeSetArgs => ({
  colors: lookColors(prefs.colors).colors,
  ...(prefs.wall === 'sky' ? { backdrop: { scene: sceneName(prefs.colors, periodOf(hour), prefs.sounds === 'rain' ? 'rain' : 'clear'), glass: prefs.glass ? GLASS.frosted : GLASS.clear } } : {}),
})

/** The sound with only the cues the person kept; the ambience stays (the app's speaker turns it off). */
export const soundFor = (prefs: Prefs): ThemeSound => {
  const set = SOUNDS[prefs.sounds]
  return { ...set, cues: Object.fromEntries(CUES.filter(c => prefs.cues[c]).map(c => [c, set.cues?.[c]])) }
}

/** The whole look the person picked. */
export const lookFor = (prefs: Prefs, hour = 22): ThemeSetArgs => ({
  ...baseLook(prefs, hour),
  ...(prefs.messages === 'app' ? {} : { style: styleFor(prefs.messages) }),
  sound: soundFor(prefs),
})
