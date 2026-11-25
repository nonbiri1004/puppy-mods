// The "額度" card: how much of each rate-limit window is used, for Claude (the engine's own
// reading, $.session.usage().rateLimits) and Codex (the newest `rate_limits` its CLI wrote into
// ~/.codex/sessions). Pure functions, so the tests need no engine.
import type { Limit, Usage } from '../types'
import { ago } from './sessions'

// Codex keeps one file per run under sessions/<year>/<month>/<day>/; only the newest is read.
export const CODEX_SESSIONS = '.codex/sessions'
// The end of that file is read, where the last reading is: a run's file can grow to megabytes.
export const CODEX_TAIL_BYTES = 256 * 1024

const WINDOW_NAMES: Record<string, string> = { five_hour: '5 小時', seven_day: '一週' }

// Claude's windows as the engine reports them (five_hour, seven_day, a gateway's spend_limit).
export function claudeLimits(rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]): Limit[] {
  return rateLimits.map(r => ({
    label: WINDOW_NAMES[r.kind] ?? r.kind,
    percent: r.percentUsed,
    ...(r.resetsAt && !Number.isNaN(Date.parse(r.resetsAt)) ? { resetsAt: Date.parse(r.resetsAt) } : {}),
  }))
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// One Codex window ({ used_percent, window_minutes, resets_at } in seconds), or null.
function codexWindow(v: unknown): Limit | null {
  if (!isObject(v) || typeof v.used_percent !== 'number') return null
  const minutes = typeof v.window_minutes === 'number' ? v.window_minutes : 0
  const label = minutes === 300 ? '5 小時' : minutes === 10080 ? '一週' : minutes ? `${Math.round(minutes / 60)} 小時` : '?'
  return { label, percent: v.used_percent, ...(typeof v.resets_at === 'number' ? { resetsAt: v.resets_at * 1000 } : {}) }
}

// The last line of a Codex run that carries a reading: { timestamp, payload: { rate_limits } }.
// A line cut at the start of the tail, or one of another shape, is passed over.
export function codexLimits(tail: string): Usage['codex'] {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (!line.includes('"rate_limits"')) continue
    try {
      const v: unknown = JSON.parse(line)
      if (!isObject(v) || !isObject(v.payload)) continue
      const rl = v.payload.rate_limits
      if (!isObject(rl)) continue
      const limits = [codexWindow(rl.primary), codexWindow(rl.secondary)].filter((l): l is Limit => l !== null)
      if (!limits.length) continue
      const at = typeof v.timestamp === 'string' ? Date.parse(v.timestamp) : Number.NaN
      return { limits, readAt: Number.isNaN(at) ? null : at }
    } catch {
      // half a line, or not json
    }
  }
  return null
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

// When a window resets, in the computer's own time: 14:30 today, 週四 14:30 within the week,
// 11/30 after that; 已重置 once the time has passed (a reading older than its window).
export function resetText(resetsAt: number | undefined, now: number): string {
  if (resetsAt == null) return ''
  if (resetsAt <= now) return '已重置'
  const d = new Date(resetsAt)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const today = new Date(now)
  if (d.toDateString() === today.toDateString()) return `${time} 重置`
  if (resetsAt - now < 6 * 24 * 3_600_000) return `週${WEEKDAYS[d.getDay()]} ${time} 重置`
  return `${d.getMonth() + 1}/${d.getDate()} 重置`
}

// One window as a line: 5 小時 42% · 14:30 重置. A window already reset says so in place of a
// number that no longer holds.
export function limitText(l: Limit, now: number): string {
  const reset = resetText(l.resetsAt, now)
  if (reset === '已重置') return `${l.label} 已重置`
  return `${l.label} ${Math.round(l.percent)}%${reset ? ` · ${reset}` : ''}`
}

// How old Codex's reading is: Codex writes one only while it runs.
export const readText = (readAt: number | null, now: number) => (readAt == null ? '' : ago(now - readAt))

// Who holds Codex now and whether it hit its limit, from two small files a person's own scripts
// may keep beside Codex (FORMAT.md, "codex lock"); Codex itself writes neither. Taking the lock is a
// folder made with mkdir, with "<who> <YYYY-MM-DD HH:MM:SS>" in its owner file; hitting the limit
// is one line, "<when it resets> <which window> <who>", kept until someone deletes it.
export const CODEX_LOCK = '.codex/collab.lock'
export const CODEX_LIMIT = '.codex/collab-limit'
// A lock held this long, with no Codex run to show for it, was probably not let go.
export const LOCK_OLD_MS = 60 * 60_000

// "T203 2026-11-25 19:08:31" → { owner: "T203", since }; the time is the computer's own. An owner
// file without a time (or none at all) leaves the folder's own time as when.
export function lockOf(owner: string, folderTime: number | null): NonNullable<Usage['hold']>['lock'] {
  const line = owner.split('\n').find(l => l.trim())?.trim() ?? ''
  const m = line.match(/^(.*?)\s*(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?\s*$/)
  if (!m) return { owner: line, since: folderTime }
  const since = new Date(+m[2]!, +m[3]! - 1, +m[4]!, +m[5]!, +m[6]!, +(m[7] ?? 0)).getTime()
  return { owner: m[1]!.trim(), since }
}
