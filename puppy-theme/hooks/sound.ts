import type { ThemeSound } from 'claude-code'

import type { SoundSet } from '../types'

// The puppy's sounds: made by the app from these numbers, no recordings.
// Every set is soft, low and few, each in one key, and never a system chime.
// The person picks one in the /look pane.

// lofi room: a warm hum, a little vinyl crackle, now and then one far-off
// key; round cues in D minor pentatonic.
const LOFI: ThemeSound = {
  ambience: {
    reverb: 0.3,
    layers: [
      // the room: a low warm hum
      { wave: 'brown', drone: true, gain: 0.1, filter: { type: 'lowpass', hz: 500 } },
      // vinyl crackle, a few ticks a second
      { wave: 'crackle', scatter: 1.2, gain: 0.05, release: 0.05, filter: { type: 'highpass', hz: 1500 } },
      // a far-off key, about once every 25 seconds
      {
        wave: 'bell',
        scatter: 0.04,
        notes: ['D4', 'F4', 'A4', 'C5', 'D5'],
        gain: 0.08,
        attack: 0.02,
        release: 2.5,
        filter: { type: 'lowpass', hz: 1800 },
      },
    ],
  },
  cues: {
    // you sent a message: two soft notes up
    send: {
      layers: [{ wave: 'triangle', notes: ['A4', 'D5'], step: 0.07, gain: 0.25, release: 0.25, filter: { type: 'lowpass', hz: 2000 } }],
    },
    // a tool call starts (often): one tiny round pop
    tool: {
      layers: [{ wave: 'sine', notes: ['A5'], gain: 0.08, release: 0.06, filter: { type: 'lowpass', hz: 1800 } }],
    },
    // the conversation was compacted: a soft page-turn sigh
    compact: {
      layers: [{ wave: 'pink', gain: 0.15, attack: 0.08, release: 0.6, filter: { type: 'lowpass', hz: 2500, to: 300 } }],
    },
    // Claude finished: three slow bell notes settling down
    done: {
      reverb: 0.35,
      layers: [{ wave: 'bell', notes: ['A5', 'F5', 'D5'], step: 0.14, gain: 0.22, release: 1.2, filter: { type: 'lowpass', hz: 3000 } }],
    },
    // something asks you: a small curious "wuf?" that tips up
    ask: {
      layers: [{ wave: 'sine', notes: ['F4', 'C5'], step: 0.15, glide: 3, gain: 0.28, attack: 0.01, release: 0.16, filter: { type: 'lowpass', hz: 1500 } }],
    },
    // the turn broke: two low notes down, soft, not a buzzer
    error: {
      layers: [{ wave: 'triangle', notes: ['D4', 'A3'], step: 0.16, gain: 0.25, release: 0.35, filter: { type: 'lowpass', hz: 900 } }],
    },
    // you clicked the wall: one key, low on the left, high on the right
    click: {
      reverb: 0.25,
      layers: [{ wave: 'bell', notes: ['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'A5'], gain: 0.18, release: 0.8 }],
    },
  },
}

// wood: a quiet fan and a marimba in C major pentatonic, short and dry.
const WOOD: ThemeSound = {
  ambience: {
    reverb: 0.2,
    layers: [
      { wave: 'pink', drone: true, gain: 0.06, filter: { type: 'lowpass', hz: 800 } },
      { wave: 'sine', scatter: 0.05, notes: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'], gain: 0.07, attack: 0.003, release: 0.6 },
    ],
  },
  cues: {
    send: { layers: [{ wave: 'sine', notes: ['C5', 'E5'], step: 0.06, gain: 0.25, attack: 0.003, release: 0.25 }] },
    tool: { layers: [{ wave: 'sine', notes: ['G5'], gain: 0.07, attack: 0.002, release: 0.05 }] },
    compact: { layers: [{ wave: 'pink', gain: 0.12, attack: 0.05, release: 0.45, filter: { type: 'highpass', hz: 300, to: 3000 } }] },
    done: {
      reverb: 0.25,
      layers: [{ wave: 'sine', notes: ['E5', 'G5', 'C6'], step: 0.1, gain: 0.22, attack: 0.003, release: 0.5 }],
    },
    ask: { layers: [{ wave: 'triangle', notes: ['G4', 'D5'], step: 0.12, gain: 0.25, attack: 0.003, release: 0.2, filter: { type: 'lowpass', hz: 2000 } }] },
    error: { layers: [{ wave: 'sine', notes: ['E4', 'C4'], step: 0.15, gain: 0.25, attack: 0.003, release: 0.4, filter: { type: 'lowpass', hz: 800 } }] },
    click: { layers: [{ wave: 'sine', notes: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6'], gain: 0.18, attack: 0.003, release: 0.4 }] },
  },
}

// rain: soft rain on the window and a slow piano in A minor; a tool call is
// one drip.
const RAIN: ThemeSound = {
  ambience: {
    reverb: 0.35,
    layers: [
      { wave: 'pink', drone: true, gain: 0.11, filter: { type: 'lowpass', hz: 2500 } },
      { wave: 'crackle', scatter: 4, gain: 0.04, release: 0.03, filter: { type: 'highpass', hz: 3000 } },
      { wave: 'triangle', scatter: 0.03, notes: ['A3', 'C4', 'E4', 'G4', 'A4'], gain: 0.07, attack: 0.01, release: 3, filter: { type: 'lowpass', hz: 1500 } },
    ],
  },
  cues: {
    send: { layers: [{ wave: 'triangle', notes: ['E5', 'A5'], step: 0.08, gain: 0.22, release: 0.35, filter: { type: 'lowpass', hz: 1800 } }] },
    tool: { layers: [{ wave: 'sine', notes: ['C6'], glide: -5, gain: 0.07, release: 0.08 }] },
    compact: { layers: [{ wave: 'brown', gain: 0.18, attack: 0.15, release: 0.7, filter: { type: 'lowpass', hz: 1200 } }] },
    done: {
      reverb: 0.4,
      layers: [{ wave: 'triangle', notes: ['A5', 'E5', 'C5', 'A4'], step: 0.16, gain: 0.2, release: 1.5, filter: { type: 'lowpass', hz: 2000 } }],
    },
    ask: { layers: [{ wave: 'sine', notes: ['E4', 'B4'], step: 0.15, glide: 2, gain: 0.26, release: 0.18, filter: { type: 'lowpass', hz: 1500 } }] },
    error: { layers: [{ wave: 'triangle', notes: ['A3', 'E3'], step: 0.18, gain: 0.25, release: 0.4, filter: { type: 'lowpass', hz: 800 } }] },
    click: { layers: [{ wave: 'sine', notes: ['A4', 'C5', 'E5', 'G5', 'A5', 'C6'], glide: -4, gain: 0.15, release: 0.25 }] },
  },
}

// 8-bit: the pixel puppy's own little game sounds, square waves kept low and
// short; asking is a small "arf" that jumps up. No ambience but a faint hum.
const CHIP: ThemeSound = {
  ambience: {
    layers: [{ wave: 'brown', drone: true, gain: 0.05, filter: { type: 'lowpass', hz: 400 } }],
  },
  cues: {
    send: { layers: [{ wave: 'square', notes: ['C5', 'G5'], step: 0.05, gain: 0.1, attack: 0.002, release: 0.08, filter: { type: 'lowpass', hz: 3000 } }] },
    tool: { layers: [{ wave: 'square', notes: ['C6'], gain: 0.04, attack: 0.002, release: 0.02, filter: { type: 'lowpass', hz: 2500 } }] },
    compact: { layers: [{ wave: 'white', gain: 0.07, attack: 0.01, release: 0.3, filter: { type: 'lowpass', hz: 4000, to: 500 } }] },
    done: { layers: [{ wave: 'square', notes: ['C5', 'E5', 'G5', 'C6'], step: 0.07, gain: 0.1, attack: 0.002, release: 0.12, filter: { type: 'lowpass', hz: 3000 } }] },
    ask: { layers: [{ wave: 'square', notes: ['A4', 'A4'], step: 0.12, glide: 5, gain: 0.1, attack: 0.002, release: 0.09, filter: { type: 'lowpass', hz: 2500 } }] },
    error: { layers: [{ wave: 'triangle', notes: ['C4', 'G3'], step: 0.1, gain: 0.2, attack: 0.002, release: 0.2 }] },
    click: { layers: [{ wave: 'square', notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], gain: 0.08, attack: 0.002, release: 0.1, filter: { type: 'lowpass', hz: 3000 } }] },
  },
}

export const SOUNDS: Record<SoundSet, ThemeSound> = { lofi: LOFI, wood: WOOD, rain: RAIN, chip: CHIP }

export const SOUND_LABEL: Record<SoundSet, string> = {
  lofi: 'lofi room · hum, vinyl, a far-off key',
  wood: 'wood · a fan and a marimba',
  rain: 'rain · rain on the window, slow piano',
  chip: '8-bit · little game sounds',
}
