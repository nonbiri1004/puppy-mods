import type { CommandInfo } from 'claude-code'

import type { Mod, Skill, Use, Where } from '../types'

// name and description from a SKILL.md's frontmatter; null when it has no name
export function parseSkill(text: string): { name: string; description: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) {
    return null
  }
  const fields: Record<string, string> = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const f = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i])
    if (!f) {
      continue
    }
    let value = f[2].trim()
    // a folded block (>, |) or a value that goes on in indented lines
    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') {
      const more: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        more.push(lines[++i].trim())
      }
      value = more.join(' ')
    }
    fields[f[1]] = value.replace(/^(['"])([\s\S]*)\1$/, '$2')
  }
  if (!fields.name) {
    return null
  }

  return { name: fields.name, description: fields.description ?? '' }
}

// the first sentence: up to the first . ! ? 。 that ends a sentence
export function firstSentence(text: string): string {
  const m = /^[\s\S]*?(?:[.!?](?=\s|$)|[。！？])/.exec(text.trim())

  return (m ? m[0] : text).trim()
}

// cut to n columns, with …: a CJK character takes two
const isWide = (c: string) => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(c)
export function cut(s: string, n: number): string {
  const chars = [...s]
  const width = (cs: string[]) => cs.reduce((w, c) => w + (isWide(c) ? 2 : 1), 0)
  if (width(chars) <= n) {
    return s
  }
  let used = 0
  let i = 0
  while (i < chars.length && used + (isWide(chars[i]) ? 2 : 1) <= n - 1) {
    used += isWide(chars[i]) ? 2 : 1
    i++
  }

  return `${chars.slice(0, i).join('').trimEnd()}…`
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// short words for a schedule: "9:00 daily", "9:00 mon", "once oct 3 14:50"; the cron itself when unsure
export function whenOf(task: { cronExpression?: string; fireAt?: number }): string {
  const c = task.cronExpression?.trim()
  if (c) {
    const [min, hour, dom, mon, dow] = c.split(/\s+/)
    const isPlain = /^\d+$/.test(min ?? '') && /^\d+$/.test(hour ?? '') && dom === '*' && mon === '*'
    if (isPlain) {
      const time = `${Number(hour)}:${min.padStart(2, '0')}`
      if (dow === '*') {
        return `${time} daily`
      }
      if (/^[0-7](,[0-7])*$/.test(dow ?? '')) {
        return `${time} ${dow
          .split(',')
          .map(d => DAYS[Number(d) % 7])
          .join(',')}`
      }
    }

    return c
  }
  if (typeof task.fireAt === 'number') {
    const d = new Date(task.fireAt)
    const month = d.toLocaleString('en', { month: 'short' }).toLowerCase()

    return `once ${month} ${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return ''
}

// the prompt's words after its frontmatter
export function bodyOf(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

// a prompt uses a skill when it names the skill's folder (…/skills/<name>/), calls it (/<name>),
// or says a name with a dash in it as a whole word. a one-word name ("pdf") alone is too common
export function isNamedIn(prompt: string, skill: { name: string; dir: string }): boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const folder = skill.dir.split('/').pop() ?? skill.name
  if (new RegExp(`skills/${esc(folder)}(/|\\b)`).test(prompt)) {
    return true
  }
  if (new RegExp(`(^|\\s)/${esc(skill.name)}\\b`).test(prompt)) {
    return true
  }

  return skill.name.includes('-') && new RegExp(`(^|[^\\w-])${esc(skill.name)}($|[^\\w-])`).test(prompt)
}

export type Task = { name: string; prompt: string; when: string }

export function usesOf(tasks: Task[], skill: { name: string; dir: string }): Use[] {
  return tasks.filter(t => isNamedIn(t.prompt, skill)).map(t => ({ task: t.name, when: t.when }))
}

// the cards in order: personal, then each repo, then each plugin, names a→z inside
export type Card = { key: string; title: string; scope: string; skills: Skill[] }

const ORDER: Where[] = ['personal', 'repo', 'plugin', 'synced']

export function cardsOf(skills: Skill[]): Card[] {
  const cards = new Map<string, Card>()
  const sorted = [...skills].sort(
    (a, b) =>
      ORDER.indexOf(a.where) - ORDER.indexOf(b.where) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
  )
  for (const s of sorted) {
    const key = `card-${s.where}${s.group ? `-${s.group}` : ''}`
    if (!cards.has(key)) {
      const title = s.where === 'personal' ? 'yours' : s.where === 'synced' ? 'from claude.ai' : s.group
      const scope =
        s.where === 'personal' || s.where === 'synced' ? 'anywhere' : s.where === 'repo' ? `only in ${s.group}` : 'plugin'
      cards.set(key, { key, title, scope, skills: [] })
    }
    cards.get(key)?.skills.push(s)
  }

  return [...cards.values()]
}

// the commands a mod adds in code: from a plugin, a bare name (a plugin's own skill or markdown
// command reads <plugin>:<name>), and not a skill found on disk. `hidden` are left out (an alias)
export function modsOf(commands: CommandInfo[], skillNames: Set<string>, hidden: string[] = []): Mod[] {
  return commands
    .filter(c => c.source === 'plugin' && !c.name.includes(':') && !skillNames.has(c.name) && !hidden.includes(c.name))
    .map(c => {
      const plugin = c.plugin?.split('@')[0] ?? ''

      return { id: `mod:${plugin}:${c.name}`, name: c.name, description: c.description, plugin }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
