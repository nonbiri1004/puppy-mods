// A pipeline's status as a top-to-bottom flow of steps (nodes), decided once here so the pane only
// lays it out. The order of the steps lives in this mod, one list per known pipeline, built from
// the detail the pipeline already writes (FORMAT.md); the status file format is unchanged. A wider
// node canvas later would read the same Flow and only draw it differently.
import type { MusicDetail, Stage, Status, VideoDetail, WaitingItem } from '../types'
import { GATE, jobName, STAGES } from './draw'
import { ago, markOf, pipeName, STATE_WORDS, waited } from './format'

// done ✓, running ◐, waiting for you (the one step drawn as a card), not yet ○
export type NodeState = 'done' | 'running' | 'waiting' | 'todo'
export type FlowNode = { label: string; state: NodeState }
// The step that waits for you, or a pipeline that broke: its words, how long, and the items with
// their buttons. For a pipeline with no known steps it is the only thing drawn.
export type Gate = { label: string; isError: boolean; waited: string; note?: string; items: WaitingItem[] }
export type Flow = {
  pipeline: string
  // 影片 · ep04
  title: string
  // the mod knows this pipeline's steps (ai-video, music); without them the card stands alone
  hasSteps: boolean
  // the steps before the gate (all of them, when nothing waits), and the ones after it
  before: FlowNode[]
  gate: Gate | null
  after: FlowNode[]
  // one grey line for when nothing waits here: 音樂：跑中 · 05 · 42/70
  line: string
  // what waits here, as the count at the top adds it up
  count: number
}

export const STAGE_WORDS: Record<Stage, string> = { plan: '企劃', clips: '片段', voice: '配音', compose: '合成', final: '成品', done: '完成' }
export const MARKS: Record<NodeState, string> = { done: '✓', running: '◐', waiting: '●', todo: '○' }

const oldest = (items: WaitingItem[]) =>
  items.map(w => w.since).filter((t): t is string => !!t && !Number.isNaN(Date.parse(t))).sort((a, b) => Date.parse(a) - Date.parse(b))[0]

// ai-video: the job at a review gate (else the newest), along plan › clips › voice › compose › final.
function video(s: Status): { subject: string; nodes: FlowNode[] } | null {
  const jobs = ((s.detail ?? {}) as VideoDetail).jobs
  if (!Array.isArray(jobs)) return null
  const known = jobs.filter(j => j && typeof j.job === 'string' && STAGES.includes(j.stage))
  if (!known.length) return null
  const job = known.find(j => GATE.has(j.stage) && j.stage !== 'plan') ?? known.find(j => GATE.has(j.stage)) ?? known[known.length - 1]!
  const at = STAGES.indexOf(job.stage)
  const nodes = STAGES.filter(st => st !== 'done').map((st, i): FlowNode => ({
    label: STAGE_WORDS[st],
    state: job.stage === 'done' || i < at ? 'done' : i > at ? 'todo' : GATE.has(st) ? 'waiting' : 'running',
  }))
  const more = known.length - 1
  return { subject: `${jobName(job)}${more > 0 ? ` · 另有 ${more} 支` : ''}`, nodes }
}

// music: the first batch, along 歌單 › 生成 › 檢查 › 你來聽 › 可用.
function music(s: Status): { subject: string; nodes: FlowNode[] } | null {
  const d = (s.detail ?? {}) as MusicDetail
  const b = Array.isArray(d.batches) ? d.batches[0] : undefined
  if (!b || typeof b.name !== 'string') return null
  const isMaking = s.state === 'running' && d.generating !== false
  const isChecking = (b.strip ?? '').includes('?')
  const toHear = b.needs_listen ?? 0
  const nodes: FlowNode[] = [
    { label: '歌單', state: 'done' },
    { label: `生成 ${b.generated ?? 0}`, state: isMaking ? 'running' : 'done' },
    { label: '檢查', state: isChecking ? 'running' : 'done' },
    { label: '你來聽', state: toHear > 0 ? 'waiting' : 'done' },
    { label: `可用 ${b.ok ?? 0}${b.target_usable ? ` / ${b.target_usable}` : ''}${b.rejected ? ` · 退掉 ${b.rejected}` : ''}`, state: 'todo' },
  ]
  return { subject: b.name, nodes }
}

export function flowOf(s: Status, now: number): Flow {
  let known: { subject: string; nodes: FlowNode[] } | null = null
  try {
    known = s.pipeline === 'ai-video' ? video(s) : s.pipeline === 'music' ? music(s) : null
  } catch {
    // a detail of an odd shape: the flow without its steps
  }
  const items = s.waiting ?? []
  const name = pipeName(s)
  const mark = markOf(s, now)
  const since = (t?: string) => (t && !Number.isNaN(Date.parse(t)) ? waited(now - Date.parse(t)) : '')
  let gate: Gate | null = null
  if (s.state === 'error') gate = { label: known ? '停下來了' : name, isError: true, waited: since(s.updated), note: s.headline, items }
  else if (items.length || s.state === 'waiting') {
    const at = known?.nodes.find(n => n.state === 'waiting')
    gate = { label: at?.label ?? name, isError: false, waited: since(oldest(items) ?? s.updated), ...(items.length ? {} : { note: s.headline }), items }
  }
  const nodes = known?.nodes ?? []
  // the gate takes the place of its step; a gate with no step of its own goes after the done ones
  let cut = nodes.findIndex(n => n.state === 'waiting')
  if (gate && cut < 0) cut = nodes.findIndex(n => n.state !== 'done')
  const before = gate && cut >= 0 ? nodes.slice(0, cut) : nodes
  const after = gate && cut >= 0 ? nodes.slice(cut).filter(n => n.state !== 'waiting') : []
  const last = s.last_output ? ` · 上次 ${s.last_output.label}${s.last_output.at ? `，${ago(now - Date.parse(s.last_output.at))}` : ''}` : ''
  return {
    pipeline: s.pipeline,
    title: known ? `${name} · ${known.subject}` : name,
    hasSteps: known != null,
    before,
    gate,
    after,
    line: `${name}：${STATE_WORDS[mark]} · ${s.state === 'idle' && last ? last.slice(3) : s.headline}`,
    count: gate ? Math.max(1, items.length) : 0,
  }
}
