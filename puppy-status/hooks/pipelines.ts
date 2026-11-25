// The pipelines that need a look (the repository's FORMAT.md, pipeline-status): only the ones
// that stopped on an error, went quiet past their own stale_after_sec, or (the live stream)
// restarted more than once in a day. A pipeline that is fine says nothing. Pure functions, so the
// tests need no engine.
import type { PipelineAlarm } from '../types'

// detail.restarts_24h above this marks the live stream (FORMAT.md, "known details")
export const LIVE_RESTART_LIMIT = 1

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// A file in the status folder that is not a pipeline's: passed over, never kept from a last read.
export class NotPipeline extends Error {}

// One status file's alarm, or null when it needs no look. A file that is not a pipeline-status
// file throws NotPipeline; one that is not json throws SyntaxError. A pipeline in error shows even
// with a broken "updated" (with no age then).
export function alarmOf(file: string, text: string, now: number): PipelineAlarm | null {
  const v: unknown = JSON.parse(text)
  if (!isObject(v) || v.format !== 'pipeline-status') throw new NotPipeline('not a pipeline-status file')
  const pipeline = str(v.pipeline)
  if (!pipeline) throw new NotPipeline('no "pipeline"')
  const parsed = Date.parse(str(v.updated))
  const updated = Number.isNaN(parsed) ? null : parsed
  const base = { file, pipeline, title: str(v.title) || pipeline, headline: str(v.headline), updated }
  if (v.state === 'error') return { ...base, kind: 'error' }
  const stale = typeof v.stale_after_sec === 'number' && v.stale_after_sec > 0 ? v.stale_after_sec * 1000 : null
  if (stale != null && updated != null && now - updated > stale) return { ...base, kind: 'quiet' }
  const restarts = pipeline === 'live' && isObject(v.detail) && typeof v.detail.restarts_24h === 'number' ? v.detail.restarts_24h : 0
  if (restarts > LIVE_RESTART_LIMIT) {
    const exit = isObject(v.detail) && typeof v.detail.last_exit === 'number' ? `，上次結束碼 ${v.detail.last_exit}` : ''
    return { ...base, kind: 'restarts', headline: `24 小時重啟 ${restarts} 次${exit}` }
  }
  return null
}

export const ALARM_WORD: Record<PipelineAlarm['kind'], string> = { error: '出錯', quiet: '沒更新', restarts: '一直重啟' }

// "~/x" → "<home>/x"; a folder setting is typed by hand
export function expandHome(path: string, home: string | undefined): string {
  return home && (path === '~' || path.startsWith('~/')) ? home + path.slice(1) : path
}
