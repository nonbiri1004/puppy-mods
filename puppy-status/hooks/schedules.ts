// The scheduled jobs (FORMAT.md, "schedule logs"): each job's last start and end, read from the
// tail of its log, and whether it is late by the "schedule every" setting. Pure functions, so the
// tests need no engine.
import type { Schedule, ScheduleState } from '../types'

// The end of each log is enough: the last start and end of a job are near the bottom.
export const LOG_TAIL_BYTES = 32_768
// A run that started this long ago and never wrote its end is counted as broken, not running.
export const RUN_MAX_MS = 6 * 3_600_000
// A job is late once its last start is older than its "every" by more than this: a computer asleep
// at the hour runs it on waking, and a run takes a few minutes.
export const LATE_GRACE_MS = 2 * 3_600_000

// "===== 2026-11-25 19:08:31 watch 開始（/where it ran）" and "===== 2026-11-25 19:08:36 watch 結束：成功".
// Anything after 開始 (the folder it ran in) is passed over.
const LINE = /^=====\s+(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\s+(\S+)\s+(開始.*|結束：\s*(.*?))\s*$/

// the stamp is this computer's local time, with no offset
const localTime = (m: RegExpMatchArray) => new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!).getTime()

type Run = { job: string; startedAt: number | null; endedAt: number | null; isOk: boolean | null }

// Every job named in one log's lines, its last start and its last end. One log may hold several
// jobs; a line that is not a start or an end is passed over.
export function runsOf(text: string): Run[] {
  const jobs = new Map<string, Run>()
  for (const line of text.split('\n')) {
    const m = line.match(LINE)
    if (!m) continue
    const job = m[7]!
    const run = jobs.get(job) ?? { job, startedAt: null, endedAt: null, isOk: null }
    const at = localTime(m)
    if (m[8]!.startsWith('開始')) run.startedAt = at
    else {
      run.endedAt = at
      run.isOk = m[9] === '成功'
    }
    jobs.set(job, run)
  }
  return [...jobs.values()]
}

// "daily 1d, weekly 7d" (or "daily=1d") → { daily: 1 day, weekly: 7 days }. m, h and d.
export function everyOf(setting: string): Record<string, number> {
  const unit: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
  const out: Record<string, number> = {}
  for (const m of setting.matchAll(/([\w.-]+)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*([mhd])\b/g)) out[m[1]!] = Number(m[2]) * unit[m[3]!]!
  return out
}

// The runs of every log, one per job (a job in two logs keeps its newest start), with its "every".
export function schedulesOf(runs: Run[], every: Record<string, number>): Schedule[] {
  const byJob = new Map<string, Run>()
  for (const r of runs) {
    const had = byJob.get(r.job)
    if (!had || (r.startedAt ?? r.endedAt ?? 0) > (had.startedAt ?? had.endedAt ?? 0)) byJob.set(r.job, r)
  }
  return [...byJob.values()]
    .map(r => ({ ...r, everyMs: every[r.job] ?? null }))
    .sort((a, b) => a.job.localeCompare(b.job))
}

// One word for a job, the worst first: late (it should have run again by now), broken (the last
// run failed, or started long ago and never ended), running, ok.
export function scheduleState(s: Schedule, now: number): ScheduleState {
  const last = s.startedAt ?? s.endedAt
  if (s.everyMs != null && last != null && now - last > s.everyMs + LATE_GRACE_MS) return 'late'
  const isOpen = s.startedAt != null && (s.endedAt == null || s.endedAt < s.startedAt)
  if (isOpen) return now - s.startedAt! > RUN_MAX_MS ? 'failed' : 'running'
  return s.isOk === false ? 'failed' : 'ok'
}

export const SCHEDULE_WORD: Record<ScheduleState, string> = { ok: '成功', failed: '有錯誤', running: '跑中', late: '該跑沒跑' }
