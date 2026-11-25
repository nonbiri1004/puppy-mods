# the conversation file format

each conversation writes one small json file about itself, in `~/.claude/puppy-sessions/<session id>.json`: on this computer only, because it holds what you typed. only that conversation writes its file, one write after another, and never while holding up a turn. it writes when a turn starts and ends, when a question card comes up in the middle of a turn and when it is answered, and once more when the conversation ends. the pane reads them all. a file there that does not parse (caught halfway through a write) keeps what the last read had; one whose `id` is not its file name is named at the bottom of the pane and left out.

(the pipelines' status files, `pipeline-status`, are another format, read by puppy-todo: see [FORMAT.md](../FORMAT.md) at the top of this repository.)

```json
{
  "format": "session-status",
  "version": 1,
  "id": "4f0c…",
  "updated": "2026-11-23T12:00:00.000Z",
  "state": "waiting",
  "title": "the app's own title, or the first line you typed",
  "isAppTitle": true,
  "source": "dispatched",
  "task": "T172",
  "appSession": "<account>/<organization>/local_<id>",
  "project": "puppy-mods",
  "recap": "what is now true and where it stands",
  "ask": "the question that waits for you, or null"
}
```

- `state` is `running` (a turn is going), `waiting` (the last turn, or a question card still up, asks you something), `done` or `error`. when the conversation ends, a `running` file becomes `done`; a `/clear` also turns `waiting` into `done`. a `running` file older than six hours is shown as `done` anyway (the conversation stopped without ending, a crash).
- a question card is the engine's `AskUserQuestion`, `ExitPlanMode` (a plan to approve), or the desktop app's offer of a new session (`start_session` with `initiation: "offer"`). while one is up the file says `waiting` with its question in `ask`; when the call comes back, answered or not, `running` again. a subagent's card is not the conversation's.
- `isAppTitle` is `true` once `title` is the app's own; `isWrapRecap` is `true` while `recap` is a wrap_up's (a later turn without one keeps it, never the answer's first line).
- `source` says how the conversation began, when not by you: `side` (a side chat, which the app names `Side chat`, `btw: …`), `fork` (forked from another conversation) or `dispatched` (another conversation started it, and its first prompt is the app's brief). only `side` is left out of the pane and never pushes. a file written by puppy-console 0.12 has `isFork: true` instead, read as `fork` (or `side`, by its app title).
- `task` is the task it works on, `T` and a number, from a dispatch brief (`任務 ID：T172`) or the title. a file without it (from puppy-console 0.12) takes it from its title. files that share a task, or an `appSession`, are one row in the pane (either link joins them): the one that waits, else the newest. a file the app has archived is left out before they are joined, whatever its state.
- `appSession` names the desktop app's own record of the conversation, under `~/Library/Application Support/Claude/claude-code-sessions/` (from the environment the app starts claude code with; none in the terminal). the pane reads only `isArchived` there, for the `可以清` card. that file is the app's and not documented: missing, or without `isArchived` as true or false, counts as unknown, and the pane says so instead of guessing.
- `host` is optional.
- the pane lists a conversation for three days after its last turn, a `waiting` one for two weeks. files older than two weeks are not read; they stay in the folder.
