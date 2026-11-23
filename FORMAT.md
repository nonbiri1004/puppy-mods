# the status file format (pipeline-status)

a writer (a pipeline, a board, a script) writes one small json file into a shared folder. a mod reads every `*.json` in that folder. this file is the agreement between the two sides, so it lives here and not in one mod: writers follow it, and each mod says below which fields it reads.

```
<status folder>/
  music.json       ← one writer
  ai-video.json    ← another
```

## who reads what

- **[puppy-todo](puppy-todo)** (setting `status_dir`, empty by default): one read-only card per file that has `waiting` items, under your own list. it reads `title`, `updated`, `waiting` (`id`, `text`, `since`, `group`, `url`, `due`) and `waiting_groups`; nothing else. it reads the folder while its pane is open (once on `/todo`, then every minute).
- **[puppy-console](puppy-console)** (setting `status_dir`): every field below, a card per pipeline. its own conversation files are a different format, in [its FORMAT.md](puppy-console/FORMAT.md).

a mod never runs a writer and never writes into the folder. an item leaves a card only when its writer stops listing it. the most a button does is open a link or a file to look at, or put words in the prompt box (see `url` and `actions`, below).

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
                "actions": [{ "label": "play", "open": "/Volumes/music/05_autumn/007.wav" }] },
              { "id": "merge-98", "text": "merge projects-map#98", "since": "2026-10-23T09:00:00+08:00",
                "url": "https://github.com/nonbiri1004/projects-map/pull/98", "due": "2026-10-30" }],
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
| `updated` | yes | iso 8601 time with the offset, when the file was written |
| `stale_after_sec` | no | after this many seconds with no new file, the card says the pipeline has gone quiet. leave it out for a pipeline that only writes when you run a command |
| `state` | yes | `running` (working now), `idle` (nothing to do), `waiting` (stopped until you do something), `error` (stopped by a problem) |
| `headline` | yes | one short line: what it is doing now |
| `progress` | no | `{ done, total, unit }` for a progress bar; `total` can be `null` when there is no end |
| `waiting` | no | things only you can do (listen, approve, drop a file in). each item is `{ id, text, since?, group?, url?, due?, actions? }`, below |
| `waiting_groups` | no | names for kinds of waiting items, `[{ id, label }]`, below |
| `sections` | no | lists to show on the pipeline's own card, `[{ id, label, rows }]`, below. new in version 1: older files and older mods simply leave it out |
| `last_output` | no | the newest thing it made: `{ label, at, path? }` |
| `next` | no | the next step, in words |
| `detail` | no | anything the pipeline wants to show more of. puppy-console draws a few known ones (below); for others it shows nothing extra |

## waiting items

| field | must have | what it is |
| --- | --- | --- |
| `id` | yes | stays the same while the item waits, so a reader can remember it (an opened group, a later to-do). an item without one is known by its words |
| `text` | yes | what to do, in a few words. put what matters first: a narrow pane cuts at its edge |
| `since` | no | iso 8601 time, when it began to wait; a reader shows how long. never a time in the future: a date the thing is due goes in `due` |
| `group` | no | the `id` of one of `waiting_groups`, below |
| `url` | no | one `https://` link to look at, at most 2048 characters (a pull request, an issue, a page). a reader draws it as a link, e.g. `↗ #98` for a GitHub pull request or issue. any other scheme is left out |
| `due` | no | when it should be done by: a date `YYYY-MM-DD`, or an iso 8601 time. a reader shows it, and may mark it once it has passed |
| `actions` | no | buttons, below. a read-only reader (puppy-todo) leaves them out |

new in version 1: `url` and `due`. older files and older mods simply leave them out.

## actions

an item in `waiting` can carry up to three buttons, `actions: [{ label, open | fill }]`, drawn on its row in the pane's list. `label` is the button's word, at most 24 characters. each action has exactly one of:

- `open`: a full path (or `~/…`) the pane opens with the computer's own app (macOS `open`) when you press it. it has to be a picture, a video, a sound or a pdf (`.mp4 .mov .m4v .webm .mkv .mp3 .wav .m4a .aac .flac .ogg .png .jpg .jpeg .gif .webp .pdf`), or a folder written with a `/` at the end. the folder can be synced, so the pane never opens anything that runs: no app or other bundle anywhere in the path, no `..`, and the same check again on where the path really leads (links resolved) when you press. a path that is not on this computer says so in the pane.
- `fill`: at most 500 characters the pane puts in the prompt box of the conversation the pane is in, after anything already typed there. it sends nothing: you finish the words and press enter. write it so claude knows what to do without the card, for example `"in ai-video-pipeline, send baibai/ep04 back to compose because: "`.

an action that breaks a rule is left out, like any field of the wrong type; the item still shows.

## waiting groups

when a pipeline has several items of one kind (three finals to review), it can name the kind once and point its items at it, so the list shows them as one row, `▸ review finals ×3 · 24h` (the oldest one's wait), that opens in place to each item and its buttons:

```json
"waiting_groups": [{ "id": "final-review", "label": "成片待審" }],
"waiting": [{ "id": "final-ep04", "text": "看過成片，approve baibai/ep04 final", "group": "final-review" }, …]
```

- `id` is what items point at with `group`, and what the pane remembers an opened group by; keep it the same. `label` is the words on the line, at most 40 characters, in the pipeline's own words.
- the pipeline decides the group where it makes the item. the pane never guesses a kind from an item's words.
- a group is only how it shows: each item keeps its own id and buttons, and still counts on its own.
- a group with one item, an item whose `group` is not in `waiting_groups`, and a group without an id or a label: the item shows on its own, as if it had no group.

## sections

a pipeline that wants more than one line can name a few lists, and puppy-console draws them on a card of its own, below what waits for you, in place of the pipeline's grey line, whatever its state:

```json
"sections": [
  { "id": "running", "label": "進行中 2", "rows": [{ "text": "T7 make the intro", "at": "2026-11-19T15:10:00+08:00" }, { "text": "T9 fix the cover" }] },
  { "id": "queued", "label": "排隊中 1", "rows": [{ "text": "T12 new song list" }] },
  { "id": "done", "label": "這週做完 14 件", "rows": [] }
]
```

- the card shows the pipeline's title, its state and when it wrote, its `headline`, then each section: `label` as a dim line, then one line per row. `at` (optional, iso 8601) is when the row last changed; the pane shows how long ago on the row's right.
- `id` is what the pane remembers an opened list by; keep it the same. `label` is at most 40 characters, in the pipeline's own words; put a count in it when it helps (`進行中 2`). a section with no rows is just its label.
- past 5 rows, `▸ 還有 N 件` opens the rest. a row is at most 200 characters (longer ones are cut); a narrow pane cuts it at its edge, so put what matters first.
- at most 8 sections. a section without an id or a short label, a second one with the same id, and a row without `text` are left out.
- what waits for you stays in `waiting`: the pane says it once, at the top, so don't list it again in a section.

## writing it

- write a temp file in the same folder, then rename it over the old one (`os.replace` in python, `fs.renameSync` in node). the reader and a sync tool then never see half a file.
- write it often enough for `stale_after_sec`, or after every command.
- keep it small (under 1 mb). it is a status, not a log; a few tail lines are fine.
- if the folder is synced between computers (google drive, dropbox), any pipeline on any computer can write there. each file has one writer.

## known details

puppy-console draws these when `pipeline` matches; anything else in `detail` is ignored.

- `music`: `{ comfy: { up, running, pending }, generating, batches: [{ name, strip, est_usable, target_usable, generated, ok, needs_listen, rejected, errors, avg_gen_sec, status_tail }] }`. `strip` has one letter per song: `o` ok, `l` to hear, `r` rejected, `x` left out, `e` failed, `?` being checked. the pipeline's details show the first batch: its name, then made · ok · to hear · rejected (and failed, and the minutes per song).
- `ai-video`: `{ spend_usd, cap_usd, jobs: [{ job, stage, spend_usd, cap_usd, updated, next }] }`. `stage` is `plan`, `clips`, `voice`, `compose`, `final` or `done` (ai-video-pipeline also writes `deliver`: the final was approved but copying it out failed; puppy-console doesn't draw that stage yet); the pipeline's details count the jobs at every stage, then the spend, and name them by stage.
- `collector-*` (info-collector, one file per profile, e.g. `collector-tech-news`; matched by the prefix): `{ counts: { collected, new, scored, sent, unsent, pending }, errors: [text] }`.
  - `collected`, `new`, `scored` and `sent` are this run. `scored` can be more than `new` (older unscored items are scored too), and `sent` can be more than `scored` (earlier runs' picks).
  - `unsent`: high-scored items not in notion yet (sent next run, or refused).
  - `pending`: items waiting for your review in notion now, from every run. at most 100 (`100` means 100 or more); `null` when notion could not be read.
  - the card shows this run's four counts side by side, then `pending` and `unsent`.
  - without `counts` (older files) the details show only `progress`, if the file has one.

