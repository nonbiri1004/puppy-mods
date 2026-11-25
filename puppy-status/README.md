# puppy-status

a pane beside the chat that answers "what needs me now": the conversations that wait for you, the pipelines that need a look, every other conversation, your rate limits and who holds codex, and your scheduled jobs. (a session is one conversation; the pane itself is in traditional chinese, where it says 對話.)

```
┌ status ────────────────────────────────────────────┐
│ 1 個對話等你                 1 分鐘前 [重新整理]   │
│ ╭ 等你回話 ───────────────────────────── 1 個 ╮    │
│ │ 要開 T168 嗎                          20 分鐘 │    │
│ │ → 要開 T168 嗎？                              │    │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 產線 ──────────────────────────────── 1 條要看 ╮   │
│ │ 科技選題 · 收集 0                   出錯 · 8 天 │   │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 對話 ───────────────────────────────── 3 個 ╮    │
│ │ T203 puppy-status · PR opened.    做完 · 30 分鐘 │  │
│ │ music batch                       跑中 · 1 分鐘  │  │
│ │ refresh retry · Yes.              閒著 · 2 小時  │  │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 額度 ───────────────────────────────────────╮    │
│ │ 5 小時 42% · 14:30 重置　一週 12%      Claude │    │
│ │ 5 小時 22%　一週 98%         Codex · 3 小時前 │    │
│ │ Codex 使用中 · T203                   12 分鐘 │    │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 排程 ───────────────────────────────────────╮    │
│ │ daily                     該跑沒跑 · 上次 3 天前 │  │
│ │ watch                           成功 · 2 分鐘前 │  │
│ │ weekly                          成功 · 3 天前   │  │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 可以清 ──────────────────────────────── 1 個 ╮    │
│ │ old talk                            閒了 2 天 │    │
│ │ [整理…]                                       │    │
│ ╰───────────────────────────────────────────────╯    │
└────────────────────────────────────────────────────┘
```

- **等你回話**, at the top: the conversations that stopped to ask you something, at the end of a turn (a wrap_up with a question) or in the middle of one (a question card: `AskUserQuestion`, a plan to approve, an offer of a new session), each with how long it has waited and its question.
- **產線**, only when one needs a look (set **status folder**): a pipeline that stopped on an error (`出錯`), one whose file has not been written for longer than its own `stale_after_sec` (`沒更新`), and the live stream when it restarted more than once in a day (`一直重啟`), each with its headline and how long since its file was written. a pipeline that is fine says nothing, so most of the time there is no such card. it reads the status files of [FORMAT.md](../FORMAT.md) at the top of this repository.
- **對話**: one row for each of the others, its name (its task id, like `T172`, then its title), the first sentence of where it stands, and on the right `跑中`, `做完` (within the hour), `閒著` or `出錯`, and for how long. past 5, `▸ 還有 N 個` opens the rest.
  - a fork, or a conversation another one started (a dispatched task), is listed like any other. a side chat (`btw: …`) is not: its answer is back in the conversation you asked from.
  - files of one task (a restart, a fork) are one row.
  - one the desktop app has archived is not listed.
- **額度**: how much of each rate-limit window is used, and when it resets. claude's comes from claude code itself (the last reply's reading). codex's comes from the newest run under `~/.codex/sessions/`, with how old that reading is; a window whose reset time has passed says `已重置`. no `~/.codex`, no codex line.
  - under it, only when there is one: `Codex 使用中` with who holds the lock and for how long (`可能沒放` past an hour), and `Codex 撞額度` with the line that says when it resets. these come from two small files your own scripts may keep beside codex, `~/.codex/collab.lock/` and `~/.codex/collab-limit` ([FORMAT.md](FORMAT.md)); codex writes neither, and without them there is no such line.
- **排程**, when you set **schedule logs**: one row per scheduled job, from its log ([FORMAT.md](FORMAT.md)): `成功` or `有錯誤` and how long ago its last run started, `跑中` while it runs, and `該跑沒跑` once it has not started for longer than you said in **schedule every** (and two hours more, for a computer that was asleep). a job not named in **schedule every** is never late, only failed or not.
- **可以清**: finished conversations from the desktop app, untouched for a day, that the app has not archived. `整理…` puts a request in this conversation's prompt box (`請封存這些對話：…；動手前先列給我確認。`), after anything you already typed. nothing is sent until you press enter, and the mod archives nothing itself: the claude you send it to does, and lists them for you first. whether the app archived one is read from the app's own session file, which is not documented; when it can't be read, one dim line says how many are unknown and they are not listed.
- **nothing waits:** the puppy (typing while a conversation runs, else asleep) and `沒有對話在等你`.
- each conversation writes a short file about itself into `~/.claude/puppy-status/` (this computer only; [FORMAT.md](FORMAT.md)). turn it off with **conversations** in `/config`, and the pane lists nothing. when a conversation stops to ask you something, it sends a push through the app's PushNotification tool, if your permission settings already allow it; turn it off with **push**. a side chat never pushes.
- while the pane is open, a short notice shows once when another conversation starts waiting for you. turn notices off with **notices** in `/config`.
- the files and folders are read only while the pane is open: once when you open it, then every minute.
- a folder you set that can't be read (missing too, since you asked for it) is said in red at the bottom.
- a file that isn't a conversation's is named at the bottom with the reason, never dropped without a word. the same for a folder the pane can't read, or a conversation that can't write its own file.
- times are one unit, as a glance needs: `5 分鐘`, `8 小時`, `3 天`.

## how it works

two halves that only meet in a folder of small files ([FORMAT.md](FORMAT.md)).

- **the writing half** runs in every conversation (unless **conversations** is off). `turn.start` writes `running`; a `wrap_up` call is caught as it happens, and so is a question card (`AskUserQuestion`, a plan to approve, an offer of a new session), which writes `waiting` with its question until the call returns; `turn.complete` writes `done`, `waiting` (the wrap_up had a question) or `error`, with the recap; `session.end` turns `running` into `done`, and a `/clear` also drops the question. the app's own title and whether it began as a fork come from the classic hooks `SessionStart` and `UserPromptSubmit`. a waiting conversation also tries a push through `PushNotification`, only if the permission check already says allow. writes go one after another and never hold up the turn.
- **the reading half** starts from `/my-status`, which reads once, opens the pane, then reads every minute while it is up (the tick stops when the pane is gone).
- **reads**: `~/.claude/puppy-status/*.json` (files older than two weeks are skipped; a file whose time did not change is not read again); whether the desktop app archived each one, from the app's own session file; claude's limits from `$.session.usage()`; codex's from the end of the newest runs under `~/.codex/sessions/`, and `~/.codex/collab.lock/owner` and `~/.codex/collab-limit` when they are there; every `*.json` in **status folder** (not its subfolders); the end (32 kb) of every `*.log` in **schedule logs**.
- **decides**: a pipeline needs a look on `state: "error"`, past its `stale_after_sec`, or (pipeline `live`) `detail.restarts_24h` over 1 ([hooks/pipelines.ts](hooks/pipelines.ts)). a job is late past its **schedule every** plus two hours, broken when its last end did not say `成功` or it started over six hours ago and never ended ([hooks/schedules.ts](hooks/schedules.ts)).
- **sorts**: side chats are dropped; files of one task (same task id or same app session) become one row, the waiting one first, else the newest; kept three days (two weeks if waiting); then waiting, error, running, done. a `running` file older than six hours counts as done, the fallback for a conversation that crashed. `可以清` is done, untouched for a day, from the app, not archived.
- **draws**: one pane (`ui.render`, id `puppy-status`): `等你回話` (or the puppy when nothing waits), `產線`, `對話`, `額度`, `排程`, `可以清`. on a new waiting conversation, a toast shows in the conversation you are in (not in the one that waits).
- **writes back**: each conversation writes only its own file. the mod archives nothing: `整理…` only fills this conversation's prompt box, and you press enter. it never writes into the status folder, the logs or `~/.codex`. on the first start after the rename, it copies the last two weeks from the old folders once: `~/.claude/puppy-sessions/` (puppy-sessions 0.13), then `~/.claude/console/sessions/` (puppy-console up to 0.12) for the names the first did not have.
- **when it fails**: a conversation's file that does not parse is named at the bottom with the reason and keeps its last read; a status file caught halfway through a write keeps its last alarm, and a file of another format there is passed over; a folder that is missing is just "none yet", any other read error is said in red. a conversation that can't write its own file says so in its own pane and tries again next turn. a write still queued when a session ends may be lost, and the six-hour rule covers it.
- **where**: [register.tsx](hooks/register.tsx) (hooks, reading, writing, the pane), [sessions.ts](hooks/sessions.ts) (file format, merging, states), [usage.ts](hooks/usage.ts) (the limits, the codex lock), [pipelines.ts](hooks/pipelines.ts) (which pipelines need a look), [schedules.ts](hooks/schedules.ts) (the jobs' logs), [draw.ts](hooks/draw.ts) (the puppy).

## install

in a claude code session in your terminal:

```
/plugin install puppy-status --marketplace nonbiri1004/puppy-mods
```

answer `y` to add the marketplace, then pick a scope.

## settings

in `/config` → puppy-status:

| setting | default | what it does |
| --- | --- | --- |
| **notices** | on | a short notice while the pane is open when another conversation starts waiting |
| **conversations** | on | each conversation writes its own file, and the pane lists them |
| **push** | on | a push when a conversation stops to ask you something |
| **status folder** (`status_dir`) | empty | a folder of pipeline-status files, for the `產線` card. `~` is your home folder |
| **schedule logs** (`schedule_logs`) | empty | a folder of scheduled jobs' logs, for the `排程` card |
| **schedule every** (`schedule_every`) | empty | how often each job should run, e.g. `daily 1d, weekly 7d` (`m`, `h`, `d`) |

## coming from puppy-sessions

puppy-status is puppy-sessions (0.13) renamed and grown (0.14.0): it keeps every card puppy-sessions had, and adds `產線`, `排程` and the codex lock lines. puppy-todo is gone from this repository at the same time ([why](../README.md#puppy-todo-is-gone)).

1. `claude plugin marketplace update puppy-mods`
2. `claude plugin install puppy-status@puppy-mods`
3. `claude plugin uninstall puppy-sessions@puppy-mods`
4. restart claude code. set **notices**, **conversations** and **push** again in `/config` if you had changed them (they start `on`), and the three folders if you want those cards (they start empty; the status folder was puppy-todo's `status_dir`).

the first conversation that starts copies the files of the last two weeks from `~/.claude/puppy-sessions/` into `~/.claude/puppy-status/`, once, and leaves the old folder as it was. once the pane looks right, you can delete `~/.claude/puppy-sessions/` by hand. the command is `/my-status` now (`/sessions` is gone; `/status` is claude code's own).

## coming from puppy-console

puppy-console (up to 0.12) became puppy-sessions in 0.13.0, and puppy-status in 0.14.0. go straight to puppy-status: the steps above, with `puppy-console@puppy-mods` in step 3. the first start also copies the last two weeks from `~/.claude/console/sessions/` (for the conversations puppy-sessions did not already have), and leaves that folder as it was; you can delete `~/.claude/console/` by hand. `/console` is gone.

## commands

| command | what it does |
| --- | --- |
| `/my-status` | opens the pane and reads the files. while the pane is open it reads again every minute; the `重新整理` button (or `r` while the pane has focus) reads now |

## develop

```
claude plugin validate puppy-status
claude plugin test puppy-status
```

## license

MIT
