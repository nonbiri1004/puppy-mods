// Any JSON value (what a status file can hold).
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

// One status file, as FORMAT.md describes it (format "pipeline-status", version 1).
export type State = 'running' | 'idle' | 'waiting' | 'error'

// A button under a waiting item (FORMAT.md, "actions"): exactly one of open or fill.
// open: a file or folder on this computer the pane opens (a video, a song, a batch folder);
// fill: words the pane puts in the prompt box, for you to finish and send.
export type WaitingAction = { label: string; open?: string; fill?: string }

export type WaitingItem = { id: string; text: string; since?: string; actions?: WaitingAction[] }

export type Status = {
  format: 'pipeline-status'
  version: 1
  pipeline: string
  title?: string
  host?: string
  updated: string
  stale_after_sec?: number
  state: State
  headline: string
  progress?: { done: number; total: number | null; unit?: string } | null
  waiting?: WaitingItem[]
  last_output?: { label: string; at?: string; path?: string } | null
  next?: string | null
  detail?: { [key: string]: Json } | null
}

// detail of pipeline "music" (baibai-music tools/status_export.py)
export type MusicBatch = {
  name: string
  strip?: string
  est_usable?: number | null
  target_usable?: number | null
  generated?: number | null
  ok?: number | null
  needs_listen?: number | null
  rejected?: number | null
  errors?: number | null
  avg_gen_sec?: number | null
  status_tail?: string[]
}
export type MusicDetail = {
  comfy?: { up: boolean; running: number | null; pending: number | null }
  generating?: boolean | null
  batches?: MusicBatch[]
}

// detail of pipeline "ai-video" (ai-video-pipeline)
export type Stage = 'plan' | 'clips' | 'voice' | 'compose' | 'final' | 'done'
export type VideoJob = { job: string; stage: Stage; spend_usd: number; cap_usd: number; updated?: string; next?: string }
export type VideoDetail = { spend_usd?: number; cap_usd?: number; jobs?: VideoJob[] }

// detail of the pipelines "collector-<profile>" (info-collector core/status.py). The first four are
// this run; unsent is high-scored items not in notion yet; pending is what waits for review in
// notion now (at most 100), null when notion could not be read.
export type CollectorCounts = { collected: number; new: number; scored: number; sent: number; unsent: number; pending: number | null }
export type CollectorDetail = { counts?: Partial<CollectorCounts>; errors?: string[] }

// A file in the folder that is not a card, and why.
export type Problem = { file: string; reason: string }

// One conversation's file in `~/.claude/console/sessions/` (format "session-status", version 1).
export type ConversationState = 'running' | 'waiting' | 'done' | 'error'
export type Conversation = {
  format: 'session-status'
  version: 1
  id: string
  updated: string
  state: ConversationState
  title: string
  // the title is the app's own (its sidebar's), not the first thing typed
  isAppTitle?: true
  // a fork of another conversation (a side question); the card leaves it out
  isFork?: true
  // the recap is a wrap_up's, kept when a later turn has none
  isWrapRecap?: true
  project?: string
  host?: string
  recap: string
  // the question the last turn left you, when it left one
  ask: string | null
}

export type Snapshot = {
  dir: string
  cards: Status[]
  // the conversations of the last few days, sorted for the card; empty when none wrote yet
  conversations: Conversation[]
  // the conversations folder could not be read (not a missing folder: that is none yet)
  conversationsError: string | null
  problems: Problem[]
  // the folder itself could not be read (missing, not set)
  dirError: string | null
  loadedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-console': {
      snapshot: Snapshot | null
      // the cards folded or opened by hand (pipeline → folded), where that differs from the default
      folds: Record<string, boolean>
      // the "older" group is open
      isShowingOlder: boolean
      // the conversations card's "done" group is open
      isShowingDone: boolean
      // this conversation's last write of its own file failed, and why
      writeError: string | null
      // what the last press of a waiting item's button did, or why it could not
      actionNote: { text: string; isError: boolean } | null
    }
  }
}
