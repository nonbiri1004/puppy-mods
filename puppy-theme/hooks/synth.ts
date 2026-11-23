import type { ThemeCue } from 'claude-code'

// A small synthesizer for the /look pane's ▶ buttons. The desktop app makes a
// theme's cues itself and a mod can't ask it to play one, so this renders the
// same numbers (sound.ts) into a short WAV in memory for $.audio.play. It is
// close to the app's sound, not the same synthesizer: no file, no recording.

export const RATE = 22050

type Layer = ThemeCue['layers'][number]
type Filter = { type: 'lowpass' | 'highpass' | 'bandpass'; hz: number; to?: number }

const NOTE = /^([A-Ga-g])([#b]?)(-?\d)$/
const SEMI: Record<string, number> = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 }

/** A note name (`A4`, `F#3`, `Bb2`) or hertz to hertz; 0 is a rest. */
export const hz = (note: string | number): number => {
  if (typeof note === 'number') {
    return note
  }
  const m = NOTE.exec(note)
  if (m === null) {
    return 0
  }
  const [, letter = 'a', accidental, octave = '4'] = m
  const semis = (SEMI[letter.toLowerCase()] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + (Number(octave) - 4) * 12
  return 440 * 2 ** (semis / 12)
}

// Same noise every press: a tiny seeded generator.
const noise = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) / 0xffffffff) * 2 - 1
  }
}

const tone = (wave: string, phase: number, t: number): number => {
  const x = phase - Math.floor(phase)
  switch (wave) {
    case 'triangle':
      return 1 - 4 * Math.abs(x - 0.5)
    case 'square':
      return x < 0.5 ? 0.6 : -0.6
    case 'saw':
      return (2 * x - 1) * 0.6
    case 'bell':
      // a sine with two quicker-fading, inharmonic partials
      return (
        Math.sin(2 * Math.PI * phase) +
        0.45 * Math.exp(-t * 6) * Math.sin(2 * Math.PI * phase * 2.76) +
        0.2 * Math.exp(-t * 10) * Math.sin(2 * Math.PI * phase * 5.4)
      ) / 1.3
    default:
      return Math.sin(2 * Math.PI * phase)
  }
}

// A two-pole state-variable filter, its cutoff moving from hz to `to` over the hit.
const filtered = (input: Float32Array, f: Filter | undefined): Float32Array => {
  if (f === undefined) {
    return input
  }
  const out = new Float32Array(input.length)
  let low = 0
  let band = 0
  for (let i = 0; i < input.length; i++) {
    const k = input.length > 1 ? i / (input.length - 1) : 0
    const cut = f.to === undefined ? f.hz : f.hz * (f.to / f.hz) ** k
    const g = 2 * Math.sin((Math.PI * Math.min(cut, RATE / 4)) / RATE)
    const high = (input[i] ?? 0) - low - 0.7 * band
    band += g * high
    low += g * band
    out[i] = f.type === 'lowpass' ? low : f.type === 'highpass' ? high : band
  }
  return out
}

/** One layer of a cue, as samples. */
const renderLayer = (layer: Layer, seed: number): Float32Array => {
  const attack = 'attack' in layer && layer.attack !== undefined ? layer.attack : 0.005
  const release = 'release' in layer && layer.release !== undefined ? layer.release : 0.4
  const gain = layer.gain ?? 0.5
  const hit = attack + release
  const isTone = 'notes' in layer
  const notes = isTone ? layer.notes.map(hz) : [1]
  const step = isTone && layer.step !== undefined ? layer.step : 0
  const glide = isTone && 'glide' in layer && layer.glide !== undefined ? layer.glide : 0
  const total = Math.ceil((step * (notes.length - 1) + hit) * RATE)
  const out = new Float32Array(total)
  const rand = noise(seed)
  let brown = 0
  let pink = 0

  notes.forEach((f, n) => {
    if (f === 0) {
      return
    }
    const start = Math.round(step * n * RATE)
    let phase = 0
    for (let i = 0; i < hit * RATE && start + i < total; i++) {
      const t = i / RATE
      const env = t < attack ? t / attack : Math.exp((-(t - attack) / release) * 5)
      let s: number
      if (isTone) {
        const freq = f * 2 ** ((glide * (t / hit)) / 12)
        phase += freq / RATE
        s = tone(layer.wave, phase, t)
      } else {
        const w = rand()
        brown = (brown + 0.02 * w) / 1.02
        pink = 0.97 * pink + 0.03 * w
        s =
          layer.wave === 'brown' ? brown * 3.5 : layer.wave === 'pink' ? pink * 4 : layer.wave === 'crackle' ? (Math.abs(w) > 0.995 ? w : 0) : w
      }
      const trem = layer.tremolo === undefined ? 1 : 1 - layer.tremolo.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * layer.tremolo.hz * t))
      out[start + i] = (out[start + i] ?? 0) + s * env * gain * trem
    }
  })
  return filtered(out, layer.filter)
}

/** A whole cue, layers mixed, with a little room if it asks for reverb. */
export const renderCue = (cue: ThemeCue): Float32Array => {
  const layers = cue.layers.map((l, i) => renderLayer(l, 7 + i))
  const tail = Math.round((cue.reverb ?? 0) * 0.6 * RATE)
  const mix = new Float32Array(Math.max(1, ...layers.map(l => l.length)) + tail)
  for (const l of layers) {
    l.forEach((s, i) => {
      mix[i] = (mix[i] ?? 0) + s
    })
  }
  if (cue.reverb !== undefined && cue.reverb > 0) {
    // two feedback echoes, short and soft
    for (const [ms, fb] of [[37, 0.35], [53, 0.3]] as const) {
      const d = Math.round((ms / 1000) * RATE)
      for (let i = d; i < mix.length; i++) {
        mix[i] = (mix[i] ?? 0) + (mix[i - d] ?? 0) * fb * cue.reverb
      }
    }
  }
  // keep it under full scale, fading the last few milliseconds
  const peak = mix.reduce((m, s) => Math.max(m, Math.abs(s)), 0)
  const scale = peak > 0.9 ? 0.9 / peak : 1
  const fade = Math.min(mix.length, Math.round(0.01 * RATE))
  for (let i = 0; i < mix.length; i++) {
    const end = mix.length - i <= fade ? (mix.length - i) / fade : 1
    mix[i] = (mix[i] ?? 0) * scale * end
  }
  return mix
}

/** Samples as a 16-bit mono WAV. */
export const wav = (samples: Float32Array): Uint8Array => {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return bytes
}

/** A cue as a clip $.audio.play takes. */
export const clipOf = (cue: ThemeCue): { base64: string; mime: string } => ({
  base64: (wav(renderCue(cue)) as Uint8Array & { toBase64(): string }).toBase64(),
  mime: 'audio/wav',
})
