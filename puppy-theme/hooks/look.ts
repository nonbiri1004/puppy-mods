import type { ThemeColors, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { PALETTES, type Mode, type PaletteName } from './palette'
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

/** The parts every build takes: colors and the backdrop. */
export const baseLook = (name: PaletteName): ThemeSetArgs => ({
  colors: colorsFor(name).colors,
  backdrop: { scene: sceneId(name), glass: { blur: 20 } },
})

/** The whole look, with the message style and the sound. */
export const fullLook = (name: PaletteName): ThemeSetArgs => ({
  ...baseLook(name),
  style: STYLE,
  sound: SOUND,
})
