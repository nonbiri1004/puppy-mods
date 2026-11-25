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
    if (m[8]!.startsWith('開始')) {
      // a new run: an end before it was the last run's, even one in the same second
      run.startedAt = at
      run.endedAt = null
      run.isOk = null
    } else {
      run.endedAt = at
      run.isOk = m[9] === '成功'
    }
    jobs.set(job, run)
  }
  return [...jobs.values()]
}

// "daily 1d, weekly 7d" (or "daily=1d") → { daily: 1 day, weekly: 7 days }; m, h, d and w. A job's
// name is anything but spaces, as in the logs. Pieces it can't read are given back, so the pane
// can say so instead of a job that is never late.
export function everyOf(setting: string): { every: Record<string, number>; unread: string[] } {
  const unit: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 }
  const every: Record<string, number> = {}
  const unread: string[] = []
  for (const piece of setting.split(/[,;\n]/).map(p => p.trim()).filter(Boolean)) {
    const m = piece.match(/^(\S+?)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*([mhdw])$/)
    if (m) every[m[1]!] = Number(m[2]) * unit[m[3]!]!
    else unread.push(piece)
  }
  return { every, unread }
}

// The runs of every log, one per job (a job in two logs keeps its newest start; the same start in
// both keeps the one that wrote its end), with its "every". A job named in "schedule every" with
// no line in any log yet still gets a row: it has never run, which is news once it should have.
export function schedulesOf(runs: Run[], every: Record<string, number>): Schedule[] {
  const byJob = new Map<string, Run>()
  const at = (r: Run) => r.startedAt ?? r.endedAt ?? 0
  for (const r of runs) {
    const had = byJob.get(r.job)
    if (!had || at(r) > at(had) || (at(r) === at(had) && had.endedAt == null && r.endedAt != null)) byJob.set(r.job, r)
  }
  for (const job of Object.keys(every)) {
    if (!byJob.has(job)) byJob.set(job, { job, startedAt: null, endedAt: null, isOk: null })
  }
  return [...byJob.values()]
    .map(r => ({ ...r, everyMs: every[r.job] ?? null }))
    .sort((a, b) => a.job.localeCompare(b.job))
}

// One word for a job: paused when you said so; running while a run is open (not yet six hours
// old); else late (it should have started again by now), broken (the last run failed, or never
// ended), ok. Late is counted from the last start or from when this pane first saw the job,
// whichever is later: a job just set up (its log may hold only a trial run) or a pane just
// installed has not missed anything it watched, so it is "pending" for its first interval. That
// only holds back "late": a last run that failed still says so. A job with no run in its log is
// pending until the pane has watched it one interval, then late.
export function scheduleState(s: Schedule, now: number): ScheduleState {
  if (s.isPaused) return 'paused'
  const isOpen = s.startedAt != null && s.endedAt == null
  if (isOpen && now - s.startedAt! <= RUN_MAX_MS) return 'running'
  const isBroken = isOpen || s.isOk === false
  const last = s.startedAt ?? s.endedAt
  if (last == null) {
    if (s.everyMs == null || s.seenAt == null) return 'pending'
    return now - s.seenAt > s.everyMs + LATE_GRACE_MS ? 'late' : 'pending'
  }
  if (s.everyMs != null && now - last > s.everyMs + LATE_GRACE_MS) {
    const watched = s.seenAt != null && s.seenAt > last ? s.seenAt : last
    if (now - watched > s.everyMs + LATE_GRACE_MS) return 'late'
    return isBroken ? 'failed' : 'pending'
  }
  return isBroken ? 'failed' : 'ok'
}

// "collector-tech-news, weekly" → the names (jobs or pipelines) paused on purpose
export const pausedOf = (setting: string) => new Set(setting.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean))

export const SCHEDULE_WORD: Record<ScheduleState, string> = { ok: '成功', failed: '有錯誤', running: '跑中', late: '該跑沒跑', pending: '等下一次', paused: '暫停中' }
