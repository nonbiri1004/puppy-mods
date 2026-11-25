# the formats puppy-status reads

three small agreements, each between puppy-status and whoever writes the files: the conversations' own files, the scheduled jobs' logs, and the codex lock. (the pipelines' status files, `pipeline-status`, are a fourth, shared with the writers: [FORMAT.md](../FORMAT.md) at the top of this repository.)

## the conversation file

each conversation writes one small json file about itself, in `~/.claude/puppy-status/<session id>.json`: on this computer only, because it holds what you typed. only that conversation writes its file, one write after another, and never while holding up a turn. it writes when a turn starts and ends, when a question card comes up in the middle of a turn and when it is answered, and once more when the conversation ends. the pane reads them all. a file there that does not parse (caught halfway through a write) keeps what the last read had; one whose `id` is not its file name is named at the bottom of the pane and left out.

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
- the mod's older names wrote the same files into their own folders; the first start copies them over once ([README, coming from puppy-sessions](README.md#coming-from-puppy-sessions)).

## schedule logs

set **schedule logs** to a folder of logs that scheduled jobs (launchd, cron) append to. the pane reads the end (32 kb) of every `*.log` there and looks for two kinds of lines; every other line is passed over, so a job can log what it likes in between:

```
===== 2026-11-25 09:00:00 daily 開始
--- anything the job prints
===== 2026-11-25 09:00:41 daily 結束：成功
```

- `=====`, the time (`YYYY-MM-DD HH:MM:SS`, the computer's own time, no offset), the job's name (no spaces), then `開始` (anything after it, like the folder it ran in, is passed over) or `結束：` and the result. only `成功` counts as worked; any other result counts as failed.
- one log may hold several jobs, and one job may write to two logs: the newest start counts. an empty log names no job.
- only the last 32 kb of a log is read: a run that prints more than that after its start line drops out of the card until its end line. keep long output in another file.
- a job whose last start has no end after it (an end in the same second before it belongs to the run before) is `跑中` for six hours, then counts as failed (it stopped without saying so).
- **schedule every** says how often a job should start, `daily 1d, weekly 7d` (`m`, `h`, `d`, `w`; pieces split by commas). a job that has not started for that long plus two hours is `該跑沒跑`, unless a run is still going. a job not named there is never late; a piece it can't read is said in the pane.
- a log can't tell a job just set up (its log may hold only a trial run) from one that missed its runs, so late counts from the last start or from when the pane first saw the job, whichever is later; before one interval has passed it says `等下一次`. a job you stopped on purpose (`launchctl disable` leaves no line) goes in the **paused** setting: `暫停中`, never late or failed. a job that runs when something changes (not on a clock) is best left out of it.

## the codex lock

two files a person's own scripts may keep beside codex, so that only one codex runs at a time and a limit hit in one conversation is seen by the others. codex itself writes neither; without them the pane shows no such line, and it never writes, takes or deletes them.

- `~/.codex/collab.lock/`: a folder, made with `mkdir` (which only one maker wins) while a codex run is going, and removed when it ends. inside, `owner` is one line, `<who> <YYYY-MM-DD HH:MM:SS>` (the computer's own time). the pane shows `Codex 使用中 · <who>` and for how long; without a time it uses the folder's own. held over an hour, it says `可能沒放`: probably left behind by a run that crashed.
- `~/.codex/collab-limit`: one line, `<when it resets> <which window> <who>`, written when a run hits codex's usage limit and deleted by whoever sees the reset pass. the pane shows `Codex 撞額度 · <the line>` as written, and how long ago the file was written.
