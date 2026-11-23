// the seven moments the desktop app plays a theme's cue
export type CueName = 'send' | 'tool' | 'compact' | 'done' | 'ask' | 'error' | 'click'

// sky: the framed night sky on the wall; plain: the wall color alone
export type Wall = 'sky' | 'plain'

// lofi: hum, vinyl, a far-off key; wood: a fan and a marimba; rain: rain and slow piano; chip: 8-bit
export type SoundSet = 'lofi' | 'wood' | 'rain' | 'chip'

// what the person picked in the /look pane; kept in $.store under 'prefs'
export type Prefs = {
  // false: the app's own look, the picks below kept for later
  on: boolean
  wall: Wall
  // the message style (pixel cards, airier text, quiet tool rows); off keeps the app's own rows
  style: boolean
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
