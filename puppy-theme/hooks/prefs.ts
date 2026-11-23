import type { CueName, Prefs, SoundSet, Wall } from '../types'

// What the person picked in the /look pane. One source: the pane writes
// it, $.store keeps it across sessions on this computer, and the look is made
// from it alone.

export const STORE_KEY = 'prefs'

export const CUES: readonly CueName[] = ['send', 'tool', 'compact', 'done', 'ask', 'error', 'click']
export const WALLS: readonly Wall[] = ['sky', 'plain']
export const SOUND_SETS: readonly SoundSet[] = ['lofi', 'wood', 'rain', 'chip']

export const DEFAULT_PREFS: Prefs = {
  on: true,
  wall: 'sky',
  style: true,
  sounds: 'lofi',
  cues: { send: true, tool: true, compact: true, done: true, ask: true, error: true, click: true },
}

const isSoundSet = (v: unknown): v is SoundSet => typeof v === 'string' && (SOUND_SETS as readonly string[]).includes(v)
const isWall = (v: unknown): v is Wall => typeof v === 'string' && (WALLS as readonly string[]).includes(v)

/**
 * Reads what an earlier version stored, field by field: a field it doesn't
 * know, or a value out of range, falls back to the default, and the rest stay.
 */
export const parsePrefs = (raw: unknown): Prefs => {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const cues = typeof o.cues === 'object' && o.cues !== null ? (o.cues as Record<string, unknown>) : {}
  return {
    on: typeof o.on === 'boolean' ? o.on : DEFAULT_PREFS.on,
    wall: isWall(o.wall) ? o.wall : DEFAULT_PREFS.wall,
    style: typeof o.style === 'boolean' ? o.style : DEFAULT_PREFS.style,
    sounds: isSoundSet(o.sounds) ? o.sounds : DEFAULT_PREFS.sounds,
    cues: Object.fromEntries(
      CUES.map(c => [c, typeof cues[c] === 'boolean' ? (cues[c] as boolean) : DEFAULT_PREFS.cues[c]]),
    ) as Prefs['cues'],
  }
}
