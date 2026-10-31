# the status file format

every pipeline writes one small json file into one shared folder. the mod reads every `*.json` in that folder and draws one card per file. it reads the folder only while its pane is open (once on `/console`, then every minute). the mod never runs a pipeline and never writes into the folder; the most a button does is open a file to look at, or put words in the prompt box (see `actions`, below). (it keeps its own conversation files elsewhere; see conversations, below.)

```
<status folder>/
  music.json       ← one pipeline
  ai-video.json    ← another
```

## the file

```json
{
  "format": "pipeline-status",
  "version": 1,
  "pipeline": "music",
  "title": "music",
  "host": "studio-mac",
  "updated": "2026-10-24T22:40:00+08:00",
  "stale_after_sec": 360,
  "state": "running",
  "headline": "05_autumn · 42/70 usable",
  "progress": { "done": 42, "total": 70, "unit": "usable songs" },
  "waiting": [{ "id": "listen-7", "text": "hear song 7", "since": "2026-10-24T21:10:00+08:00",
                "actions": [{ "label": "play", "open": "/Volumes/music/05_autumn/007.wav" }] }],
  "last_output": { "label": "song 88 ok", "at": "2026-10-24T22:38:12+08:00" },
  "next": "keep making songs",
  "detail": {}
}
```

| field | must have | what it is |
| --- | --- | --- |
| `format` | yes | always `"pipeline-status"`; a file without it is not a card |
| `version` | yes | `1`. a new version only when a field above changes meaning; new fields can be added in version 1 |
| `pipeline` | yes | short id, lowercase, `a-z 0-9 -`; the file name is `<pipeline>.json` |
| `title` | no | the card's title; `pipeline` when missing |
| `host` | no | which computer wrote it |
| `updated` | yes | iso 8601 time with the offset, when the file was written. a card more than three days old folds into `older` at the bottom of the pane, unless it is `waiting` or `error` or has anything in `waiting` |
| `stale_after_sec` | no | after this many seconds with no new file, the card says the pipeline has gone quiet. leave it out for a pipeline that only writes when you run a command |
| `state` | yes | `running` (working now), `idle` (nothing to do), `waiting` (stopped until you do something), `error` (stopped by a problem) |
| `headline` | yes | one short line: what it is doing now |
| `progress` | no | `{ done, total, unit }` for a progress bar; `total` can be `null` when there is no end |
| `waiting` | no | things only you can do (listen, approve, drop a file in). `id` stays the same while the item waits, so a later to-do or button can point at it. `since` is when it began to wait. `actions` gives it buttons, below |
| `last_output` | no | the newest thing it made: `{ label, at, path? }` |
| `next` | no | the next step, in words |
| `detail` | no | anything the pipeline wants to show more of. the mod draws a few known ones (below); for others it shows nothing extra |

## actions

an item in `waiting` can carry up to three buttons, `actions: [{ label, open | fill }]`, drawn under it in the pane's **for you** card. `label` is the button's word, at most 24 characters. each action has exactly one of:

- `open`: a full path (or `~/…`) the pane opens with the computer's own app (macOS `open`) when you press it. it has to be a picture, a video, a sound or a pdf (`.mp4 .mov .m4v .webm .mkv .mp3 .wav .m4a .aac .flac .ogg .png .jpg .jpeg .gif .webp .pdf`), or a folder written with a `/` at the end. the folder can be synced, so the pane never opens anything that runs: no app or other bundle anywhere in the path, no `..`, and the same check again on where the path really leads (links resolved) when you press. a path that is not on this computer says so in the pane.
- `fill`: at most 500 characters the pane puts in the prompt box of the conversation the pane is in, after anything already typed there. it sends nothing: you finish the words and press enter. write it so claude knows what to do without the card, for example `"in ai-video-pipeline, send baibai/ep04 back to compose because: "`.

an action that breaks a rule is left out, like any field of the wrong type; the item still shows.

## writing it

- write a temp file in the same folder, then rename it over the old one (`os.replace` in python, `fs.renameSync` in node). the reader and a sync tool then never see half a file.
- write it often enough for `stale_after_sec`, or after every command.
- keep it small (under 1 mb). it is a status, not a log; a few tail lines are fine.
- if the folder is synced between computers (google drive, dropbox), any pipeline on any computer can write there. each file has one writer.

## known details

the mod draws these when `pipeline` matches; anything else in `detail` is ignored.

- `music`: `{ comfy: { up, running, pending }, generating, batches: [{ name, strip, est_usable, target_usable, generated, ok, needs_listen, rejected, errors, avg_gen_sec, status_tail }] }`. `strip` has one letter per song: `o` ok, `l` to hear, `r` rejected, `x` left out, `e` failed, `?` being checked.
- `ai-video`: `{ spend_usd, cap_usd, jobs: [{ job, stage, spend_usd, cap_usd, updated, next }] }`. `stage` is `plan`, `clips`, `voice`, `compose`, `final` or `done`; the card groups jobs by stage.
- `collector-*` (info-collector, one file per profile, e.g. `collector-tech-news`; matched by the prefix): `{ counts: { collected, new, scored, sent, unsent, pending }, errors: [text] }`.
  - `collected`, `new`, `scored` and `sent` are this run. `scored` can be more than `new` (older unscored items are scored too), and `sent` can be more than `scored` (earlier runs' picks).
  - `unsent`: high-scored items not in notion yet (sent next run, or refused).
  - `pending`: items waiting for your review in notion now, from every run. at most 100 (`100` means 100 or more); `null` when notion could not be read.
  - without `counts` (older files) the card draws no picture and no extra lines.

## conversations

the mod itself writes one more kind of file, one per conversation, in `~/.claude/console/sessions/<session id>.json`: on this computer only, never in the status folder, because it holds what you typed. only that conversation writes its file, one write after another, and never while holding up a turn; it writes once more when the conversation ends. the pane reads them for the first card. a file there that does not parse (caught halfway through a write) keeps what the last read had; one whose `id` is not its file name is named at the bottom of the pane and left out.

```json
{
  "format": "session-status",
  "version": 1,
  "id": "4f0c…",
  "updated": "2026-10-27T12:00:00.000Z",
  "state": "waiting",
  "title": "the app's own title, or the first line you typed",
  "isAppTitle": true,
  "project": "puppy-mods",
  "recap": "what is now true and where it stands",
  "ask": "the question the last turn left you, or null"
}
```

`state` is `running` (a turn is going), `waiting` (the last turn asked you something), `done` or `error`. when the conversation ends, a `running` file becomes `done`; a `/clear` also turns `waiting` into `done`. a `running` file older than six hours is shown as `done` anyway (the conversation stopped without ending, a crash). `isAppTitle` is `true` once `title` is the app's own; `isFork` is `true` for a conversation forked from another (a side question), which the card leaves out. `host` is optional. files older than three days are not shown, except a `waiting` one, shown for two weeks; they stay in the folder.
