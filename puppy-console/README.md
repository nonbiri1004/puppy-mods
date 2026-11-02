# puppy-console

a pane beside the chat that answers one question: **what waits for you now?** (the pane itself is in traditional chinese.)

```
┌ console ───────────────────────────────────────────┐
│ 2 件等你                         1 分鐘前 [重新整理] │
│ 看 ep04 的成品                       23 小時 [播放]  │
│ 聽 05_autumn 的 3 首：#7 #12 #31     2 小時  [打開]  │
│                                                    │
│ ▸ 影片：閒置 · 音樂：跑中 42/70                      │
└────────────────────────────────────────────────────┘
```

- **one list, one row per thing.** each row says what to do, how long it has waited, and has the buttons its pipeline gives it (`actions` in [FORMAT.md](FORMAT.md)):
  - a plain button opens a file or folder with your computer's own app (macOS `open`). only pictures, videos, sounds, pdfs and folders, never an app or a script, checked again where the path really leads.
  - a button ending in `…` puts a sentence in this conversation's prompt box, after anything you already typed. nothing is sent until you press enter.
  - one line under the list says what the last press did, or why it could not.
- conversations that ask you something are not listed: the app's sidebar already shows them. a pipeline that broke or waits with no item to name gets one row.
- a pipeline's named group of items is one row that opens in place. past 8 rows, `▸ 還有 N 件` opens the rest.
- **nothing waits:** the puppy and one sentence, `都處理完了`.
- **the pipelines are one grey line** at the bottom: each one's name and state. press it to see each pipeline's details (what it is doing, its counts, the last thing it made, what comes next). only `等你` has a color (and `出錯` its own).
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
