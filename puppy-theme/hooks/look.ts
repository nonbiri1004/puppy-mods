import type { ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE_ID } from './scene'

// The lofi puppy's warm greys (baibai-brand docs, "網站：白白的宇宙"):
// paper grey by day, warm charcoal by night. No orange: in the brand, orange
// belongs to the puppy's headphones, and coding tools draw none.
export const PAGE = {
  light: { wall: '#eeede9', card: '#f8f7f4', line: '#dcdad4', edge: '#cdcac3', text: '#2a2926', muted: '#6d6a64' },
  dark: { wall: '#191917', card: '#232321', line: '#353431', edge: '#45433f', text: '#e7e5e0', muted: '#9b9891' },
} as const

// Seeds only: the design system keeps the hue and sets the lightness.
// The accent is the grey-blue of the framed night sky's nebula, tuned up.
export const ROLES = {
  accent: '#5a6e86',
  danger: '#b4483c',
  success: '#5b7f4a',
  warning: '#a87a1e',
  pro: '#7a6290',
} as const

export const { theme, problems } = makeColors({
  label: 'lofi puppy',
  roles: ROLES,
  light: {
    gray: {
      anchors: {
        'surface-0': PAGE.light.wall,
        'surface-1': PAGE.light.card,
        'surface-2': '#fcfbf9',
        'text-primary': PAGE.light.text,
        'text-secondary': '#4b4944',
        'text-muted': PAGE.light.muted,
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': PAGE.dark.wall,
        'surface-1': PAGE.dark.card,
        'surface-2': '#292826',
        'surface-3': '#2e2d2a',
        'text-primary': PAGE.dark.text,
        'text-secondary': '#c6c3bc',
        'text-muted': PAGE.dark.muted,
      },
    },
  },
})

/** The line that would stop Desktop painting the colors, if any. */
export const unpainted = (): string | undefined => problems.find(line => line.startsWith("Desktop won't paint"))

export const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE_ID, glass: { blur: 20 } },
}
