// The look's colors: one palette, in a light and a dark mode.

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
// grey by day, warm charcoal by night. No orange: in baibai-brand it belongs
// to the puppy's headphones alone. The accent is the framed night sky's
// grey-blue nebula, tuned up.
export const PALETTE: Palette = {
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
