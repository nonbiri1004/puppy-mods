# puppy-console

a pane beside the chat. the first card, **for you**, is everything that waits for you, in one place: the conversations that ask you something, and each pipeline's waiting items, with buttons to open the video or the songs, or to start a message to claude. then your other conversations, then one card per production pipeline: what it is doing now, the last thing it made, and what comes next.

the pipeline cards only read. each pipeline writes one small json file into a folder you pick, and every file there becomes a card. a new pipeline needs no change to the mod: it only starts writing its file. the format is in [FORMAT.md](FORMAT.md).

```
┌ for you ──────────────────────────────────────── 2 waiting ┐
│ ai-video                                                   │
│ · check the final of ep04 · 23h                            │
│   [play]  [send back…]                                     │
│ music                                                      │
│ · hear 3 songs in 05_autumn: #7, #12, #31                  │
│   [open the batch]                                         │
└────────────────────────────────────────────────────────────┘
┌ music ─────────── running · 1 for you · 1m ago · studio-mac ┐
│ 05_autumn · 42/70 usable                                    │
│ [the puppy at work]  ■■■■■■□■■■■■■■■□■■■…                   │
│ next: making songs                                          │
└─────────────────────────────────────────────────────────────┘
```

- the **for you** card comes first whenever anything waits, and is gone when nothing does. a conversation that asks you something shows its name, its recap and the question; you answer it in that conversation. a pipeline's waiting items show how long each has waited, and the buttons its status file gives them (`actions` in [FORMAT.md](FORMAT.md)):
  - a plain button opens a file or folder with your computer's own app (macOS `open`): the final video, a song, the folder of songs to hear. only pictures, videos, sounds, pdfs and folders, never an app or a script, checked again where the path really leads.
  - a button ending in `…` puts a sentence in this conversation's prompt box, after anything you already typed, for you to finish and send ("send ep04 back because …"). nothing is sent until you press enter.
  - one line under the card says what the last press did, or why it could not.

- the **conversations** card comes next. each conversation writes a short file about itself into `~/.claude/console/sessions/` when a turn starts and ends, and when it closes. that folder is on this computer only, never the status folder, so what you typed is not synced anywhere: its name (the app's own title, as the sidebar shows it; before the app has named it, the first thing you typed), the folder it runs in, and the recap the desktop app's next-step box shows (in the terminal, the answer's first line, without markdown).
  - the ones that ask you something are in the **for you** card above; this card counts them. running ones get one quiet line each; done ones fold into `▸ done N`.
  - a side question forked from another conversation (`btw`) is left out: its answer is back in the conversation it came from.
  - a conversation leaves the card three days after its last turn; one that still waits for you stays two weeks. a `/clear` ends it at once.
  - when a conversation stops to ask you something, it sends a push through the app's PushNotification tool, if your permission settings already allow that tool (the mod checks first and sends nothing otherwise). turn it off with **push** in `/config`.
  - turn the writing off with **conversations** in `/config`.
- pipeline cards that wait for you come first, then errors, then running, then idle.
- a card with no update for more than three days folds into `▸ older N` at the bottom, unless it waits for you (waiting, error, or anything in its waiting list). press it to see them.
- press a card's name to fold it to one line (`▸`); press again to open it. the pane remembers, on this computer, across conversations and restarts, and so does the `older` group. a card that waits for you says how many things on its line (`1 for you`).
- the folder is read only while the pane is open: once when you open it, then every minute. a conversation without the pane reads nothing.
- when a card turns `waiting`, `error` or quiet, or a waiting card gets a new item, a short notice shows in the corner (once, not every minute), only while the pane is open. what changed while it was closed shows in the pane when you open it, without a notice. turn notices off with **notices** in `/config`.
- a pipeline that promised to write every few minutes (`stale_after_sec`) and went quiet gets a "quiet" mark, so a stopped writer doesn't look like it is still working. an `error` stays an `error`, however old.
- a file caught halfway through a write keeps its last card until the next read.
- a file in the folder that isn't a status file is named at the bottom with the reason, never dropped without a word.
- the folder can be a synced one (google drive, dropbox), so a pipeline on another computer gets a card too.
- the puppy is at the top, at its little laptop: typing while a conversation is running, sitting while one waits for you, asleep when nothing goes on. the desktop draws it moving; the terminal draws the same puppy in block characters, still (34 columns × 13 rows, from baibai-brand), only when the pane is at least 26 rows tall and 34 columns wide. the pane asks for 40 rows when it opens in the terminal.
- the desktop app draws a small picture per card (the music card has the puppy and one square per song; the ai-video card groups jobs by review gate; an info-collector card, `collector-<profile>`, shows collected › new › scored › sent and what waits for your review in notion). the terminal shows the same as text.

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
