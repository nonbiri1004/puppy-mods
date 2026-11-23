// The look's colors: two palettes, each in a light and a dark mode.
//
// baibai: the brand's six page colors, exactly as baibai-brand gives them.
// eyecare: worked out from those six by deriveEyeCare below, never a hex set
// of its own. When the brand colors change, baibai-brand changes first and
// both palettes follow; nothing here changes a brand color.

import type { PaletteName } from '../types'

import { dark, light, type PageColors } from './brand-colors'

export const PALETTE_NAMES: readonly PaletteName[] = ['baibai', 'eyecare']

export type Hex = `#${string}`
/** The six page colors of one mode: wall, card, line, edge, text, muted. */
export type Six = { readonly [K in keyof PageColors]: Hex }
export type Palette = { light: Six; dark: Six }

export const BRAND: Palette = { light, dark }

// Seeds: makeColors keeps each hue and sets the lightness itself. All come
// from the brand or the puppy family; none is orange (in the brand, orange is
// the puppy's headphones alone). accent: the night sky's grey-blue nebula;
// success and warning: puppy-console's --ok and --listen; danger: a brick red
// kept well away from the headphones' hue; pro: the rooftop haze.
export const ROLES = {
  accent: '#313840',
  success: '#7f9a72',
  warning: '#c2a768',
  danger: '#b4483c',
  pro: '#a29cc2',
} as const

/** The only knobs of the eye-care palette. Change a number here, never a derived hex. */
export const EYE_CARE = {
  /** light mode: added to R, G, B of wall, card, line and edge alike (warmer, a little deeper) */
  lightShift: [-3, -6, -12] as const,
  /** light mode: text-primary on the wall, as a contrast ratio (the brand's is 12.4) */
  lightText: 10.5,
  /** dark mode: text-primary on the wall (the brand's is 14.0); the charcoal itself stays */
  darkText: 11,
  /** both modes: the least text-muted may have on the surface that is hardest for it */
  mutedMin: 4.6,
}

const rgb = (h: string): number[] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const hex = (c: number[]): Hex =>
  `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
const lin = (v: number): number => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const lum = (h: string): number => {
  const [r = 0, g = 0, b = 0] = rgb(h).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio of two six-digit hex colors. */
export const contrast = (a: string, b: string): number => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mix = (a: string, b: string, t: number): Hex => {
  const to = rgb(b)
  return hex(rgb(a).map((v, i) => v + ((to[i] ?? v) - v) * t))
}
const shift = (h: string, d: readonly number[]): Hex => hex(rgb(h).map((v, i) => v + (d[i] ?? 0)))

/** `from` walked toward `to` in 255 steps: the last step where `ok` still holds (or `from` itself). */
const walkWhile = (from: Hex, to: Hex, ok: (c: Hex) => boolean): Hex => {
  let last = from
  for (let i = 1; i <= 255; i++) {
    const c = mix(from, to, i / 255)
    if (!ok(c)) break
    last = c
  }
  return last
}
/** `from` walked toward `to`: the first step where `ok` holds (or `to`). */
const walkUntil = (from: Hex, to: Hex, ok: (c: Hex) => boolean): Hex => {
  for (let i = 0; i <= 255; i++) {
    const c = mix(from, to, i / 255)
    if (ok(c)) return c
  }
  return to
}

const easeOne = (m: Six, d: readonly number[], textTarget: number, hardest: 'wall' | 'card'): Six => {
  // 1. wall, card, line and edge move together, so the steps between them stay the brand's
  const wall = shift(m.wall, d)
  const card = shift(m.card, d)
  const line = shift(m.line, d)
  const edge = shift(m.edge, d)
  // 2. the text gives way toward the wall and stops at the target (never above the brand's)
  const text = walkWhile(m.text, wall, c => contrast(c, wall) >= textTarget)
  // 3. the muted text keeps the brand's value unless the moved surface left it short; then it leans to the text
  const behind = hardest === 'wall' ? wall : card
  const muted = walkUntil(m.muted, text, c => contrast(c, behind) >= EYE_CARE.mutedMin)
  return { wall, card, line, edge, text, muted }
}

/** The eye-care palette, worked out from the brand's: softer text, a warmer day wall. */
export const deriveEyeCare = (brand: Palette): Palette => ({
  // light: the wall is the darkest surface, so the hardest for muted text
  light: easeOne(brand.light, EYE_CARE.lightShift, EYE_CARE.lightText, 'wall'),
  // dark: the charcoal stays; cards are lighter than the wall, so the card is the hardest
  dark: easeOne(brand.dark, [0, 0, 0], EYE_CARE.darkText, 'card'),
})

export const paletteFor = (name: PaletteName): Palette => (name === 'eyecare' ? deriveEyeCare(BRAND) : BRAND)
