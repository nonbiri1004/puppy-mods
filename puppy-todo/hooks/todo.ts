// the parts with no $: ids, reading items, ticking, sorting. tests import these.
import type { Item, Kind } from '../types'

export const KINDS: readonly Kind[] = ['todo', 'ask', 'later']
// done items stay in the done list this long, then only the file remains
export const DONE_DAYS = 3
const DAY = 86_400_000

// 20261024-1432-k3f9: sorts by time, short enough to type
export function newId(now: number, rand: () => number = Math.random): string {
  const d = new Date(now)
  const two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
  const tail = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')

  return `${stamp}-${tail}`
}

// a repo's name from its working folder: worktrees count as their repo
export function projectOf(cwd: string): string {
  const repo = cwd.replace(/\/\.claude\/worktrees\/[^/]+\/?$/, '').replace(/\/+$/, '')

  return repo.slice(repo.lastIndexOf('/') + 1) || repo
}

// an id is also its file's name: letters, digits, - _ and ., never a path
export const isSafeId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes('..')

// a file written by an older version, or by hand: keep what is usable (unknown fields too), drop the rest
export function parseItem(text: string): Item | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || !isSafeId(o.id) || typeof o.text !== 'string' || o.text.trim() === '') {
    return null
  }
  const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
  const { declaration, ...known } = o
  // times this mod sorts by must be text; a hand-written number would stop the pane drawing
  for (const k of ['pinnedAt', 'doneAt', 'editedAt', 'reopenedAt'] as const) {
    if (k in known && typeof known[k] !== 'string') delete known[k]
  }
  if ('deletedAt' in known && typeof known.deletedAt !== 'string') {
    if (known.deletedAt) known.deletedAt = String(known.deletedAt)
    else delete known.deletedAt
  }

  return {
    ...(known as Partial<Item>),
    ...(isObject(declaration) ? { declaration: declaration as Item['declaration'] } : {}),
    id: o.id,
    text: o.text.trim(),
    project: typeof o.project === 'string' && o.project ? o.project : 'misc',
    kind: KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : 'todo',
    status: o.status === 'done' ? 'done' : 'open',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
  }
}

// a tick in the pane: the person says it is done
export function tick(item: Item, at: string): Item {
  const { declaration: _gone, doneAt: _alsoGone, ...rest } = item

  return { ...rest, schemaVersion: 2, status: 'done', doneAt: at, declaration: { by: 'person', at } }
}

// open again: the old "done" no longer holds; reopenedAt keeps when
export function reopen(item: Item, at: string): Item {
  const { declaration: _gone, doneAt: _alsoGone, ...rest } = item

  return { ...rest, schemaVersion: 2, status: 'open', reopenedAt: at }
}

// deleted: never shown again, the file stays (nothing is erased)
export function deleteItem(item: Item, at: string): Item {
  return { ...item, schemaVersion: 2, deletedAt: at, deletedBy: 'person' }
}

// new words for the same item: its id, place and when it was made stay
export function editText(item: Item, text: string, at: string): Item {
  return { ...item, schemaVersion: 2, text: text.trim(), editedAt: at }
}

// deleted by mistake: back where it was, open or done as before
export function restoreItem(item: Item): Item {
  const { deletedAt: _gone, deletedBy: _alsoGone, ...rest } = item

  return { ...rest, schemaVersion: 2 }
}

// pinned items come first, in the order they were pinned
export function pin(item: Item, at: string): Item {
  return { ...item, schemaVersion: 2, pinnedAt: at }
}

export function unpin(item: Item): Item {
  const { pinnedAt: _gone, ...rest } = item

  return { ...rest, schemaVersion: 2 }
}

// an item an older version left for GitHub to tick when its PR merged: its file still says open even
// after the merge, and this list doesn't ask GitHub, so it isn't shown
export function isForGithub(item: Item): boolean {
  const o = item as Item & { source?: unknown; completion?: { mode?: unknown } | null }

  return o.source !== undefined || o.completion?.mode === 'source'
}

// when it was done: doneAt, or the time an older version kept only in declaration.at
const doneAtOf = (i: Item) => i.doneAt ?? i.declaration?.at ?? ''

// when it was made, to the millisecond: createdAt, or the minute in an older id
const madeAt = (i: Item) => {
  const t = Date.parse(i.createdAt)

  return Number.isNaN(t) ? null : t
}
const byMade = (a: Item, b: Item) => {
  const ta = madeAt(a)
  const tb = madeAt(b)

  return ta !== null && tb !== null && ta !== tb ? ta - tb : a.id.localeCompare(b.id)
}

// open ones: pinned first (in the order pinned), then oldest first, so nothing sinks; done ones
// newest first, for a few days; deleted ones newest first, for the folded list you restore from
export function listOf(items: readonly Item[], now: number): { open: Item[]; done: Item[]; deleted: Item[] } {
  const mine = items.filter(i => !isForGithub(i))
  const kept = mine.filter(i => !i.deletedAt)
  const isOpen = (i: Item) => i.status === 'open'
  const pinned = kept.filter(i => isOpen(i) && i.pinnedAt).sort((a, b) => (a.pinnedAt ?? '').localeCompare(b.pinnedAt ?? '') || byMade(a, b))
  const rest = kept.filter(i => isOpen(i) && !i.pinnedAt).sort(byMade)
  const done = kept
    .filter(i => i.status === 'done' && doneAtOf(i) !== '' && now - Date.parse(doneAtOf(i)) < DONE_DAYS * DAY)
    .sort((a, b) => doneAtOf(b).localeCompare(doneAtOf(a)))
  const deleted = mine.filter(i => i.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))

  return { open: [...pinned, ...rest], done, deleted }
}
