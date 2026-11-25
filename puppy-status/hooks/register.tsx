import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register, RenderChildren, Timer } from 'claude-code'

import type { Conversation, PipelineAlarm, Problem, Schedule, Snapshot, Usage } from '../types'
import { cut, MASCOT_SCALE, mascot, PUPPY_COLUMNS, PUPPY_MIN_ROWS, stillBlocks } from './draw'
import type { Mood } from './draw'
import {
  ago, APP_SESSIONS, cleanPrompt, firstSentence, folderName, groupKeys, idle, isBrief, isSideChatTitle, isWrapUp, KEEP_WAITING_MS, nameOf, OLD_SESSIONS, oneLine,
  parseConversation, plain, plainLine, promptName, questionOf, recent, rowName, SESSIONS, shownState, sourceOf, stateWord, taskOf, waited, wrapOf,
} from './sessions'
import { ALARM_WORD, alarmOf, expandHome, NotPipeline } from './pipelines'
import { everyOf, LOG_TAIL_BYTES, pausedOf, runsOf, SCHEDULE_WORD, scheduleState, schedulesOf } from './schedules'
import { claudeLimits, CODEX_LIMIT, CODEX_LOCK, CODEX_SESSIONS, CODEX_TAIL_BYTES, codexLimits, limitText, LOCK_OLD_MS, lockOf, readText } from './usage'

const PANE = 'puppy-status'
const REFRESH_MS = 60_000
// a card's rows before "▸ 還有 N 個"
const MAX_ROWS = 5
// The terminal pane asks for this many rows: the 13-row puppy and the list fit.
const PANE_ROWS = 40
// $.store key: the old folders' files were copied over (migrate). puppy-sessions kept its own
// "migrated:console" in its own store; this is a new mod's store, so a new key.
const MIGRATED = 'migrated:puppy-sessions'

const snapshot = atom({ plugin: 'puppy-status', key: 'snapshot' } as const, null)
// A card's rest opened by its name, closed by default, kept in $.store under "more:<name>", so the
// minute's read and a restart keep it open.
const openMore = atom({ plugin: 'puppy-status', key: 'openMore' } as const, {} as Record<string, boolean>)
const writeError = atom({ plugin: 'puppy-status', key: 'writeError' } as const, null as string | null)
const migrateError = atom({ plugin: 'puppy-status', key: 'migrateError' } as const, null as string | null)
const actionNote = atom({ plugin: 'puppy-status', key: 'actionNote' } as const, null as { text: string; isError: boolean } | null)

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isMissing = (why: string) => /ENOENT|no such|not found|missing/i.test(why)

// The conversations' files. A file older than the pane can show is not read at all, and one
// whose time has not changed since the last read is not read again, so the folder can grow
// without the refresh slowing down. One that does not parse (a write caught halfway) keeps what
// the last read had. A missing folder is "none yet"; any other failure is said in the pane.
const readCache = new Map<string, { mtimeMs: number; conversation: Conversation }>()
type Loaded = { conversations: Conversation[]; error: string | null; problems: Problem[] }
async function loadConversations($: EngineInterface, dir: string, now: number): Promise<Loaded> {
  let entries
  try {
    entries = await $.fs.list(dir)
  } catch (err) {
    const why = errorText(err)
    return { conversations: [], error: isMissing(why) ? null : why, problems: [] }
  }
  const out: Conversation[] = []
  const problems: Problem[] = []
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.endsWith('.json') || f.name.startsWith('.')) continue
    if (f.mtimeMs && now - f.mtimeMs > KEEP_WAITING_MS) continue
    const cached = readCache.get(f.name)
    if (cached && f.mtimeMs && cached.mtimeMs === f.mtimeMs) {
      out.push(cached.conversation)
      continue
    }
    try {
      const c = parseConversation(await $.fs.read(`${dir}/${f.name}`))
      if (`${c.id}.json` !== f.name) {
        problems.push({ file: f.name, reason: `its "id" is ${c.id}` })
        continue
      }
      readCache.set(f.name, { mtimeMs: f.mtimeMs ?? 0, conversation: c })
      out.push(c)
    } catch (err) {
      problems.push({ file: f.name, reason: cached ? `${errorText(err)}; showing the last read` : errorText(err) })
      if (cached) out.push(cached.conversation)
    }
  }
  return { conversations: out, error: null, problems }
}

// Whether the desktop app archived each conversation, from its own session file's
// isArchived. That file is the app's, not documented: one missing, unreadable or without a
// true/false there is left out, so the pane says it does not know rather than guess. Read again
// only when the file's time changes.
const appCache = new Map<string, { mtimeMs: number; isArchived: boolean | null }>()
async function loadArchived($: EngineInterface, home: string, list: Conversation[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const c of list) {
    if (!c.appSession || c.appSession in out) continue
    const path = `${home}/${APP_SESSIONS}/${c.appSession}.json`
    try {
      const { mtimeMs } = await $.fs.stat(path)
      let known = appCache.get(path)
      if (!known || known.mtimeMs !== mtimeMs) {
        const v: unknown = JSON.parse(await $.fs.read(path))
        const flag = typeof v === 'object' && v !== null ? (v as Record<string, unknown>).isArchived : undefined
        known = { mtimeMs, isArchived: typeof flag === 'boolean' ? flag : null }
        appCache.set(path, known)
      }
      if (known.isArchived !== null) out[c.appSession] = known.isArchived
    } catch {
      // the app's file is gone or changed shape: unknown
    }
  }
  return out
}

// The day folders under sessions/<year>/<month>/<day>/, newest first, at most `n`.
async function newestDays($: EngineInterface, root: string, n: number): Promise<string[]> {
  const dated = async (dir: string) =>
    (await $.fs.list(dir).catch(() => [])).filter(f => f.kind === 'dir' && /^\d+$/.test(f.name)).map(f => f.name).sort().reverse()
  const out: string[] = []
  for (const y of await dated(root)) {
    for (const m of await dated(`${root}/${y}`)) {
      for (const d of await dated(`${root}/${y}/${m}`)) {
        out.push(`${root}/${y}/${m}/${d}`)
        if (out.length >= n) return out
      }
    }
  }
  return out
}

// Codex's newest reading: the runs of the two newest days (a run started yesterday may still be
// writing), the three last written, and of their readings the newest. No ~/.codex (Codex not used
// here) is no line at all, not an error.
async function loadCodex($: EngineInterface, home: string): Promise<Usage['codex']> {
  try {
    const runs: { path: string; size: number; mtimeMs: number }[] = []
    for (const day of await newestDays($, `${home}/${CODEX_SESSIONS}`, 2)) {
      for (const f of await $.fs.list(day)) {
        if (f.kind === 'file' && f.name.endsWith('.jsonl')) runs.push({ path: `${day}/${f.name}`, size: f.size, mtimeMs: f.mtimeMs ?? 0 })
      }
    }
    let best: Usage['codex'] = null
    for (const f of runs.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 3)) {
      const offset = Math.max(0, f.size - CODEX_TAIL_BYTES)
      const found = codexLimits(await $.fs.read(f.path, { offset, length: f.size - offset }))
      if (found && (!best || (found.readAt ?? 0) > (best.readAt ?? 0))) best = found
    }
    return best
  } catch {
    return null
  }
}

// The Codex lock and limit files (FORMAT.md, "codex lock"). Neither there is the usual case: null.
// One that is there but can't be read is named in `errors`, not taken for "no lock".
async function loadHold($: EngineInterface, home: string, errors: string[]): Promise<Usage['hold']> {
  const missing = (name: string) => (err: unknown) => {
    const why = errorText(err)
    if (!isMissing(why)) errors.push(`讀不到 ~/${name}：${why}`)
    return null
  }
  const lockDir = `${home}/${CODEX_LOCK}`
  const lock = await $.fs.stat(lockDir)
    .then(async st => lockOf(await $.fs.read(`${lockDir}/owner`).catch(() => ''), st.mtimeMs ?? null))
    .catch(missing(CODEX_LOCK))
  const limit = await $.fs.stat(`${home}/${CODEX_LIMIT}`)
    .then(async st => ({ text: oneLine(await $.fs.read(`${home}/${CODEX_LIMIT}`), 120), since: st.mtimeMs ?? null }))
    .catch(missing(CODEX_LIMIT))
  return lock || limit ? { lock, limit } : null
}

async function loadUsage($: EngineInterface, home: string, errors: string[]): Promise<Usage> {
  const claude = await $.session.usage().then(u => claudeLimits(u.rateLimits)).catch(() => [])
  return { claude, codex: await loadCodex($, home), hold: await loadHold($, home, errors) }
}

// The folders typed in the settings. Empty: that card is off.
type Folders = { statusDir: string; scheduleLogs: string; scheduleEvery: string; paused: string }

// Each job's last run, from the end of every *.log in the schedule logs folder. A log that can't
// be read is named in `errors` and the other jobs still show; so are pieces of "schedule every"
// it can't read.
async function loadSchedules($: EngineInterface, dir: string, setting: string, paused: Set<string>, now: number, errors: string[]): Promise<Schedule[]> {
  const runs = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.log') || f.name.startsWith('.') || !f.size) continue
    const offset = Math.max(0, f.size - LOG_TAIL_BYTES)
    try {
      runs.push(...runsOf(await $.fs.read(`${dir}/${f.name}`, { offset, length: f.size - offset })))
    } catch (err) {
      errors.push(`讀不到 ${f.name}：${errorText(err)}`)
    }
  }
  const { every, unread } = everyOf(setting)
  if (unread.length) errors.push(`schedule every 看不懂：${unread.join('、')}（寫成 daily 1d，單位 m h d w）`)
  const out: Schedule[] = []
  for (const s of schedulesOf(runs, every)) out.push({ ...s, isPaused: paused.has(s.job), seenAt: await seenAt($, s.job, now) })
  return out
}

// When this pane first saw a job, kept in $.store under "seen:<job>" (this computer, every
// conversation): a job is not called late before the pane has watched one whole interval of it.
// A store that can't be read or written: not known, and late counts from the last start alone.
async function seenAt($: EngineInterface, job: string, now: number): Promise<number | null> {
  try {
    const was = await $.store.get(`seen:${job}`)
    if (typeof was === 'number') return was
    await $.store.set(`seen:${job}`, now)
    return now
  } catch {
    return null
  }
}

// The pipelines that need a look, from every *.json in the status folder. A file caught halfway
// through a write, a sync's half copy or a file that can't be read this minute is judged again
// from its last good text, so one that stays broken still goes quiet once past stale_after_sec; a
// file of another format is not a pipeline's and is passed over.
const statusCache = new Map<string, string>()
async function loadAlarms($: EngineInterface, dir: string, now: number, paused: Set<string>): Promise<PipelineAlarm[]> {
  const out: PipelineAlarm[] = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.json') || f.name.startsWith('.')) continue
    let alarm: PipelineAlarm | null
    try {
      const text = await $.fs.read(`${dir}/${f.name}`)
      alarm = alarmOf(f.name, text, now)
      statusCache.set(f.name, text)
    } catch (err) {
      const was = err instanceof NotPipeline ? undefined : statusCache.get(f.name)
      alarm = was == null ? null : alarmOf(f.name, was, now)
    }
    if (alarm && !paused.has(alarm.pipeline)) out.push(alarm)
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

// A folder the settings ask for and the pane can't read is said in the pane, missing or not.
async function loadFolders($: EngineInterface, home: string, folders: Folders, now: number) {
  const errors: string[] = []
  const tryRead = async <T,>(setting: string, read: (dir: string) => Promise<T[]>): Promise<T[]> => {
    if (!setting.trim()) return []
    try {
      return await read(expandHome(setting.trim(), home))
    } catch (err) {
      errors.push(`讀不到 ${setting.trim()}：${errorText(err)}`)
      return []
    }
  }
  const paused = pausedOf(folders.paused)
  const schedules = await tryRead(folders.scheduleLogs, dir => loadSchedules($, dir, folders.scheduleEvery, paused, now, errors))
  const alarms = await tryRead(folders.statusDir, dir => loadAlarms($, dir, now, paused))
  return { schedules, alarms, folderErrors: errors }
}

// puppy-sessions (0.13) kept the conversations' files in ~/.claude/puppy-sessions/, and
// puppy-console (up to 0.12) in ~/.claude/console/sessions/. They are copied here once, newest
// folder first, each one of the last two weeks (older ones are never shown) this folder does not
// have yet (a conversation may already have written its own), and left where they were: the old
// folders can go by hand. A failure is said in the pane and tried again at the next start.
async function migrate($: EngineInterface): Promise<void> {
  // in the write queue, so this conversation's own first write never runs while files are copied
  const copying = writing.then(() => copyOld($))
  writing = copying
  return copying
}
async function copyOld($: EngineInterface): Promise<void> {
  try {
    if ((await $.store.get(MIGRATED)) === true) return
    const home = await $.env.get('HOME')
    if (!home) return
    const to = `${home}/${SESSIONS}`
    const now = await $.clock.now()
    const have = new Set(await $.fs.list(to).then(l => l.map(f => f.name)).catch(() => [] as string[]))
    for (const dir of OLD_SESSIONS) {
      const from = `${home}/${dir}`
      let old: FsEntry[]
      try {
        old = await $.fs.list(from)
      } catch (err) {
        if (!isMissing(errorText(err))) throw err
        old = []
      }
      for (const f of old) {
        if (f.kind !== 'file' || !f.name.endsWith('.json') || f.name.startsWith('.') || have.has(f.name)) continue
        if (f.mtimeMs && now - f.mtimeMs > KEEP_WAITING_MS) continue
        const text = await $.fs.read(`${from}/${f.name}`)
        // another conversation may have written its own file meanwhile: that one is newer
        if (!(await $.fs.exists(`${to}/${f.name}`))) await $.fs.write(`${to}/${f.name}`, text)
        have.add(f.name)
      }
    }
    await $.store.set(MIGRATED, true)
    await update($, migrateError, () => null)
  } catch (err) {
    await update($, migrateError, () => `舊名的對話檔沒搬完，下次啟動再試：${errorText(err)}`).catch(() => {})
  }
}

// This conversation's own file, `~/.claude/puppy-status/<session id>.json`; only this
// conversation writes it. `own` is what the file last said, kept by session id: /clear gives a
// new id without a new session.start, and a reload starts the module over and reads it back.
// Writes go one after another and never hold up the turn: a turn's hooks queue them and go on.
let own: Conversation | null = null
let writing: Promise<void> = Promise.resolve()
// What the classic hooks told about each session: the app's own title (its sidebar's, which the
// app writes after the first prompt and may change) and whether it began as a fork.
const appTitles = new Map<string, string>()
const forks = new Set<string>()
// The desktop app's own name for this conversation, "<account>/<organization>/local_<id>", from
// the environment it starts Claude Code with; none in the terminal.
async function appSessionOf($: EngineInterface): Promise<string | undefined> {
  const quiet = (p: Promise<string | undefined>) => p.catch(() => undefined)
  const [account, org, host] = await Promise.all([
    quiet($.env.get('CLAUDE_CODE_ACCOUNT_UUID')),
    quiet($.env.get('CLAUDE_CODE_ORGANIZATION_UUID')),
    quiet($.env.get('CLAUDE_CODE_HOST_SESSION_ID')),
  ])
  const name = `${account}/${org}/${host}`
  return account && org && host?.startsWith('local_') && /^[\w-]+\/[\w-]+\/local_[\w-]+$/.test(name) ? name : undefined
}
function save($: EngineInterface, change: (c: Conversation) => Conversation, prompt = ''): Promise<void> {
  // The id is asked for now, not when the write's turn comes: a /clear in between must not
  // send this turn's recap into the next conversation's file.
  const asked = $.session.id()
  writing = writing.then(async () => {
    const [id, home, now] = await Promise.all([asked, $.env.get('HOME'), $.clock.now()])
    if (!home) throw new Error('HOME is not set')
    const path = `${home}/${SESSIONS}/${id}.json`
    if (own?.id !== id) {
      own = await $.fs.read(path).then(parseConversation).catch(() => null)
      if (!own) {
        // the repository's name (a worktree's main checkout), not the folder: no "t172-…" for a
        // worktree, no home folder's name for a conversation outside any repository
        const [messages, repo] = await Promise.all([$.session.messages().catch(() => []), $.session.repo().catch(() => null)])
        own = {
          format: 'session-status', version: 1, id, updated: '', state: 'running',
          // this turn's prompt first: a side chat or a fork starts on a copy of another
          // conversation's messages, whose first prompt is that one's
          title: promptName(prompt) || nameOf(messages),
          project: repo ? folderName(repo.root) : undefined, recap: '', ask: null,
        }
      }
    }
    if (!own.appSession) {
      const appSession = await appSessionOf($)
      if (appSession) own = { ...own, appSession }
    }
    const appTitle = appTitles.get(id)
    const title = appTitle ? oneLine(appTitle, 80) : own.title
    // how it began: a side chat by the app's name for it; started by another conversation by the
    // brief it opened with (a fork too, when it carries the other's messages); else a fork
    const isDispatched = own.source === 'dispatched' || (prompt !== '' && isBrief(prompt))
    const source = appTitle && isSideChatTitle(appTitle) ? 'side' as const
      : isDispatched ? 'dispatched' as const
      : forks.has(id) || own.source === 'fork' || own.isFork ? 'fork' as const
      : undefined
    const task = own.task ?? (isDispatched && prompt ? taskOf(plain(prompt)) : undefined) ?? taskOf(title)
    const { isFork: _old, ...rest } = own
    own = change({
      ...rest,
      updated: new Date(now).toISOString(),
      title,
      ...(appTitle ? { isAppTitle: true as const } : {}),
      ...(source ? { source } : {}),
      ...(task ? { task } : {}),
    })
    await $.fs.write(path, `${JSON.stringify(own, null, 2)}\n`)
    await update($, writeError, () => null)
  }).catch(async err => {
    // said in this conversation's pane, if it has one open; the write is tried again next turn
    await update($, writeError, () => errorText(err)).catch(() => {})
  })
  return writing
}

// A push to the person's phone or desktop when this conversation stops to ask them something,
// through the app's own PushNotification tool. Only when the permission check already allows it:
// a hook never opens a permission dialog. Nothing is said when it is not sent. A side chat never
// pushes: its question is about the conversation you are in.
async function push($: EngineInterface, c: Conversation | null): Promise<void> {
  if (!c || c.state !== 'waiting' || sourceOf(c) === 'side') return
  try {
    const input = { message: cut(`${rowName(c)} · ${c.ask ?? ''}`, 190), status: 'proactive' as const }
    const { decision } = await $.tool.check({ tool: 'PushNotification', input })
    if (decision === 'allow') await $.tool.call({ tool: 'PushNotification', ...input })
  } catch {
    // no such tool here (the terminal, an older app), or it failed: the pane still shows it
  }
}

// The rows that wait for you, by group (one task's files are one row): what a toast compares
// between two reads.
const waitingIds = (s: Snapshot | null, now: number) => {
  if (!s) return new Set<string>()
  const keys = groupKeys(s.conversations)
  return new Set(recent(live(s), now).filter(c => shownState(c, now) === 'waiting').map(c => keys.get(c.id) ?? c.id))
}
// The files of conversations the desktop app has not archived: an archived one is done with,
// whatever its last state. Taken out before files are merged, so an archived file never hides
// one of its group that is still open.
const live = (s: Snapshot) => s.conversations.filter(c => !(c.appSession && s.archived[c.appSession] === true))

// One refresh at a time: the timer and the button share the running one,
// so an older read can never finish last and overwrite a newer one.
let running: Promise<void> | null = null
function refresh($: EngineInterface, isNotifying: boolean, isReading: boolean, folders: Folders): Promise<void> {
  running ??= (async () => {
    const [home, now] = await Promise.all([$.env.get('HOME'), $.clock.now()])
    const prev = await read($, snapshot)
    const loaded = isReading && home
      ? await loadConversations($, `${home}/${SESSIONS}`, now)
      : { conversations: [], error: null, problems: [] }
    const archived = home ? await loadArchived($, home, loaded.conversations) : {}
    const holdErrors: string[] = []
    const usage = home ? await loadUsage($, home, holdErrors) : { claude: [], codex: null, hold: null }
    const fromFolders = home ? await loadFolders($, home, folders, now) : { schedules: [], alarms: [], folderErrors: [] }
    const next: Snapshot = {
      conversations: loaded.conversations,
      conversationsError: loaded.error,
      archived,
      usage,
      ...fromFolders,
      folderErrors: [...fromFolders.folderErrors, ...holdErrors],
      problems: loaded.problems,
      loadedAt: now,
    }
    await update($, snapshot, () => next)
    // A toast shows in this conversation only, for ten seconds; each open conversation tells its
    // own. This one's question is in front of you already.
    if (isNotifying && prev) {
      const was = waitingIds(prev, now)
      const keys = groupKeys(next.conversations)
      const self = await $.session.id().catch(() => '')
      for (const c of recent(live(next), now)) {
        if (shownState(c, now) === 'waiting' && !was.has(keys.get(c.id) ?? c.id) && c.id !== self) $.ui.toast(cut(`${rowName(c)} 在等你：${c.ask ?? ''}`, 120), { timeoutMs: 10_000 })
      }
    }
  })()
    // an engine call that failed mid-read: the pane keeps the last read, and the next tick tries again
    .catch(() => {})
    .finally(() => { running = null })
  return running
}

// What is open as the store has it, read when the pane opens, so something opened in another
// conversation shows here too. A store that can't be read keeps what this session has.
async function loadFolds($: EngineInterface): Promise<void> {
  try {
    const opened: Record<string, boolean> = {}
    for (const key of await $.store.keys()) {
      if (key.startsWith('more:') && (await $.store.get(key)) === true) opened[key.slice('more:'.length)] = true
    }
    await update($, openMore, () => opened)
  } catch {
    // nothing kept yet, or no store here: the defaults
  }
}

// Opened is kept by its key; closed is the default, so closing forgets it.
async function pressMore($: EngineInterface, key: string): Promise<void> {
  const next = await update($, openMore, was => {
    const { [key]: isOpen, ...rest } = was
    return isOpen ? rest : { ...rest, [key]: true }
  })
  await (next[key] ? $.store.set(`more:${key}`, true) : $.store.delete(`more:${key}`)).catch(() => {})
}

// "整理…": the request to archive goes into this conversation's prompt box, after anything
// already typed there, for you to read and send. The mod archives nothing itself: a Claude with
// the app's tools does, asking first.
async function pressClean($: EngineInterface, text: string): Promise<void> {
  const note = (t: string, isError = false) => update($, actionNote, () => ({ text: t, isError }))
  try {
    const box = await $.prompt.read()
    const isEmpty = !box.text.trim()
    const { isFilled, refusal } = await $.prompt.fill({ text: isEmpty ? text : `\n${text}`, mode: isEmpty ? 'replace' : 'append' })
    await (isFilled ? note('已放進輸入框：看過再送出')
      : note(refusal === 'dialog' ? '輸入框被對話框佔住，關掉後再按一次' : refusal === 'no_composer' ? '這個對話沒有輸入框' : '輸入框沒有收下', true))
  } catch (err) {
    await note(`填不進輸入框：${errorText(err)}`, true)
  }
}

// A failed question is not a closed pane: the reading goes on, and ui.close stops it.
async function isPaneUp($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    return true
  }
}

// The files are read only while the pane is open: once when it opens, then every minute.
// A module variable, not $.state: a timer is not data, and a reload drops both together.
let reading: Timer | null = null
function stopReading() {
  reading?.cancel()
  reading = null
}

// Like setInterval in a component's mount, cleared on unmount: each tick first asks whether the
// pane is still up, and stops when it is not. Started over on every /my-status, so a second
// /my-status never leaves two timers. Only the ticks tell news with a toast: the read on opening
// is shown by the pane itself, and would compare against a read that may be hours old.
function startReading($: EngineInterface, isNotifying: boolean, isReading: boolean, folders: Folders) {
  stopReading()
  reading = $.clock.every(REFRESH_MS, () => {
    void (async () => {
      if (!(await isPaneUp($))) return stopReading()
      await refresh($, isNotifying, isReading, folders)
    })().catch(() => {})
  })
}

export const register: Register = (on, options) => {
  const isNotifying = options.notify !== 'off'
  const isWriting = options.conversations !== 'off'
  const isPushing = isWriting && options.push !== 'off'
  const folders: Folders = {
    statusDir: String(options.status_dir ?? ''),
    scheduleLogs: String(options.schedule_logs ?? ''),
    scheduleEvery: String(options.schedule_every ?? ''),
    paused: String(options.paused ?? ''),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'my-status', description: '打開狀態：等你回話的對話、出問題的產線、每個對話、額度、排程、可以清的' })
    const started = await next(e)
    const copied = isWriting ? migrate($) : Promise.resolve()
    // the files are read only on /my-status. a reload (or a new worker) with the pane still up reads
    // again, once the old names' files are copied
    if (await isPaneUp($)) {
      await loadFolds($)
      void copied.then(() => refresh($, false, isWriting, folders))
      startReading($, isNotifying, isWriting, folders)
    }
    return started
  })

  // Closing the pane stops the reading at once (the next tick would see it gone anyway).
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (!(await isPaneUp($))) stopReading()
    return closed
  }).catch(($, e, next) => next(e))

  // The app's own title and how the session began, from the classic hooks: SessionStart (a fork
  // of another conversation, a /clear, a resume) and UserPromptSubmit (each prompt, with the
  // title as it stands). Kept by session id and written with the next turn's save.
  on('classic.SessionStart', async ($, e, next) => {
    if (isWriting) {
      if (e.source === 'fork') forks.add(e.session_id)
      if (e.session_title) appTitles.set(e.session_id, e.session_title)
    }
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (isWriting && e.session_title) appTitles.set(e.session_id, e.session_title)
    return next(e)
  })

  // The main loop only: a subagent's turns are part of this conversation's turn.
  // `wrap` is this turn's wrap_up, caught as it is called, so an older turn's is never used.
  let wrap: ReturnType<typeof wrapOf> = null
  on('turn.start', async ($, e, next) => {
    if (isWriting && e.agentId === undefined) {
      wrap = null
      save($, c => ({ ...c, state: 'running', ask: null }), e.text)
    }
    return next(e)
  })

  // A wrap_up is caught as it is called. A question card (AskUserQuestion, a plan to approve, an
  // offer of a new session) holds the turn until you answer: the file says "waiting" with its
  // question while it is up, and "running" again once the call comes back, answered or not.
  on('tool.call', async ($, e, next) => {
    if (!isWriting || e.agentId !== undefined) return next(e)
    if (isWrapUp(e.tool)) {
      wrap = wrapOf(e as Record<string, unknown>) ?? wrap
      return next(e)
    }
    const ask = questionOf(e as Record<string, unknown>)
    if (!ask) return next(e)
    let told: Conversation | null = null
    void save($, c => (told = { ...c, state: 'waiting', ask })).then(() => (isPushing ? push($, told) : undefined))
    try {
      return await next(e)
    } finally {
      void save($, c => (c.state === 'waiting' && c.ask === ask ? { ...c, state: 'running', ask: null } : c))
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (isWriting && e.agentId === undefined) {
      const w = wrap
      const state = e.reason === 'error' || e.reason === 'refusal' ? 'error' : w?.ask ? 'waiting' : 'done'
      // a turn with no wrap_up of its own keeps the last wrap_up's recap (a short reply says less);
      // a conversation that never had one (the terminal) shows the answer's first line instead
      let told: Conversation | null = null
      void save($, c => (told = {
        ...c,
        state,
        recap: w?.recap || (c.isWrapRecap ? c.recap : plainLine(e.answer, 200) || c.recap),
        ...(w?.recap || c.isWrapRecap ? { isWrapRecap: true as const } : {}),
        ask: w?.ask ?? null,
      })).then(() => (isPushing ? push($, told) : undefined))
    }
    return next(e)
  })

  // The session ends: a turn left running is done, so the pane never waits on a guess. A /clear
  // ends this conversation for good, so its question goes too; an exit keeps it (you may come back).
  on('session.end', async ($, e, next) => {
    if (isWriting) {
      const isCleared = e.reason === 'clear'
      // the engine's short end budget bounds this wait; a write still queued past it is lost,
      // and the 6-hour fallback (RUNNING_MS) covers that
      await save($, c => ({
        ...c,
        state: c.state === 'running' || (isCleared && c.state === 'waiting') ? 'done' : c.state,
        ask: isCleared ? null : c.ask,
      }))
    }
    return next(e)
  })

  on('command.run', { command: 'my-status' }, async $ => {
    await loadFolds($)
    // read before opening, so the first draw has the cards
    await refresh($, false, isWriting, folders)
    await $.ui.open({ id: PANE, title: 'status', rows: PANE_ROWS })
    startReading($, isNotifying, isWriting, folders)
    return { text: '狀態已打開。' }
  })

  // The pane: the conversations that wait for you to answer, at the top; the pipelines that need a
  // look (only when one does); one row for each of the other conversations; the rate limits and
  // who holds Codex; the scheduled jobs; the finished conversations you may archive.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const opened = await read($, openMore)
    const ownWriteError = await read($, writeError)
    const migrated = await read($, migrateError)
    const note = await read($, actionNote)
    if (!snap) return <Text dimColor>讀取中…</Text>
    const isTerminal = e.surface === 'terminal'
    // a card's body has 4 fewer columns than the pane: its border and padding
    const cardColumns = Math.max(8, e.props.bodyColumns - 4)
    const hasSvg = !isTerminal && 'Svg' in ui
    const since = (c: Conversation) => waited(now - Date.parse(c.updated))
    const fit = (text: string, room: number) => (isTerminal ? cut(text, Math.max(8, room)) : text)

    // archived in the app: done with, so not listed
    const listed = recent(live(snap), now)
    const waiting = listed.filter(c => shownState(c, now) === 'waiting')
    const others = listed.filter(c => shownState(c, now) !== 'waiting')
    const idleOnes = idle(live(snap), now)
    const cleanable = idleOnes.filter(c => snap.archived[c.appSession!] === false)
    const unknown = idleOnes.filter(c => !(c.appSession! in snap.archived)).length

    // a list cut at MAX_ROWS ends in a dim button that opens the rest
    const limited = <T,>(key: string, list: T[], draw: (x: T) => RenderChildren): RenderChildren[] => {
      const isAll = opened[key] === true
      return [
        ...(isAll ? list : list.slice(0, MAX_ROWS)).map(draw),
        list.length > MAX_ROWS && (
          <Button key={`more-${key}`} label={isAll ? '▾ 收起' : `▸ 還有 ${list.length - MAX_ROWS} 個`} dimColor onPress={() => pressMore($, key)} />
        ),
      ]
    }
    // words on the left that give way, facts on the right that never wrap
    const row = (key: string, left: RenderChildren, right: RenderChildren) => (
      <Box key={key} flexDirection="row" gap={1}>
        <Box flexShrink={1} minWidth={0} flexGrow={1}>{left}</Box>
        <Box flexShrink={0}>{right}</Box>
      </Box>
    )
    const header = (name: string, right: string, color?: 'warning') => (
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexShrink={1} minWidth={0}><Text weight="semibold" color={color} wrap="truncate-end">{name}</Text></Box>
        {right && <Box flexShrink={0}><Text dimColor>{right}</Text></Box>}
      </Box>
    )

    // 等你回話: its name, how long it has waited, and the question under it.
    const waitingCard = waiting.length > 0 && (
      <Box key="card-waiting" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1} gap="xs">
        {header('等你回話', `${waiting.length} 個`, 'warning')}
        {limited('waiting', waiting, c => (
          <Box key={`waiting-${c.id}`} flexDirection="column">
            {row(`waiting-row-${c.id}`, <Text wrap="truncate-end">{fit(rowName(c), cardColumns - 8)}</Text>, <Text dimColor>{since(c)}</Text>)}
            {c.ask && c.ask !== rowName(c) && <Text dimColor wrap="truncate-end">{fit(`→ ${c.ask}`, cardColumns)}</Text>}
          </Box>
        ))}
      </Box>
    )

    // 對話: one row each, its name and the first sentence of where it stands, its state and how long.
    const conversationsCard = others.length > 0 && (
      <Box key="card-conversations" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        {header('對話', `${others.length} 個`)}
        {limited('conversations', others, c => {
          const word = stateWord(c, now)
          const right = `${word} · ${since(c)}`
          const recap = c.recap ? firstSentence(c.recap) : ''
          const text = fit(`${rowName(c)}${recap ? ` · ${recap}` : ''}`, cardColumns - right.length * 2 - 1)
          const name = rowName(c)
          return row(
            `row-${c.id}`,
            <Text wrap="truncate-end">{text.startsWith(name) ? <Text>{name}<Text dimColor>{text.slice(name.length)}</Text></Text> : text}</Text>,
            <Text><Text color={word === '跑中' ? 'success' : word === '出錯' ? 'error' : undefined} dimColor={word !== '跑中' && word !== '出錯'}>{word}</Text><Text dimColor> · {since(c)}</Text></Text>,
          )
        })}
      </Box>
    )

    // 額度: each window on one line; Codex says how old its reading is (it writes one only while it runs).
    const { claude, codex, hold } = snap.usage
    const usageCard = (
      <Box key="card-usage" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        {header('額度', '')}
        {claude.length > 0
          ? row('usage-claude', <Text wrap="truncate-end">{fit(claude.map(l => limitText(l, now)).join('　'), cardColumns - 7)}</Text>, <Text dimColor>Claude</Text>)
          : <Text key="usage-claude" dimColor>Claude：還沒有讀數</Text>}
        {codex && row(
          'usage-codex',
          <Text wrap="truncate-end">{fit(codex.limits.map(l => limitText(l, now)).join('　'), cardColumns - 18)}</Text>,
          <Text dimColor>Codex{codex.readAt != null ? ` · ${readText(codex.readAt, now)}` : ''}</Text>,
        )}
        {hold?.limit && row(
          'codex-limit',
          <Text wrap="truncate-end"><Text color="error">Codex 撞額度</Text><Text dimColor>{fit(hold.limit.text ? ` · ${hold.limit.text}` : '', cardColumns - 22)}</Text></Text>,
          <Text dimColor>{hold.limit.since != null ? ago(now - hold.limit.since) : ''}</Text>,
        )}
        {hold?.lock && row(
          'codex-lock',
          <Text wrap="truncate-end">Codex 使用中<Text dimColor>{fit(hold.lock.owner ? ` · ${hold.lock.owner}` : '', cardColumns - 24)}</Text></Text>,
          hold.lock.since != null && now - hold.lock.since > LOCK_OLD_MS
            ? <Text><Text color="error">可能沒放</Text><Text dimColor> · {waited(now - hold.lock.since)}</Text></Text>
            : <Text dimColor>{hold.lock.since != null ? waited(now - hold.lock.since) : ''}</Text>,
        )}
      </Box>
    )

    // 產線: only the pipelines that need a look (an error, gone quiet, restarting), each with its
    // headline and how long since its file was written. Shown only when there is one.
    const alarmsCard = snap.alarms.length > 0 && (
      <Box key="card-alarms" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        {header('產線', `${snap.alarms.length} 條要看`)}
        {limited('alarms', snap.alarms, a => {
          const age = a.updated == null ? '' : waited(now - a.updated)
          const right = `${ALARM_WORD[a.kind]}${age ? ` · ${age}` : ''}`
          return row(
            `alarm-${a.file}`,
            <Text wrap="truncate-end">{a.title}<Text dimColor>{a.headline ? fit(` · ${a.headline}`, cardColumns - a.title.length * 2 - right.length * 2 - 1) : ''}</Text></Text>,
            <Text><Text color="error">{ALARM_WORD[a.kind]}</Text><Text dimColor>{age ? ` · ${age}` : ''}</Text></Text>,
          )
        })}
      </Box>
    )

    // 排程: one row per job, its last run's word and how long ago it started. Only a late or broken
    // job gets a color.
    const schedulesCard = snap.schedules.length > 0 && (
      <Box key="card-schedules" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        {header('排程', '')}
        {snap.schedules.map(sc => {
          const state = scheduleState(sc, now)
          const last = sc.startedAt ?? sc.endedAt
          const age = last == null ? '' : state === 'running' ? waited(now - last) : ago(now - last)
          const isBad = state === 'late' || state === 'failed'
          // a paused job is said in grey, its name too: nothing to do about it
          const isQuiet = state === 'paused'
          const isBefore = state === 'late' || state === 'pending' || state === 'paused'
          return row(
            `schedule-${sc.job}`,
            <Text wrap="truncate-end" dimColor={isQuiet}>{sc.job}</Text>,
            <Text><Text color={isBad ? 'error' : state === 'running' ? 'success' : undefined} dimColor={!isBad && state !== 'running'}>{SCHEDULE_WORD[state]}</Text><Text dimColor>{age ? ` · ${isBefore ? '上次 ' : ''}${age}` : ''}</Text></Text>,
          )
        })}
      </Box>
    )

    // 可以清: done, untouched for a day, not archived in the app. The button asks a Claude to
    // archive them, and that Claude asks you first.
    const cleanCard = cleanable.length > 0 && (
      <Box key="card-clean" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        {header('可以清', `${cleanable.length} 個`)}
        {limited('clean', cleanable, c => row(`clean-${c.id}`, <Text dimColor wrap="truncate-end">{fit(rowName(c), cardColumns - 10)}</Text>, <Text dimColor>閒了 {since(c)}</Text>))}
        <Box flexDirection="row">
          <Button key="clean" label="整理…" onPress={() => pressClean($, cleanPrompt(cleanable))} />
        </Box>
      </Box>
    )

    // The puppy types while a conversation is running, else sleeps: it shows only when nothing waits.
    const mood: Mood = listed.some(c => shownState(c, now) === 'running') ? 'typing' : 'sleeping'
    const puppy = hasSvg && 'Svg' in ui
      ? <ui.Svg source={mascot(mood)} alt={`白白${mood === 'typing' ? '在打筆電' : '在睡覺'}`} width={34 * MASCOT_SCALE} height={26 * MASCOT_SCALE} isInteractive />
      : !hasSvg && e.props.scroll.bodyRows >= PUPPY_MIN_ROWS && e.props.bodyColumns >= PUPPY_COLUMNS
        ? (
          <Box key="puppy" flexDirection="column">
            {stillBlocks(mood).map((runs, i) => (
              // a blank row is one space: an empty Text takes no row, and the puppy must keep all 13
              <Text key={`puppy-${i}`}>
                {runs.length ? runs.map(([text, fg, bg]) => <Text color={fg ?? undefined} backgroundColor={bg ?? undefined}>{text}</Text>) : ' '}
              </Text>
            ))}
          </Box>
        )
        : null

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          {waiting.length > 0
            ? <Text color="warning" weight="semibold">{waiting.length} 個對話等你</Text>
            : <Text dimColor>{ago(now - snap.loadedAt)}看過</Text>}
          <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
            {waiting.length > 0 && <Text dimColor>{ago(now - snap.loadedAt)}</Text>}
            {/* no toast: what it finds shows right here */}
            <Button key="refresh" label="重新整理" hotkey="r" onPress={() => refresh($, false, isWriting, folders)} />
          </Box>
        </Box>
        {waitingCard || (
          <Box key="empty" flexDirection="column" alignItems="center" gap="xs">
            {puppy}
            <Text>沒有對話在等你</Text>
          </Box>
        )}
        {alarmsCard}
        {conversationsCard}
        {usageCard}
        {schedulesCard}
        {cleanCard}
        {unknown > 0 && <Text dimColor>{unknown} 個做完的對話讀不到桌面 app 的封存狀態，沒列進可以清</Text>}
        {note && (note.isError ? <Text color="error">{note.text}</Text> : <Text dimColor>{note.text}</Text>)}
        {!isWriting && <Text dimColor>conversations 關著：對話不寫檔，這裡不列（/config → puppy-status）</Text>}
        {isWriting && snap.conversationsError && <Text color="error">讀不到對話資料夾：{snap.conversationsError}</Text>}
        {isWriting && ownWriteError && <Text dimColor>這個對話寫不進自己的檔：{ownWriteError}</Text>}
        {migrated && <Text dimColor>{migrated}</Text>}
        {snap.folderErrors.map(why => <Text key={`folder:${why}`} color="error">{why}</Text>)}
        {snap.problems.map(p => (
          <Text key={`p:${p.file}`} dimColor>略過 {p.file}：{p.reason}</Text>
        ))}
      </Box>
    )
  })
}
