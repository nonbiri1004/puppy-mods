import { expect, test } from 'claude-code/testing'

import { alarmOf, expandHome } from '../hooks/pipelines'
import { everyOf, LATE_GRACE_MS, RUN_MAX_MS, runsOf, scheduleState, schedulesOf } from '../hooks/schedules'
import { lockOf } from '../hooks/usage'

const T = new Date(2026, 10, 25, 12, 0, 0).getTime()
const HOUR = 3_600_000
const DAY = 24 * HOUR

test('a start line may name the folder it ran in', () => {
  expect(runsOf('===== 2026-11-22 20:11:34 daily 開始（/somewhere）\n')[0]?.startedAt).toBe(new Date(2026, 10, 22, 20, 11, 34).getTime())
})

test('a log\'s lines give each job its last start and end; other lines are passed over', () => {
  const runs = runsOf([
    '===== 2026-11-22 20:11:34 daily 開始（/somewhere）',
    '--- 2026-11-22 20:11:34 step one',
    '===== 2026-11-22 20:11:34 daily 結束：成功',
    '===== 2026-11-24 09:00:00 daily 開始',
    '===== 2026-11-24 09:00:05 daily 結束：有錯誤',
  ].join('\n'))
  expect(runs).toEqual([{ job: 'daily', startedAt: new Date(2026, 10, 24, 9, 0, 0).getTime(), endedAt: new Date(2026, 10, 24, 9, 0, 5).getTime(), isOk: false }])
})

test('"every" reads m, h, d and w, with or without = or :; what it can\'t read is given back', () => {
  expect(everyOf('daily 1d, weekly=1w; watch:90m, 日報 2h')).toEqual({ every: { daily: DAY, weekly: 7 * DAY, watch: 90 * 60_000, 日報: 2 * HOUR }, unread: [] })
  expect(everyOf('')).toEqual({ every: {}, unread: [] })
  expect(everyOf('daily 1d, watch 90min, oops').unread).toEqual(['watch 90min', 'oops'])
})

test('a start in the same second as the last end is a new run, still going', () => {
  const [run] = runsOf('===== 2026-11-25 11:59:30 w 結束：成功\n===== 2026-11-25 11:59:30 w 開始\n')
  expect(run).toMatchObject({ endedAt: null, isOk: null })
  expect(scheduleState({ ...run!, everyMs: null }, T)).toBe('running')
})

test('a job is late past its every and the grace, broken when it failed or never ended, else running or ok', () => {
  const s = (over: object) => ({ job: 'j', startedAt: T - HOUR, endedAt: T - HOUR + 1000, isOk: true, everyMs: DAY, ...over })
  expect(scheduleState(s({}), T)).toBe('ok')
  expect(scheduleState(s({ isOk: false }), T)).toBe('failed')
  expect(scheduleState(s({ startedAt: T - DAY - LATE_GRACE_MS + 1000, endedAt: T - DAY }), T)).toBe('ok')
  expect(scheduleState(s({ startedAt: T - DAY - LATE_GRACE_MS - 1000, endedAt: T - DAY }), T)).toBe('late')
  expect(scheduleState(s({ endedAt: null, isOk: null }), T)).toBe('running')
  // a run still going is running, even past its every
  expect(scheduleState(s({ startedAt: T - 4 * HOUR, endedAt: null, isOk: null, everyMs: HOUR }), T)).toBe('running')
  expect(scheduleState(s({ startedAt: T - RUN_MAX_MS - 1000, endedAt: null, isOk: null, everyMs: null }), T)).toBe('failed')
  // no every: never late
  expect(scheduleState(s({ startedAt: T - 30 * DAY, endedAt: T - 30 * DAY, everyMs: null }), T)).toBe('ok')
})

test('a job in two logs keeps its newest run; jobs are sorted by name', () => {
  const a = { job: 'weekly', startedAt: T - DAY, endedAt: T - DAY, isOk: true }
  const b = { job: 'daily', startedAt: T - 2 * DAY, endedAt: T - 2 * DAY, isOk: true }
  const c = { job: 'daily', startedAt: T - HOUR, endedAt: null, isOk: null }
  expect(schedulesOf([a, b, c], { daily: DAY }).map(s => [s.job, s.startedAt, s.everyMs])).toEqual([['daily', T - HOUR, DAY], ['weekly', T - DAY, null]])
})

test('a pipeline needs a look only on an error, past its own stale time, or restarting live', () => {
  const file = (over: object) => JSON.stringify({ format: 'pipeline-status', version: 1, pipeline: 'p', updated: new Date(T - HOUR).toISOString(), state: 'running', headline: 'h', ...over })
  expect(alarmOf('p.json', file({}), T)).toBeNull()
  expect(alarmOf('p.json', file({ state: 'error', title: '科技選題' }), T)).toMatchObject({ kind: 'error', title: '科技選題', headline: 'h' })
  expect(alarmOf('p.json', file({ stale_after_sec: 600 }), T)).toMatchObject({ kind: 'quiet', title: 'p' })
  expect(alarmOf('p.json', file({ stale_after_sec: 7200 }), T)).toBeNull()
  expect(alarmOf('live.json', file({ pipeline: 'live', detail: { restarts_24h: 2, last_exit: 196 } }), T)).toMatchObject({ kind: 'restarts', headline: '24 小時重啟 2 次，上次結束碼 196' })
  expect(alarmOf('live.json', file({ pipeline: 'live', detail: { restarts_24h: 1 } }), T)).toBeNull()
  // restarts_24h is read for the live stream only
  expect(alarmOf('p.json', file({ detail: { restarts_24h: 5 } }), T)).toBeNull()
  expect(() => alarmOf('x.json', '{"format": "session-status"}', T)).toThrow('not a pipeline-status file')
  // in error with a broken "updated": still shown, with no age
  expect(alarmOf('p.json', file({ state: 'error', updated: 'x' }), T)).toMatchObject({ kind: 'error', updated: null })
  expect(() => alarmOf('x.json', '{"format": "pipeline-sta', T)).toThrow(SyntaxError)
})

test('the lock\'s owner file gives who and since when; without a time, the folder\'s time', () => {
  expect(lockOf('T203 2026-11-25 11:48:00\n', null)).toEqual({ owner: 'T203', since: new Date(2026, 10, 25, 11, 48, 0).getTime() })
  expect(lockOf('local_abc', 123)).toEqual({ owner: 'local_abc', since: 123 })
  expect(lockOf('', 123)).toEqual({ owner: '', since: 123 })
})

test('~ is the home folder', () => {
  expect(expandHome('~/logs', '/home/me')).toBe('/home/me/logs')
  expect(expandHome('/abs', '/home/me')).toBe('/abs')
})
