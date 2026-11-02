import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Conversation, Problem, Snapshot, Status, WaitingAction, WaitingItem } from '../types'
import { cut, MASCOT_SCALE, mascot, PUPPY_COLUMNS, PUPPY_MIN_ROWS, stillBlocks, unknownStages } from './draw'
import type { Mood } from './draw'
import { ago, alerts, expandHome, isOpenable, isStale, markOf, parseStatus, pipeName, quietWhy, sortCards, STATE_WORDS, waited, waitingEntries } from './format'
import { folderName, isSideChatTitle, isWrapUp, KEEP_MS, KEEP_WAITING_MS, nameOf, oneLine, parseConversation, plainLine, promptName, recent, SESSIONS, shownState, wrapOf } from './sessions'
import { view } from './view'
import type { View } from './view'

const PANE = 'puppy-console'
const REFRESH_MS = 60_000
// rows in the list before "▸ 還有 N 件"
const MAX_ROWS = 8
// The terminal pane asks for this many rows: the 13-row puppy and the list fit.
const PANE_ROWS = 40

const snapshot = atom({ plugin: 'puppy-console', key: 'snapshot' } as const, null)
// Things opened by name, closed by default, each kept in $.store under its prefix and key, so the
// minute's read and a restart keep them open: a pipeline's group of waiting items
// ("<pipeline>:<group id>"), the rest of a long list ("all"), the pipelines' details ("pipelines").
const openGroups = atom({ plugin: 'puppy-console', key: 'openGroups' } as const, {} as Record<string, boolean>)
const openMore = atom({ plugin: 'puppy-console', key: 'openMore' } as const, {} as Record<string, boolean>)
const OPENED = ['group:', 'more:'] as const
type Opened = typeof OPENED[number]
const writeError = atom({ plugin: 'puppy-console', key: 'writeError' } as const, null as string | null)
const actionNote = atom({ plugin: 'puppy-console', key: 'actionNote' } as const, null as { text: string; isError: boolean } | null)

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

// Every *.json in the folder is one card. A file that does not parse becomes a problem line,
// never a missing card without a word: the writer may be halfway through, or on an old format.
// A file that fails once (caught mid-write, or a sync's half copy) keeps its last good card, so
// the card does not blink out and its notice is not told again when it comes back.
export async function loadFolder($: EngineInterface, dir: string, prev: Status[] = []): Promise<Omit<Snapshot, 'conversations' | 'conversationsError'>> {
  const loadedAt = await $.clock.now()
  if (!dir) return { dir, cards: [], problems: [], dirError: 'no status folder set', loadedAt }
  let entries
  try {
    entries = await $.fs.list(dir)
  } catch (err) {
    return { dir, cards: [], problems: [], dirError: errorText(err), loadedAt }
  }
  const cards: Status[] = []
  const problems: Problem[] = []
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.endsWith('.json') || f.name.startsWith('.')) continue
    try {
      const s = parseStatus(await $.fs.read(`${dir}/${f.name}`))
      if (`${s.pipeline}.json` !== f.name) throw new Error(`"pipeline" is ${s.pipeline}, so the file should be ${s.pipeline}.json`)
      cards.push(s)
    } catch (err) {
      problems.push({ file: f.name, reason: errorText(err) })
      const kept = prev.find(s => `${s.pipeline}.json` === f.name)
      if (kept) cards.push(kept)
    }
  }
  return { dir, cards: sortCards(cards), problems, dirError: null, loadedAt }
}

// The conversations' files. A file older than the card can show is not read at all, and one
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
    return { conversations: [], error: /ENOENT|no such|not found|missing/i.test(why) ? null : why, problems: [] }
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
        problems.push({ file: `sessions/${f.name}`, reason: `its "id" is ${c.id}` })
        continue
      }
      readCache.set(f.name, { mtimeMs: f.mtimeMs ?? 0, conversation: c })
      out.push(c)
    } catch (err) {
      problems.push({ file: `sessions/${f.name}`, reason: cached ? `${errorText(err)}; showing the last read` : errorText(err) })
      if (cached) out.push(cached.conversation)
    }
  }
  return { conversations: recent(out, now), error: null, problems }
}

// This conversation's own file, `~/.claude/console/sessions/<session id>.json`; only this
// conversation writes it. `own` is what the file last said, kept by session id: /clear gives a
// new id without a new session.start, and a reload starts the module over and reads it back.
// Writes go one after another and never hold up the turn: a turn's hooks queue them and go on.
let own: Conversation | null = null
let writing: Promise<void> = Promise.resolve()
// What the classic hooks told about each session: the app's own title (its sidebar's, which the
// app writes after the first prompt and may change) and whether it began as a fork.
const appTitles = new Map<string, string>()
const forks = new Set<string>()
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
        // the repository's name (a worktree's main checkout), not the folder: no "console-sessions"
        // for a worktree, no home folder's name for a conversation outside any repository
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
    const appTitle = appTitles.get(id)
    own = change({
      ...own,
      updated: new Date(now).toISOString(),
      ...(appTitle ? { title: oneLine(appTitle, 80), isAppTitle: true as const } : {}),
      ...(forks.has(id) || (appTitle && isSideChatTitle(appTitle)) ? { isFork: true as const } : {}),
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
// a hook never opens a permission dialog. Nothing is said when it is not sent.
async function push($: EngineInterface, text: string): Promise<void> {
  try {
    const input = { message: text, status: 'proactive' as const }
    const { decision } = await $.tool.check({ tool: 'PushNotification', input })
    if (decision === 'allow') await $.tool.call({ tool: 'PushNotification', ...input })
  } catch {
    // no such tool here (the terminal, an older app), or it failed: the card still shows it
  }
}

// One refresh at a time: the timer and the button share the running one,
// so an older read can never finish last and overwrite a newer one.
let running: Promise<void> | null = null
function refresh($: EngineInterface, setting: string, isNotifying: boolean, isShowing: boolean): Promise<void> {
  running ??= (async () => {
    const home = await $.env.get('HOME')
    const dir = expandHome(setting.trim(), home)
    const prev = await read($, snapshot)
    const folder = await loadFolder($, dir, prev?.cards ?? [])
    const loaded = isShowing && home
      ? await loadConversations($, `${home}/${SESSIONS}`, folder.loadedAt)
      : { conversations: [], error: null, problems: [] }
    const next: Snapshot = {
      ...folder,
      problems: [...folder.problems, ...loaded.problems],
      conversations: loaded.conversations,
      conversationsError: loaded.error,
    }
    await update($, snapshot, () => next)
    // A toast shows in this conversation only, for ten seconds; each open conversation tells its own.
    if (isNotifying) for (const line of alerts(prev, next)) $.ui.toast(line, { timeoutMs: 10_000 })
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
    const opened: Record<Opened, Record<string, boolean>> = { 'group:': {}, 'more:': {} }
    for (const key of await $.store.keys()) {
      const prefix = OPENED.find(p => key.startsWith(p))
      if (!prefix || (await $.store.get(key)) !== true) continue
      opened[prefix][key.slice(prefix.length)] = true
    }
    // each atom named as it is: the engine lists what a module reads and writes from the code itself
    await update($, openGroups, () => opened['group:'])
    await update($, openMore, () => opened['more:'])
  } catch {
    // nothing kept yet, or no store here: the defaults
  }
}

// Opened is kept by its key; closed is the default, so closing forgets it.
async function pressOpen($: EngineInterface, prefix: Opened, key: string): Promise<void> {
  const flip = (was: Record<string, boolean>) => {
    const { [key]: isOpen, ...rest } = was
    return isOpen ? rest : { ...rest, [key]: true }
  }
  const next = prefix === 'group:' ? await update($, openGroups, flip) : await update($, openMore, flip)
  await (next[key] ? $.store.set(`${prefix}${key}`, true) : $.store.delete(`${prefix}${key}`)).catch(() => {})
}

// A waiting item's button. open shows a file or folder with the system's own app (macOS
// `open`); fill puts words in this conversation's prompt box, after anything already typed there,
// for you to finish and send. Either way one line under the list says what happened.
async function pressAction($: EngineInterface, a: WaitingAction): Promise<void> {
  const note = (text: string, isError = false) => update($, actionNote, () => ({ text, isError }))
  try {
    if (a.open != null) {
      const path = expandHome(a.open, await $.env.get('HOME'))
      // the path as the system will open it: a link named like a video must not lead to an app
      const { kind, realPath } = await $.fs.stat(path, { resolve: true })
      if (!realPath || kind === 'other' || !isOpenable(kind === 'dir' ? `${realPath.replace(/\/$/, '')}/` : realPath)) {
        return void (await note(`不開 ${a.open}：它指向的不是可以看的檔案`, true))
      }
      const { exitCode, stderr } = await $.process.run(['open', path])
      await (exitCode === 0 ? note(`已打開 ${folderName(path)}`) : note(`打不開 ${a.open}：${oneLine(stderr, 120) || `exit ${exitCode}`}`, true))
    } else if (a.fill != null) {
      const box = await $.prompt.read()
      const isEmpty = !box.text.trim()
      const { isFilled, refusal } = await $.prompt.fill({ text: isEmpty ? a.fill : `\n${a.fill}`, mode: isEmpty ? 'replace' : 'append' })
      await (isFilled ? note('已放進輸入框：寫完再送出')
        : note(refusal === 'dialog' ? '輸入框被對話框佔住，關掉後再按一次' : refusal === 'no_composer' ? '這個對話沒有輸入框' : '輸入框沒有收下', true))
    }
  } catch (err) {
    await note(`${a.open != null ? `打不開 ${a.open}` : '填不進輸入框'}：${errorText(err)}`, true)
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

// The folder is read only while the pane is open: once when it opens, then every minute.
// A module variable, not $.state: a timer is not data, and a reload drops both together.
let reading: Timer | null = null
function stopReading() {
  reading?.cancel()
  reading = null
}

// Like setInterval in a component's mount, cleared on unmount: each tick first asks whether the
// pane is still up, and stops when it is not. Started over on every /console, so a second
// /console never leaves two timers. Only the ticks tell news with a toast: the read on opening
// is shown by the pane itself, and would compare against a read that may be hours old.
function startReading($: EngineInterface, setting: string, isNotifying: boolean, isShowing: boolean) {
  stopReading()
  reading = $.clock.every(REFRESH_MS, () => {
    void (async () => {
      if (!(await isPaneUp($))) return stopReading()
      await refresh($, setting, isNotifying, isShowing)
    })().catch(() => {})
  })
}

function safeView(s: Status, now: number): View {
  try {
    return view(s, now)
  } catch {
    return { summary: [], detailText: [], facts: [] }
  }
}

export const register: Register = (on, options) => {
  const setting = String(options.status_dir ?? '')
  const isNotifying = options.notify !== 'off'
  const isWriting = options.conversations !== 'off'
  const isPushing = isWriting && options.push !== 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'console', description: '打開 console：現在有什麼要你處理' })
    const started = await next(e)
    // the folder is read only on /console. a reload (or a new worker) with the pane still up reads again
    if (await isPaneUp($)) {
      await loadFolds($)
      void refresh($, setting, false, isWriting)
      startReading($, setting, isNotifying, isWriting)
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

  on('tool.call', async ($, e, next) => {
    if (isWriting && e.agentId === undefined && isWrapUp(e.tool)) wrap = wrapOf(e as Record<string, unknown>) ?? wrap
    return next(e)
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
      }))
        .then(() => {
          const c = told as Conversation | null
          if (isPushing && c && state === 'waiting' && !c.isFork) void push($, cut(`${c.title} · ${c.ask}`, 190))
        })
    }
    return next(e)
  })

  // The session ends: a turn left running is done, so the card never waits on a guess. A /clear
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

  on('command.run', { command: 'console' }, async $ => {
    await loadFolds($)
    // read before opening, so the first draw has the cards
    await refresh($, setting, false, isWriting)
    await $.ui.open({ id: PANE, title: 'console', rows: PANE_ROWS })
    startReading($, setting, isNotifying, isWriting)
    return { text: 'console 已打開。' }
  })

  // The pane answers one question: what waits for you now. One list, one row per thing, each
  // with its button; the pipelines are one grey line at the bottom that opens to their details.
  // Nothing waits: the puppy and one sentence.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const opened = await read($, openGroups)
    const openedMore = await read($, openMore)
    const ownWriteError = await read($, writeError)
    const note = await read($, actionNote)
    if (!snap) return <Text dimColor>讀取中…</Text>
    const isTerminal = e.surface === 'terminal'
    const columns = e.props.bodyColumns
    const hasSvg = !isTerminal && 'Svg' in ui
    const sinceText = (t?: string) => (t && !Number.isNaN(Date.parse(t)) ? waited(now - Date.parse(t)) : '')

    // One row: the words give way, the age and the buttons on the right never wrap (STYLE.md).
    // The terminal cuts the words by columns; the desktop lets them end at the edge.
    type Row = { key: string; text: string; word?: { text: string; color: 'warning' | 'error' }; age: string; actions?: WaitingAction[]; group?: string }
    const row = (r: Row) => {
      const labels = (r.actions ?? []).map(a => (a.fill != null ? `${a.label}…` : a.label))
      const right = (r.age ? r.age.length * 2 + 1 : 0) + labels.reduce((n, l) => n + l.length + 5, 0)
      const lead = r.word ? `${r.word.text} ` : ''
      const text = isTerminal ? cut(r.text, Math.max(8, columns - right - lead.length * 2)) : r.text
      return (
        <Box key={`row:${r.key}`} flexDirection="row" gap={1} alignItems="center">
          <Box flexShrink={1} minWidth={0} flexGrow={1}>
            <Text wrap="truncate-end">{r.word && <Text color={r.word.color}>{lead}</Text>}{text}</Text>
          </Box>
          <Box flexShrink={0} flexDirection="row" gap={1} alignItems="center">
            {r.age && <Text dimColor>{r.age}</Text>}
            {(r.actions ?? []).map((a, i) => (
              <Button key={`act:${r.key}:${i}`} label={labels[i]!} onPress={() => pressAction($, a)} />
            ))}
          </Box>
        </Box>
      )
    }

    // Everything that waits, in one flat list: each pipeline's waiting items, or its state when it
    // waits or broke with no item to name. A pipeline's named group of items is one row that opens
    // in place. The conversations that ask you something are left to the app's sidebar.
    const rows: Row[] = []
    for (const s of snap.cards) {
      const entries = waitingEntries(s)
      for (const en of entries) {
        if ('item' in en) {
          rows.push({ key: `i:${s.pipeline}:${en.item.id}`, text: en.item.text, age: sinceText(en.item.since), actions: en.item.actions })
        } else {
          // by time, not as text: the times may be written in different offsets
          const oldest = en.items.map(w => w.since).filter(t => t && !Number.isNaN(Date.parse(t))).sort((a, b) => Date.parse(a!) - Date.parse(b!))[0]
          rows.push({ key: `g:${s.pipeline}:${en.group.id}`, text: `${en.group.label} ×${en.items.length}`, age: sinceText(oldest), group: `${s.pipeline}:${en.group.id}` })
          if (opened[`${s.pipeline}:${en.group.id}`]) {
            for (const w of en.items) rows.push({ key: `i:${s.pipeline}:${w.id}`, text: `　${w.text}`, age: sinceText(w.since), actions: w.actions })
          }
        }
      }
      if (entries.length === 0 && s.state === 'error') rows.push({ key: `s:${s.pipeline}`, text: `${pipeName(s)}：${s.headline}`, word: { text: '出錯', color: 'error' }, age: sinceText(s.updated) })
      else if (entries.length === 0 && s.state === 'waiting') rows.push({ key: `s:${s.pipeline}`, text: `${pipeName(s)}：${s.headline}`, age: sinceText(s.updated) })
    }
    // the count is of things, not rows: an opened group's items are its own one thing
    const count = rows.filter(r => !r.text.startsWith('　')).length
    const isAll = openedMore.all === true
    const shownRows = isAll ? rows : rows.slice(0, MAX_ROWS)

    const listRow = (r: Row) => r.group
      ? (
        <Box key={`grp:${r.key}`} flexDirection="row" gap={1}>
          <Box flexShrink={1} minWidth={0} flexGrow={1}>
            <Button key={`group:${r.group}`} plain label={`${opened[r.group] ? '▾' : '▸'} ${isTerminal ? cut(r.text, Math.max(8, columns - 12)) : r.text}`} onPress={() => pressOpen($, 'group:', r.group!)} />
          </Box>
          <Box flexShrink={0}>{r.age && <Text dimColor>{r.age}</Text>}</Box>
        </Box>
      )
      : row(r)

    // The puppy types while a conversation is running, else sleeps: it shows only when nothing waits.
    const mood: Mood = snap.conversations.some(c => shownState(c, now) === 'running') ? 'typing' : 'sleeping'
    const puppy = hasSvg && 'Svg' in ui
      ? <ui.Svg source={mascot(mood)} alt={`白白${mood === 'typing' ? '在打筆電' : '在睡覺'}`} width={34 * MASCOT_SCALE} height={26 * MASCOT_SCALE} isInteractive />
      : !hasSvg && e.props.scroll.bodyRows >= PUPPY_MIN_ROWS && columns >= PUPPY_COLUMNS
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

    // Each pipeline in a few grey words: 影片：閒置 · 音樂：跑中 42/70. Only 等你 has a color, and
    // 出錯 its own. Pressed, it opens each pipeline's details below it.
    const isPipesOpen = openedMore.pipelines === true
    const pipes = snap.cards.length > 0 && (
      <Box key="pipelines" flexDirection="column" gap="xs">
        <Button key="show-pipelines" plain onPress={() => pressOpen($, 'more:', 'pipelines')}>
          <Text dimColor>{isPipesOpen ? '▾' : '▸'} </Text>
          {snap.cards.map((s, i) => {
            const mark = markOf(s, now)
            const color = mark === 'waiting' ? 'warning' : mark === 'error' ? 'error' : undefined
            const progress = s.progress?.total ? ` ${s.progress.done}/${s.progress.total}` : ''
            return (
              <Text key={`pipe-${s.pipeline}`} dimColor={!color}>
                {i > 0 && <Text dimColor> · </Text>}
                <Text dimColor>{pipeName(s)}：</Text><Text color={color} dimColor={!color}>{STATE_WORDS[mark]}</Text><Text dimColor>{progress}</Text>
              </Text>
            )
          })}
        </Button>
        {isPipesOpen && snap.cards.map(s => {
          const v = safeView(s, now)
          const stale = isStale(s, now) && s.state !== 'error'
          return (
            <Box key={`pipe-detail-${s.pipeline}`} flexDirection="column" paddingLeft={2}>
              <Text><Text weight="semibold">{pipeName(s)}</Text><Text dimColor> · {STATE_WORDS[markOf(s, now)]} · {ago(now - Date.parse(s.updated))}</Text></Text>
              <Text dimColor wrap="truncate-end">{s.headline}</Text>
              {stale && <Text dimColor>{quietWhy(s, now)}</Text>}
              {v.summary.map((l, i) => (
                <Text key={`sum-${s.pipeline}-${i}`} dimColor>{l.label ? `${l.label} ` : ''}{l.parts.map(p => p.text).join(l.sep)}</Text>
              ))}
              {/* jobs at a stage the summary has no place for, named so none goes missing */}
              {unknownStages(s).map(line => <Text key={`other-${line}`} dimColor>其他階段 · {line}</Text>)}
              {v.detailText.map(line => <Text dimColor>{line}</Text>)}
              {v.facts.map(line => <Text dimColor>{line}</Text>)}
            </Box>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          {count > 0 ? <Text><Text color="warning" weight="semibold">{count} 件等你</Text></Text> : <Text dimColor>{ago(now - snap.loadedAt)}看過</Text>}
          <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
            {count > 0 && <Text dimColor>{ago(now - snap.loadedAt)}</Text>}
            {/* no toast: what it finds shows right here */}
            <Button key="refresh" label="重新整理" hotkey="r" onPress={() => refresh($, setting, false, isWriting)} />
          </Box>
        </Box>
        {count > 0 ? (
          <Box key="list" flexDirection="column" gap={isTerminal ? 0 : 'xs'}>
            {shownRows.map(listRow)}
            {rows.length > MAX_ROWS && <Button key="more-all" label={`${isAll ? '▾ 收起' : `▸ 還有 ${rows.length - MAX_ROWS} 件`}`} dimColor onPress={() => pressOpen($, 'more:', 'all')} />}
          </Box>
        ) : (
          <Box key="empty" flexDirection="column" alignItems="center" gap="xs">
            {puppy}
            <Text>都處理完了</Text>
          </Box>
        )}
        {note && (note.isError ? <Text color="error">{note.text}</Text> : <Text dimColor>{note.text}</Text>)}
        {isWriting && snap.conversationsError && <Text color="error">讀不到對話資料夾：{snap.conversationsError}</Text>}
        {isWriting && ownWriteError && <Text dimColor>這個對話寫不進自己的檔：{ownWriteError}</Text>}
        {snap.dirError && (
          <Box flexDirection="column">
            <Text color="error">讀不到狀態資料夾：{snap.dirError}</Text>
            <Text dimColor>到 /config → puppy-console → status folder 設定{snap.dir ? `（現在是 ${snap.dir}）` : ''}</Text>
          </Box>
        )}
        {!snap.dirError && snap.cards.length === 0 && snap.problems.length === 0 && (
          <Text dimColor>{snap.dir} 裡還沒有狀態檔</Text>
        )}
        {pipes}
        {snap.problems.map(p => (
          <Text key={`p:${p.file}`} dimColor>略過 {p.file}：{p.reason}</Text>
        ))}
      </Box>
    )
  })
}
