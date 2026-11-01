// What a pipeline card says, decided once for both surfaces: the summary lines under its headline,
// and what its "▸ details" holds. The desktop and the terminal only lay these out, so a fact one of
// them shows is never missing on the other. The desktop may draw a detail as a picture instead of
// its text lines (draw.ts); the picture holds the same facts.
import type { MusicDetail, Status, VideoDetail } from '../types'
import { byStage, COLLECTOR, collectorCounts, GATE, jobName, PENDING_CAP, STAGES } from './draw'
import { ago, textBar } from './format'

// A word and its number. isYou marks the one that waits for you: the pane gives it the warning color.
export type Part = { text: string; isYou?: boolean }
// One summary line: a dim label, then its parts. › only where things flow from one part into the
// next (ai-video's stages); · where they are counted side by side.
export type Line = { label?: string; parts: Part[]; sep: ' › ' | ' · ' }
export type View = {
  summary: Line[]
  // the details as text lines: what the desktop's picture shows, for a surface without one
  detailText: string[]
  // the rest of the details, on both surfaces: the computer, the last output, what comes next
  facts: string[]
}

export const lineText = (l: Line) => `${l.label ? `${l.label} ` : ''}${l.parts.map(p => p.text).join(l.sep)}`

const toReview = (p: number | null) => (p == null ? '? (notion not read)' : p >= PENDING_CAP ? `${PENDING_CAP}+` : String(p))

function music(s: Status): Pick<View, 'summary' | 'detailText'> | null {
  const d = (s.detail ?? {}) as MusicDetail
  const b = d.batches?.[0]
  if (!b) return null
  const parts: Part[] = [
    { text: `made ${b.generated ?? 0}` },
    { text: `ok ${b.ok ?? 0}` },
    { text: `to hear ${b.needs_listen ?? 0}`, isYou: (b.needs_listen ?? 0) > 0 },
    { text: `rejected ${b.rejected ?? 0}` },
  ]
  if (b.errors) parts.push({ text: `failed ${b.errors}` })
  if (b.avg_gen_sec) parts.push({ text: `${Math.round(b.avg_gen_sec / 60)} min / song` })
  return {
    summary: [{ parts: [{ text: b.name }], sep: ' · ' }, { parts, sep: ' · ' }],
    detailText: d.comfy ? [`comfy ${d.comfy.up ? 'up' : 'down'}`] : [],
  }
}

// Every stage, the empty ones too, so a stage keeps its place from one look to the next. The spend
// is in the summary: a paid engine's money is never folded away.
function video(s: Status): Pick<View, 'summary' | 'detailText'> | null {
  const d = (s.detail ?? {}) as VideoDetail
  const jobs = d.jobs ?? []
  if (!jobs.length) return null
  const lanes = byStage(jobs)
  const summary: Line[] = [{ parts: STAGES.map(st => ({ text: `${st} ${lanes[st].length}`, isYou: GATE.has(st) && lanes[st].length > 0 })), sep: ' › ' }]
  if (d.cap_usd) summary.push({ parts: [{ text: `spent $${(d.spend_usd ?? 0).toFixed(2)} of $${d.cap_usd.toFixed(2)}` }], sep: ' · ' })
  const detailText = STAGES.filter(st => lanes[st].length).map(st => `${st}${GATE.has(st) ? ' (you)' : ''}: ${lanes[st].map(jobName).join(', ')}`)
  return { summary, detailText }
}

// Not a funnel, so no arrows: earlier runs' unscored items are scored too, and earlier runs' picks
// are sent too (FORMAT.md). This run's counts, then what waits outside it.
function collector(s: Status): Pick<View, 'summary' | 'detailText'> | null {
  const c = collectorCounts(s)
  if (!c) return null
  return {
    summary: [
      { label: 'this run:', parts: [{ text: `collected ${c.collected}` }, { text: `new ${c.new}` }, { text: `scored ${c.scored}` }, { text: `sent ${c.sent}` }], sep: ' · ' },
      { parts: [{ text: `to review in notion ${toReview(c.pending)}`, isYou: (c.pending ?? 0) > 0 }, { text: `unsent ${c.unsent}` }], sep: ' · ' },
    ],
    detailText: [],
  }
}

export function view(s: Status, now: number): View {
  const known = s.pipeline === 'music' ? music(s) : s.pipeline === 'ai-video' ? video(s) : s.pipeline.startsWith(COLLECTOR) ? collector(s) : null
  // a pipeline this mod has no details for, or an older file without them: its progress, if any
  const { summary, detailText } = known ?? { summary: s.progress ? [{ parts: [{ text: textBar(s.progress) }], sep: ' · ' as const }] : [], detailText: [] }
  const facts: string[] = []
  if (s.host) facts.push(`on ${s.host}`)
  if (s.last_output) facts.push(`last: ${s.last_output.label}${s.last_output.at ? ` · ${ago(now - Date.parse(s.last_output.at))}` : ''}`)
  // a "next" that repeats a waiting item is already in "for you"
  if (s.next && !(s.waiting ?? []).some(w => w.text === s.next)) facts.push(`next: ${s.next}`)
  return { summary, detailText, facts }
}
