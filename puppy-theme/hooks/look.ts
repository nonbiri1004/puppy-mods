import type { ThemeColors, ThemeCue, ThemeSetArgs, ThemeSound } from 'claude-code'

import type { CueName, Prefs } from '../types'

import { makeColors } from './make-colors.js'
import { PALETTES, type Mode, type PaletteName } from './palette'
import { CUES } from './prefs'
import { sceneId } from './scene'
import { SOUND } from './sound'
import { STYLE, messageColors } from './style'

const anchors = (m: Mode) => ({
  'surface-0': m.wall,
  'surface-1': m.card,
  'surface-2': m.surface2,
  ...(m.surface3 === undefined ? {} : { 'surface-3': m.surface3 }),
  'text-primary': m.text,
  'text-secondary': m.secondary,
  'text-muted': m.muted,
})

/** The design-system colors for a palette, and its contrast notes. */
export const colorsFor = (name: PaletteName): { colors: ThemeColors; problems: string[] } => {
  const p = PALETTES[name]
  const { theme, problems } = makeColors({
    label: p.label,
    roles: p.roles,
    light: { gray: { anchors: anchors(p.light) } },
    dark: { gray: { anchors: anchors(p.dark) } },
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

/** The parts every build takes: colors and, if picked, the night sky. */
export const baseLook = (prefs: Prefs): ThemeSetArgs => ({
  colors: colorsFor(prefs.palette).colors,
  ...(prefs.wall === 'sky' ? { backdrop: { scene: sceneId(prefs.palette), glass: { blur: 20 } } } : {}),
})

/**
 * A cue redone as the wall's click, for listening from the pane. A click plays
 * one note of each layer, picked by where the wall is clicked (left to right),
 * and takes no `step`: so the notes keep their own sound and pitch, and the
 * person clicks from left to right to hear them in turn.
 */
export const asClick = (cue: ThemeCue): ThemeCue => ({
  ...cue,
  layers: cue.layers.map(layer => {
    if (!('step' in layer)) {
      return layer
    }
    const { step: _step, ...rest } = layer
    return rest
  }),
})

/**
 * The sound with only the cues the person kept; the ambience stays (the app's
 * speaker turns it off). While a cue is being listened to, the wall's click
 * plays it.
 */
export const soundFor = (prefs: Prefs, listening: CueName | null = null): ThemeSound => {
  const kept = Object.fromEntries(CUES.filter(c => prefs.cues[c]).map(c => [c, SOUND.cues?.[c]]))
  const heard = listening === null ? undefined : SOUND.cues?.[listening]
  return { ...SOUND, cues: heard === undefined ? kept : { ...kept, click: asClick(heard) } }
}

/** The whole look the person picked. */
export const lookFor = (prefs: Prefs, listening: CueName | null = null): ThemeSetArgs => ({
  ...baseLook(prefs),
  ...(prefs.style ? { style: STYLE } : {}),
  sound: soundFor(prefs, listening),
})
