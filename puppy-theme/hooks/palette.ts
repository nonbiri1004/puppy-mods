import type { PaletteName } from '../types'

// The palettes this look can wear. The warm greys keep the brand's rule of no
// orange (in baibai-brand, orange belongs to the puppy's headphones alone);
// the gruvbox option keeps gruvbox's own colors, orange included (the person
// chose this on 2026-11-23: picking gruvbox steps outside the brand anyway).

export type Hex = `#${string}`

export type Mode = {
  /** the page, the darkest surface */
  wall: Hex
  /** cards, a step lighter */
  card: Hex
  surface2: Hex
  surface3?: Hex
  /** thin lines and the picture frame */
  line: Hex
  edge: Hex
  text: Hex
  secondary: Hex
  muted: Hex
}

export type Palette = {
  label: string
  light: Mode
  dark: Mode
  /** seeds: the design system keeps the hue and sets the lightness */
  roles: { accent: Hex; danger: Hex; success: Hex; warning: Hex; pro: Hex }
}

// The lofi puppy's warm greys (baibai-brand docs, "網站：白白的宇宙"): paper
// grey by day, warm charcoal by night. The accent is the framed night sky's
// grey-blue nebula, tuned up.
export const WARM: Palette = {
  label: 'lofi puppy · warm grey',
  light: {
    wall: '#eeede9', card: '#f8f7f4', surface2: '#fcfbf9',
    line: '#dcdad4', edge: '#cdcac3', text: '#2a2926', secondary: '#4b4944', muted: '#6d6a64',
  },
  dark: {
    wall: '#191917', card: '#232321', surface2: '#292826', surface3: '#2e2d2a',
    line: '#353431', edge: '#45433f', text: '#e7e5e0', secondary: '#c6c3bc', muted: '#9b9891',
  },
  roles: { accent: '#5a6e86', danger: '#b4483c', success: '#5b7f4a', warning: '#a87a1e', pro: '#7a6290' },
}

// The editor theme Gruvbox Hard (jdinhlife/vscode-theme-gruvbox, MIT, after
// morhetz/gruvbox): its Light Hard colors by day and Dark Hard by night, taken
// from the theme files themselves (the person asked for that, 2026-11-23).
// Like the editor theme, every surface is the one bg0_h color and thin bg1
// lines do the separating. Gruvbox's orange is the accent.
export const GRUVBOX: Palette = {
  label: 'lofi puppy · gruvbox hard',
  light: {
    // editor/sideBar/panel .background, sideBar.border, foreground, sideBar.foreground, tab.inactiveForeground
    wall: '#f9f5d7', card: '#f9f5d7', surface2: '#f9f5d7',
    line: '#ebdbb2', edge: '#d5c4a1', text: '#3c3836', secondary: '#504945', muted: '#7c6f64',
  },
  dark: {
    wall: '#1d2021', card: '#1d2021', surface2: '#1d2021',
    line: '#3c3836', edge: '#504945', text: '#ebdbb2', secondary: '#d5c4a1', muted: '#a89984',
  },
  roles: { accent: '#d65d0e', danger: '#cc241d', success: '#98971a', warning: '#d79921', pro: '#b16286' },
}

export type { PaletteName }

export const PALETTES: Record<PaletteName, Palette> = { warm: WARM, gruvbox: GRUVBOX }
