// The backdrop: a plain warm-grey wall (paper by day, charcoal by night) with
// one small framed night sky hung in the top right corner, like the radio
// screen on lofipuppy.app. The sky is the same in both modes (baibai-brand:
// "夜空小螢幕" night #151412 → #23211e, nebula #443c35 / #313840, warm white
// stars). Pixel art, crisp edges, slow twinkles, nothing flashes.

import { BRAND, type Palette } from './palette'

/** The name the backdrop asks for, and the Backdrop hook answers to. */
export const SCENE_ID = 'framed-night'

// Frame placement inside the 1200×800 view, anchored top right.
const F = { x: 948, y: 56, w: 200, h: 130 }

// Stars: [x, y, size, delay seconds]. Size 1 is one pixel, 2 is a small cross.
const STARS: readonly (readonly [number, number, 1 | 2, number])[] = [
  [18, 14, 2, 0],
  [46, 30, 1, 2.1],
  [71, 12, 1, 4.3],
  [96, 40, 2, 1.2],
  [124, 18, 1, 3.4],
  [150, 34, 1, 5.6],
  [168, 12, 2, 2.7],
  [30, 62, 1, 4.9],
  [62, 78, 1, 0.8],
  [110, 70, 1, 3.9],
  [140, 88, 2, 6.1],
  [176, 64, 1, 1.7],
  [14, 96, 1, 5.2],
  [84, 102, 1, 2.4],
]

const P = 2 // one art pixel, in view units

const star = ([x, y, size, delay]: (typeof STARS)[number], i: number): string => {
  const cls = `s s${i % 3}`
  const style = `animation-delay:-${delay}s`
  if (size === 1) {
    return `<rect class="${cls}" style="${style}" x="${x}" y="${y}" width="${P}" height="${P}"/>`
  }
  return (
    `<g class="${cls}" style="${style}">` +
    `<rect x="${x}" y="${y - P}" width="${P}" height="${P * 3}"/>` +
    `<rect x="${x - P}" y="${y}" width="${P * 3}" height="${P}"/>` +
    `</g>`
  )
}

const sky = (): string => {
  const { x, y, w, h } = F
  const inner = { x: x + 8, y: y + 8, w: w - 16, h: h - 16 }
  return [
    // string and nail
    `<path class="cord" d="M${x + 40} ${y} L${x + w / 2} ${y - 34} L${x + w - 40} ${y}" fill="none" stroke-width="2"/>`,
    `<rect class="nail" x="${x + w / 2 - 3}" y="${y - 38}" width="6" height="6"/>`,
    // soft shadow, then the frame itself
    `<rect class="shade" x="${x + 4}" y="${y + 6}" width="${w}" height="${h}"/>`,
    `<rect class="frame" x="${x}" y="${y}" width="${w}" height="${h}"/>`,
    `<rect class="frame-in" x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}"/>`,
    // the sky
    `<svg x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" viewBox="0 0 ${inner.w} ${inner.h}">`,
    `<rect width="${inner.w}" height="${inner.h}" fill="url(#night)"/>`,
    `<g class="neb">`,
    `<rect x="20" y="58" width="60" height="10" fill="#443c35"/>`,
    `<rect x="34" y="50" width="40" height="8" fill="#443c35"/>`,
    `<rect x="44" y="68" width="48" height="8" fill="#3b3530"/>`,
    `<rect x="100" y="26" width="52" height="8" fill="#313840"/>`,
    `<rect x="110" y="18" width="30" height="8" fill="#313840"/>`,
    `<rect x="92" y="34" width="44" height="6" fill="#2b3036"/>`,
    `</g>`,
    // a small grey planet, low in the corner
    `<rect x="146" y="84" width="10" height="2" fill="#5d5750"/>`,
    `<rect x="144" y="86" width="14" height="8" fill="#5d5750"/>`,
    `<rect x="146" y="94" width="10" height="2" fill="#5d5750"/>`,
    `<rect x="148" y="86" width="4" height="2" fill="#77706a"/>`,
    `<g class="stars">${STARS.map(star).join('')}</g>`,
    `</svg>`,
  ].join('')
}

export const drawScene = (p: Palette = BRAND): string => {
  const { light: l, dark: d } = p
  return [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMaxYMin meet" shape-rendering="crispEdges">`,
  `<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1">`,
  `<stop offset="0" stop-color="#151412"/><stop offset="1" stop-color="#23211e"/>`,
  `</linearGradient></defs>`,
  `<style>`,
  `.wall{fill:${l.wall}}`,
  `.frame{fill:${l.edge}}.frame-in{fill:${l.line}}.shade{fill:${l.text};opacity:.08}`,
  `.cord{stroke:${l.edge}}.nail{fill:${l.muted}}`,
  `@media (prefers-color-scheme: dark){`,
  `.wall{fill:${d.wall}}.frame{fill:${d.edge}}.frame-in{fill:${d.line}}.shade{fill:#000;opacity:.25}`,
  `.cord{stroke:${d.edge}}.nail{fill:${d.muted}}}`,
  `.stars{fill:#efe8da}`,
  `.s{opacity:.85;animation:tw 7s ease-in-out infinite}`,
  `.s1{animation-duration:9s}.s2{animation-duration:11s}`,
  `@keyframes tw{0%,100%{opacity:.85}50%{opacity:.3}}`,
  `.neb{opacity:.9;animation:drift 40s ease-in-out infinite alternate}`,
  `@keyframes drift{from{transform:translateX(0)}to{transform:translateX(6px)}}`,
  `</style>`,
  `<rect class="wall" x="-20000" y="-20000" width="40000" height="40000"/>`,
  sky(),
  `</svg>`,
  ].join('')
}
