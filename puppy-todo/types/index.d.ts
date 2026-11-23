// one to-do: ~/.claude/todo/items/<id>.json. older files have more fields (a PR, who said it is
// done, the conversation that wrote it); they are kept as they are and not used
export type Item = {
  // 2 for the current format; missing means the first one
  schemaVersion?: number
  id: string
  text: string
  // where it was written, e.g. baibai-music; kept in the file, not shown
  project: string
  kind: Kind
  status: 'open' | 'done'
  // who wrote the item: person (older files: claude, codex)
  by?: string
  createdAt: string
  doneAt?: string
  // who said it is done; cleared when it opens again
  declaration?: Declaration
  // when it was last opened again after being done
  reopenedAt?: string
  // deleted: never shown, the file stays
  deletedAt?: string
  deletedBy?: string
}

export type Kind = 'todo' | 'ask' | 'later'

export type Declaration = {
  by: string
  recordedBy?: string
  at: string
  note?: string
}

// one read-only card: a status file's waiting items (../FORMAT.md). the mod never writes it
export type Board = {
  // the file's name in the status folder, e.g. dispatch.json
  file: string
  title: string
  // iso 8601, when the writer wrote it
  updated: string
  // older than this, the card says the writer has not written
  staleMs: number
  items: BoardItem[]
  groups: BoardGroup[]
}

export type BoardItem = {
  id: string
  text: string
  since?: string
  group?: string
  // https only
  url?: string
  // YYYY-MM-DD or an iso 8601 time
  due?: string
}

export type BoardGroup = { id: string; label: string }

export type View = {
  items: Item[]
  // the done list at the bottom is unfolded
  isShowingDone: boolean
  // ms since the epoch of the last read; null before the first
  at: number | null
  // why the list could not be read
  notes: string[]
  // the read-only cards from status_dir; empty when it is not set
  boards: Board[]
  // ms since the epoch of the last read of the status folder; null before the first
  boardsAt: number | null
  // the status folder's own name, the tag on each card; '' when status_dir is not set
  boardTag: string
  // why the status folder could not be read
  boardNote: string | null
  // folded groups opened by hand, '<file>:<group id>'
  openGroups: Record<string, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-todo': { view: View }
  }
}
