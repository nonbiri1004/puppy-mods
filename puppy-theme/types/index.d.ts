// the seven moments the desktop app plays a theme's cue
export type CueName = 'send' | 'tool' | 'compact' | 'done' | 'ask' | 'error' | 'click'

// baibai: the brand's own warm greys; eyecare: worked out from them, softer text and a warmer light-mode wall
export type PaletteName = 'baibai' | 'eyecare'

// sky: the framed sky on the wall, following the time of day; plain: the wall color alone
export type Wall = 'sky' | 'plain'

// how your messages are drawn: pixel card with a tail, taped paper note, card with a bookmark strip,
// or the app's own rows
export type MessageStyle = 'pixel' | 'tape' | 'bookmark' | 'app'

// lofi: hum, vinyl, a far-off key; wood: a fan and a marimba; rain: rain and slow piano; chip: 8-bit
export type SoundSet = 'lofi' | 'wood' | 'rain' | 'chip'

// what the person picked in the /look pane; kept in $.store under 'prefs'
export type Prefs = {
  // false: the app's own look, the picks below kept for later
  on: boolean
  colors: PaletteName
  wall: Wall
  // frosted glass on the panels over the framed sky; off lets the sky show through clear
  glass: boolean
  // the message style; 'app' keeps the app's own rows
  messages: MessageStyle
  // which set of sounds plays
  sounds: SoundSet
  // each cue on or off; the app's speaker still turns all sound on and off
  cues: Record<CueName, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-theme': { prefs: Prefs }
  }
}
