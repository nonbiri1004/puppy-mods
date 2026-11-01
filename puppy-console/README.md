# puppy-console

a pane beside the chat. the first card, **for you**, is everything that waits for you, in one place: the conversations that ask you something, and each pipeline's waiting items, with buttons to open the video or the songs, or to start a message to claude. then one short card per production pipeline: what it is doing now and where its work stands, with the rest folded into `▸ details`. your other conversations are one quiet line each at the bottom.

the pipeline cards only read. each pipeline writes one small json file into a folder you pick, and every file there becomes a card. a new pipeline needs no change to the mod: it only starts writing its file. the format is in [FORMAT.md](FORMAT.md).

```
┌ for you ───────────────────────────────────────────────────┐
│ conversations · 1                                          │
│ 每天畫白白                              baibai-tools · 3h ago │
│ → 要照這個發嗎？                                             │
│ ai short videos · 3                                        │
│ ▸ 成片待審 ×3 · 1h                                           │
│ music · 1                                                  │
│ · hear 41 songs in 05_autumn                               │
│   [open the batch]                                         │
└────────────────────────────────────────────────────────────┘
┌ ▾ ai short videos ─────────────────────── waiting · 1m ago ┐
│ 6 open · 3 at a review gate                                │
│ plan 2 › clips 2 › voice 0 › compose 1 › final 3 › done 2  │
│ spent $0.49 of $42.50                                      │
│ ▸ details                                                  │
└────────────────────────────────────────────────────────────┘
┌ ▾ music ───────────────────────────────── waiting · 3m ago ┐
│ 05_autumn · 70/70 usable                                   │
│ 05_autumn                                                  │
│ made 70 · ok 19 · to hear 41 · rejected 10 · 14 min / song │
│ ▸ details                                                  │
└────────────────────────────────────────────────────────────┘
· fix the bowl                          running · puppy-mods · 1m ago
▸ done 12
```

- the **for you** card comes first whenever anything waits, and is gone when nothing does. a conversation that asks you something shows its name and the question; you answer it in that conversation. a pipeline's waiting items show how long each has waited, and the buttons its status file gives them (`actions` in [FORMAT.md](FORMAT.md)):
  - a plain button opens a file or folder with your computer's own app (macOS `open`): the final video, a song, the folder of songs to hear. only pictures, videos, sounds, pdfs and folders, never an app or a script, checked again where the path really leads.
  - a button ending in `…` puts a sentence in this conversation's prompt box, after anything you already typed, for you to finish and send ("send ep04 back because …"). nothing is sent until you press enter.
  - one line under the card says what the last press did, or why it could not.
  - each part counts its own things (`conversations · 1`, `music · 1`); the card adds up no total, because one pipeline item may be 41 songs.
  - a conversation shows its name and its question; one the app never named goes by its question. a question waiting more than a day folds into `▸ older N` (an error never does).
  - a long list ends in a button, `▸ 2 more`, that opens the rest.
  - a pipeline can put items of one kind in a group (`waiting_groups` in [FORMAT.md](FORMAT.md)); the group is one line, `▸ review finals ×3`, that opens in place. the pane remembers what you opened.

- **conversations**: each conversation writes a short file about itself into `~/.claude/console/sessions/` when a turn starts and ends, and when it closes. that folder is on this computer only, never the status folder, so what you typed is not synced anywhere: its name (the app's own title, as the sidebar shows it; before the app has named it, the first thing you typed in it, an attached file by its file name, not its path), the folder it runs in, and the recap the desktop app's next-step box shows (in the terminal, the answer's first line, without markdown).
  - the ones that ask you something are in the **for you** card. the others have no card: below the pipelines, running ones get one quiet line each, and done ones fold into `▸ done N`.
  - a side question (`btw`) is left out: its answer is back in the conversation it came from. the app does not always start one as a fork, so its name tells it too: the app names a side chat `Side chat`, then `btw: <the question>`.
  - a conversation leaves the pane three days after its last turn; one that still waits for you stays two weeks. a `/clear` ends it at once.
  - when a conversation stops to ask you something, it sends a push through the app's PushNotification tool, if your permission settings already allow that tool (the mod checks first and sends nothing otherwise). turn it off with **push** in `/config`.
  - turn the writing off with **conversations** in `/config`.
- pipeline cards that wait for you come first, then errors, then running, then idle.
- a card with no update for more than three days folds into `▸ older N` at the bottom, unless it waits for you (waiting, error, or anything in its waiting list). press it to see them.
- a pipeline card's line says its state and when it last wrote. under its headline comes a short summary, the same text on the desktop and the terminal: ai-video's stages in one row (`plan 2 › clips 2 › … › done 2`) and the money spent; music's batch and its songs (`made · ok · to hear · rejected`); an info-collector card's run (`this run: collected · new · scored · sent`, side by side, not arrows: it is not a funnel) and what waits for review in notion. the number that waits for you is in the warning color.
- `▸ details` opens the rest: the computer the pipeline runs on, the last thing it made, what comes next, and on the desktop a picture (the music card's puppy and one square per song; the ai-video jobs in a column per stage). the terminal shows the same as text (the job names by stage, whether comfy is up).
- press a card's name to fold it to one line (`▸`); press again to open it. the pane remembers, on this computer, across conversations and restarts, and so do the `older` group, each card's details, and each `more`.
- the folder is read only while the pane is open: once when you open it, then every minute. a conversation without the pane reads nothing.
- when a card turns `waiting`, `error` or quiet, or a waiting card gets a new item, a short notice shows in the corner (once, not every minute), only while the pane is open. what changed while it was closed shows in the pane when you open it, without a notice. turn notices off with **notices** in `/config`.
- a pipeline that promised to write every few minutes (`stale_after_sec`) and went quiet gets a "quiet" mark, so a stopped writer doesn't look like it is still working. an `error` stays an `error`, however old.
- a file caught halfway through a write keeps its last card until the next read.
- a file in the folder that isn't a status file is named at the bottom with the reason, never dropped without a word.
- the folder can be a synced one (google drive, dropbox), so a pipeline on another computer gets a card too.
- the puppy is at the top, at its little laptop: typing while a conversation is running, sitting while one waits for you, asleep when nothing goes on. the desktop draws it moving; the terminal draws the same puppy in block characters, still (34 columns × 13 rows, from baibai-brand), only when the pane is at least 26 rows tall and 34 columns wide. the pane asks for 40 rows when it opens in the terminal.

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
