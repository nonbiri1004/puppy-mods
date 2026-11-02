// Reading one status file (FORMAT.md). Pure functions, so the tests need no engine.
import type { Snapshot, State, Status, WaitingAction, WaitingGroup, WaitingItem } from '../types'

const STATES: readonly State[] = ['running', 'idle', 'waiting', 'error']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Only what the card needs is checked; a pipeline can add any field it likes.
export function parseStatus(text: string): Status {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('not json (maybe being written; next refresh reads it again)')
  }
  if (!isObject(v) || v.format !== 'pipeline-status') throw new Error('no "format": "pipeline-status" (an older status file?)')
  if (v.version !== 1) throw new Error(`format version ${String(v.version)}; this mod reads version 1`)
  if (typeof v.pipeline !== 'string' || !v.pipeline) throw new Error('no "pipeline"')
  if (!/^[a-z0-9-]+$/.test(v.pipeline)) throw new Error('"pipeline" may hold only a-z, 0-9 and -')
  if (typeof v.updated !== 'string' || Number.isNaN(Date.parse(v.updated))) throw new Error('"updated" is not a time')
  if (!STATES.includes(v.state as State)) throw new Error(`"state" must be one of ${STATES.join(', ')}`)
  if (typeof v.headline !== 'string') throw new Error('no "headline"')
  if (v.waiting != null && !Array.isArray(v.waiting)) throw new Error('"waiting" is not a list')
  // Optional fields of the wrong type are dropped, so one odd field can't break the sorting or the drawing.
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
  const p = isObject(v.progress) ? v.progress : null
  const last = isObject(v.last_output) && typeof v.last_output.label === 'string' ? v.last_output : null
  return {
    ...(v as unknown as Status),
    title: str(v.title),
    host: str(v.host),
    stale_after_sec: num(v.stale_after_sec),
    next: str(v.next) ?? null,
    progress: p && num(p.done) != null
      ? { done: num(p.done)!, total: num(p.total) ?? null, ...(str(p.unit) ? { unit: str(p.unit) } : {}) }
      : null,
    last_output: last
      ? { label: last.label as string, ...(str(last.at) ? { at: str(last.at) } : {}), ...(str(last.path) ? { path: str(last.path) } : {}) }
      : null,
    // an item with no id is known by its words, so a new one is still news
    waiting: ((v.waiting as unknown[] | undefined) ?? []).filter(isObject).map(w => {
      const actions = parseActions(w.actions)
      return {
        id: str(w.id) || String(w.text ?? ''),
        text: String(w.text ?? ''),
        ...(typeof w.since === 'string' ? { since: w.since } : {}),
        ...(str(w.group) ? { group: str(w.group) } : {}),
        ...(actions.length ? { actions } : {}),
      }
    }),
    waiting_groups: parseGroups(v.waiting_groups),
  }
}

const MAX_GROUP_LABEL = 40

// The names of a file's waiting groups. One without an id or a short label is dropped; its items
// then show one by one, as if they had no group.
function parseGroups(v: unknown): WaitingGroup[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObject).flatMap(g => {
    const id = typeof g.id === 'string' ? g.id.trim() : ''
    const label = typeof g.label === 'string' ? g.label.trim() : ''
    return id && label && [...label].length <= MAX_GROUP_LABEL ? [{ id, label }] : []
  })
}

// What "for you" lists for one pipeline, in the file's order: the items of a named group of two
// or more as one entry, where the group's first item stands; every other item on its own.
export type WaitingEntry = { item: WaitingItem } | { group: WaitingGroup; items: WaitingItem[] }
export function waitingEntries(s: Status): WaitingEntry[] {
  const items = s.waiting ?? []
  const named = new Map((s.waiting_groups ?? []).map(g => [g.id, g]))
  const members = (id: string) => items.filter(w => w.group === id)
  const out: WaitingEntry[] = []
  const placed = new Set<string>()
  for (const w of items) {
    const group = w.group ? named.get(w.group) : undefined
    if (!group || members(group.id).length < 2) out.push({ item: w })
    else if (!placed.has(group.id)) {
      placed.add(group.id)
      out.push({ group, items: members(group.id) })
    }
  }
  return out
}

export const MAX_ACTIONS = 3
const MAX_LABEL = 24
const MAX_FILL = 500

// A waiting item's buttons. One that is not a short label with exactly one of open or fill is
// dropped, like any odd field; an open that is not a file the pane may open is dropped too.
export function parseActions(v: unknown): WaitingAction[] {
  if (!Array.isArray(v)) return []
  const out: WaitingAction[] = []
  for (const a of v.filter(isObject)) {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    if (!label || label.length > MAX_LABEL) continue
    const open = typeof a.open === 'string' ? a.open : undefined
    const fill = typeof a.fill === 'string' ? a.fill : undefined
    if (open != null && fill == null && isOpenable(open)) out.push({ label, open })
    else if (fill != null && open == null && fill.trim() && fill.length <= MAX_FILL) out.push({ label, fill })
    if (out.length === MAX_ACTIONS) break
  }
  return out
}

// What a status file may ask the pane to open. Status files can come from a synced folder, so
// the pane opens only something to look at or listen to, never something that runs: a full path
// (or ~/…) to a picture, a video, a sound or a pdf, or to a folder (ending in /) that is not an
// app or another bundle the system would start.
const VIEWABLE = /\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|flac|ogg|png|jpe?g|gif|webp|pdf)$/i
const RUNNABLE = /\.(app|bundle|pkg|mpkg|command|tool|workflow|terminal|prefpane|plugin|kext)\/?$/i
export function isOpenable(path: string): boolean {
  if (!(path.startsWith('/') || path.startsWith('~/')) || path.includes('\0') || path.length > 1024) return false
  const parts = path.split('/').filter(Boolean)
  if (parts.some(p => p === '..' || RUNNABLE.test(p))) return false
  return path.endsWith('/') || VIEWABLE.test(path)
}

// Quiet for longer than the writer promised. A file without stale_after_sec is never stale.
export function isStale(s: Status, now: number): boolean {
  return s.stale_after_sec != null && now - Date.parse(s.updated) > s.stale_after_sec * 1000
}

// Cards that need you come first: waiting, then error, then running, then idle; ties by title.
const ORDER: Record<State, number> = { waiting: 0, error: 1, running: 2, idle: 3 }
export function sortCards(cards: Status[]): Status[] {
  return [...cards].sort((a, b) => ORDER[a.state] - ORDER[b.state] || titleOf(a).localeCompare(titleOf(b)))
}

export const titleOf = (s: Status) => s.title || s.pipeline

// One unit, as precise as a glance needs: 5 分鐘前, 8 小時前, 3 天前.
export function ago(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} 小時前`
  return `${Math.floor(h / 24)} 天前`
}

// How long something has waited: ago() without 前.
export const waited = (ms: number) => ago(ms).replace(/前$/, '')

// The pane's own names for the pipelines it knows; any other goes by its title.
const NAMES: Record<string, string> = { 'ai-video': '影片', music: '音樂' }
export const pipeName = (s: Status) =>
  NAMES[s.pipeline] ?? (s.pipeline.startsWith('collector-') && !s.title ? `收集 ${s.pipeline.slice('collector-'.length)}` : titleOf(s))

// The words for a card's mark (markOf).
export const STATE_WORDS: Record<State | 'quiet', string> = { running: '跑中', idle: '閒置', waiting: 'waiting', error: '出錯', quiet: '沒消息' }

// A text progress bar for surfaces without Svg: ▓▓▓▓░░░░░░ 42/70 usable songs
export function textBar(p: NonNullable<Status['progress']>, width = 10): string {
  const unit = p.unit ? ` ${p.unit}` : ''
  if (!p.total) return `${p.done}${unit}`
  const filled = Math.round(Math.max(0, Math.min(1, p.done / p.total)) * width)
  return `${'▓'.repeat(filled)}${'░'.repeat(width - filled)} ${p.done}/${p.total}${unit}`
}

// "~/x" → "<home>/x"; the folder setting is typed by hand.
export function expandHome(path: string, home: string | undefined): string {
  return home && (path === '~' || path.startsWith('~/')) ? home + path.slice(1) : path
}

// The word a card shows for its state: "quiet" when the writer went silent, unless it last said
// it broke: an error stays an error however old.
export const markOf = (s: Status, now: number) => (isStale(s, now) && s.state !== 'error' ? 'quiet' : s.state)

// Why a card went quiet, in words that don't guess the cause: the computer may sleep, the
// pipeline may have stopped writing, or the sync may lag.
export const quietWhy = (s: Status, now: number) =>
  `${waited(now - Date.parse(s.updated))}沒有更新（${s.host ?? '它的電腦'}）`
const ALERT = new Set(['waiting', 'error', 'quiet'])

// The lines to tell the person, comparing the last read with this one: a card that turned
// waiting, error or quiet, or new waiting items on any card that was already shown.
// No previous read (the pane just started) is a baseline, not news.
export function alerts(prev: Snapshot | null, next: Snapshot): string[] {
  if (!prev) return []
  const before = new Map(prev.cards.map(s => [s.pipeline, s]))
  const out: string[] = []
  for (const s of next.cards) {
    const was = before.get(s.pipeline)
    const mark = markOf(s, next.loadedAt)
    const wasMark = was ? markOf(was, prev.loadedAt) : undefined
    const items = s.waiting ?? []
    if (ALERT.has(mark) && mark !== wasMark) {
      const why = mark === 'quiet' ? quietWhy(s, next.loadedAt) : mark === 'waiting' && items[0] ? items[0].text : s.headline
      out.push(`${pipeName(s)} · ${STATE_WORDS[mark]}：${why}`)
    } else if (was && items.length) {
      const seen = new Set((was?.waiting ?? []).map(w => w.id))
      const fresh = items.filter(w => !seen.has(w.id))
      if (fresh.length) out.push(`${pipeName(s)} · 新的：${fresh[0]!.text}${fresh.length > 1 ? `（還有 ${fresh.length - 1} 件）` : ''}`)
    }
  }
  return out
}

// A card waits for you while it is waiting or broken, or holds anything in its waiting list.
export const waitsForYou = (s: Status) => s.state === 'waiting' || s.state === 'error' || (s.waiting ?? []).length > 0
