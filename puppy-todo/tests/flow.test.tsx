import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { REFRESH_MS } from '../hooks/register'

const DIR = '/home/me/.claude/todo/items'
const T = Date.parse('2026-10-27T10:00:00Z')
const PANE = {
  plugin: 'puppy-todo',
  component: 'Pane',
  requestId: 'puppy-todo',
  props: { title: 'todo', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(textOf).join('')

const file = (id: string, over: object = {}) => `${JSON.stringify({ schemaVersion: 2, id, text: id, project: 'p', kind: 'todo', status: 'open', createdAt: '2026-10-27T09:00:00Z', ...over })}\n`

// the items folder in memory; reads and writes can be made to fail or to wait
function world(on: On) {
  const w = {
    files: {} as Record<string, string>,
    unreadable: new Set<string>(),
    writeError: null as string | null,
    writes: 0,
    panes: true,
    // a read held until release() is called
    hold: null as null | { path: string; release: () => void },
  }
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: T })
  on('fs.exists', (_, e) => ({ value: e.path === DIR }))
  on('fs.list', () => ({ value: Object.keys(w.files).map(n => ({ name: n, kind: 'file', size: 1, mtimeMs: T, isLink: false })) as never }))
  on('fs.read', async (_, e) => {
    const name = e.path.slice(DIR.length + 1)
    if (w.unreadable.has(name)) throw new Error('EACCES: permission denied')
    const text = w.files[name]
    if (w.hold?.path === name) await new Promise<void>(r => { w.hold!.release = r })
    if (text == null) throw new Error('ENOENT: missing')
    return { value: text }
  })
  on('fs.write', (_, e) => {
    if (w.writeError) return { deny: w.writeError }
    w.writes++
    w.files[e.path.slice(DIR.length + 1)] = e.text
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: w.panes ? [{ id: 'puppy-todo', title: 'todo', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('session.cwd', () => ({ value: '/x/home' }))
  on('command.register', () => ({ value: { command: 'todo' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { w, clock }
}

const open = async ($: Parameters<Parameters<typeof test>[1]>[0], surface: 'desktop' | 'terminal' | 'mobile' = 'desktop') => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run({ command: 'todo', args: '' } as never)
  return $.ui.mount({ ...PANE, surface })
}
const texts = async (ui: { findAll: (q: object) => Promise<unknown[]> }) => (await ui.findAll({ type: 'Text' })).map(textOf)
const parsed = (w: { files: Record<string, string> }, name: string) => JSON.parse(w.files[name]!)

test('a file that can\'t be read this time keeps its last read and is counted, never silently gone', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('a', { text: 'call the vet' }) }
  const ui = await open($)
  expect((await texts(ui)).some(t => t === 'call the vet')).toBe(true)
  w.unreadable.add('a.json')
  await ui.press({ key: 'refresh' })
  const now = await texts(ui)
  expect(now.some(t => t === 'call the vet')).toBe(true)
  expect(now.some(t => t.startsWith('could not read 1 file this time'))).toBe(true)
})

test('a file whose id is not its file name is left out and named', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('b') }
  const ui = await open($)
  expect((await texts(ui)).some(t => t.includes('left out a.json'))).toBe(true)
  expect(await ui.find({ key: 'tick-b' })).toBeFalsy()
})

test('a slow read that started before a tick can\'t put the tick back', async ($, on) => {
  const { w, clock } = world(on)
  w.files = { 'a.json': file('a') }
  const ui = await open($)
  // a refresh reads a.json slowly; meanwhile the tick writes done
  w.hold = { path: 'a.json', release: () => undefined }
  const slow = ui.press({ key: 'refresh' })
  await clock.settle()
  const hold = w.hold
  w.hold = null
  await ui.press({ key: 'tick-a' })
  hold.release()
  await slow
  await clock.settle()
  expect(parsed(w, 'a.json').status).toBe('done')
  expect(await ui.find({ key: 'tick-a' })).toBeFalsy()
})

test('a write that fails says so in red; the next one that works clears it', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('a') }
  const ui = await open($)
  w.writeError = 'EROFS: read-only file system'
  await ui.press({ key: 'tick-a' })
  expect((await texts(ui)).some(t => t.startsWith('could not save') && t.includes('EROFS'))).toBe(true)
  expect(await ui.find({ key: 'tick-a' })).toBeTruthy()
  w.writeError = null
  await ui.press({ key: 'tick-a' })
  expect((await texts(ui)).some(t => t.startsWith('could not save'))).toBe(false)
})

test('edit: ✎ opens a field with the words; save writes them; another window\'s change is not overwritten', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('a', { text: 'call teh vet' }) }
  const ui = await open($)
  await ui.press({ key: 'edit-a' })
  expect((await ui.find({ type: 'Input', key: 'edit-a' }))?.props.value).toBe('call teh vet')
  await ui.input({ key: 'edit-a', text: 'call the vet' })
  expect(parsed(w, 'a.json')).toMatchObject({ id: 'a', text: 'call the vet', createdAt: '2026-10-27T09:00:00Z' })
  expect(await ui.find({ type: 'Input', key: 'edit-a' })).toBeFalsy()

  await ui.press({ key: 'edit-a' })
  w.files['a.json'] = file('a', { text: 'call the vet at 3' })
  await ui.input({ key: 'edit-a', text: 'call the vet today' })
  expect(parsed(w, 'a.json').text).toBe('call the vet at 3')
  expect((await texts(ui)).some(t => t.startsWith('changed in another window'))).toBe(true)
  await ui.press({ key: 'cancel-a' })
  expect(await ui.find({ type: 'Input', key: 'edit-a' })).toBeFalsy()
})

test('delete: an undo line brings it back; the folded deleted list restores older ones, ten at a time', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('a', { text: 'water the plants' }) }
  for (let n = 0; n < 12; n++) w.files[`x${n}.json`] = file(`x${n}`, { deletedAt: `2026-10-26T0${n % 10}:00:00Z`, deletedBy: 'person' })
  const ui = await open($)
  await ui.press({ key: 'del-a' })
  expect((await texts(ui)).some(t => t === 'deleted “water the plants”')).toBe(true)
  await ui.press({ key: 'undo-delete' })
  expect(parsed(w, 'a.json').deletedAt).toBe(undefined)
  expect(await ui.find({ key: 'undo-delete' })).toBeFalsy()
  expect(await ui.find({ key: 'tick-a' })).toBeTruthy()

  expect((await ui.find({ key: 'show-deleted' }))?.text).toBe('▸ deleted 12')
  await ui.press({ key: 'show-deleted' })
  expect(await ui.findAll({ type: 'Button', text: '↺' })).toHaveLength(10)
  expect((await ui.find({ key: 'more-deleted' }))?.text).toBe('▸ 2 more')
  await ui.press({ key: 'more-deleted' })
  expect(await ui.findAll({ type: 'Button', text: '↺' })).toHaveLength(12)
  await ui.press({ key: 'restore-x3' })
  expect(parsed(w, 'x3.json').deletedAt).toBe(undefined)
})

test('pin: ☆ moves an item to the top as ★; pressing ★ puts it back', async ($, on) => {
  const { w } = world(on)
  w.files = { 'a.json': file('a', { createdAt: '2026-10-27T08:00:00Z' }), 'b.json': file('b', { createdAt: '2026-10-27T09:00:00Z' }) }
  const ui = await open($)
  const order = async () => (await ui.findAll({ type: 'Button', text: '○' })).map(b => (b as { key?: string }).key)
  expect(await order()).toEqual(['tick-a', 'tick-b'])
  await ui.press({ key: 'pin-b' })
  expect(await order()).toEqual(['tick-b', 'tick-a'])
  expect((await ui.find({ key: 'pin-b' }))?.text).toBe('★')
  await ui.press({ key: 'pin-b' })
  expect(await order()).toEqual(['tick-a', 'tick-b'])
})

test('while the pane is up the list is read every few seconds; closed, the reads stop', async ($, on) => {
  const { w, clock } = world(on)
  w.files = { 'a.json': file('a') }
  const ui = await open($)
  w.files['b.json'] = file('b', { text: 'from another window' })
  await clock.advance(REFRESH_MS)
  await clock.settle()
  expect((await texts(ui)).some(t => t === 'from another window')).toBe(true)
  w.panes = false
  await clock.advance(REFRESH_MS)
  await clock.settle()
  w.files['c.json'] = file('c', { text: 'after close' })
  await clock.advance(REFRESH_MS * 3)
  await clock.settle()
  expect((await texts(ui)).some(t => t === 'after close')).toBe(false)
})
