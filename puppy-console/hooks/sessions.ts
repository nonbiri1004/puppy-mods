// The conversations card (FORMAT.md, "conversations"). Each conversation writes one small file
// about itself when a turn starts and ends; the pane reads them all. Pure functions, so the
// tests need no engine.
import type { Conversation, ConversationState } from '../types'

// Under the home folder, on this computer only: what you typed and the recaps never go into
// the status folder, which may be synced. The pane shows a conversation for this long after its
// last turn, so an archived one leaves by itself.
export const SESSIONS = '.claude/console/sessions'
export const KEEP_MS = 3 * 24 * 3_600_000
// One that waits for you stays longer: a question left open over a weekend still shows.
export const KEEP_WAITING_MS = 14 * 24 * 3_600_000
// A "running" file older than this was left by a conversation that stopped without session.end
// (a crash). Long enough for a long workflow; session.end marks a normal close at once.
export const RUNNING_MS = 6 * 3_600_000

const STATES: readonly ConversationState[] = ['running', 'waiting', 'done', 'error']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined)

// A user message the person typed, not one that only carries tool results.
type Message = { role: 'user' | 'assistant'; text: string; toolUses: { tool: string; input: Record<string, unknown> }[]; toolResults?: unknown[] }

// Openers the app writes in the person's place: the summary after a compaction, the brief of a
// conversation another one started. They name nothing.
const NOT_TYPED = [/^This session is being continued from a previous conversation/, /^Background \(from the session that started this one\)/]
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

// Only what the card needs is checked; anything else in the file is left alone.
export function parseConversation(text: string): Conversation {
  const v: unknown = JSON.parse(text)
  if (!isObject(v) || v.format !== 'session-status' || v.version !== 1) throw new Error('not a session-status file')
  if (typeof v.id !== 'string' || !v.id) throw new Error('no "id"')
  if (typeof v.updated !== 'string' || Number.isNaN(Date.parse(v.updated))) throw new Error('"updated" is not a time')
  if (!STATES.includes(v.state as ConversationState)) throw new Error('bad "state"')
  return {
    format: 'session-status',
    version: 1,
    id: v.id,
    updated: v.updated,
    state: v.state as ConversationState,
    title: str(v.title) ?? v.id,
    ...(v.isAppTitle === true ? { isAppTitle: true } : {}),
    ...(v.isFork === true ? { isFork: true } : {}),
    ...(v.isWrapRecap === true ? { isWrapRecap: true } : {}),
    project: str(v.project),
    host: str(v.host),
    recap: str(v.recap) ?? '',
    ask: str(v.ask) ?? null,
  }
}

// How the card shows a conversation now: a "running" file nobody finished is done.
export function shownState(c: Conversation, now: number): ConversationState {
  return c.state === 'running' && now - Date.parse(c.updated) > RUNNING_MS ? 'done' : c.state
}

const keepFor = (c: Conversation, now: number) => (shownState(c, now) === 'waiting' ? KEEP_WAITING_MS : KEEP_MS)

// The ones the card shows: the last few days (two weeks for one that waits for you), forks and
// side chats left out (a side question's answer is back in the conversation it came from), also
// from a file written before side chats were marked; waiting first, then errors, running, done;
// newest first.
const ORDER: Record<ConversationState, number> = { waiting: 0, error: 1, running: 2, done: 3 }
const isSide = (c: Conversation) => c.isFork || (c.isAppTitle && isSideChatTitle(c.title))
export function recent(list: Conversation[], now: number): Conversation[] {
  return list
    .filter(c => !isSide(c) && now - Date.parse(c.updated) <= keepFor(c, now))
    .sort((a, b) => ORDER[shownState(a, now)] - ORDER[shownState(b, now)] || Date.parse(b.updated) - Date.parse(a.updated))
}

// "/Users/me/dev/puppy-mods" → "puppy-mods"
export const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
