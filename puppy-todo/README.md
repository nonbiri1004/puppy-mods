# puppy-todo

the things that wait for you outside the chat, in a quiet pane beside it: your own to-do list, which you add to, tick and delete, and, if you want, a read-only card of what a board lists for you.

```
3 to-do                               refresh
╭─────────────────────────────────────────────╮
│ [add a to-do…]                        [add] │
│  ○  call the vet about the shots            │
│  ○  decide where the coffee stand goes   ✕  │
│  ○  set up the mods on the backup mac       │
╰─────────────────────────────────────────────╯
▸ done 2
╭─────────────────────────────────────────────╮
│ 任務板 · 主控                19 · 12 分鐘前 │
│ ▸ 要你合併的 PR ×5 · 8 天                   │
│ ▸ 要你自己動手的 ×14 · 9 天                 │
│ 刪 Drive 舊檔                          2 天 │
│ 到 11/30                                    │
╰─────────────────────────────────────────────╯
```

on the desktop, the puppy moves beside the header: sitting and blinking while to-dos are open, sleeping when none are open. in the terminal, it is a still puppy in block characters, 34 columns × 13 rows, above the header. it is left out when the pane is shorter than 26 rows or narrower than 34 columns.

it looks like the other puppy mods: warm greys, quiet cards ([style](../STYLE.md)).

## what goes here

a thing belongs in this pane when it is still there after you close the conversation: something to merge, decide, set up or clean. a conversation that waits for a reply is not a to-do: the sidebar shows that.

## your own list

- **open it**: `/todo`. it doesn't open by itself.
- **add**: the field at the top, or `/todo <text>`.
- **tick** ○ when it's done. under `▸ done`, tick ☑ to open it again. done items stay there for three days.
- **✕** to delete something you won't do. on the desktop it shows when the pointer is on the row.
- **refresh** reads everything again, if you changed it in another window.

this list is only yours. Claude doesn't add to it, tick it or read it: the mod gives Claude no tools. nothing else writes into it.

## the read-only cards (optional)

set **status folder** (`status_dir`) in the mod's settings to a folder of status files ([format](../FORMAT.md)), for example the one a dispatch board writes. empty (the default) shows only your own list.

- each file with waiting items is one card under your list: its `title` with the folder's own name as a tag (`…/產線狀態/主控` → `任務板 · 主控`), then, dim on the right, how many and when it was written.
- items of one kind (`waiting_groups`) fold into one row, `▸ 等合併 ×4 · 3 天` (the oldest wait), that opens in place.
- an item can carry a link (`url`, https only, drawn as `↗ #98` for a GitHub pull request) and a day it is due (`due`, `到 11/30`, in the warning color once it has passed).
- a card is read-only: no tick, no ✕, no buttons. an item goes away when the file stops listing it, for example when the board crosses it out or its pull request is merged. the mod never writes into the folder.
- a file that has not been written for a day (or for its own `stale_after_sec`) says so in one dim line, `任務板 26 小時沒更新`. a file caught halfway through a write keeps its last card.
- the folder is read only while the pane is open: on `/todo`, on refresh, after a turn, and every minute.

## what it doesn't do

it doesn't read your conversations, ask GitHub anything, send notices or put a badge anywhere. when the pane is closed, nothing runs.

## why so little

earlier versions also showed what each conversation was doing, which could be archived, and a list Claude kept for you. the extra facts made the day more tiring, not less, and a list written by someone else is a list you have to check. so it went back to one thing.

the read-only cards are the one thing let back in, on trial: the board's items were already shown elsewhere, so this moves them rather than adding a list; they sit on their own card, folded by kind, and leave by themselves once they are done. if they still make the day tiring, clear `status_dir` and the pane is your own list again.

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

## install

```
/plugin install puppy-todo --marketplace nonbiri1004/puppy-mods
```

to show a board's card, set the status folder after installing: `/config` → puppy-todo → status folder.

## license

MIT
