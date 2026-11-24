import { expect, test } from 'claude-code/testing'

import { CUES, SOUND_SETS } from '../hooks/prefs'
import { SOUND_LABEL, SOUNDS } from '../hooks/sound'

// The test engine doesn't check a sound's ranges, and the app refuses a whole
// theme with one value out of range, so check them here against ThemeSound's
// documented limits.
const NOTE = /^[A-G][#b]?\d$/
const within = (v: unknown, lo: number, hi: number, what: string) => {
  if (v === undefined) return
  expect(typeof v === 'number' && v >= lo && v <= hi ? 'ok' : `${what} ${String(v)} not in ${lo}..${hi}`).toBe('ok')
}
const checkLayer = (l: Record<string, unknown>, where: string) => {
  within(l.gain, 0, 1, `${where} gain`)
  within(l.pan, -1, 1, `${where} pan`)
  within(l.attack, 0.002, 2, `${where} attack`)
  within(l.release, 0.01, 4, `${where} release`)
  within(l.step, 0, 2, `${where} step`)
  within(l.glide, -24, 24, `${where} glide`)
  within(l.scatter, 0.02, 10, `${where} scatter`)
  const f = l.filter as { hz: number; to?: number } | undefined
  within(f?.hz, 20, 10_000, `${where} filter`)
  within(f?.to, 20, 10_000, `${where} filter to`)
  const t = l.tremolo as { hz: number; depth: number } | undefined
  within(t?.hz, 0.05, 30, `${where} tremolo`)
  within(t?.depth, 0, 1, `${where} tremolo depth`)
  if ('notes' in l) {
    const notes = l.notes as unknown[]
    expect(notes.length >= 1 && notes.length <= 16).toBe(true)
    for (const n of notes) {
      expect(typeof n === 'number' ? n === 0 || (n >= 20 && n <= 10_000) : NOTE.test(String(n))).toBe(true)
    }
    // a hit plays its notes and ends within 4 seconds
    if (!('drone' in l)) {
      const len = ((l.step as number | undefined) ?? 0) * (notes.length - 1) + ((l.attack as number | undefined) ?? 0.005) + ((l.release as number | undefined) ?? 0.4)
      expect(len).toBeLessThanOrEqual(4)
    }
  }
}

test('every set has all seven cues, a label, and values in range', () => {
  for (const set of SOUND_SETS) {
    const s = SOUNDS[set]
    expect(SOUND_LABEL[set].length).toBeGreaterThan(0)
    expect(Object.keys(s.cues ?? {}).sort()).toEqual([...CUES].sort())
    const amb = s.ambience
    if (amb !== undefined) {
      expect(amb.layers.length >= 1 && amb.layers.length <= 8).toBe(true)
      within(amb.reverb, 0, 1, `${set} ambience reverb`)
      amb.layers.forEach((l, i) => checkLayer(l as unknown as Record<string, unknown>, `${set} ambience ${i}`))
    }
    for (const c of CUES) {
      const cue = s.cues?.[c]
      within(cue?.reverb, 0, 1, `${set} ${c} reverb`)
      cue?.layers.forEach((l, i) => checkLayer(l as unknown as Record<string, unknown>, `${set} ${c} ${i}`))
    }
  }
})

test('a tool call, which comes often, is the shortest and softest cue of each set', () => {
  for (const set of SOUND_SETS) {
    const cues = SOUNDS[set].cues ?? {}
    const tool = cues.tool?.layers[0] as { gain?: number; release?: number }
    for (const c of CUES.filter(c => c !== 'tool')) {
      const other = cues[c]?.layers[0] as { gain?: number }
      expect((tool.gain ?? 0.5) <= (other.gain ?? 0.5)).toBe(true)
    }
    expect(tool.release ?? 0.4).toBeLessThanOrEqual(0.1)
  }
})

test('the click cue takes no step: its notes are picked by where the wall is clicked', () => {
  for (const set of SOUND_SETS) {
    for (const l of SOUNDS[set].cues?.click?.layers ?? []) {
      expect('step' in l).toBe(false)
    }
  }
})
