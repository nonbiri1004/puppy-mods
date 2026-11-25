// The puppy, as baibai-brand draws it (generated, see brand.lock.json), and how a line is cut to fit
// the terminal. The puppy is the bare one (no headphones): a coding tool.
import { sit, sitBlink, sleep0, sleep1, typing0, typing1, typing2, typing3, typing4, typing5 } from './puppy'
import { sit as blockSit, sleep0 as blockSleep0, typing0 as blockTyping0 } from './puppy-blocks'
import type { BlockRun } from './puppy-blocks'

// Cut a line to fit the terminal's columns. n is in Latin letters; a CJK character counts as two.
const wide = (c: string) => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(c)
// Counted and cut by code point, so an emoji is never split in half; the … takes one column.
export function cut(s: string, n: number): string {
  const chars = [...s]
  const width = (c: string) => (wide(c) ? 2 : 1)
  if (chars.reduce((sum, c) => sum + width(c), 0) <= n) return s
  let used = 1
  let out = ''
  for (const c of chars) {
    if (used + width(c) > n) break
    used += width(c)
    out += c
  }
  return `${out}…`
}

// The puppy beside the pane's first row, as puppy-skills draws it: typing at its laptop while a
// conversation is running, sitting (and blinking) while one waits for you, asleep when nothing goes on.
export type Mood = 'typing' | 'sitting' | 'sleeping'
const MOODS: Record<Mood, { frames: string[]; seconds: number }> = {
  // slower than the pet's 6 fps: motion stays slow and small
  typing: { frames: [typing0, typing1, typing2, typing3, typing4, typing5], seconds: 2.4 },
  sitting: { frames: [sit, sit, sit, sit, sit, sit, sit, sit, sit, sitBlink], seconds: 4 },
  sleeping: { frames: [sleep0, sleep1], seconds: 3 },
}
export const MASCOT_SCALE = 2

// one frame shown at a time, swapped by SMIL; each frame is visible for its share of the loop
export function mascot(mood: Mood): string {
  const { frames, seconds } = MOODS[mood]
  const n = frames.length
  const keyTimes = frames.map((_, i) => (i / n).toFixed(4)).join(';')
  const body = frames.map((rects, i) => {
    const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
    return `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${rects}` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${seconds}s" repeatCount="indefinite" calcMode="discrete"/></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${34 * MASCOT_SCALE}" height="${26 * MASCOT_SCALE}" viewBox="0 0 34 26" shape-rendering="crispEdges">${body}</svg>`
}

// The same puppy for a surface with no Svg (the terminal), from baibai-brand's block output:
// each character holds two pixels stacked, as Claude Code draws its mascot. One still frame per
// mood: redrawing the pane a few times a second would flicker, and the puppy moves slowly anyway.
// The pane's rows (e.props.scroll.bodyRows) the block puppy needs: its 13 rows take at most half.
// Shorter, it is left out, never shrunk. puppy-todo and puppy-skills use the same number.
export const PUPPY_MIN_ROWS = 26
// The columns (e.props.bodyColumns) it needs: a narrower pane would wrap its rows apart.
export const PUPPY_COLUMNS = 34
const STILLS: Record<Mood, BlockRun[][]> = { typing: blockTyping0, sitting: blockSit, sleeping: blockSleep0 }
export const stillBlocks = (mood: Mood): BlockRun[][] => STILLS[mood]
