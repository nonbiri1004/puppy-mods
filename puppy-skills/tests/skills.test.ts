import { expect, test } from 'claude-code/testing'

import { cardsOf, cut, firstSentence, isNamedIn, modsOf, parseSkill, usesOf, whenOf } from '../hooks/skills'

test('frontmatter: name and description, quoted or folded', () => {
  expect(parseSkill('---\nname: nap-time\ndescription: "Finds a sunny spot. Then naps."\n---\nbody')).toEqual({
    name: 'nap-time',
    description: 'Finds a sunny spot. Then naps.',
  })
  expect(parseSkill('---\nname: walk\ndescription: >\n  Goes out.\n  Comes back.\n---\n')?.description).toBe('Goes out. Comes back.')
  expect(parseSkill('no frontmatter')).toBe(null)
})

test('the first sentence, english or chinese', () => {
  expect(firstSentence('Finds a sunny spot. Then naps.')).toBe('Finds a sunny spot.')
  expect(firstSentence('找個曬太陽的地方。然後睡覺。')).toBe('找個曬太陽的地方。')
  expect(firstSentence('v1.2 is out')).toBe('v1.2 is out')
})

test('schedule words', () => {
  expect(whenOf({ cronExpression: '0 9 * * *' })).toBe('9:00 daily')
  expect(whenOf({ cronExpression: '30 7 * * 1' })).toBe('7:30 mon')
  expect(whenOf({ cronExpression: '*/5 * * * *' })).toBe('*/5 * * * *')
})

test('a prompt names a skill by its folder, a /command, or a dashed name; not a bare common word', () => {
  const nap = { name: 'nap-time', dir: '/x/.claude/skills/nap-time' }
  expect(isNamedIn('read ~/repo/.claude/skills/nap-time/SKILL.md and do it', nap)).toBe(true)
  expect(isNamedIn('run nap-time today', nap)).toBe(true)
  expect(isNamedIn('run nap-timer', nap)).toBe(false)
  const pdf = { name: 'pdf', dir: '/x/skills/pdf' }
  expect(isNamedIn('make a pdf of it', pdf)).toBe(false)
  expect(isNamedIn('use /pdf on it', pdf)).toBe(true)
  expect(usesOf([{ name: 'morning nap', prompt: 'do nap-time', when: '9:00 daily' }], nap)).toEqual([
    { task: 'morning nap', when: '9:00 daily' },
  ])
})

test('cards: personal first, then repos, then plugins', () => {
  const s = (where: 'personal' | 'repo' | 'plugin', group: string, name: string) => ({
    id: `${where}:${group}:${name}`, name, description: '', where, group, dir: '', uses: [],
  })
  const cards = cardsOf([s('plugin', 'toys', 'ball'), s('repo', 'garden', 'dig'), s('personal', '', 'nap')])
  expect(cards.map(c => `${c.title}|${c.scope}`)).toEqual(['yours|anywhere', 'garden|only in garden', 'toys|plugin'])
})

test('cut: by columns, a CJK character is two', () => {
  expect(cut('short', 10)).toBe('short')
  expect(cut('a long sentence here', 10)).toBe('a long se…')
  expect(cut('白白白白白白', 7)).toBe('白白白…')
})

test('mods: a plugin\'s bare command that is not a skill, without its marketplace', () => {
  const c = (name: string, source: 'builtin' | 'plugin' | 'user' | 'mcp', plugin?: string) => ({ name, description: `${name}.`, source, plugin })
  const mods = modsOf(
    [
      c('todo', 'plugin', 'puppy-todo@puppy-mods'),
      c('compact', 'builtin'),
      c('console', 'plugin', 'puppy-console'),
      // a plugin's skill or markdown command reads <plugin>:<name>
      c('toys:ball', 'plugin', 'toys'),
      // a skill found on disk is already a row above
      c('dig-hole', 'plugin', 'garden'),
      c('my-skills', 'plugin', 'puppy-skills'),
      c('lint', 'mcp'),
      c('ghost', 'plugin'),
    ],
    new Set(['dig-hole']),
    ['my-skills'],
  )
  expect(mods.map(m => `${m.name}|${m.plugin}`)).toEqual(['console|puppy-console', 'ghost|', 'todo|puppy-todo'])
  expect(mods[0]?.id).toBe('mod:puppy-console:console')
})
