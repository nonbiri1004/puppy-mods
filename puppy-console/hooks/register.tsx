import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Conversation, Problem, Snapshot, Status, WaitingAction, WaitingItem } from '../types'
import { cut, MASCOT_SCALE, mascot, picture, PUPPY_COLUMNS, PUPPY_MIN_ROWS, stillBlocks, unknownStages } from './draw'
import type { Mood } from './draw'
import { ago, alerts, expandHome, isFolded, isOpenable, isStale, markOf, parseStatus, quietWhy, sortCards, splitCards, titleOf, toggleFold, waitingEntries } from './format'
import { askName, folderName, FRESH_ASK_MS, isSideChatTitle, isWrapUp, KEEP_MS, KEEP_WAITING_MS, nameOf, oneLine, parseConversation, plainLine, promptName, recent, SESSIONS, shownState, wrapOf } from './sessions'
import { view } from './view'
import type { View } from './view'

const PANE = 'puppy-console'
const REFRESH_MS = 60_000
const MAX_NEEDS = 6
const MAX_OTHERS = 5
const MAX_ITEMS = 5
// The terminal pane asks for this many rows: the 13-row puppy and the first cards fit.
const PANE_ROWS = 40

const snapshot = atom({ plugin: 'puppy-console', key: 'snapshot' } as const, null)
// What the person folded or opened, and whether the "older" group is open. The atoms redraw the
// pane; $.store keeps them on this computer across conversations and restarts, one key per card
// ("fold:<pipeline>") so two conversations folding different cards never undo each other.
const folds = atom({ plugin: 'puppy-console', key: 'folds' } as const, {} as Record<string, boolean>)
const isShowingOlder = atom({ plugin: 'puppy-console', key: 'isShowingOlder' } as const, false)
const isShowingDone = atom({ plugin: 'puppy-console', key: 'isShowingDone' } as const, false)
const isShowingOlderNeeds = atom({ plugin: 'puppy-console', key: 'isShowingOlderNeeds' } as const, false)
// Things opened by name, closed by default, each kept in the store under its prefix and key: the
// waiting groups in "for you" ("<pipeline>:<group id>"), a card's details ("<pipeline>"), and a
// list's "▸ N more" ("needs", "running", "done", "<pipeline>").
const openGroups = atom({ plugin: 'puppy-console', key: 'openGroups' } as const, {} as Record<string, boolean>)
const openDetails = atom({ plugin: 'puppy-console', key: 'openDetails' } as const, {} as Record<string, boolean>)
const openMore = atom({ plugin: 'puppy-console', key: 'openMore' } as const, {} as Record<string, boolean>)
const OPENED = ['group:', 'details:', 'more:'] as const
type Opened = typeof OPENED[number]
const writeError = atom({ plugin: 'puppy-console', key: 'writeError' } as const, null as string | null)
const actionNote = atom({ plugin: 'puppy-console', key: 'actionNote' } as const, null as { text: string; isError: boolean } | null)
const FOLD = 'fold:'
const SHOWING_OLDER = 'isShowingOlder'
const SHOWING_DONE = 'isShowingDone'
const SHOWING_OLDER_NEEDS = 'isShowingOlderNeeds'

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

// The folds as the store has them, read when the pane opens, so a fold made in another
// conversation shows here too. A store that can't be read keeps what this session has.
async function loadFolds($: EngineInterface): Promise<void> {
  try {
    const kept: Record<string, boolean> = {}
    const opened: Record<Opened, Record<string, boolean>> = { 'group:': {}, 'details:': {}, 'more:': {} }
    for (const key of await $.store.keys()) {
      const prefix = OPENED.find(p => key.startsWith(p))
      if (!key.startsWith(FOLD) && !prefix) continue
      const v = await $.store.get(key)
      if (typeof v !== 'boolean') continue
      if (key.startsWith(FOLD)) kept[key.slice(FOLD.length)] = v
      else if (prefix && v) opened[prefix][key.slice(prefix.length)] = true
    }
    const showing = (await $.store.get(SHOWING_OLDER)) === true
    const showingDone = (await $.store.get(SHOWING_DONE)) === true
    const showingOlderNeeds = (await $.store.get(SHOWING_OLDER_NEEDS)) === true
    await update($, folds, () => kept)
    // each atom named as it is: the engine lists what a module reads and writes from the code itself
    await update($, openGroups, () => opened['group:'])
    await update($, openDetails, () => opened['details:'])
    await update($, openMore, () => opened['more:'])
    await update($, isShowingOlder, () => showing)
    await update($, isShowingDone, () => showingDone)
    await update($, isShowingOlderNeeds, () => showingOlderNeeds)
  } catch {
    // nothing kept yet, or no store here: the defaults
  }
}

async function pressFold($: EngineInterface, pipeline: string, isOlderCard: boolean): Promise<void> {
  const next = await update($, folds, was => toggleFold(was, pipeline, isOlderCard))
  const key = `${FOLD}${pipeline}`
  await (pipeline in next ? $.store.set(key, next[pipeline]) : $.store.delete(key)).catch(() => {})
}

async function pressOlder($: EngineInterface): Promise<void> {
  const next = await update($, isShowingOlder, was => !was)
  await $.store.set(SHOWING_OLDER, next).catch(() => {})
}

async function pressDone($: EngineInterface): Promise<void> {
  const next = await update($, isShowingDone, was => !was)
  await $.store.set(SHOWING_DONE, next).catch(() => {})
}

async function pressOlderNeeds($: EngineInterface): Promise<void> {
  const next = await update($, isShowingOlderNeeds, was => !was)
  await $.store.set(SHOWING_OLDER_NEEDS, next).catch(() => {})
}

// Opened, a group, a card's details or a "more" is kept by its key, so the minute's read and a
// restart keep it open; closed is the default, so closing forgets it.
async function pressOpen($: EngineInterface, prefix: Opened, key: string): Promise<void> {
  const flip = (was: Record<string, boolean>) => {
    const { [key]: isOpen, ...rest } = was
    return isOpen ? rest : { ...rest, [key]: true }
  }
  const next = prefix === 'group:' ? await update($, openGroups, flip)
    : prefix === 'details:' ? await update($, openDetails, flip) : await update($, openMore, flip)
  await (next[key] ? $.store.set(`${prefix}${key}`, true) : $.store.delete(`${prefix}${key}`)).catch(() => {})
}

// A waiting item's button. open shows a file or folder with the system's own app (macOS
// `open`); fill puts words in this conversation's prompt box, after anything already typed there,
// for you to finish and send. Either way one line under "for you" says what happened.
async function pressAction($: EngineInterface, a: WaitingAction): Promise<void> {
  const note = (text: string, isError = false) => update($, actionNote, () => ({ text, isError }))
  try {
    if (a.open != null) {
      const path = expandHome(a.open, await $.env.get('HOME'))
      // the path as the system will open it: a link named like a video must not lead to an app
      const { kind, realPath } = await $.fs.stat(path, { resolve: true })
      if (!realPath || kind === 'other' || !isOpenable(kind === 'dir' ? `${realPath.replace(/\/$/, '')}/` : realPath)) {
        return void (await note(`won't open ${a.open}: it leads somewhere that is not a file to look at`, true))
      }
      const { exitCode, stderr } = await $.process.run(['open', path])
      await (exitCode === 0 ? note(`opened ${folderName(path)}`) : note(`can't open ${a.open}: ${oneLine(stderr, 120) || `exit ${exitCode}`}`, true))
    } else if (a.fill != null) {
      const box = await $.prompt.read()
      const isEmpty = !box.text.trim()
      const { isFilled, refusal } = await $.prompt.fill({ text: isEmpty ? a.fill : `\n${a.fill}`, mode: isEmpty ? 'replace' : 'append' })
      await (isFilled ? note('in the prompt box: finish it and send')
        : note(refusal === 'dialog' ? 'a dialog has the prompt box; close it and press again' : refusal === 'no_composer' ? 'this conversation has no prompt box' : "the prompt box didn't take it", true))
    }
  } catch (err) {
    await note(`can't ${a.open != null ? `open ${a.open}` : 'fill the prompt box'}: ${errorText(err)}`, true)
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

// A detail of an unexpected shape loses its picture, not the whole pane.
function safePicture(s: Status, stale: boolean) {
  try {
    return picture(s, stale)
  } catch {
    return null
  }
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
    await $.command.register({ name: 'console', description: 'Open the console: what waits for you, then the pipelines' })
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
    return { text: 'console opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const folded = await read($, folds)
    const isShowingOlderCards = await read($, isShowingOlder)
    const isShowingDoneList = await read($, isShowingDone)
    const isShowingOlderNeedList = await read($, isShowingOlderNeeds)
    const opened = await read($, openGroups)
    const openedDetails = await read($, openDetails)
    const openedMore = await read($, openMore)
    const ownWriteError = await read($, writeError)
    const note = await read($, actionNote)
    if (!snap) return <Text dimColor>loading…</Text>
    const isTerminal = e.surface === 'terminal'
    // a card's body has 4 fewer columns than the pane: its border and padding
    const cardColumns = Math.max(8, e.props.bodyColumns - 4)

    const hasSvg = e.surface !== 'terminal' && 'Svg' in ui
    const { current, older } = splitCards(snap.cards, now)
    // the puppy types while a conversation is running, sits while one waits for you, else sleeps
    const shown = snap.conversations.map(c => shownState(c, now))
    const mood: Mood = shown.includes('running') ? 'typing' : shown.includes('waiting') || shown.includes('error') ? 'sitting' : 'sleeping'

    // A card in the "older" group waits for nothing, so its state word has no color there.
    const card = (s: Status, isOlderCard: boolean) => {
      const stale = isStale(s, now) && s.state !== 'error'
      const isCardFolded = isFolded(folded, s.pipeline, isOlderCard)
      const word = markOf(s, now)
      const stateColor = isOlderCard ? undefined
        : word === 'error' ? 'error' : word === 'waiting' || word === 'quiet' ? 'warning' : word === 'running' ? 'success' : undefined
      // what waits for you is in the "for you" card, and the computer in the details: the header
      // keeps to the state and when it last wrote
      const after = ` · ${ago(now - Date.parse(s.updated))}`
      // the terminal clips the name by columns: the card's border and padding, the mark, the facts
      const title = isTerminal ? cut(titleOf(s), Math.max(8, cardColumns - 2 - word.length - after.length - 1)) : titleOf(s)
      // the card's name opens and folds it
      const header = (
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Box flexShrink={1} minWidth={0}>
            <Button key={`fold-${s.pipeline}`} plain onPress={() => pressFold($, s.pipeline, isOlderCard)}>
              <Text dimColor>{isCardFolded ? '▸' : '▾'}</Text>{' '}<Text weight="semibold">{title}</Text>
            </Button>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor><Text color={stateColor}>{word}</Text>{after}</Text>
          </Box>
        </Box>
      )
      if (isCardFolded) {
        return (
          <Box key={`card-${s.pipeline}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
            {header}
          </Box>
        )
      }
      // the summary is text on both surfaces; the rest folds into "▸ details", where the desktop
      // draws its picture in place of the same facts as text
      const v = safeView(s, now)
      const pic = hasSvg ? safePicture(s, stale) : null
      const isDetailsOpen = openedDetails[s.pipeline] === true
      const hasDetails = Boolean(pic) || v.detailText.length > 0 || v.facts.length > 0
      return (
        <Box key={`card-${s.pipeline}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          {header}
          <Text>{s.headline}</Text>
          {stale && <Text><Text color="warning">quiet</Text><Text dimColor> · {quietWhy(s, now)}</Text></Text>}
          {v.summary.map((l, i) => (
            <Text key={`sum-${s.pipeline}-${i}`}>
              {l.label && <Text dimColor>{l.label} </Text>}
              {l.parts.map((p, k) => (
                <Text>{k > 0 && <Text dimColor>{l.sep}</Text>}{p.isYou ? <Text color="warning">{p.text}</Text> : p.text}</Text>
              ))}
            </Text>
          ))}
          {/* jobs at a stage the summary has no place for, named so none goes missing */}
          {unknownStages(s).map(line => <Text key={`other-${line}`} dimColor>other stage · {line}</Text>)}
          {hasDetails && (
            <Box key={`details-${s.pipeline}`} flexDirection="column" gap="xs">
              <Button key={`show-details-${s.pipeline}`} label={`${isDetailsOpen ? '▾' : '▸'} details`} dimColor onPress={() => pressOpen($, 'details:', s.pipeline)} />
              {isDetailsOpen && pic && 'Svg' in ui && <ui.Svg source={pic.source} alt={pic.alt} isInteractive />}
              {isDetailsOpen && !pic && v.detailText.map(line => <Text dimColor>{line}</Text>)}
              {isDetailsOpen && v.facts.map(line => <Text dimColor>{line}</Text>)}
            </Box>
          )}
        </Box>
      )
    }

    const since = (c: Conversation) => `${c.project ? `${c.project} · ` : ''}${ago(now - Date.parse(c.updated))}`
    // One row: the name gives way, the facts on the right never wrap (STYLE.md, long text).
    // columns: what the terminal row has, a card's body unless it sits outside any card.
    const row = (c: Conversation, facts: string, isDim: boolean, title = c.title, columns = cardColumns) => {
      const name = isTerminal ? cut(title, Math.max(8, columns - facts.length - 3)) : title
      return (
        <Box key={`c:${c.id}`} flexDirection="row" gap={1}>
          <Box flexShrink={1} minWidth={0}>
            <Text dimColor={isDim} wrap="truncate-end">{isDim ? '· ' : ''}{name}</Text>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor>{facts}</Text>
          </Box>
        </Box>
      )
    }

    // A question in "for you": its name, then what it asks. One the app never named goes by its
    // question, said once and whole (a row would cut it), like a pipeline's item. The recap stays
    // in the conversation.
    const need = (c: Conversation) => {
      const name = askName(c)
      if (c.ask && name === c.ask && c.state !== 'error')
        return <Text key={`need:${c.id}`}><Text color="warning">→</Text> {c.ask}<Text dimColor> · {since(c)}</Text></Text>
      return (
        <Box key={`need:${c.id}`} flexDirection="column">
          {row(c, since(c), false, name)}
          {c.state === 'error'
            ? <Text><Text color="error">error</Text><Text dimColor> · the last turn ended on an error</Text></Text>
            : c.ask && <Text><Text color="warning">→</Text> {c.ask}</Text>}
        </Box>
      )
    }
    const waitedFor = (since?: string) => (since && !Number.isNaN(Date.parse(since)) ? ago(now - Date.parse(since)).replace(' ago', '') : null)
    const item = (s: Status, w: WaitingItem) => (
      <Box key={`item:${s.pipeline}:${w.id}`} flexDirection="column">
        <Text>· {w.text}{waitedFor(w.since) ? <Text dimColor> · {waitedFor(w.since)}</Text> : null}</Text>
        {(w.actions ?? []).length > 0 && (
          <Box flexDirection="row" gap={1} paddingLeft={2}>
            {(w.actions ?? []).map((a, i) => (
              <Button key={`act:${s.pipeline}:${w.id}:${i}`} label={a.fill != null ? `${a.label}…` : a.label} onPress={() => pressAction($, a)} />
            ))}
          </Box>
        )}
      </Box>
    )

    // First, when anything waits: everything that waits for you, in one place. The conversations
    // that ask you something (answered in that conversation), then each pipeline's waiting items,
    // with the buttons its status file gives them (open a file, start a message in the prompt box).
    // A question older than a day folds behind "▸ older N"; a pipeline's named group of items
    // folds into one line that opens in place. Each part counts its own things: a conversation, a
    // pipeline's item (one item may be 41 songs), so the card adds up no total.
    const forYouCard = (needs: Conversation[], cards: Status[]) => {
      const waitingCards = cards.filter(s => (s.waiting ?? []).length > 0)
      if (needs.length === 0 && waitingCards.length === 0) return null
      const isFresh = (c: Conversation) => c.state === 'error' || now - Date.parse(c.updated) <= FRESH_ASK_MS
      const fresh = needs.filter(isFresh)
      const older = needs.filter(c => !isFresh(c))
      const isAllNeeds = openedMore.needs === true
      return (
        <Box key="card-for-you" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Text weight="semibold">for you</Text>
          {needs.length > 0 && (
            <Box key="for-conversations" flexDirection="column">
              <Text dimColor>conversations · {needs.length}</Text>
              {/* the terminal has no "xs" gap, so a blank row keeps one conversation from running into the next */}
              <Box key="needs" flexDirection="column" gap={isTerminal ? 1 : 'xs'}>
                {(isAllNeeds ? fresh : fresh.slice(0, MAX_NEEDS)).map(need)}
              </Box>
              {fresh.length > MAX_NEEDS && <Button key="more-needs" label={`${isAllNeeds ? '▾' : '▸'} ${fresh.length - MAX_NEEDS} more`} dimColor onPress={() => pressOpen($, 'more:', 'needs')} />}
              {older.length > 0 && (
                <Box key="older-needs" flexDirection="column" gap={isTerminal ? 1 : 'xs'}>
                  <Button key="show-older-needs" label={`${isShowingOlderNeedList ? '▾' : '▸'} older ${older.length}`} dimColor onPress={() => pressOlderNeeds($)} />
                  {isShowingOlderNeedList && older.map(need)}
                </Box>
              )}
            </Box>
          )}
          {waitingCards.map(s => {
            const entries = waitingEntries(s)
            const isAll = openedMore[s.pipeline] === true
            const shown = isAll ? entries : entries.slice(0, MAX_ITEMS)
            const hidden = entries.slice(MAX_ITEMS).reduce((n, e) => n + ('item' in e ? 1 : e.items.length), 0)
            return (
              <Box key={`for-${s.pipeline}`} flexDirection="column">
                <Text dimColor>{titleOf(s)} · {(s.waiting ?? []).length}</Text>
                {shown.map(e => {
                  if ('item' in e) return item(s, e.item)
                  const key = `${s.pipeline}:${e.group.id}`
                  const isOpen = opened[key] === true
                  // by time, not as text: the times may be written in different offsets
                  const oldest = e.items.map(w => w.since).filter(t => t && !Number.isNaN(Date.parse(t))).sort((a, b) => Date.parse(a!) - Date.parse(b!))[0]
                  return (
                    <Box key={`grp:${key}`} flexDirection="column">
                      <Button key={`group:${key}`} plain label={`${isOpen ? '▾' : '▸'} ${e.group.label} ×${e.items.length}${oldest ? ` · ${waitedFor(oldest)}` : ''}`} onPress={() => pressOpen($, 'group:', key)} />
                      {isOpen && (
                        <Box flexDirection="column" paddingLeft={2}>
                          {e.items.map(w => item(s, w))}
                        </Box>
                      )}
                    </Box>
                  )
                })}
                {hidden > 0 && <Button key={`more-${s.pipeline}`} label={`${isAll ? '▾' : '▸'} ${hidden} more`} dimColor onPress={() => pressOpen($, 'more:', s.pipeline)} />}
              </Box>
            )
          })}
          {note && (note.isError ? <Text color="error">{note.text}</Text> : <Text dimColor>{note.text}</Text>)}
        </Box>
      )
    }

    // The other conversations, below the pipelines and with no card of their own: the running
    // ones get one quiet line each, the done ones fold behind "▸ done N". The ones that wait for
    // you are in the "for you" card.
    const activity = (list: Conversation[]) => {
      const runningList = list.filter(c => shownState(c, now) === 'running')
      const doneList = list.filter(c => shownState(c, now) === 'done')
      const isAllRunning = openedMore.running === true
      const isAllDone = openedMore.done === true
      const DONE_SHOWN = MAX_OTHERS * 2
      // outside any card, a terminal row has the pane's whole width
      const line = (c: Conversation, facts: string) => row(c, facts, true, c.title, e.props.bodyColumns)
      if (list.length === 0) return <Text key="activity" dimColor>no conversations yet: each one shows here after its first turn</Text>
      if (runningList.length === 0 && doneList.length === 0) return null
      return (
        <Box key="activity" flexDirection="column" gap="xs">
          {(isAllRunning ? runningList : runningList.slice(0, MAX_OTHERS)).map(c => line(c, `running · ${since(c)}`))}
          {runningList.length > MAX_OTHERS && <Button key="more-running" label={`${isAllRunning ? '▾' : '▸'} ${runningList.length - MAX_OTHERS} more running`} dimColor onPress={() => pressOpen($, 'more:', 'running')} />}
          {doneList.length > 0 && (
            <Box key="done" flexDirection="column" gap="xs">
              <Button key="show-done" label={`${isShowingDoneList ? '▾' : '▸'} done ${doneList.length}`} dimColor onPress={() => pressDone($)} />
              {isShowingDoneList && (isAllDone ? doneList : doneList.slice(0, DONE_SHOWN)).map(c => line(c, since(c)))}
              {isShowingDoneList && doneList.length > DONE_SHOWN && <Button key="more-done" label={`${isAllDone ? '▾' : '▸'} ${doneList.length - DONE_SHOWN} more`} dimColor onPress={() => pressOpen($, 'more:', 'done')} />}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {/* no Svg here (the terminal): the puppy in block characters, on its own rows above, when they fit */}
        {!hasSvg && e.props.scroll.bodyRows >= PUPPY_MIN_ROWS && e.props.bodyColumns >= PUPPY_COLUMNS && (
          <Box key="puppy" flexDirection="column">
            {stillBlocks(mood).map((runs, i) => (
              // a blank row is one space: an empty Text takes no row, and the puppy must keep all 13
              <Text key={`puppy-${i}`}>
                {runs.length ? runs.map(([text, fg, bg]) => <Text color={fg ?? undefined} backgroundColor={bg ?? undefined}>{text}</Text>) : ' '}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" alignItems="center" gap={1}>
            {hasSvg && 'Svg' in ui && (
              <ui.Svg source={mascot(mood)} alt={`the puppy ${mood === 'typing' ? 'typing at its laptop' : mood}`} width={34 * MASCOT_SCALE} height={26 * MASCOT_SCALE} isInteractive />
            )}
            <Text dimColor>checked {ago(now - snap.loadedAt)}</Text>
          </Box>
          {/* no toast: what it finds shows right here */}
          <Button key="refresh" label="refresh" hotkey="r" onPress={() => refresh($, setting, false, isWriting)} />
        </Box>
        {forYouCard(isWriting ? snap.conversations.filter(c => ['waiting', 'error'].includes(shownState(c, now))) : [], current)}
        {isWriting && snap.conversationsError && <Text color="error">can't read the conversations folder: {snap.conversationsError}</Text>}
        {isWriting && ownWriteError && <Text dimColor>this conversation could not write its file: {ownWriteError}</Text>}
        {snap.dirError && (
          <Box flexDirection="column">
            <Text color="error">can't read the status folder: {snap.dirError}</Text>
            <Text dimColor>set it in /config → puppy-console → status folder{snap.dir ? ` (now ${snap.dir})` : ''}</Text>
          </Box>
        )}
        {!snap.dirError && snap.cards.length === 0 && snap.problems.length === 0 && (
          <Text dimColor>no status files in {snap.dir} yet</Text>
        )}
        {current.map(s => card(s, false))}
        {/* cards with no update for three days and nothing for you, folded away at the bottom */}
        {older.length > 0 && (
          <Box key="older" flexDirection="column" gap="xs">
            <Button
              key="show-older"
              label={`${isShowingOlderCards ? '▾' : '▸'} older ${older.length}`}
              dimColor
              onPress={() => pressOlder($)}
            />
            {isShowingOlderCards && older.map(s => card(s, true))}
          </Box>
        )}
        {isWriting && activity(snap.conversations)}
        {snap.problems.map(p => (
          <Text key={`p:${p.file}`} dimColor>skipped {p.file}: {p.reason}</Text>
        ))}
      </Box>
    )
  })
}
