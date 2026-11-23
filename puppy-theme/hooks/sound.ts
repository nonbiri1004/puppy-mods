import type { ThemeSound } from 'claude-code'

// The puppy's sounds: made by the app from these numbers, no recordings.
// Soft, low and few, like a lofi room: a warm hum, a little vinyl crackle,
// and now and then one far-off key. The cues are short and round, in one key
// (D minor pentatonic), and never a system chime.

export const SOUND: ThemeSound = {
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
