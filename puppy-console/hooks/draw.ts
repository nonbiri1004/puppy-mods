// The picture in a card's "▸ details", as an SVG string, for the details this mod knows (music,
// ai-video); the summary above it is text, from view.ts. Warm greys, light by day and dark by night,
// low contrast. The puppy is the bare one (no headphones): a coding tool.
import type { CollectorCounts, CollectorDetail, MusicDetail, Stage, Status, VideoDetail, VideoJob } from '../types'
import { sit, sitBlink, sleep0, sleep1, typing0, typing1, typing2, typing3, typing4, typing5 } from './puppy'
import { sit as blockSit, sleep0 as blockSleep0, typing0 as blockTyping0 } from './puppy-blocks'
import type { BlockRun } from './puppy-blocks'

export const W = 640

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cut a label to fit; SVG text does not wrap. n is in Latin letters; a CJK character counts as two.
const wide = (c: string) => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(c)
// Counted and cut by code point, so an emoji is never split in half; the … takes one column.
export function cut(s: string, n: number): string {
  const chars = [...s]
  const width = (c: string) => (wide(c) ? 2 : 1)
  if (chars.reduce((sum, c) => sum + width(c), 0) <= n) return s
  let used = 1
  let out = ''
  for (const c of chars) {
    if (used + width(c) > n) break
    used += width(c)
    out += c
  }
  return `${out}…`
}

const STYLE = `<style>
  svg{--card:#f8f7f4;--line:#dcdad4;--text:#2a2926;--muted:#6d6a64;--ok:#7f9a72;--listen:#c2a768;--reject:#b98276}
  @media (prefers-color-scheme: dark){svg{--card:#232321;--line:#353431;--text:#e7e5e0;--muted:#9b9891;
    --ok:#86a078;--listen:#bfa66a;--reject:#b07e73}}
  .t{fill:var(--text);font-family:ui-sans-serif,system-ui,sans-serif}
  .m{fill:var(--muted);font-family:ui-sans-serif,system-ui,sans-serif}
  .px{font-family:ui-monospace,Menlo,monospace;letter-spacing:.5px}
</style>`

// The width and height in the markup let the pane fit the picture to its own width (never wider
// than W) and keep the shape; guessing the pane's pixel width from its columns left empty space.
const svg = (h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${STYLE}${body}</svg>`

export type Picture = { source: string; height: number; alt: string }

// Two frames swapped by SMIL: the puppy blinks while it works and breathes while it sleeps.
function puppy(x: number, y: number, scale: number, isWorking: boolean) {
  const [a, b, dur, keyTimes] = isWorking ? [sit, sitBlink, '4s', '0;0.94'] : [sleep0, sleep1, '3s', '0;0.5']
  const frame = (rects: string, values: string) =>
    `<g visibility="visible">${rects}<set attributeName="visibility" to="visible"/>` +
    `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite" calcMode="discrete"/></g>`
  return `<g transform="translate(${x} ${y}) scale(${scale})" shape-rendering="crispEdges">` +
    frame(a, 'visible;hidden') + frame(b, 'hidden;visible') + '</g>'
}

function notes(x: number, y: number) {
  return [0, 1.3, 2.6].map((delay, i) =>
    `<text class="m" x="${x + i * 10}" y="${y}" font-size="13" opacity="0">♪` +
    `<animate attributeName="y" values="${y};${y - 30}" dur="3.9s" begin="${delay}s" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0;.8;0" dur="3.9s" begin="${delay}s" repeatCount="indefinite"/></text>`,
  ).join('')
}

export const MAX_SQUARES = 300

const STRIP_COLOR: Record<string, string> = {
  o: 'var(--ok)', l: 'var(--listen)', r: 'var(--reject)', x: 'var(--line)', '?': 'var(--muted)',
}

// The puppy at work (or asleep), then one square per song made.
function musicPicture(s: Status, isStale: boolean): Picture | null {
  const d = (s.detail ?? {}) as MusicDetail
  const b = d.batches?.[0]
  if (!b) return null
  const H = 120
  const isWorking = s.state === 'running' && !isStale
  let body = puppy(0, H - 26 * 2.6 - 18, 2.6, isWorking)
  if (isWorking) body += notes(70, 40)
  // the host is in the details beside the picture; the picture keeps to the studio itself
  const comfy = d.comfy ? (d.comfy.up ? 'comfy up' : 'comfy down') : ''

  // 30 squares per row; they shrink so a batch of 220 songs still fits. Past MAX_SQUARES only the
  // newest are drawn, so the squares keep a size and the SVG stays under the element's size limit.
  const all = typeof b.strip === 'string' ? b.strip : ''
  const strip = all.slice(-MAX_SQUARES)
  const [x0, y0, per] = [120, 6, 30]
  const rows = Math.max(1, Math.ceil(strip.length / per))
  const step = Math.min(16, 86 / rows)
  const size = step - 2
  ;[...strip].forEach((c, i) => {
    const [x, y] = [x0 + (i % per) * step, y0 + Math.floor(i / per) * step]
    body += c === 'e'
      ? `<rect x="${(x + 0.5).toFixed(1)}" y="${(y + 0.5).toFixed(1)}" width="${(size - 1).toFixed(1)}" height="${(size - 1).toFixed(1)}" rx="1" fill="none" stroke="var(--reject)"/>`
      : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="1" fill="${STRIP_COLOR[c] ?? 'var(--line)'}"/>`
  })
  if (!strip) body += `<text class="m" x="${x0}" y="40" font-size="11">no songs yet</text>`
  if (all.length > strip.length) body += `<text class="m" x="${W}" y="${H - 18}" font-size="9" text-anchor="end">newest ${strip.length} of ${all.length}</text>`
  const legend: [string, string][] = [['ok', 'var(--ok)'], ['to hear', 'var(--listen)'], ['rejected', 'var(--reject)']]
  legend.forEach(([name, fill], i) => {
    body += `<rect x="${x0 + i * 78}" y="${H - 12}" width="8" height="8" rx="1" fill="${fill}"/>` +
      `<text class="m" x="${x0 + 12 + i * 78}" y="${H - 4}" font-size="12">${name}</text>`
  })
  // the pace is in the summary above the picture
  if (comfy) body += `<text class="m px" x="${W}" y="${H - 4}" font-size="12" text-anchor="end">${comfy}</text>`
  return {
    height: H,
    alt: `${b.name}: ${b.ok ?? 0} ok, ${b.needs_listen ?? 0} to hear, ${b.rejected ?? 0} rejected`,
    source: svg(H, body),
  }
}

export const STAGES: readonly Stage[] = ['plan', 'clips', 'voice', 'compose', 'final', 'done']
// The two review gates only you can pass.
export const GATE: ReadonlySet<Stage> = new Set(['plan', 'final'])

// A stage outside the list (a newer writer's) gets no column: unknownStages names those jobs.
export function byStage(jobs: VideoJob[]): Record<Stage, VideoJob[]> {
  const out = Object.fromEntries(STAGES.map(st => [st, [] as VideoJob[]])) as Record<Stage, VideoJob[]>
  for (const j of jobs) if (STAGES.includes(j.stage)) out[j.stage].push(j)
  return out
}

export const jobName = (j: VideoJob) => j.job.split('/').pop() ?? j.job

// "deliver: 電車" for each job whose stage has no column; empty when there are none.
// A job of an odd shape (not an object, no name) is skipped.
export function unknownStages(s: Status): string[] {
  if (s.pipeline !== 'ai-video') return []
  const jobs: unknown = ((s.detail ?? {}) as VideoDetail).jobs
  if (!Array.isArray(jobs)) return []
  return jobs
    .filter((j): j is VideoJob => typeof j === 'object' && j !== null && typeof (j as VideoJob).job === 'string')
    .filter(j => !STAGES.includes(j.stage))
    .map(j => `${String(j.stage)}: ${jobName(j)}`)
}

// One column per stage, a chip per job; the review gates have a dashed outline. The spend is in the
// summary above the picture.
function videoPicture(s: Status): Picture | null {
  const d = (s.detail ?? {}) as VideoDetail
  const jobs = d.jobs ?? []
  if (!jobs.length) return null
  const lanes = byStage(jobs)
  const colW = W / STAGES.length
  const shown = 4
  const H = 36 + shown * 20 + 6
  let body = ''
  STAGES.forEach((st, i) => {
    const x = i * colW
    body += `<rect x="${x + 2}" y="0.5" width="${colW - 4}" height="${H - 1}" rx="6" fill="var(--card)" stroke="var(--line)"${GATE.has(st) ? ' stroke-dasharray="4 3"' : ''}/>`
    body += `<text class="m px" x="${x + 10}" y="16" font-size="11">${st.toUpperCase()}${GATE.has(st) ? ' · YOU' : ''}</text>`
    const list = lanes[st]
    list.slice(0, shown).forEach((j, k) => {
      body += `<text class="${st === 'done' ? 'm' : 't'}" x="${x + 10}" y="${38 + k * 20}" font-size="14">${esc(cut(jobName(j), 12))}</text>`
    })
    if (list.length > shown) body += `<text class="m" x="${x + 10}" y="${38 + shown * 20}" font-size="12">+${list.length - shown} more</text>`
  })
  const waiting = jobs.filter(j => GATE.has(j.stage)).length
  return { height: H, alt: `${jobs.length} jobs, ${waiting} at a review gate`, source: svg(H, body) }
}

// info-collector writes one file per profile: collector-tech-news.json, collector-jobs.json, …
export const COLLECTOR = 'collector-'
// info-collector counts one page of notion results, so 100 means "100 or more"
export const PENDING_CAP = 100

const count = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : null)

// detail.counts of a collector-<profile> card; null for an older file without it (or a broken one).
// A stage number that is missing or odd counts as 0; a pending that is not a number means
// notion was not read.
export function collectorCounts(s: Status): CollectorCounts | null {
  const c = ((s.detail ?? {}) as CollectorDetail).counts
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return null
  const collected = count(c.collected)
  if (collected == null) return null
  return { collected, new: count(c.new) ?? 0, scored: count(c.scored) ?? 0, sent: count(c.sent) ?? 0, unsent: count(c.unsent) ?? 0, pending: count(c.pending) }
}

export function picture(s: Status, isStale: boolean): Picture | null {
  if (s.pipeline === 'music') return musicPicture(s, isStale)
  if (s.pipeline === 'ai-video') return videoPicture(s)
  return null
}

// The puppy beside the pane's first row, as puppy-skills draws it: typing at its laptop while a
// conversation is running, sitting (and blinking) while one waits for you, asleep when nothing goes on.
export type Mood = 'typing' | 'sitting' | 'sleeping'
const MOODS: Record<Mood, { frames: string[]; seconds: number }> = {
  // slower than the pet's 6 fps: motion stays slow and small
  typing: { frames: [typing0, typing1, typing2, typing3, typing4, typing5], seconds: 2.4 },
  sitting: { frames: [sit, sit, sit, sit, sit, sit, sit, sit, sit, sitBlink], seconds: 4 },
  sleeping: { frames: [sleep0, sleep1], seconds: 3 },
}
export const MASCOT_SCALE = 2

// one frame shown at a time, swapped by SMIL; each frame is visible for its share of the loop
export function mascot(mood: Mood): string {
  const { frames, seconds } = MOODS[mood]
  const n = frames.length
  const keyTimes = frames.map((_, i) => (i / n).toFixed(4)).join(';')
  const body = frames.map((rects, i) => {
    const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
    return `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${rects}` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${seconds}s" repeatCount="indefinite" calcMode="discrete"/></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${34 * MASCOT_SCALE}" height="${26 * MASCOT_SCALE}" viewBox="0 0 34 26" shape-rendering="crispEdges">${body}</svg>`
}

// The same puppy for a surface with no Svg (the terminal), from baibai-brand's block output:
// each character holds two pixels stacked, as Claude Code draws its mascot. One still frame per
// mood: redrawing the pane a few times a second would flicker, and the puppy moves slowly anyway.
// The pane's rows (e.props.scroll.bodyRows) the block puppy needs: its 13 rows take at most half.
// Shorter, it is left out, never shrunk. puppy-todo and puppy-skills use the same number.
export const PUPPY_MIN_ROWS = 26
// The columns (e.props.bodyColumns) it needs: a narrower pane would wrap its rows apart.
export const PUPPY_COLUMNS = 34
const STILLS: Record<Mood, BlockRun[][]> = { typing: blockTyping0, sitting: blockSit, sleeping: blockSleep0 }
export const stillBlocks = (mood: Mood): BlockRun[][] => STILLS[mood]
