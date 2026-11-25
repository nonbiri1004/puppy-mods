# puppy-sessions

a pane beside the chat with your claude conversations, and nothing else. (a session is one conversation; the pane itself is in traditional chinese, where it says 對話.)

```
┌ sessions ──────────────────────────────────────────┐
│ 1 個對話等你                 1 分鐘前 [重新整理]   │
│ ╭ 等你回話 ───────────────────────────── 1 個 ╮    │
│ │ 要開 T168 嗎                          20 分鐘 │    │
│ │ → 要開 T168 嗎？                              │    │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 對話 ───────────────────────────────── 3 個 ╮    │
│ │ T172 puppy-sessions · PR opened.  做完 · 30 分鐘 │  │
│ │ music batch                       跑中 · 1 分鐘  │  │
│ │ refresh retry · Yes.              閒著 · 2 小時  │  │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 額度 ───────────────────────────────────────╮    │
│ │ 5 小時 42% · 14:30 重置　一週 12%      Claude │    │
│ │ 5 小時 22%　一週 98%         Codex · 3 小時前 │    │
│ ╰───────────────────────────────────────────────╯    │
│ ╭ 可以清 ──────────────────────────────── 1 個 ╮    │
│ │ old talk                            閒了 2 天 │    │
│ │ [整理…]                                       │    │
│ ╰───────────────────────────────────────────────╯    │
└────────────────────────────────────────────────────┘
```

- **等你回話**, at the top: the conversations that stopped to ask you something, at the end of a turn (a wrap_up with a question) or in the middle of one (a question card: `AskUserQuestion`, a plan to approve, an offer of a new session), each with how long it has waited and its question.
- **對話**: one row for each of the others, its name (its task id, like `T172`, then its title), the first sentence of where it stands, and on the right `跑中`, `做完` (within the hour), `閒著` or `出錯`, and for how long. past 5, `▸ 還有 N 個` opens the rest.
  - a fork, or a conversation another one started (a dispatched task), is listed like any other. a side chat (`btw: …`) is not: its answer is back in the conversation you asked from.
  - files of one task (a restart, a fork) are one row.
  - one the desktop app has archived is not listed.
- **額度**: how much of each rate-limit window is used, and when it resets. claude's comes from claude code itself (the last reply's reading). codex's comes from the newest run under `~/.codex/sessions/`, with how old that reading is; a window whose reset time has passed says `已重置`. no `~/.codex`, no codex line.
- **可以清**: finished conversations from the desktop app, untouched for a day, that the app has not archived. `整理…` puts a request in this conversation's prompt box (`請封存這些對話：…；動手前先列給我確認。`), after anything you already typed. nothing is sent until you press enter, and the mod archives nothing itself: the claude you send it to does, and lists them for you first. whether the app archived one is read from the app's own session file, which is not documented; when it can't be read, one dim line says how many are unknown and they are not listed.
- **nothing waits:** the puppy (typing while a conversation runs, else asleep) and `沒有對話在等你`.
- each conversation writes a short file about itself into `~/.claude/puppy-sessions/` (this computer only; [FORMAT.md](FORMAT.md)). turn it off with **conversations** in `/config`, and the pane lists nothing. when a conversation stops to ask you something, it sends a push through the app's PushNotification tool, if your permission settings already allow it; turn it off with **push**. a side chat never pushes.
- while the pane is open, a short notice shows once when another conversation starts waiting for you. turn notices off with **notices** in `/config`.
- the files are read only while the pane is open: once when you open it, then every minute.
- a file that isn't a conversation's is named at the bottom with the reason, never dropped without a word. the same for a folder the pane can't read, or a conversation that can't write its own file.
- times are one unit, as a glance needs: `5 分鐘`, `8 小時`, `3 天`.

## how it works

two halves that only meet in a folder of small files ([FORMAT.md](FORMAT.md)).

- **the writing half** runs in every conversation (unless **conversations** is off). `turn.start` writes `running`; a `wrap_up` call is caught as it happens, and so is a question card (`AskUserQuestion`, a plan to approve, an offer of a new session), which writes `waiting` with its question until the call returns; `turn.complete` writes `done`, `waiting` (the wrap_up had a question) or `error`, with the recap; `session.end` turns `running` into `done`, and a `/clear` also drops the question. the app's own title and whether it began as a fork come from the classic hooks `SessionStart` and `UserPromptSubmit`. a waiting conversation also tries a push through `PushNotification`, only if the permission check already says allow. writes go one after another and never hold up the turn.
- **the reading half** starts from `/sessions`, which reads once, opens the pane, then reads every minute while it is up (the tick stops when the pane is gone).
- **reads**: `~/.claude/puppy-sessions/*.json` (files older than two weeks are skipped; a file whose time did not change is not read again); whether the desktop app archived each one, from the app's own session file; claude's limits from `$.session.usage()`; codex's from the end of the newest runs under `~/.codex/sessions/`.
- **sorts**: side chats are dropped; files of one task (same task id or same app session) become one row, the waiting one first, else the newest; kept three days (two weeks if waiting); then waiting, error, running, done. a `running` file older than six hours counts as done, the fallback for a conversation that crashed. `可以清` is done, untouched for a day, from the app, not archived.
- **draws**: one pane (`ui.render`, id `puppy-sessions`): `等你回話`, `對話`, `額度`, `可以清`, or the puppy when nothing waits. on a new waiting conversation, a toast shows in the conversation you are in (not in the one that waits).
- **writes back**: each conversation writes only its own file. the mod archives nothing: `整理…` only fills this conversation's prompt box, and you press enter. on the first start after the rename, it copies the last two weeks from the old `~/.claude/console/sessions/` once.
- **when it fails**: a file that does not parse is named at the bottom with the reason and keeps its last read; a folder that is missing is just "none yet", any other read error is said in red. a conversation that can't write its own file says so in its own pane and tries again next turn. a write still queued when a session ends may be lost, and the six-hour rule covers it.
- **where**: [register.tsx](hooks/register.tsx) (hooks, reading, writing, the pane), [sessions.ts](hooks/sessions.ts) (file format, merging, states), [usage.ts](hooks/usage.ts) (the limits), [draw.ts](hooks/draw.ts) (the puppy).

## install

in a claude code session in your terminal:

```
/plugin install puppy-sessions --marketplace nonbiri1004/puppy-mods
```

answer `y` to add the marketplace, then pick a scope.

## coming from puppy-console

puppy-sessions is puppy-console renamed (0.13.0). the pipelines left the pane: their waiting items are in puppy-todo now, and the whole factory is on its board page.

1. `claude plugin marketplace update puppy-mods`
2. `claude plugin install puppy-sessions@puppy-mods`
3. `claude plugin uninstall puppy-console@puppy-mods`
4. restart claude code. set **notices**, **conversations** and **push** again in `/config` if you had changed them (they start `on`). the old **status folder** setting is gone from here; it is puppy-todo's now.

the first conversation that starts copies the files of the last two weeks from `~/.claude/console/sessions/` into `~/.claude/puppy-sessions/`, once, and leaves the old folder as it was. once the pane looks right, you can delete `~/.claude/console/` by hand. the command is `/sessions` now (`/console` is gone).

## commands

| command | what it does |
| --- | --- |
| `/sessions` | opens the pane and reads the files. while the pane is open it reads again every minute; the `重新整理` button (or `r` while the pane has focus) reads now |

## develop

```
claude plugin validate puppy-sessions
claude plugin test puppy-sessions
```

## license

MIT
