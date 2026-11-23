import { expect, test } from 'claude-code/testing'

import { CUES } from '../hooks/prefs'
import { SOUND } from '../hooks/sound'
import { clipOf, hz, RATE, renderCue, wav } from '../hooks/synth'

test('note names turn into hertz', () => {
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.05)
  near(hz('A4'), 440)
  near(hz('A5'), 880)
  near(hz('C5'), 523.25)
  near(hz('F#3'), 185)
  near(hz('Bb2'), 116.54)
  expect(hz(0)).toBe(0)
})

test('every cue renders short, audible and under full scale', () => {
  for (const c of CUES) {
    const cue = SOUND.cues?.[c]
    expect(cue).toBeDefined()
    const s = renderCue(cue!)
    expect(s.length / RATE).toBeLessThan(4)
    const peak = s.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
    expect(peak).toBeGreaterThan(0.005)
    expect(peak).toBeLessThanOrEqual(0.9001)
    expect(s.every(Number.isFinite)).toBe(true)
  }
})

test('a stepped cue plays its notes one after another', () => {
  // done: three notes 0.14 s apart; the third starts after 0.28 s
  const s = renderCue(SOUND.cues!.done!)
  const at = (sec: number) => Math.abs(s[Math.round(sec * RATE)] ?? 0)
  const loudAfter = (sec: number) => {
    let m = 0
    for (let i = Math.round(sec * RATE); i < Math.round((sec + 0.02) * RATE); i++) m = Math.max(m, Math.abs(s[i] ?? 0))
    return m
  }
  expect(at(0)).toBeLessThan(0.01)
  expect(loudAfter(0.29)).toBeGreaterThan(0.01)
})

test('the clip is a 16-bit mono wav', () => {
  const bytes = wav(new Float32Array([0, 0.5, -0.5]))
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
  expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
  expect(bytes.length).toBe(44 + 6)
  const clip = clipOf(SOUND.cues!.tool!)
  expect(clip.mime).toBe('audio/wav')
  expect(clip.base64.length).toBeGreaterThan(100)
})
