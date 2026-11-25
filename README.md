# puppy mods

- **What this is:** small claude code mods kept by the lofi puppy: puppy-status, puppy-skills, puppy-theme.
- **What this isn't:** the puppy's apps, games or music; those live in other (private) repos.
- **Related:** each mod's `hooks/puppy.ts` and `hooks/puppy-blocks.ts` are generated from baibai-brand; baibai-music, ai-video-pipeline, info-collector and projects-map write the status files puppy-status reads, and projects-map's scheduled jobs write the logs it reads.

small, quiet mods for [claude code](https://claude.com/claude-code), kept by the lofi puppy.

each one does one useful thing and stays out of the way. they're free and open; nothing is locked.

## the mods

| mod | what it does |
| --- | --- |
| [puppy-status](puppy-status) | `/my-status`: a pane with what needs you now: the claude conversations that wait for you to answer first (a session is one conversation), the pipelines that need a look (only when one does), one row for each other conversation, your claude and codex rate limits and who holds codex, your scheduled jobs, and the finished conversations you may archive. it was called puppy-sessions, and before that puppy-console ([how to switch](puppy-status/README.md#coming-from-puppy-sessions)) |
| [puppy-skills](puppy-skills) | `/my-kit`: a pane with the skills you have, grouped by where they work (everywhere, one repo, a plugin), with a ⏰ on the ones a scheduled task uses, then the slash commands your mods add (`/my-status`) |
| [puppy-theme](puppy-theme) | the puppy's look for the desktop app: warm grey colors, a small framed sky that follows the time of day, pixel message cards and four sets of soft sounds. `/look` picks each part |

they all look the same way: quiet cards, warm greys, lowercase words. the rules are in [STYLE.md](STYLE.md).

## changing a mod

each mod's readme has a `## how it works` section (what starts it, what it reads, where it draws, what it writes, what happens when it fails). a pull request that changes a mod checks that section too, and updates it if a sentence is no longer true.

## install

in a claude code session in your terminal:

```
/plugin install puppy-status --marketplace nonbiri1004/puppy-mods
```

(the same for `puppy-skills` and `puppy-theme`.)

answer `y` to add the marketplace, then pick a scope (user = every session). it works in the terminal and in the desktop app's code tab once installed.

## puppy-todo is gone

puppy-todo (a to-do list in a pane, up to 1.2.0) was taken out of this repository in november 2026: it was rarely opened, and puppy-status is now the one pane for what needs you. to stop it:

```
claude plugin uninstall puppy-todo@puppy-mods
```

your list stays where it was, in `~/.claude/todo/items/` (one json file per item): nothing deletes it. to keep it, leave that folder alone or copy it somewhere you back up; each file is plain json with the item's text. the code is still in this repository's history (before puppy-status 0.14.0) if you want to run it from a copy with `claude --plugin-dir`.

## donate a can

if a mod keeps you company, you can give the puppy a can: [ko-fi.com/lofipuppy](https://ko-fi.com/lofipuppy). it unlocks nothing; the puppy just wags its tail. ♡

## license

MIT
