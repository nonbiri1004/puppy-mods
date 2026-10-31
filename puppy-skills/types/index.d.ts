// where a skill can be used: personal ones everywhere, a repo's only in a conversation opened in
// that repo, a plugin's wherever the plugin is turned on. synced: Anthropic's skills the app copies
// from your claude.ai account into ~/.claude/skills/synced/ (usable everywhere, but not yours)
export type Where = 'personal' | 'repo' | 'plugin' | 'synced'

// one scheduled task whose prompt names the skill
export type Use = {
  // the task's name in the app, e.g. "draw the puppy every day"
  task: string
  // short time words, e.g. "9:00 daily"; empty when the app's schedule file was not found
  when: string
}

export type Skill = {
  // <where>:<group>:<name>, unique in the list
  id: string
  name: string
  description: string
  where: Where
  // the repo or the plugin it comes from; empty for personal
  group: string
  // the folder holding SKILL.md, matched against what a schedule's prompt names
  dir: string
  uses: Use[]
}

// a slash command a mod adds in code ($.command.register), not a SKILL.md: /console, /todo
export type Mod = {
  // mod:<plugin>:<name>, unique in the list
  id: string
  // what you type, without the slash
  name: string
  description: string
  // the plugin that added it, without @<marketplace>; empty when the app does not say
  plugin: string
}

export type View = {
  skills: Skill[]
  mods: Mod[]
  // the ids unfolded to their whole description
  openIds: string[]
  // the claude.ai skills are unfolded below the cards
  isShowingSynced: boolean
  // ms since the epoch of the last look; null before the first
  at: number | null
  // what could not be read
  notes: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'puppy-skills': { view: View }
  }
}
