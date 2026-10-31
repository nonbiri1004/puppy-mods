# puppy mods

- **What this is:** small claude code mods kept by the lofi puppy: puppy-todo, puppy-console, puppy-skills.
- **What this isn't:** the puppy's apps, games or music; those live in other (private) repos.
- **Related:** each mod's `hooks/puppy.ts` and `hooks/puppy-blocks.ts` are generated from baibai-brand; baibai-music, ai-video-pipeline and info-collector write the status files puppy-console shows.

small, quiet mods for [claude code](https://claude.com/claude-code), kept by the lofi puppy.

each one does one useful thing and stays out of the way. they're free and open; nothing is locked.

## the mods

| mod | what it does |
| --- | --- |
| [puppy-todo](puppy-todo) | your own to-do list in a pane beside the chat: add, tick, delete. nothing else writes to it |
| [puppy-console](puppy-console) | a pane with your conversations first (which ones wait for you, and what they ask), then one card per production pipeline (music, videos, …). each pipeline writes a small status file ([format](puppy-console/FORMAT.md)) |
| [puppy-skills](puppy-skills) | `/my-kit`: a pane with the skills you have, grouped by where they work (everywhere, one repo, a plugin), with a ⏰ on the ones a scheduled task uses, then the slash commands your mods add (`/console`, `/todo`) |

they all look the same way: quiet cards, warm greys, lowercase words. the rules are in [STYLE.md](STYLE.md).

## install

in a claude code session in your terminal:

```
/plugin install puppy-todo --marketplace nonbiri1004/puppy-mods
```

(the same for `puppy-console` and `puppy-skills`.)

answer `y` to add the marketplace, then pick a scope (user = every session). it works in the terminal and in the desktop app's code tab once installed.

## donate a can

if a mod keeps you company, you can give the puppy a can: [ko-fi.com/lofipuppy](https://ko-fi.com/lofipuppy). it unlocks nothing; the puppy just wags its tail. ♡

## license

MIT
