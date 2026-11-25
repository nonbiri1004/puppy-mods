# puppy-todo

the things that wait for you outside the chat, in a quiet pane beside it: your own to-do list, which you add to, tick and delete. nothing else writes to it.

```
3 to-do                               refresh
╭─────────────────────────────────────────────╮
│ [add a to-do…]                        [add] │
│  ○  call the vet about the shots     ⍑ ✎ ✕  │
│  ○  decide where the coffee stand goes ⍑ ✎ ✕│
│  ○  set up the mods on the backup mac ⍑ ✎ ✕ │
╰─────────────────────────────────────────────╯
deleted “buy a new lamp”                  undo
▸ done 2
▸ deleted 14
```

on the desktop, the puppy moves beside the header: sitting and blinking while to-dos are open, sleeping when none are open. in the terminal, it is a still puppy in block characters, 34 columns × 13 rows, above the header. it is left out when the pane is shorter than 26 rows or narrower than 34 columns.

it looks like the other puppy mods: warm greys, quiet cards ([style](../STYLE.md)).

## what goes here

a thing belongs in this pane when it is still there after you close the conversation: something to merge, decide, set up or clean. a conversation that waits for a reply is not a to-do: the sidebar shows that.

## your own list

- **open it**: `/todo`. it doesn't open by itself.
- **add**: the field at the top, or `/todo <text>`.
- **tick** ○ when it's done. under `▸ done`, tick ☑ to open it again. done items stay there for three days.
- **✎** to change the words in place: `save` (or enter) keeps them, `cancel` leaves them. if another window changed them meanwhile, nothing is written and the field shows the new words.
- **⍑** pins an item to the top, in bold; press ⍑ again to put it back in its place. pinned items keep the order you pinned them in.
- **✕** to delete something you won't do. one dim line under the list says what went, with `undo`. older ones are under `▸ deleted`, ten at a time, each with ↺ to bring it back as it was.
- ⍑ ✎ ✕ are always there, dim, at the end of each row.
- while the pane is open the list is read again every 5 seconds, so a change in another window shows. **refresh** reads it at once.
- a press that can't be saved says `could not save: …` in red; nothing else changes.

this list is only yours. Claude doesn't add to it, tick it or read it: the mod gives Claude no tools. nothing else writes into it.

## what it doesn't do

it doesn't read your conversations, ask GitHub anything, send notices or put a badge anywhere. when the pane is closed, nothing runs.

## why so little

earlier versions also showed what each conversation was doing, which could be archived, and a list Claude kept for you. the extra facts made the day more tiring, not less, and a list written by someone else is a list you have to check. so it went back to one thing.

## where your list lives

one small json file per item in `~/.claude/todo/items/`. the file name is the id.

```json
{
  "schemaVersion": 2,
  "id": "20261027-1210-m8p2",
  "text": "call the vet about the shots",
  "project": "home",
  "kind": "todo",
  "status": "open",
  "by": "person",
  "createdAt": "2026-10-27T04:10:00.000Z"
}
```

- ticking sets `status: "done"`, `doneAt`, and `declaration: { by: "person" }`. opening it again clears those and sets `reopenedAt`.
- delete sets `deletedAt` and `deletedBy`. the file stays; the item is never shown again.
- files from older versions still work: their extra fields (the conversation that wrote it, who said it was done) are kept and not used.
- items an older version left for GitHub to tick when a PR merged (`source`, or `completion.mode: "source"`) aren't shown: their file says open even after the merge, and this list doesn't ask GitHub. the files stay.
- the list lives on this computer; a second computer has its own `~/.claude/todo/`.

## how it works

- **starts from**: `/todo` (registered at `session.start`). it opens the pane and, with text, adds an item. the pane does not open by itself; if it is already up when a session starts or reloads, it reads again.
- **reads**: every `*.json` in `~/.claude/todo/items/` (a file that is not json, or has no `id` or text, is left out). it reads on `/todo`, on refresh, after each press and every 5 seconds, only while the pane is up: each tick asks whether the pane is still open and stops the timer when it is not. a file whose `id` is not its file name is left out and named.
- **sorts**: open items pinned first (in the order pinned), then by `createdAt` (the id when that is missing); done items newest first, for three days; deleted items newest first under `▸ deleted`; items an older version left for GitHub are dropped.
- **draws**: one pane (`ui.render`, id `puppy-todo`): your list card, the undo line, `▸ done`, `▸ deleted`.
- **writes**: only your own item files, one json each: add, tick, untick, edit (`editedAt`), pin (`pinnedAt`), delete, restore. writes from one window go one after another. a press reads the file again first, so a change from another window is not undone. the mod gives Claude no tools.
- **when it fails**: a list that can't be read keeps the last one and says so in red at the bottom; one file that can't be read, or is caught halfway through a write, keeps its last read and is counted there. a press never writes through a file whose id is no longer its name. undo brings back only the delete it was made for. a write that fails says so in red. each read is numbered and each write makes reads in flight stale, so a slow old read can't put back what a press just changed. two windows writing the same item at the same instant can still race: the last write wins.
- **where**: [register.tsx](hooks/register.tsx) (events, reading, the pane), [todo.ts](hooks/todo.ts) (items, ticking, sorting), [draw.ts](hooks/draw.ts) (the puppy).

## install

```
/plugin install puppy-todo --marketplace nonbiri1004/puppy-mods
```

## coming back (1.3.0)

puppy-todo was taken out of this repository on 2026-11-26 and put back the same day, as only your own list, now with edit, undo, pin and a 5-second refresh. the read-only board cards are gone: what a pipeline needs is in [puppy-status](../puppy-status/README.md)'s `產線` card. your items in `~/.claude/todo/items/` were never touched.

```
claude plugin marketplace update puppy-mods
claude plugin install puppy-todo@puppy-mods
```

then restart claude code. if you still have 1.2.0 installed, `claude plugin update puppy-todo@puppy-mods` instead. the old `status_dir` setting is no longer read.

## license

MIT
