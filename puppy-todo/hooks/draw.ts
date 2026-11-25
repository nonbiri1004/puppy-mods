// Bare puppy frames come from baibai-brand (puppy.ts, generated).
import { sit, sitBlink, sleep0, sleep1 } from './puppy'
import { sit as blockSit, sleep0 as blockSleep0 } from './puppy-blocks'
import type { BlockRun } from './puppy-blocks'

export type Mood = 'sitting' | 'sleeping'
const MOODS: Record<Mood, { frames: string[]; seconds: number }> = {
  sitting: { frames: [sit, sit, sit, sit, sit, sit, sit, sit, sit, sitBlink], seconds: 4 },
  sleeping: { frames: [sleep0, sleep1], seconds: 3 },
}
const SCALE = 2

// one frame shown at a time, swapped by SMIL; each frame is visible for its share of the loop
export function mascot(mood: Mood): string {
  const { frames, seconds } = MOODS[mood]
  const w = 34 * SCALE
  const h = 26 * SCALE
  const n = frames.length
  const keyTimes = frames.map((_, i) => (i / n).toFixed(4)).join(';')
  const body = frames.map((rects, i) => {
    const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')

    return (
      `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${rects}` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${seconds}s" repeatCount="indefinite" calcMode="discrete"/></g>`
    )
  }).join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 26" shape-rendering="crispEdges">` +
    `${body}</svg>`
  )
}

// One unscaled still frame on surfaces without Svg.
const STILLS: Record<Mood, BlockRun[][]> = { sitting: blockSit, sleeping: blockSleep0 }
export const stillBlocks = (mood: Mood): BlockRun[][] => STILLS[mood]
