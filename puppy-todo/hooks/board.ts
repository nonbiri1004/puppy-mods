// the read-only cards: what another writer (the dispatch board) lists for you, read from the
// status folder (../../FORMAT.md). only title, updated, waiting and waiting_groups are read.
// the parts with no $, so the tests need no engine.
import type { Board, BoardGroup, BoardItem } from '../types'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const isTime = (v: string) => !Number.isNaN(Date.parse(v))

const MAX_GROUP_LABEL = 40
const MAX_URL = 2048
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
// a writer that names no stale_after_sec: a board older than this says so in one dim line
export const STALE_MS = 24 * 3_600_000

// one status file, as a card. throws on a file that is not a pipeline-status v1 (or is caught
// halfway through a write); the caller keeps the last good card for that file
export function parseBoard(file: string, text: string): Board {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('not json')
  }
  if (!isObject(v) || v.format !== 'pipeline-status') throw new Error('not a pipeline-status file')
  if (v.version !== 1) throw new Error(`version ${String(v.version)}`)
  const updated = str(v.updated)
  if (!updated || !isTime(updated)) throw new Error('"updated" is not a time')
  const groups: BoardGroup[] = (Array.isArray(v.waiting_groups) ? v.waiting_groups : []).filter(isObject).flatMap(g => {
    const id = str(g.id)
    const label = str(g.label)
    return id && label && [...label].length <= MAX_GROUP_LABEL ? [{ id, label }] : []
  })
  const items: BoardItem[] = (Array.isArray(v.waiting) ? v.waiting : []).filter(isObject).flatMap(w => {
    const text = str(w.text)
    if (!text) return []
    const since = str(w.since)
    const group = str(w.group)
    const url = str(w.url)
    const due = str(w.due)
    return [{
      id: str(w.id) ?? text,
      text,
      ...(since && isTime(since) ? { since } : {}),
      ...(group ? { group } : {}),
      ...(url && isLink(url) ? { url } : {}),
      ...(due && (DAY_RE.test(due) || isTime(due)) ? { due } : {}),
    }]
  })
  const stale = typeof v.stale_after_sec === 'number' && v.stale_after_sec > 0 ? v.stale_after_sec * 1000 : STALE_MS
  return { file, title: str(v.title) ?? str(v.pipeline) ?? file.replace(/\.json$/, ''), updated, staleMs: stale, items, groups }
}

// only https, as FORMAT.md says: a synced file must not hand the pane any other scheme to open
export function isLink(url: string): boolean {
  if (url.length > MAX_URL || /\s/.test(url)) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// the words on a link: #98 for a GitHub pull request or issue, else the host
export function linkLabel(url: string): string {
  const pr = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/(\d+)/.exec(url)
  if (pr) return `#${pr[1]}`
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// the card's list, in the file's order: a named group of two or more is one entry where its first
// item stands; every other item on its own (FORMAT.md, waiting groups)
export type Entry = { item: BoardItem } | { group: BoardGroup; items: BoardItem[] }
export function entriesOf(b: Board): Entry[] {
  const named = new Map(b.groups.map(g => [g.id, g]))
  const members = (id: string) => b.items.filter(w => w.group === id)
  const out: Entry[] = []
  const placed = new Set<string>()
  for (const w of b.items) {
    const group = w.group ? named.get(w.group) : undefined
    if (!group || members(group.id).length < 2) out.push({ item: w })
    else if (!placed.has(group.id)) {
      placed.add(group.id)
      out.push({ group, items: members(group.id) })
    }
  }
  return out
}

// the oldest wait among items, for a folded group's line
export function oldestSince(items: readonly BoardItem[]): string | undefined {
  return items.map(w => w.since).filter((t): t is string => !!t).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
}

// 12 分鐘前, 8 小時前, 3 天前; ago() without 前 for how long something waited
export function ago(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小時前`
  return `${Math.floor(h / 24)} 天前`
}
export const waited = (ms: number) => ago(Math.max(0, ms)).replace(/前$/, '')

// 任務板 26 小時沒更新: minutes within the hour, hours for three days, then days
export function staleLine(b: Board, now: number): string | null {
  const ms = now - Date.parse(b.updated)
  if (ms <= b.staleMs) return null
  const h = Math.floor(ms / 3_600_000)
  const span = h < 1 ? `${Math.floor(ms / 60_000)} 分鐘` : h < 72 ? `${h} 小時` : `${Math.floor(h / 24)} 天`
  return `${b.title} ${span}沒更新`
}

// 到 11/30, and whether that day has passed (a bare date lasts to its end, in local time)
export function dueOf(due: string, now: number): { text: string; isPast: boolean } {
  const d = DAY_RE.test(due) ? new Date(`${due}T00:00:00`) : new Date(due)
  const end = DAY_RE.test(due) ? d.getTime() + 86_400_000 : d.getTime()
  return { text: `到 ${d.getMonth() + 1}/${d.getDate()}`, isPast: now >= end }
}

// the tag on each card: the status folder's own name (…/產線狀態/主控 → 主控)
export function folderTag(dir: string): string {
  const parts = dir.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] ?? ''
}

// "~/x" → "<home>/x"; the folder setting is typed by hand
export function expandHome(path: string, home: string | undefined): string {
  return home && (path === '~' || path.startsWith('~/')) ? home + path.slice(1) : path
}
