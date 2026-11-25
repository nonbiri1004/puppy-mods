# puppy-skills

a quiet pane that lists the claude code skills you have, where each one works, and the slash commands your mods add.

type `/my-kit` (`/my-skills`, its old name, still works; `/skills` is claude code's own). on the desktop the puppy moves at the top, typing at its little laptop. in the terminal, it is a still puppy in block characters, 34 columns × 13 rows, above the header. it is left out when the pane is shorter than 26 rows or narrower than 34 columns. the pane only reads files and the app's command list: it never runs a skill or a command and never shows what is running (that is `puppy-sessions`'s job).

```
4 skills · 2 mods · looked 10:02            refresh
╭──────────────────────────────────────────────────────╮
│ yours                                 anywhere · 2   │
│ ▸  nap Finds a sunny spot.                           │
│ ▸  walk-plan Plans the morning walk.                 │
╰──────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────╮
│ garden                         only in garden · 1    │
│ ▾  dig-hole Digs one hole.                    ⏰ 9:00 │
│      Digs one hole. Never two.                       │
│      ⏰ morning dig · 9:00 daily                      │
╰──────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────╮
│ toys                                     plugin · 1  │
│ ▸  ball Throws the ball.                             │
╰──────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────╮
│ mods                       where the mod is on · 2   │
│ ▸  /fetch Brings back whatever you threw.            │
│ ▸  /my-kit see which skills and mods you have and…   │
╰──────────────────────────────────────────────────────╯
▸ from claude.ai 11
```

(made-up skills, to show the shape.)

## where it looks

| card | read from | works in |
| --- | --- | --- |
| yours | `~/.claude/skills/**/SKILL.md` | every conversation |
| one per repo | `~/dev/**/.claude/skills/*/SKILL.md` (5 folders deep; skips `node_modules` and dot folders like `.claude/worktrees`) | only conversations opened in that repo |
| from claude.ai (folded) | `~/.claude/skills/synced/…`: anthropic's skills the app copies from your claude.ai account, not ones you wrote | every conversation |
| one per plugin | `<installPath>/skills/*/SKILL.md` for each plugin in `~/.claude/plugins/installed_plugins.json` | wherever the plugin is on |
| mods | the app's own command list (`$.command.list()`): each command from a plugin with a bare name (not `<plugin>:<name>`) that is not one of the skills above. these are what a mod adds in code with `$.command.register`, like `/sessions` and `/todo`; they have no `SKILL.md`. `/my-skills` is left out, since it is `/my-kit` again | wherever the mod is on |

each row is the skill's `name` (a mod's `/name`) and the first sentence of its `description`. press `▸` to see all of it, and for a mod, which plugin added it.

## the clock

a skill gets `⏰` when a scheduled task's prompt (`~/.claude/scheduled-tasks/<task>/SKILL.md`) names it: its folder (`…/skills/<name>/`), `/<name>`, or a name with a dash in it as a whole word. a one-word name like `pdf` needs the folder or `/pdf`, since the word alone is too common.

the time comes from the desktop app's own `scheduled-tasks.json` files under `~/Library/Application Support/Claude/claude-code-sessions/` (macOS). a task the app turned off is left out. without those files the clock shows with no time.

it reads again when you open it and when you press refresh.

## how it works

- **starts from**: `/my-kit` or `/my-skills` (both registered at `session.start`). it opens the pane and reads; there is no timer, so it reads again only on refresh.
- **reads**: in parallel, `~/.claude/skills`, every `<repo>/.claude/skills` under `~/dev`, each plugin's `skills/` from `installed_plugins.json`, the scheduled tasks' prompts (and the app's `scheduled-tasks.json` for their times), and the app's command list (`$.command.list()`). each `SKILL.md` gives its `name` and `description` from the frontmatter; one with no `name` is left out.
- **sorts**: a skill found twice shows once. cards are yours, then one per repo, then one per plugin, names a→z; `synced` ones fold under `from claude.ai`. a skill gets `⏰` when a task's prompt names it. mods are the commands from a plugin with a bare name that is not one of the skills found, minus `/my-skills`.
- **draws**: one pane (`ui.render`, id `puppy-skills`): a card per group, then the mods, then the folded `from claude.ai`. which rows are open is kept in the pane's own state.
- **writes**: nothing. it never runs a skill or a command.
- **when it fails**: each source is tried alone. one that can't be read adds `could not read …` in red at the bottom, and the others still show. a read that finishes after a newer one is dropped.
- **where**: [register.tsx](hooks/register.tsx) (finding files, the pane), [skills.ts](hooks/skills.ts) (parsing, cards, `⏰` matching), [draw.ts](hooks/draw.ts) (the puppy).
