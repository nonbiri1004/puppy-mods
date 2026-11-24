import type { CueName, MessageStyle, PaletteName, Prefs, SoundSet, Wall } from '../types'

import { PALETTE_NAMES } from './palette'

// What the person picked in the /look pane. One source: the pane writes
// it, $.store keeps it across sessions on this computer, and the look is made
// from it alone.

export const STORE_KEY = 'prefs'

export const CUES: readonly CueName[] = ['send', 'tool', 'compact', 'done', 'ask', 'error', 'click']
export const WALLS: readonly Wall[] = ['sky', 'plain']
export const MESSAGE_STYLES: readonly MessageStyle[] = ['pixel', 'tape', 'bookmark', 'app']
export const SOUND_SETS: readonly SoundSet[] = ['lofi', 'wood', 'rain', 'chip']

export const DEFAULT_PREFS: Prefs = {
  on: true,
  colors: 'baibai',
  wall: 'sky',
  glass: false, // clear: the frame hangs where no words cross it, so the sky shows at full color
  messages: 'pixel',
  sounds: 'lofi',
  cues: { send: true, tool: true, compact: true, done: true, ask: true, error: true, click: true },
}

const isSoundSet = (v: unknown): v is SoundSet => typeof v === 'string' && (SOUND_SETS as readonly string[]).includes(v)
const isMessageStyle = (v: unknown): v is MessageStyle =>
  typeof v === 'string' && (MESSAGE_STYLES as readonly string[]).includes(v)
const isPalette = (v: unknown): v is PaletteName =>
  typeof v === 'string' && (PALETTE_NAMES as readonly string[]).includes(v)
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
    colors: isPalette(o.colors) ? o.colors : DEFAULT_PREFS.colors,
    wall: isWall(o.wall) ? o.wall : DEFAULT_PREFS.wall,
    glass: typeof o.glass === 'boolean' ? o.glass : DEFAULT_PREFS.glass,
    messages: isMessageStyle(o.messages)
      ? o.messages
      : o.style === false // an earlier build kept an on/off switch
        ? 'app'
        : DEFAULT_PREFS.messages,
    sounds: isSoundSet(o.sounds) ? o.sounds : DEFAULT_PREFS.sounds,
    cues: Object.fromEntries(
      CUES.map(c => [c, typeof cues[c] === 'boolean' ? (cues[c] as boolean) : DEFAULT_PREFS.cues[c]]),
    ) as Prefs['cues'],
  }
}
