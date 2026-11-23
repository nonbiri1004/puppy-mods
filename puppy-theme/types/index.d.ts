// the palettes in hooks/palette.ts
export type PaletteName = 'warm' | 'gruvbox'

// the seven moments the desktop app plays a theme's cue
export type CueName = 'send' | 'tool' | 'compact' | 'done' | 'ask' | 'error' | 'click'

// sky: the framed night sky on the wall; plain: the palette's wall color alone
export type Wall = 'sky' | 'plain'

// what the person picked in the /look pane; kept in $.store under 'prefs'
export type Prefs = {
  palette: PaletteName
  wall: Wall
  // the message style (pixel cards, airier text, quiet tool rows); off keeps the app's own rows
  style: boolean
  // each cue on or off; the app's speaker still turns all sound on and off
  cues: Record<CueName, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    // listening: the cue the wall's click plays for now, from the pane; null when none
    // heard: wall clicks the app reported while listening
    'puppy-theme': { prefs: Prefs; listening: CueName | null; heard: number }
  }
}
