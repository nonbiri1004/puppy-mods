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

export type View = {
  items: Item[]
  // the done list at the bottom is unfolded
  isShowingDone: boolean
  // ms since the epoch of the last read; null before the first
  at: number | null
  // why the list could not be read
  notes: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-todo': { view: View }
  }
}
