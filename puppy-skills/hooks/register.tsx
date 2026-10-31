import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register } from 'claude-code'

import type { Mod, Skill, View, Where } from '../types'
import { stillBlocks, typingPuppy } from './draw'
import { bodyOf, cardsOf, cut, firstSentence, modsOf, parseSkill, usesOf, whenOf } from './skills'
import type { Card, Task } from './skills'

const PANE = 'puppy-skills'
// /my-kit since it lists mods too; /my-skills, its old name, still opens it (/skills is the app's own)
const OLD_COMMAND = 'my-skills'
const PUPPY_MIN_ROWS = 26
// the block frame is 34 columns; narrower, each row wraps and breaks the drawing
const PUPPY_COLUMNS = 34
// how long a first sentence may run (Latin columns; a CJK character is two) where rows wrap
const SENTENCE = 110

const EMPTY: View = { skills: [], mods: [], openIds: [], isShowingSynced: false, at: null, notes: [] }
const view = atom({ plugin: 'puppy-skills', key: 'view' } as const, EMPTY)

// how deep under ~/dev a repo's .claude folder may be (~/dev/Projects/<owner>/<repo>/.claude is 4)
const DEPTH = 5

async function listOr($: EngineInterface, dir: string): Promise<FsEntry[]> {
  return $.fs.list(dir).catch(() => [])
}

// a folder, or a link that may lead to one
const isDirLike = (f: FsEntry) => f.kind === 'dir' || f.isLink

type Found = { dir: string; text: string }

// every <dir>/**/SKILL.md, down to `depth` folders
async function findSkillFiles($: EngineInterface, dir: string, depth: number): Promise<Found[]> {
  const entries = await listOr($, dir)
  const here = entries.find(f => f.name === 'SKILL.md' && f.kind !== 'dir')
  if (here) {
    const text = await $.fs.read(`${dir}/SKILL.md`).catch(() => null)

    return text === null ? [] : [{ dir, text }]
  }
  if (depth === 0) {
    return []
  }
  const below = await Promise.all(
    entries.filter(f => isDirLike(f) && !f.name.startsWith('.')).map(f => findSkillFiles($, `${dir}/${f.name}`, depth - 1)),
  )

  return below.flat()
}

// every <repo>/.claude/skills under ~/dev, with the repo's folder name
async function findRepoSkillDirs($: EngineInterface, dir: string, depth: number): Promise<{ repo: string; dir: string }[]> {
  const entries = await listOr($, dir)
  const found: { repo: string; dir: string }[] = []
  if (entries.some(f => f.name === '.claude' && isDirLike(f)) && (await $.fs.exists(`${dir}/.claude/skills`))) {
    found.push({ repo: dir.split('/').pop() ?? dir, dir: `${dir}/.claude/skills` })
  }
  if (depth > 0) {
    const skip = new Set(['node_modules', 'Library'])
    const below = await Promise.all(
      entries
        .filter(f => f.kind === 'dir' && !f.name.startsWith('.') && !skip.has(f.name))
        .map(f => findRepoSkillDirs($, `${dir}/${f.name}`, depth - 1)),
    )
    found.push(...below.flat())
  }

  return found
}

function toSkill(f: Found, where: Where, group: string): Omit<Skill, 'uses'> | null {
  const parsed = parseSkill(f.text)

  return parsed ? { ...parsed, id: `${where}:${group}:${parsed.name}`, where, group, dir: f.dir } : null
}

async function pluginSkills($: EngineInterface, home: string): Promise<Omit<Skill, 'uses'>[]> {
  const text = await $.fs.read(`${home}/.claude/plugins/installed_plugins.json`).catch(() => null)
  if (text === null) {
    return []
  }
  const installed = (JSON.parse(text) as { plugins?: Record<string, { installPath?: string }[]> }).plugins ?? {}
  const got = await Promise.all(
    Object.entries(installed).map(async ([id, copies]) => {
      const path = copies[0]?.installPath
      if (!path) {
        return []
      }
      const files = await findSkillFiles($, `${path}/skills`, 2)

      return files.map(f => toSkill(f, 'plugin', id.split('@')[0])).filter(s => s !== null)
    }),
  )

  return got.flat()
}

type AppTask = { id: string; displayName?: string; cronExpression?: string; fireAt?: number; enabled?: boolean }

// the desktop app keeps each task's time in scheduled-tasks.json files of its own (not in the
// task's SKILL.md): ~/Library/Application Support/Claude/claude-code-sessions/<a>/<b>/
async function appTasks($: EngineInterface, home: string): Promise<Map<string, AppTask>> {
  const root = `${home}/Library/Application Support/Claude/claude-code-sessions`
  const tasks = new Map<string, AppTask>()
  for (const a of await listOr($, root)) {
    for (const b of await listOr($, `${root}/${a.name}`)) {
      const text = await $.fs.read(`${root}/${a.name}/${b.name}/scheduled-tasks.json`).catch(() => null)
      const list = text === null ? [] : ((JSON.parse(text) as { scheduledTasks?: AppTask[] }).scheduledTasks ?? [])
      for (const t of list) {
        tasks.set(t.id, t)
      }
    }
  }

  return tasks
}

// each ~/.claude/scheduled-tasks/<id>/SKILL.md is one task's prompt; a task the app turned off is left out
async function scheduledTasks($: EngineInterface, home: string): Promise<Task[]> {
  const dir = `${home}/.claude/scheduled-tasks`
  const app = await appTasks($, home).catch(() => new Map<string, AppTask>())
  const got = await Promise.all(
    (await listOr($, dir))
      .filter(isDirLike)
      .map(async f => {
        const meta = app.get(f.name)
        if (meta?.enabled === false) {
          return null
        }
        const text = await $.fs.read(`${dir}/${f.name}/SKILL.md`).catch(() => null)
        if (text === null) {
          return null
        }

        return { name: meta?.displayName ?? parseSkill(text)?.name ?? f.name, prompt: bodyOf(text), when: meta ? whenOf(meta) : '' }
      }),
  )

  return got.filter(t => t !== null)
}

// looks again: when the pane opens and on refresh. it only reads files and the command list; nothing is run
let loads = 0

async function load($: EngineInterface): Promise<void> {
  const mine = ++loads
  const home = (await $.env.get('HOME')) ?? ''
  const notes: string[] = []
  const tried = async <T,>(what: string, work: Promise<T[]>): Promise<T[]> =>
    work.catch(() => {
      notes.push(`could not read ${what}`)

      return []
    })

  const [personal, repos, plugins, tasks, commands] = await Promise.all([
    tried('~/.claude/skills', findSkillFiles($, `${home}/.claude/skills`, 3).then(fs =>
        // skills/synced/ is what the app copies from claude.ai: Anthropic's, not ones you wrote
        fs.map(f => toSkill(f, f.dir.includes('/.claude/skills/synced/') ? 'synced' : 'personal', '')),
      )),
    tried(
      '~/dev',
      findRepoSkillDirs($, `${home}/dev`, DEPTH).then(async dirs =>
        (await Promise.all(dirs.map(d => findSkillFiles($, d.dir, 2).then(fs => fs.map(f => toSkill(f, 'repo', d.repo)))))).flat(),
      ),
    ),
    tried('plugins', pluginSkills($, home)),
    tried('scheduled tasks', scheduledTasks($, home)),
    tried('commands', $.command.list()),
  ])
  const seen = new Set<string>()
  const skills: Skill[] = []
  for (const s of [...personal, ...repos, ...plugins]) {
    // the same skill found twice (a link, two copies) shows once
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      skills.push({ ...s, uses: usesOf(tasks, s) })
    }
  }
  const mods = modsOf(commands, new Set(skills.map(s => s.name)), [OLD_COMMAND])
  const at = await $.clock.now()
  if (mine !== loads) {
    return
  }
  await update($, view, was => ({ ...EMPTY, ...was, skills, mods, at, notes }))
}

async function openKit($: EngineInterface): Promise<{ text: string }> {
  await $.ui.open({ id: PANE, title: 'kit' })
  await load($)

  return { text: 'your kit is open.' }
}

function clock(at: number): string {
  const d = new Date(at)

  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'my-kit', description: 'see which skills and mods you have and where each one works' })
    await $.command.register({ name: OLD_COMMAND, description: 'the old name of /my-kit' })

    return next(e)
  })

  on('command.run', { command: 'my-kit' }, openKit)
  on('command.run', { command: 'my-skills' }, openKit)

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const v: View = { ...EMPTY, ...(await read($, view)) }
    if (v.at === null) {
      return <Text dimColor>loading…</Text>
    }
    const hasSvg = e.surface !== 'terminal' && 'Svg' in ui
    // the terminal: one line per skill, cut to the card (the pane less border and padding).
    // elsewhere a row may wrap, but a long first sentence still stops at SENTENCE columns
    const cols = e.surface === 'terminal' ? Math.max(10, e.props.bodyColumns - 4) : SENTENCE
    const toggle = (id: string) =>
      update($, view, was => ({
        ...EMPTY,
        ...was,
        openIds: was.openIds.includes(id) ? was.openIds.filter(i => i !== id) : [...was.openIds, id],
      }))

    // your own skills (yours, a repo's, a plugin's) are cards, then the mods' commands;
    // anthropic's skills from claude.ai stay folded below
    const mine = v.skills.filter(s => s.where !== 'synced')
    const synced = v.skills.filter(s => s.where === 'synced')
    // one row: ▸, the name and its first sentence, a fact on the right; unfolded, the whole description and more lines
    const drawRow = (id: string, name: string, description: string, right: string, more: string[]) => {
      const isOpen = v.openIds.includes(id)

      return (
        <Box key={`s-${id}`} flexDirection="column">
          <Box flexDirection="row" alignItems="flex-start" gap={1}>
            <Box width={3} flexShrink={0}>
              <Button key={`open-${id}`} label={isOpen ? '▾' : '▸'} plain dimColor onPress={() => toggle(id)} />
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text>
                {name}
                <Text dimColor> {cut(firstSentence(description), Math.max(8, cols - name.length - 5 - right.length))}</Text>
              </Text>
            </Box>
            {right ? (
              <Box flexShrink={0}>
                <Text dimColor>{right}</Text>
              </Box>
            ) : null}
          </Box>
          {isOpen ? (
            <Box flexDirection="column" paddingLeft={4}>
              <Text dimColor>{description || 'no description.'}</Text>
              {more.map(line => (
                <Text key={`more-${id}-${line}`} dimColor>
                  {line}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      )
    }
    const drawCard = (key: string, title: string, scope: string, rows: JSX.Element[]) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text weight="semibold">{title}</Text>
          <Text dimColor>
            {scope} · {rows.length}
          </Text>
        </Box>
        {rows}
      </Box>
    )
    const drawSkill = (s: Skill) => {
      const time = s.uses.map(u => u.when).find(w => w !== '') ?? ''
      const right = s.uses.length > 0 ? `⏰${time ? ` ${time.split(' ')[0]}` : ''}` : ''

      return drawRow(s.id, s.name, s.description, right, s.uses.map(u => `⏰ ${u.task}${u.when ? ` · ${u.when}` : ''}`))
    }
    const drawSkillCard = (card: Card) => drawCard(card.key, card.title, card.scope, card.skills.map(drawSkill))
    const drawMod = (m: Mod) => drawRow(m.id, `/${m.name}`, m.description, '', m.plugin ? [`from ${m.plugin}`] : [])

    return (
      <Box flexDirection="column" gap={1}>
        {!hasSvg && e.props.scroll.bodyRows >= PUPPY_MIN_ROWS && e.props.bodyColumns >= PUPPY_COLUMNS && (
          <Box key="puppy" flexDirection="column">
            {stillBlocks().map((runs, i) => (
              <Text key={`puppy-${i}`}>
                {/* a blank row is one space: an empty Text takes no row, and the puppy must keep all 13 */}
                {runs.length ? runs.map(([text, fg, bg]) => <Text color={fg ?? undefined} backgroundColor={bg ?? undefined}>{text}</Text>) : ' '}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box flexDirection="row" alignItems="center" gap={1}>
            {hasSvg && 'Svg' in ui ? (
              <ui.Svg source={typingPuppy()} alt="the puppy typing at its laptop" width={68} height={52} isInteractive />
            ) : null}
            <Text dimColor>
              {mine.length} skills{v.mods.length > 0 ? ` · ${v.mods.length} mods` : ''} · looked {clock(v.at)}
            </Text>
          </Box>
          <Button key="refresh" label="refresh" dimColor onPress={() => load($)} />
        </Box>

        {cardsOf(mine).map(drawSkillCard)}
        {v.mods.length > 0 ? drawCard('card-mods', 'mods', 'where the mod is on', v.mods.map(drawMod)) : null}

        {synced.length > 0 && (
          <Box flexDirection="column" gap="xs">
            <Button
              key="show-synced"
              label={`${v.isShowingSynced ? '▾' : '▸'} from claude.ai ${synced.length}`}
              dimColor
              onPress={() => update($, view, was => ({ ...EMPTY, ...was, isShowingSynced: !was.isShowingSynced }))}
            />
            {v.isShowingSynced ? cardsOf(synced).map(drawSkillCard) : null}
          </Box>
        )}

        {mine.length === 0 ? <Text dimColor>no skills of your own yet. the puppy naps.</Text> : null}
        {v.notes.length > 0 ? <Text color="error">{v.notes.join(' · ')}</Text> : null}
      </Box>
    )
  })
}
