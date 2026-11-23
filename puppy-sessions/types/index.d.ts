// One conversation's file in `~/.claude/puppy-sessions/` (format "session-status", version 1;
// FORMAT.md). A session is one conversation.
export type ConversationState = 'running' | 'waiting' | 'done' | 'error'
// How it began, when not by you: a side chat (btw), a fork of another conversation, or one that
// another conversation started (the desktop app's start_session, e.g. a dispatched task).
export type Source = 'side' | 'fork' | 'dispatched'
export type Conversation = {
  format: 'session-status'
  version: 1
  id: string
  updated: string
  state: ConversationState
  title: string
  // the title is the app's own (its sidebar's), not the first thing typed
  isAppTitle?: true
  // written by puppy-console 0.12 for a fork or a side chat; read as source "fork" (or "side")
  isFork?: true
  source?: Source
  // the task it works on (T and a number), from a dispatch brief or the title
  task?: string
  // the desktop app's own record of it: "<account>/<organization>/local_<id>", under APP_SESSIONS
  appSession?: string
  // the recap is a wrap_up's, kept when a later turn has none
  isWrapRecap?: true
  project?: string
  host?: string
  recap: string
  // the question that waits for you, when one does: the last turn's, or a question card's
  ask: string | null
}

// One rate-limit window: what it is called, how much is used (0 to 100), when it resets.
export type Limit = { label: string; percent: number; resetsAt?: number }
export type Usage = {
  // Claude's windows, as the engine reported them last; empty off a subscription
  claude: Limit[]
  // Codex's, from its newest run's file, and when that reading was written; null when there is none
  codex: { limits: Limit[]; readAt: number | null } | null
}

// A file the pane passed over, and why.
export type Problem = { file: string; reason: string }

export type Snapshot = {
  // every conversation's file of the last two weeks, as read; the pane picks what it lists
  conversations: Conversation[]
  // the conversations folder could not be read (not a missing folder: that is none yet)
  conversationsError: string | null
  // whether the desktop app archived each conversation, by appSession; a missing key is unknown
  archived: Record<string, boolean>
  usage: Usage
  problems: Problem[]
  loadedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-sessions': {
      snapshot: Snapshot | null
      // the rest of a long list, when open, by the card's name
      openMore: Record<string, boolean>
      // this conversation's last write of its own file failed, and why
      writeError: string | null
      // copying puppy-console's old files over failed, and why
      migrateError: string | null
      // what the last press of "整理…" did, or why it could not
      actionNote: { text: string; isError: boolean } | null
    }
  }
}
