// The conversations (FORMAT.md). Each conversation writes one small file about itself when a turn
// starts and ends, and when it stops mid-turn to ask you something; the pane reads them all. Pure
// functions, so the tests need no engine.
import type { Conversation, ConversationState, Source } from '../types'

// Under the home folder, on this computer only: what you typed and the recaps never leave it.
// Not ~/.claude/sessions/, which is Claude Code's own.
export const SESSIONS = '.claude/puppy-sessions'
// Where puppy-console (this mod's old name) kept them; copied over once (migrate in register.tsx).
export const OLD_SESSIONS = '.claude/console/sessions'
// The desktop app's own record of each of its conversations, under the home folder (macOS). Not
// documented: read for isArchived alone, and a file that does not say it counts as unknown.
export const APP_SESSIONS = 'Library/Application Support/Claude/claude-code-sessions'

// The "對話" card shows a conversation for this long after its last turn.
export const KEEP_MS = 3 * 24 * 3_600_000
// One that waits for you stays longer: a question left open over a weekend still shows. Files
// older than this are not read at all, so the "可以清" card looks this far back too.
export const KEEP_WAITING_MS = 14 * 24 * 3_600_000
// A "running" file older than this was left by a conversation that stopped without session.end
// (a crash). Long enough for a long workflow; session.end marks a normal close at once.
export const RUNNING_MS = 6 * 3_600_000
// A finished conversation reads 做完 for this long, then 閒著.
export const FRESH_DONE_MS = 3_600_000
// Done and untouched for this long, and not archived in the app: it may go (the "可以清" card).
export const IDLE_MS = 24 * 3_600_000

const STATES: readonly ConversationState[] = ['running', 'waiting', 'done', 'error']
const SOURCES: readonly Source[] = ['side', 'fork', 'dispatched']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined)

// A user message the person typed, not one that only carries tool results.
type Message = { role: 'user' | 'assistant'; text: string; toolUses: { tool: string; input: Record<string, unknown> }[]; toolResults?: unknown[] }

// The brief a conversation gets when another one starts it (the desktop app's start_session):
// the app writes it in the person's place, and it is how a dispatched conversation is told.
const BRIEF = /^Background \(from the session that started this one\)/
// Openers the app writes in the person's place: the summary after a compaction, the brief of a
// conversation another one started. They name nothing.
const NOT_TYPED = [/^This session is being continued from a previous conversation/, BRIEF]
const isPrompt = (m: Message) => {
  if (m.role !== 'user' || m.toolResults?.length) return false
  const text = plain(m.text)
  return text !== '' && !NOT_TYPED.some(re => re.test(text))
}

// What the person typed, without the <tag>…</tag> blocks the app wraps around it
// (system reminders, command caveats, pasted content).
export function plain(text: string): string {
  return text.replace(/<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi, '').trim()
}

export function oneLine(text: string, max: number): string {
  const line = text.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''
  return [...line].length > max ? `${[...line].slice(0, max - 1).join('')}…` : line
}

// One line of a reply, without the markdown marks a card would print as they are.
export function plainLine(text: string, max: number): string {
  const line = text.split('\n').map(l => l.trim()).find(l => l !== '' && !/^(```|---+|\|)/.test(l)) ?? ''
  const bare = line
    .replace(/^#+\s+|^[-*>]\s+|^\d+\.\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
  return oneLine(bare, max)
}

// The first sentence of a recap: a row has room for one.
export function firstSentence(text: string): string {
  const m = /^(.+?[。！？]|.+?[.!?](?=\s|$))/.exec(text.trim())
  return (m?.[1] ?? text).trim()
}

// An attached file is typed as @"<path>" (or @<path>); the name keeps the file's own name, not
// its path. An @ inside a link (threads.com/@name) is not one.
const MENTION = /(^|\s)@(?:"([^"]+)"|(\S*\/\S+))/g

// A prompt as a name: one line, without the app's tags or the attached files' paths. Empty for
// an opener the app wrote in the person's place.
export function promptName(text: string): string {
  const typed = plain(text)
  if (!typed || NOT_TYPED.some(re => re.test(typed))) return ''
  return oneLine(typed.replace(MENTION, (_, before: string, quoted?: string, bare?: string) => `${before}${folderName(quoted ?? bare ?? '')}`), 60)
}

// The conversation's name when the app has given it none yet: the first thing the person typed.
export function nameOf(messages: Message[]): string {
  const first = messages.find(isPrompt)
  return (first && promptName(first.text)) || 'new conversation'
}

// A prompt that is another conversation's brief: this one was started by it (dispatched).
export const isBrief = (text: string) => BRIEF.test(plain(text))

// The task id a conversation works on, T and a number: from a dispatch brief ("任務 ID：T172"),
// else from its title. Two files of one task (a restart, a fork) share one row in the pane.
export function taskOf(text: string): string | undefined {
  const m = /任務\s*ID\s*[:：]\s*(T\d{1,5})\b/i.exec(text) ?? /(?:^|[^\w-])(T\d{2,5})(?=$|[^\w])/i.exec(text)
  return m ? m[1]!.toUpperCase() : undefined
}

// The desktop app's side chats (btw). It starts one on a copy of the other conversation's
// messages, not always as a fork, and names it "Side chat", then "btw: <the question>": that
// name is what tells it. Only the app's own title counts; a person may type "btw:" themselves.
export const isSideChatTitle = (title: string) => /^(side chat$|btw:\s)/i.test(title.trim())

// The desktop app's wrap_up tool: its recap says what is now true, its ask what waits on you.
export const isWrapUp = (tool: string) => /(^|__)wrap_up$/.test(tool)
export function wrapOf(input: Record<string, unknown>): { recap: string; ask: string | null } | null {
  const recap = str(input.recap)
  return recap ? { recap: oneLine(recap, 300), ask: str(input.ask) ? oneLine(str(input.ask)!, 120) : null } : null
}

// A tool call that stops the turn until you answer: AskUserQuestion, a plan to approve, or the
// desktop app's card that offers a new session. Its question, or null for any other call.
export function questionOf(call: Record<string, unknown>): string | null {
  const tool = String(call.tool ?? '')
  if (tool === 'AskUserQuestion') {
    const first = Array.isArray(call.questions) ? (call.questions[0] as Record<string, unknown> | undefined) : undefined
    return oneLine(str(first?.question) ?? '有問題要問你', 120)
  }
  if (tool === 'ExitPlanMode') return '計畫要你核准'
  if (/(^|__)start_session$/.test(tool) && call.initiation === 'offer') {
    return oneLine(`要開新對話嗎：${str(call.title) ?? ''}`, 120)
  }
  return null
}

// How a conversation began, from an older file too: isFork was all puppy-console 0.12 kept.
export function sourceOf(c: Pick<Conversation, 'source' | 'isFork' | 'isAppTitle' | 'title'>): Source | undefined {
  if (c.isAppTitle && isSideChatTitle(c.title)) return 'side'
  return c.source ?? (c.isFork ? 'fork' : undefined)
}

// Only what the pane needs is checked; anything else in the file is left alone.
export function parseConversation(text: string): Conversation {
  const v: unknown = JSON.parse(text)
  if (!isObject(v) || v.format !== 'session-status' || v.version !== 1) throw new Error('not a session-status file')
  if (typeof v.id !== 'string' || !v.id) throw new Error('no "id"')
  if (typeof v.updated !== 'string' || Number.isNaN(Date.parse(v.updated))) throw new Error('"updated" is not a time')
  if (!STATES.includes(v.state as ConversationState)) throw new Error('bad "state"')
  const appSession = str(v.appSession)
  return {
    format: 'session-status',
    version: 1,
    id: v.id,
    updated: v.updated,
    state: v.state as ConversationState,
    title: str(v.title) ?? v.id,
    ...(v.isAppTitle === true ? { isAppTitle: true } : {}),
    ...(v.isFork === true ? { isFork: true } : {}),
    ...(SOURCES.includes(v.source as Source) ? { source: v.source as Source } : {}),
    ...(str(v.task) ? { task: str(v.task) } : {}),
    // three plain names joined by "/", never a path that climbs out of the app's folder
    ...(appSession && /^[\w-]+\/[\w-]+\/local_[\w-]+$/.test(appSession) ? { appSession } : {}),
    ...(v.isWrapRecap === true ? { isWrapRecap: true } : {}),
    project: str(v.project),
    host: str(v.host),
    recap: str(v.recap) ?? '',
    ask: str(v.ask) ?? null,
  }
}

// The name a conversation goes by in the pane: its task id and its title; its question in place
// of a name that says nothing ("new conversation", when no prompt could name it).
export function rowName(c: Conversation): string {
  const name = c.title === 'new conversation' && c.ask ? c.ask : c.title
  return c.task && !name.toUpperCase().includes(c.task) ? `${c.task} ${name}` : name
}

// How the pane shows a conversation now: a "running" file nobody finished is done.
export function shownState(c: Conversation, now: number): ConversationState {
  return c.state === 'running' && now - Date.parse(c.updated) > RUNNING_MS ? 'done' : c.state
}

// The word on a row's right: 跑中, 做完 within the hour, then 閒著; and 出錯.
export function stateWord(c: Conversation, now: number): string {
  const s = shownState(c, now)
  if (s === 'running') return '跑中'
  if (s === 'error') return '出錯'
  if (s === 'waiting') return '等你'
  return now - Date.parse(c.updated) <= FRESH_DONE_MS ? '做完' : '閒著'
}

// Several files can be one conversation to you: the desktop app restarts one under a new id, a
// task runs in a fork after its first session. They are merged by task id, else by the app's own
// session: the row is the one that waits, else the newest.
const ORDER: Record<ConversationState, number> = { waiting: 0, error: 1, running: 2, done: 3 }
const byShown = (now: number) => (a: Conversation, b: Conversation) =>
  ORDER[shownState(a, now)] - ORDER[shownState(b, now)] || Date.parse(b.updated) - Date.parse(a.updated)
export const groupKey = (c: Conversation) => (c.task ? `task:${c.task}` : c.appSession ? `app:${c.appSession}` : `id:${c.id}`)
export function merged(list: Conversation[], now: number): Conversation[] {
  const groups = new Map<string, Conversation[]>()
  for (const c of list) groups.set(groupKey(c), [...(groups.get(groupKey(c)) ?? []), c])
  return [...groups.values()].map(g => {
    const top = [...g].sort((a, b) => (shownState(a, now) === 'waiting' ? 0 : 1) - (shownState(b, now) === 'waiting' ? 0 : 1) || Date.parse(b.updated) - Date.parse(a.updated))[0]!
    return top
  })
}

const keepFor = (c: Conversation, now: number) => (shownState(c, now) === 'waiting' ? KEEP_WAITING_MS : KEEP_MS)

// The ones the pane lists: side chats left out (a side question's answer is back in the
// conversation it came from), forks and dispatched ones kept; one row per conversation; the last
// few days (two weeks for one that waits for you); waiting first, then errors, running, done;
// newest first.
export function recent(list: Conversation[], now: number): Conversation[] {
  return merged(list.filter(c => sourceOf(c) !== 'side'), now)
    .filter(c => now - Date.parse(c.updated) <= keepFor(c, now))
    .sort(byShown(now))
}

// The ones that may be archived: done, untouched for a day, from the desktop app (a terminal
// conversation has nothing to archive), not a side chat. Whether the app already archived each is
// the caller's to ask (APP_SESSIONS); oldest first.
export function idle(list: Conversation[], now: number): Conversation[] {
  return merged(list.filter(c => sourceOf(c) !== 'side'), now)
    .filter(c => c.appSession && shownState(c, now) === 'done' && now - Date.parse(c.updated) > IDLE_MS)
    .sort((a, b) => Date.parse(a.updated) - Date.parse(b.updated))
}

// The words the "整理…" button puts in the prompt box: the conversations by name and the app's
// id, for a Claude with the app's tools to archive, asking first.
export function cleanPrompt(list: Conversation[]): string {
  const names = list.map(c => `${rowName(c)}（${c.appSession!.split('/').pop()}）`).join('、')
  return `請封存這些對話：${names}；動手前先列給我確認。`
}

// One unit, as precise as a glance needs: minutes within the hour, hours within the day, then
// days: 5 分鐘前, 8 小時前, 3 天前.
export function ago(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小時前`
  return `${Math.floor(h / 24)} 天前`
}

// How long something has gone on: ago() without 前.
export const waited = (ms: number) => ago(ms).replace(/前$/, '')

// "/Users/me/dev/puppy-mods" → "puppy-mods"
export const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
