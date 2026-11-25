// One conversation's file in `~/.claude/puppy-status/` (format "session-status", version 1;
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
  // ~/.codex/collab.lock and ~/.codex/collab-limit (FORMAT.md, "codex lock"); null when neither is there
  hold: {
    // who holds it and since when (null: not known)
    lock: { owner: string; since: number | null } | null
    // the limit line as written, and when it was written
    limit: { text: string; since: number | null } | null
  } | null
}

// One scheduled job from its log (FORMAT.md, "schedule logs"): its last start and end, whether that
// end said 成功, and how often it should run (the "schedule every" setting; null: not set).
export type Schedule = { job: string; startedAt: number | null; endedAt: number | null; isOk: boolean | null; everyMs: number | null }
export type ScheduleState = 'ok' | 'failed' | 'running' | 'late'

// A pipeline that needs a look: stopped on an error, quiet past its stale_after_sec, or (the live
// stream) restarting. `updated` is when its file was last written.
export type PipelineAlarm = { file: string; title: string; headline: string; updated: number; kind: 'error' | 'quiet' | 'restarts' }

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
  // the scheduled jobs, by name; empty with no "schedule logs" folder set
  schedules: Schedule[]
  // the pipelines that need a look; empty when all are fine or no "status folder" is set
  alarms: PipelineAlarm[]
  // a folder set in the settings that could not be read, and why (a missing one too: it was asked for)
  folderErrors: string[]
  problems: Problem[]
  loadedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-status': {
      snapshot: Snapshot | null
      // the rest of a long list, when open, by the card's name
      openMore: Record<string, boolean>
      // this conversation's last write of its own file failed, and why
      writeError: string | null
      // copying the old names' files over (puppy-sessions, puppy-console) failed, and why
      migrateError: string | null
      // what the last press of "整理…" did, or why it could not
      actionNote: { text: string; isError: boolean } | null
    }
  }
}
