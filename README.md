# puppy mods

- **What this is:** small claude code mods kept by the lofi puppy: puppy-todo, puppy-sessions, puppy-skills, puppy-theme.
- **What this isn't:** the puppy's apps, games or music; those live in other (private) repos.
- **Related:** each mod's `hooks/puppy.ts` and `hooks/puppy-blocks.ts` are generated from baibai-brand; baibai-music, ai-video-pipeline, info-collector and projects-map write the status files puppy-todo shows.

small, quiet mods for [claude code](https://claude.com/claude-code), kept by the lofi puppy.

each one does one useful thing and stays out of the way. they're free and open; nothing is locked.

## the mods

| mod | what it does |
| --- | --- |
| [puppy-todo](puppy-todo) | the things that wait for you outside the chat: your own to-do list (add, tick, delete; nothing else writes to it), and, if you set a status folder, a read-only card of what a board lists for you |
| [puppy-sessions](puppy-sessions) | `/sessions`: a pane with your claude conversations (a session is one conversation): the ones that wait for you to answer first, one row for each of the others, your claude and codex rate limits, and the finished ones you may archive. it was called puppy-console ([how to switch](puppy-sessions/README.md#coming-from-puppy-console)) |
| [puppy-skills](puppy-skills) | `/my-kit`: a pane with the skills you have, grouped by where they work (everywhere, one repo, a plugin), with a ⏰ on the ones a scheduled task uses, then the slash commands your mods add (`/sessions`, `/todo`) |
| [puppy-theme](puppy-theme) | the puppy's look for the desktop app: warm grey colors, a small framed sky that follows the time of day, pixel message cards and four sets of soft sounds. `/look` picks each part |

they all look the same way: quiet cards, warm greys, lowercase words. the rules are in [STYLE.md](STYLE.md).

## changing a mod

each mod's readme has a `## how it works` section (what starts it, what it reads, where it draws, what it writes, what happens when it fails). a pull request that changes a mod checks that section too, and updates it if a sentence is no longer true.

## install

in a claude code session in your terminal:

```
/plugin install puppy-todo --marketplace nonbiri1004/puppy-mods
```

(the same for `puppy-sessions` and `puppy-skills`.)

answer `y` to add the marketplace, then pick a scope (user = every session). it works in the terminal and in the desktop app's code tab once installed.

## donate a can

if a mod keeps you company, you can give the puppy a can: [ko-fi.com/lofipuppy](https://ko-fi.com/lofipuppy). it unlocks nothing; the puppy just wags its tail. ♡

## license

MIT
