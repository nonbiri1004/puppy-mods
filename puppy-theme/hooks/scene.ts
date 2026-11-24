// The backdrop: a plain warm-grey wall (paper in light mode, charcoal in dark) with
// one small framed sky hung beside the sidebar, like the radio screen on
// lofipuppy.app. Pixel art, crisp edges, slow motion, nothing flashes.
//
// Where: the root svg has no viewBox, so a unit is a CSS pixel and the frame
// keeps its place beside the sidebar (199 px) at any window size. It hangs in
// the strip between the sidebar and the text column, which stays clear with the
// sidebar open, the right pane open or shut:
//   scene under 1364 px wide (or 320 tall): the wall alone, there is no room
//   1364 to 1619: a slim upright frame, 24×96, at x 206
//   1620 and up: the wide frame, 116×76, at x 217
// Both frames: a 2 px edge, a 2 px inner line, a shadow 2 right and 4 down.
// (A folded sidebar with the pane open moves the text over the slim frame;
// the API doesn't tell a backdrop that, so plain wall is the way out.)
//
// What: the sky follows the real time of day (dawn, day, dusk, night), with a
// shooting star now and then at night; with the rain sounds picked, it rains.

import type { PaletteName } from '../types'

import { night } from './brand-colors'
import { paletteFor } from './palette'

export type Period = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'rain'

/** The time of day for a local hour: dawn 5–7, day 7–17, dusk 17–19, night 19–5. */
export const periodOf = (hour: number): Period =>
  hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night'

// Sky colors, top to bottom. None is orange: in the brand that is the puppy's headphones alone.
// The clear night is the brand's night screen; the rest are worked out around it,
// warm at night like the brand's charcoal.
const SKY: Record<Weather, Record<Period, readonly [string, string]>> = {
  clear: {
    dawn: ['#2e2b28', '#8a8f9a'],
    day: ['#9aa3ad', '#c6c9cb'], // the bottom kept off the frame's inner line
    dusk: ['#3a3f4a', '#7a7488'],
    night: [night.night, night.skyBottom],
  },
  rain: {
    dawn: ['#2c2e31', '#5d636b'],
    day: ['#7d858d', '#a9adb0'],
    dusk: ['#30343b', '#555a63'],
    night: [night.night, '#2b2926'],
  },
}
const STAR = night.nightText
const NEBULA = { warm: night.nebulaWarm, warmLow: '#3b3530', blue: night.nebulaBlue, blueLow: '#2b3036' }
// Dusk's sky is lighter than the night's, so its nebula and planet are lighter
// than the sky too (the night's colors there read as dark smudges).
const DUSK_NEBULA = { blue: '#8b8594', blueLow: '#7f7a8a' }
const PLANET = { night: { body: '#5d5750', lit: '#77706a' }, dusk: { body: '#8f8a9c', lit: '#a5a0b0' } }
const CLOUD = '#e8e6e1'
const RAIN = '#b4bac1'
const WINDOW = night.nightText
// In dark mode a day sky is the brightest thing on the screen; a shade over it
// (hidden in light mode) turns it to an overcast day that sits with the charcoal.
const DAY_SHADE = 0.4
const TOWN = night.night // the brand's night, warm like the clear night

/** The scene names: one per palette, time of day and weather, so a change redraws (letters, digits and - only). */
export const SCENE_ID = 'puppy-sky'
export const sceneName = (palette: PaletteName, period: Period, weather: Weather): string =>
  `${SCENE_ID}-${palette}-${period}-${weather}`
export const readSceneName = (
  name: string,
): { palette: PaletteName; period: Period; weather: Weather } | undefined => {
  if (!name.startsWith(`${SCENE_ID}-`)) return undefined
  const [palette, period, weather, ...rest] = name.slice(SCENE_ID.length + 1).split('-')
  if (rest.length > 0) return undefined
  if (palette !== 'baibai' && palette !== 'eyecare') return undefined
  if (period !== 'dawn' && period !== 'day' && period !== 'dusk' && period !== 'night') return undefined
  if (weather !== 'clear' && weather !== 'rain') return undefined
  return { palette, period, weather }
}

type Star = readonly [x: number, y: number, cross: boolean, group: 0 | 1 | 2, delay: number]

const SLIM_STARS: readonly Star[] = [
  [2, 6, false, 0, 0], [10, 12, true, 1, 2.1], [4, 26, false, 2, 4.3], [12, 36, false, 0, 1.2],
  [6, 46, false, 1, 5.6], [2, 60, false, 2, 2.7], [12, 64, false, 0, 4.9], [4, 82, false, 1, 0.8],
]
const WIDE_STARS: readonly Star[] = [
  [10, 6, true, 0, 0], [26, 16, false, 1, 2.1], [44, 6, false, 2, 4.3], [52, 28, false, 0, 1.2],
  [96, 8, true, 1, 2.7], [100, 30, false, 2, 5.6], [8, 26, false, 0, 4.9], [16, 56, false, 1, 0.8],
  [62, 40, false, 2, 3.9], [70, 56, true, 0, 6.1], [98, 62, false, 1, 1.7], [38, 60, false, 2, 2.4],
]

const rect = (x: number, y: number, w: number, h: number, fill?: string, extra = ''): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${fill ? ` fill="${fill}"` : ''}${extra}/>`

const star = ([x, y, cross, group, delay]: Star): string =>
  cross
    ? `<g class="s s${group}" style="animation-delay:-${delay}s">${rect(x, y, 2, 6)}${rect(x - 2, y + 2, 6, 2)}</g>`
    : rect(x, y, 2, 2, undefined, ` class="s s${group}" style="animation-delay:-${delay}s"`)

// The sky inside one frame: w×h art pixels, the stars it may show, and where
// its nebulae, planet and clouds sit.
type Layout = {
  w: number
  h: number
  stars: readonly Star[]
  /** the grey-blue nebula, in the given colors */
  blue: (c: string, low: string) => string
  /** the warm nebula, night only */
  warm: string
  planet: readonly [number, number]
  clouds: readonly (readonly [number, number, number])[]
  /** shooting stars: start x, start y, travel x, travel y */
  meteors: readonly (readonly [number, number, number, number])[]
}

const SLIM: Layout = {
  w: 16,
  h: 88,
  stars: SLIM_STARS,
  blue: (c, low) => rect(6, 18, 10, 4, c) + rect(8, 22, 8, 2, low),
  warm: rect(0, 50, 10, 4, NEBULA.warm) + rect(2, 46, 6, 4, NEBULA.warm) + rect(0, 54, 12, 2, NEBULA.warmLow),
  planet: [8, 70],
  clouds: [[0, 20, 10], [6, 48, 10]],
  meteors: [[14, 4, -12, 24], [16, 30, -14, 26]],
}
const WIDE: Layout = {
  w: 108,
  h: 68,
  stars: WIDE_STARS,
  blue: (c, low) => rect(58, 14, 32, 6, c) + rect(64, 8, 18, 6, c) + rect(54, 20, 26, 4, low),
  warm: rect(10, 38, 36, 6, NEBULA.warm) + rect(18, 32, 24, 6, NEBULA.warm) + rect(24, 44, 30, 4, NEBULA.warmLow),
  planet: [84, 48],
  clouds: [[8, 14, 30], [52, 30, 36], [24, 48, 24]],
  meteors: [[96, 4, -40, 26], [70, 2, -34, 30]],
}

const planet = ([x, y]: readonly [number, number], c: { body: string; lit: string }): string =>
  rect(x + 1, y, 4, 2, c.body) + rect(x, y + 2, 6, 4, c.body) + rect(x + 1, y + 6, 4, 2, c.body) +
  rect(x + 1, y + 2, 2, 2, c.lit)

// A shooting star: a short pixel streak, hidden at rest, crossing once a cycle.
// Each has its own keyframes (no CSS variables), named by the frame width.
const meteor = (w: number) => ([x, y, dx, dy]: readonly [number, number, number, number], i: number): string =>
  `<style>.m-${w}-${i}{animation-name:shoot-${w}-${i}}` +
  `@keyframes shoot-${w}-${i}{0%,95.9%{opacity:0;transform:translate(0,0)}96%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(${dx}px,${dy}px)}}</style>` +
  `<g class="m m${i} m-${w}-${i}">` +
  rect(x, y, 2, 2, STAR) + rect(x + 2, y - 2, 2, 2, STAR, ' opacity=".6"') + rect(x + 4, y - 4, 2, 2, STAR, ' opacity=".3"') +
  `</g>`

// Rain: two stacked copies of the same streaks slide down one sky height, so it loops.
// The streaks are 1 px on purpose, finer than the 2 px art; everything else sits on the 2 px grid.
const rain = (l: Layout, period: Period): string => {
  const streaks: string[] = []
  const step = l.w > 40 ? 9 : 5
  for (let x = 1, i = 0; x < l.w; x += step, i++) {
    for (let y = (i * 13) % 17; y < l.h; y += 17) streaks.push(rect(x, y, 1, 4))
  }
  const one = streaks.join('')
  const drops = [0, 1, 2].map(i => {
    const x = Math.round(((i + 1) * l.w) / 8) * 2
    return rect(x, 4 + i * 6, 2, 2, RAIN, ` class="drop drop-${l.w}" style="animation-delay:-${i * 4.5}s"`)
  })
  // Under a day sky in light mode the near-black town was the heaviest spot on the
  // screen; there it takes the brand's muted grey (the .town-day rules below).
  const cls = period === 'day' ? ' class="town-day"' : ''
  const town =
    rect(0, l.h - 8, l.w, 8, TOWN, cls) + rect(Math.round(l.w / 4) * 2, l.h - 12, Math.round(l.w / 6) * 2, 4, TOWN, cls)
  const windows = [0.2, 0.55, 0.8].map(
    (f, i) => rect(Math.round((f * l.w) / 2) * 2, l.h - 6, 2, 2, WINDOW, ` class="win" style="animation-delay:-${i * 3.7}s"`),
  )
  return (
    `<g class="rain-${l.w}" fill="${RAIN}" opacity=".45"><g>${one}</g><g transform="translate(0 -${l.h})">${one}</g></g>` +
    `<style>.rain-${l.w}{animation:fall-${l.w} 7s linear infinite}@keyframes fall-${l.w}{from{transform:translateY(0)}to{transform:translateY(${l.h}px)}}` +
    `.drop-${l.w}{animation-name:slide-${l.w}}@keyframes slide-${l.w}{0%{transform:translateY(0);opacity:.6}85%{opacity:.6}100%{transform:translateY(${l.h - 10}px);opacity:0}}</style>` +
    town + windows.join('') + drops.join('')
  )
}

const sky = (l: Layout, period: Period, weather: Weather): string => {
  const id = `sky-${l.w}`
  const [top, bottom] = SKY[weather][period]
  const parts = [
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`,
    rect(0, 0, l.w, l.h, `url(#${id})`),
  ]
  if (weather === 'rain') {
    parts.push(rain(l, period))
  } else if (period === 'day') {
    parts.push(`<g class="cloud" fill="${CLOUD}" opacity=".7">${l.clouds.map(([x, y, w]) => rect(x, y, w, 2) + rect(x + 2, y - 2, w - 4, 2)).join('')}</g>`)
  }
  if (period === 'day') {
    parts.push(rect(0, 0, l.w, l.h, '#000', ' class="day-shade"'))
  } else if (weather === 'clear') {
    // dawn: a few last stars only; dusk: a light nebula and planet; night: all of it
    const shown = period === 'night' ? l.stars : period === 'dusk' ? l.stars.slice(0, 4) : l.stars.slice(0, 2)
    if (period === 'night') {
      parts.push(`<g class="neb" opacity=".9">${l.warm}${l.blue(NEBULA.blue, NEBULA.blueLow)}</g>`, planet(l.planet, PLANET.night))
    } else if (period === 'dusk') {
      parts.push(`<g class="neb" opacity=".5">${l.blue(DUSK_NEBULA.blue, DUSK_NEBULA.blueLow)}</g>`, planet(l.planet, PLANET.dusk))
    }
    parts.push(`<g class="stars" fill="${STAR}">${shown.map(star).join('')}</g>`)
    if (period === 'night') parts.push(l.meteors.map(meteor(l.w)).join(''))
  }
  return `<svg width="${l.w}" height="${l.h}" viewBox="0 0 ${l.w} ${l.h}">${parts.join('')}</svg>`
}

export const drawScene = (palette: PaletteName = 'baibai', period: Period = 'night', weather: Weather = 'clear'): string => {
  const { light: l, dark: d } = paletteFor(palette)
  // The middle panel is see-through over the sky, so it shows this wall. In dark
  // mode the plain wall's middle panel is the card (#232321), and the charcoal
  // wall (#191917) read far darker there; so the dark sky wall is the card too.
  // In light mode the wall stays the brand's paper grey.
  const slim = sky(SLIM, period, weather).replace('<svg ', '<svg x="210" y="88" ')
  const wide = sky(WIDE, period, weather).replace('<svg ', '<svg x="221" y="98" ')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" shape-rendering="crispEdges">`,
    `<style>`,
    `.wall{fill:${l.wall}}`,
    `.frame{fill:${l.edge}}.frame-in{fill:${l.line}}.shade{fill:${l.text};opacity:.08}`,
    `.cord{stroke:${l.edge}}.nail{fill:${l.muted}}.day-shade{opacity:0}.town-day{fill:${l.muted}}`,
    `@media (prefers-color-scheme: dark){`,
    `.wall{fill:${d.card}}.frame{fill:${d.edge}}.frame-in{fill:${d.line}}.shade{fill:#000;opacity:.25}`,
    `.cord{stroke:${d.edge}}.nail{fill:${d.muted}}.day-shade{opacity:${DAY_SHADE}}.town-day{fill:${TOWN}}}`,
    `.slim,.wide{display:none}`,
    `@media (min-width: 1364px) and (max-width: 1619px) and (min-height: 320px){.slim{display:inline}}`,
    `@media (min-width: 1620px) and (min-height: 320px){.wide{display:inline}}`,
    `.s{opacity:.85;animation:tw 7s ease-in-out infinite}`,
    `.s1{animation-duration:9s}.s2{animation-duration:11s}`,
    `@keyframes tw{0%,100%{opacity:.85}50%{opacity:.3}}`,
    `.neb,.cloud{animation:drift 40s ease-in-out infinite alternate}`,
    `@keyframes drift{from{transform:translateX(0)}to{transform:translateX(2px)}}`,
    // shooting stars rest hidden; each crosses for the last 4% of its cycle (about 2 seconds)
    `.m{opacity:0;animation-duration:47s;animation-timing-function:linear;animation-iteration-count:infinite}.m1{animation-duration:59s;animation-delay:-21s}`,
    `.drop{opacity:.6;animation-duration:14s;animation-timing-function:ease-in;animation-iteration-count:infinite}`,
    `.win{opacity:.55;animation:glow 11s ease-in-out infinite}`,
    `@keyframes glow{0%,100%{opacity:.3}50%{opacity:.8}}`,
    `</style>`,
    `<rect class="wall" width="100%" height="100%"/>`,
    `<g class="slim">`,
    `<path class="cord" d="M211 84 L218 68 L225 84" fill="none" stroke-width="1"/>`,
    rect(216, 66, 4, 4, undefined, ' class="nail"'),
    rect(208, 88, 24, 96, undefined, ' class="shade"'),
    rect(206, 84, 24, 96, undefined, ' class="frame"'),
    rect(208, 86, 20, 92, undefined, ' class="frame-in"'),
    slim,
    `</g>`,
    `<g class="wide">`,
    `<path class="cord" d="M241 94 L275 70 L309 94" fill="none" stroke-width="2"/>`,
    rect(273, 68, 4, 4, undefined, ' class="nail"'),
    rect(219, 98, 116, 76, undefined, ' class="shade"'),
    rect(217, 94, 116, 76, undefined, ' class="frame"'),
    rect(219, 96, 112, 72, undefined, ' class="frame-in"'),
    wide,
    `</g>`,
    `</svg>`,
  ].join('')
}
