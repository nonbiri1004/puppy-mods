import { expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import { typing0 as blockFrame } from '../hooks/puppy-blocks'
import type { BlockRun } from '../hooks/puppy-blocks'

import type { View } from '../types'

const PANE = {
  plugin: 'puppy-skills',
  component: 'Pane',
  requestId: 'puppy-skills',
  props: {
    title: 'kit',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

// FoundElement.children are drawn trees, not FoundElements: { type, props?, children? }, strings as leaves
type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isDrawn = (c: unknown): c is Drawn => typeof c === 'object' && c !== null && typeof (c as { type?: unknown }).type === 'string'
const drawnIn = (children: unknown[] | undefined): Drawn[] => (children ?? []).filter(isDrawn)
const hexOr = (v: unknown): string | null => (typeof v === 'string' ? v : null)
// the puppy Box's rows: each row a Text, each run read back as [text, fg, bg] like puppy-blocks.ts
const rowsOf = (puppy: FoundElement | undefined): Drawn[] => drawnIn(puppy?.children)
const textIn = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(textIn).join('')
const drawnRuns = (puppy: FoundElement | undefined): BlockRun[][] =>
  rowsOf(puppy).map(row => drawnIn(row.children).map((run): BlockRun => [
    (run.children ?? []).filter((c): c is string => typeof c === 'string').join(''),
    hexOr(run.props?.color),
    hexOr(run.props?.backgroundColor),
  ]))

const VIEW: View = {
  skills: [
    { id: 'personal::nap', name: 'nap', description: 'Finds a sunny spot. Then naps a long time.', where: 'personal', group: '', dir: '', uses: [] },
    {
      id: 'repo:garden:dig-hole', name: 'dig-hole', description: 'Digs one hole. Never two.', where: 'repo', group: 'garden', dir: '',
      uses: [{ task: 'morning dig', when: '9:00 daily' }],
    },
  ],
  mods: [],
  openIds: [],
  isShowingSynced: false,
  at: Date.parse('2026-10-27T10:00:00Z'),
  notes: [],
}

test('the pane: a card per place, the first sentence, a clock on the scheduled one', async ($, on) => {
  on('state.get', () => ({ value: { value: VIEW, version: 1 } }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /2 skills/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'card-personal' })).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'card-repo-garden' })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /only in garden/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /⏰ 9:00/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Never two/ })).toBeFalsy()
    if (surface !== 'terminal') {
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('the puppy typing at its laptop')
    }
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')).not.toContain('ᴥ')
    await ui.unmount()
  }
})

test('unfolded: the whole description and the schedule', async ($, on) => {
  on('state.get', () => ({ value: { value: { ...VIEW, openIds: ['repo:garden:dig-hole'] }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Never two/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /morning dig · 9:00 daily/ }))?.text).toBeTruthy()
  // read only: nothing to run
  expect(await ui.find({ type: 'Button', text: /run/ })).toBeFalsy()
  await ui.unmount()
})

test('a long first sentence is cut, not the whole paragraph', async ($, on) => {
  const long = { ...VIEW.skills[0], id: 'personal::docs', name: 'docs', description: `docs (${'word '.repeat(80)}) and more` }
  on('state.get', () => ({ value: { value: { ...VIEW, skills: [long] }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = (await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => t.startsWith('docs'))
  expect(row?.endsWith('…')).toBe(true)
  expect((row?.length ?? 0) < 130).toBe(true)
  await ui.unmount()
})

const SYNCED = { id: 'synced::pdf', name: 'pdf', description: 'Reads PDFs.', where: 'synced', group: '', dir: '', uses: [] } as const

test('claude.ai skills stay folded below yours, and are not counted as yours', async ($, on) => {
  on('state.get', () => ({ value: { value: { ...VIEW, skills: [...VIEW.skills, SYNCED] }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /2 skills/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^yours$/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Button', key: 'show-synced' }))?.text).toContain('from claude.ai 1')
  expect(await ui.find({ type: 'Box', key: 'card-synced' })).toBeFalsy()
  await ui.unmount()
})

test('unfolded: the claude.ai card', async ($, on) => {
  on('state.get', () => ({ value: { value: { ...VIEW, skills: [SYNCED], isShowingSynced: true }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Box', key: 'card-synced' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /no skills of your own yet/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('terminal: the full still puppy is above the header only when tall and wide enough', async ($, on) => {
  on('state.get', () => ({ value: { value: VIEW, version: 1 } }))
  for (const [bodyRows, bodyColumns] of [[40, 80], [26, 80], [40, 34], [25, 80], [20, 80], [40, 30]] as const) {
    const ui = await $.ui.mount({
      ...PANE, surface: 'terminal',
      props: { ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } },
    })
    const texts = await ui.findAll({ type: 'Text' })
    const puppy = await ui.find({ type: 'Box', key: 'puppy' })
    if (bodyRows >= 26 && bodyColumns >= 34) {
      expect(rowsOf(puppy).map(row => row.type)).toEqual(Array(13).fill('Text'))
      // a blank row is a space: an empty Text takes no row, so the puppy would shrink and the pane jump
      expect(rowsOf(puppy).filter(row => textIn(row) === '')).toHaveLength(0)
      expect(drawnRuns(puppy)).toEqual(blockFrame)
      expect(texts[0]?.text).toBe(blockFrame[0]?.map(([text]) => text).join('') || ' ')
      expect(texts.findIndex(t => t.text.includes('2 skills'))).toBeGreaterThan(12)
    } else {
      // too short, or so narrow each row would wrap: no puppy at all
      expect(puppy).toBeFalsy()
      expect(texts[0]?.text).toContain('2 skills')
    }
    expect(await ui.find({ type: 'Svg' })).toBeFalsy()
    expect(texts.map(t => t.text).join(' ')).not.toContain('ᴥ')
    await ui.unmount()
  }
})

test('loading is plain text on every surface', async ($, on) => {
  on('state.get', () => ({ value: { value: { ...VIEW, at: null }, version: 1 } }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['loading…'])
    await ui.unmount()
  }
})

const MODS: View['mods'] = [
  { id: 'mod:puppy-console:console', name: 'console', description: 'Open the console: your conversations, then the pipelines', plugin: 'puppy-console' },
  { id: 'mod:puppy-todo:todo', name: 'todo', description: 'your own to-do list. nothing else writes to it', plugin: 'puppy-todo' },
]

test('mods: one card after the skills, a row per command, counted in the first row', async ($, on) => {
  on('state.get', () => ({ value: { value: { ...VIEW, mods: MODS, openIds: ['mod:puppy-todo:todo'] }, version: 1 } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /2 skills · 2 mods · looked/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'card-mods' })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /where the mod is on · 2/ }))?.text).toBeTruthy()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.some(t => t.startsWith('/console Open the console'))).toBe(true)
    // unfolded: the whole description and where it comes from
    expect(texts).toContain('from puppy-todo')
    expect(texts).not.toContain('from puppy-console')
    // after the skills' cards
    expect(texts.findIndex(t => t.startsWith('/console'))).toBeGreaterThan(texts.findIndex(t => t.startsWith('dig-hole')))
    await ui.unmount()
  }
})

test('no mods: no card, and the first row says only skills', async ($, on) => {
  on('state.get', () => ({ value: { value: VIEW, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Box', key: 'card-mods' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /mods/ }))).toBeFalsy()
  await ui.unmount()
})

test('a view stored before mods existed still draws', async ($, on) => {
  const { mods: _, ...old } = VIEW
  on('state.get', () => ({ value: { value: old as View, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /2 skills · looked/ }))?.text).toBeTruthy()
  await ui.unmount()
})
