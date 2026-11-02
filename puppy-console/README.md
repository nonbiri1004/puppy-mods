# puppy-console

a pane beside the chat that answers one question: **what waits for you now?** (the pane itself is in traditional chinese.)

```
┌ console ───────────────────────────────────────────┐
│ 2 件等你                         1 分鐘前 [重新整理] │
│ 影片 · ep04                                         │
│ ✓ 企劃 ─ ✓ 片段 ─ ✓ 配音 ─ ✓ 合成                    │
│ ╭ 成品 ─────────────────────── 等你 · 23 小時 ╮      │
│ │ check the final of ep04       [播放] [退回…] │      │
│ ╰─────────────────────────────────────────────╯      │
│ ◐ 音樂：跑中 · 05_autumn · 42/70 usable              │
└────────────────────────────────────────────────────┘
```

- **each pipeline that waits for you is a flow from top to bottom:** the steps it already passed in one grey line (✓ done, ◐ running, ○ not yet), the step that waits for you as a card (how long it has waited, then each thing with the buttons its pipeline gives it, `actions` in [FORMAT.md](FORMAT.md)), then the steps after it. the steps are known to the mod for `ai-video` (`detail.jobs[].stage`) and `music` (`detail.batches`); another pipeline gets the card alone.
  - a plain button opens a file or folder with your computer's own app (macOS `open`). only pictures, videos, sounds, pdfs and folders, never an app or a script, checked again where the path really leads.
  - a button ending in `…` puts a sentence in this conversation's prompt box, after anything you already typed. nothing is sent until you press enter.
  - one line under the cards says what the last press did, or why it could not.
- a pipeline that broke gets a card too, with its error. past 5 things, `▸ 還有 N 件` opens the rest.
- conversations that ask you something are not listed: the app's sidebar already shows them.
- **the other pipelines are one grey line each:** their name, state and what they are doing. only `等你` has a color (and `出錯` its own).
- **nothing waits:** the puppy and one sentence, `都處理完了`.
- the pipelines only write; the mod only reads. each pipeline writes one small json file into a folder you pick ([FORMAT.md](FORMAT.md)). a new pipeline needs no change to the mod.
- the folder is read only while the pane is open: once when you open it, then every minute.
- each conversation writes a short file about itself into `~/.claude/console/sessions/` (this computer only), so the puppy knows when one is running (it types) and a push can go out. turn it off with **conversations** in `/config`. when a conversation stops to ask you something, it sends a push through the app's PushNotification tool, if your permission settings already allow it; turn it off with **push**.
- when a pipeline turns waiting, error or quiet, or gets a new waiting item, a short notice shows in the corner (once), only while the pane is open. turn notices off with **notices** in `/config`.
- a file in the folder that isn't a status file is named at the bottom with the reason, never dropped without a word.

## install

in a claude code session in your terminal:

```
/plugin install puppy-console --marketplace nonbiri1004/puppy-mods
```

answer `y` to add the marketplace, then pick a scope. set **status folder** to the folder your pipelines write into (`~` is your home folder). you can change it later in `/config`.

## commands

| command | what it does |
| --- | --- |
| `/console` | opens the pane and reads the folder. while the pane is open it reads again every minute; the `refresh` button (or `r` while the pane has focus) reads it now |

## develop

```
claude plugin validate puppy-console
claude plugin test puppy-console
```

## license

MIT
