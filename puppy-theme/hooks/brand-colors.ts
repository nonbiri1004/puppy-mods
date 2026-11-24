// Copied by hand from baibai-brand dist/brand-colors.ts (nonbiri1004/baibai-brand#117, made from
// docs/品牌風格.md, the brand color tables). It has the same name and shape as that file, so the
// sync that comes next (T177) can replace this file with the generated one. Don't change a value
// here: change baibai-brand, then sync.

/** Page colors in light mode. */
export const light = {
  wall: '#eeede9',
  card: '#f8f7f4',
  line: '#dcdad4',
  edge: '#cdcac3',
  text: '#2a2926',
  muted: '#6d6a64',
} as const

/** Page colors in dark mode. */
export const dark = {
  wall: '#191917',
  card: '#232321',
  line: '#353431',
  edge: '#45433f',
  text: '#e7e5e0',
  muted: '#9b9891',
} as const

/** The little night screen on the wall: the same in light and dark mode. */
export const night = {
  night: '#151412',
  nightText: '#e9e4da',
  nightMuted: '#a7a196',
  skyBottom: '#23211e',
  nebulaWarm: '#443c35',
  nebulaBlue: '#313840',
} as const

export type PageColors = { readonly [K in keyof typeof light]: string }
