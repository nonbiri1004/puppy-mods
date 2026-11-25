import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Item, View } from '../types'
import { mascot, stillBlocks } from './draw'
import { deleteItem, editText, listOf, newId, parseItem, pin, projectOf, reopen, restoreItem, tick, unpin } from './todo'

const PANE = 'puppy-todo'
const PUPPY_MIN_ROWS = 26
// the block frame is 34 columns; narrower, each row wraps and breaks the drawing
const PUPPY_COLUMNS = 34
// while the pane is up the list is read again this often, so a change in another window shows
export const REFRESH_MS = 5_000
// the folded deleted list shows this many at a time
const DELETED_PAGE = 10

const EMPTY: View = { items: [], isShowingDone: false, at: null, notes: [] }
const view = atom({ plugin: 'puppy-todo', key: 'view' } as const, EMPTY)

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function itemsDir($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? ''}/.claude/todo/items`
}

// every item file, read as loosely as parseItem allows. A file that can't be read this time keeps
// what the last read had (its id is its file name), and is counted; a file whose id is not its own
// file name is left out and named.
async function readItems($: EngineInterface, was: readonly Item[]): Promise<{ items: Item[]; notes: string[] }> {
  const dir = await itemsDir($)
  if (!(await $.fs.exists(dir))) {
    return { items: [], notes: [] }
  }
  const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json'))
  let unread = 0
  const misnamed: string[] = []
  const got = await Promise.all(
    files.map(async f => {
      const id = f.name.slice(0, -'.json'.length)
      let text: string
      try {
        text = await $.fs.read(`${dir}/${f.name}`)
      } catch {
        unread++

        return was.find(i => i.id === id) ?? null
      }
      const item = parseItem(text)
      if (!item) {
        // caught halfway through a write: the last read stands, and it is counted
        const had = was.find(i => i.id === id)
        if (had) unread++

        return had ?? null
      }
      if (item.id !== id) {
        misnamed.push(f.name)

        return null
      }

      return item
    }),
  )
  const notes = [
    ...(unread ? [`could not read ${unread} file${unread > 1 ? 's' : ''} this time; showing the last read`] : []),
    ...(misnamed.length ? [`left out ${misnamed.join(', ')}: the id inside is not the file name`] : []),
  ]

  return { items: got.filter((i): i is Item => i !== null), notes }
}

async function writeItem($: EngineInterface, item: Item): Promise<void> {
  await $.fs.write(`${await itemsDir($)}/${item.id}.json`, `${JSON.stringify(item, null, 2)}\n`)
}

// Each read is numbered, and so is each write: a read that began before the latest write, or
// before a newer read, is dropped when it ends, so it can never put back what a press just changed.
let loads = 0

async function load($: EngineInterface): Promise<void> {
  const mine = ++loads
  const was = (await read($, view))?.items ?? []
  let items: Item[] | null = null
  let notes: string[] = []
  try {
    ;({ items, notes } = await readItems($, was))
  } catch (err) {
    notes = [`could not read ~/.claude/todo/items: ${errorText(err)}`]
  }
  const at = await $.clock.now()
  if (mine !== loads) {
    return
  }
  await update($, view, v => ({ ...EMPTY, ...v, items: items ?? v.items, at, notes }))
}

// Writes from this window go one after another. Each one first makes any read in flight stale,
// then reads the list again once it is on disk, so the pane shows the file, not a guess. A write
// that fails is said in one red line and nothing else changes.
let writing: Promise<unknown> = Promise.resolve()

function save<T>($: EngineInterface, write: () => Promise<T>): Promise<T | null> {
  const run = writing.then(async () => {
    loads++
    try {
      const out = await write()
      await update($, view, v => ({ ...EMPTY, ...v, saveError: null }))
      await load($)

      return out
    } catch (err) {
      await update($, view, v => ({ ...EMPTY, ...v, saveError: `could not save: ${errorText(err)}` }))

      return null
    }
  })
  writing = run.catch(() => undefined)

  return run
}

function add($: EngineInterface, text: string): Promise<Item | null> {
  return save($, async () => {
    const now = await $.clock.now()
    const item: Item = {
      schemaVersion: 2,
      id: newId(now),
      text: text.trim(),
      project: projectOf(await $.session.cwd()),
      kind: 'todo',
      status: 'open',
      by: 'person',
      createdAt: new Date(now).toISOString(),
    }
    await writeItem($, item)
    // a new key draws a new, empty field: the old one would keep the words just added
    await update($, view, v => ({ ...EMPTY, ...v, added: (v.added ?? 0) + 1 }))

    return item
  })
}

// One file, read again just before it is changed, so a change from another window isn't undone.
// A file whose id is no longer its own name is never written through: that would land on another item.
async function fresh($: EngineInterface, id: string): Promise<Item> {
  const item = parseItem(await $.fs.read(`${await itemsDir($)}/${id}.json`))
  if (!item) throw new Error(`${id}.json is not a to-do right now; try again in a moment`)
  if (item.id !== id) throw new Error(`the id inside ${id}.json is not ${id}`)

  return item
}

type Press = 'done' | 'open' | 'delete' | 'restore' | 'pin' | 'unpin'

function press($: EngineInterface, id: string, what: Press, undoOf?: string): Promise<unknown> {
  return save($, async () => {
    const item = await fresh($, id)
    const at = new Date(await $.clock.now()).toISOString()
    // undo brings back only the delete it was made for: one done again since (another window) stays
    if (what === 'restore' && undoOf && item.deletedAt !== undoOf) {
      await update($, view, v => ({ ...EMPTY, ...v, lastDeleted: null }))
      throw new Error('it was changed in another window since; find it under ▸ deleted')
    }
    const next = {
      done: () => tick(item, at),
      open: () => reopen(item, at),
      delete: () => deleteItem(item, at),
      restore: () => restoreItem(item),
      pin: () => pin(item, at),
      unpin: () => unpin(item),
    }[what]()
    await writeItem($, next)
    await update($, view, v => ({
      ...EMPTY,
      ...v,
      lastDeleted: what === 'delete' ? { id, text: item.text, deletedAt: next.deletedAt! } : what === 'restore' || v.lastDeleted?.id === id ? null : v.lastDeleted,
    }))
  })
}

// Changing an item's words: the field holds them until save or cancel. If another window changed
// them meanwhile, nothing is written: the field says so and shows the new words.
async function startEdit($: EngineInterface, item: Item): Promise<void> {
  await update($, view, v => ({ ...EMPTY, ...v, editingId: item.id, editBase: item.text, editNote: null }))
}

async function stopEdit($: EngineInterface): Promise<void> {
  await update($, view, v => ({ ...EMPTY, ...v, editingId: null, editBase: '', editNote: null }))
}

async function saveEdit($: EngineInterface, id: string, text: string): Promise<unknown> {
  if (text.trim() === '') {
    return update($, view, v => ({ ...EMPTY, ...v, editNote: 'empty: use ✕ to delete it' }))
  }
  // the words the field was opened on, taken now: a second press queued behind the first is held
  // to the same words, so it can't slip past a change the first one found
  const base = (await read($, view))?.editBase

  return save($, async () => {
    const item = await fresh($, id)
    if (base === undefined || item.text !== base) {
      await update($, view, v => ({ ...EMPTY, ...v, editBase: item.text, editNote: 'changed in another window: here are the new words' }))

      return
    }
    if (item.text !== text.trim()) {
      await writeItem($, editText(item, text, new Date(await $.clock.now()).toISOString()))
    }
    await stopEdit($)
  })
}

async function isPaneUp($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)
}

// A timer is not data: a module variable, and a reload drops both together. Each tick first asks
// whether the pane is still up and stops when it is not; /todo starts it over, never two.
let reading: Timer | null = null
function stopReading(): void {
  reading?.cancel()
  reading = null
}
// a tick that finds a read still going skips its turn, so slow reads can't keep making each other stale
let polling = false
function startReading($: EngineInterface): void {
  stopReading()
  const mine: Timer = $.clock.every(REFRESH_MS, () => {
    if (polling) return
    polling = true
    void (async () => {
      if (!(await isPaneUp($))) {
        // only this timer: a newer one (the pane opened again meanwhile) keeps going
        mine.cancel()
        if (reading === mine) reading = null

        return
      }
      await load($)
    })()
      .catch(() => undefined)
      .finally(() => {
        polling = false
      })
  })
  reading = mine
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'todo',
      description: 'open your to-do list; /todo <text> adds one',
      argumentHint: '[text]',
    })
    const started = await next(e)
    // the pane opens only on /todo. a reload with it still up reads the list again
    if (await isPaneUp($)) {
      void load($).catch(() => undefined)
      startReading($)
    }

    return started
  })

  // closing the pane stops the reads at once (the next tick would see it gone anyway)
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (!(await isPaneUp($))) {
      stopReading()
    }

    return closed
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'todo' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: 'todo' })
    startReading($)
    await load($)
    if (e.args.trim() === '') {
      return { text: 'your to-do list is open.' }
    }
    const item = await add($, e.args)

    return { text: item ? `added: ${item.text}` : 'could not save it; the pane says why.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // the phone app draws no field yet: no add field and no editing there
    const Input = 'Input' in ui ? ui.Input : undefined
    // a view kept from an older version lacks the newer fields (the session's state outlives a reload)
    const v: View = { ...EMPTY, ...(await read($, view)) }
    if (v.at === null) {
      return <Text dimColor>loading…</Text>
    }
    const { open, done, deleted } = listOf(v.items, v.at)
    const mood = open.length === 0 ? 'sleeping' : 'sitting'
    const hasSvg = e.surface !== 'terminal' && 'Svg' in ui
    // the row's buttons always show, dim: hidden until hover they were never found (11/26)
    const shownDeleted = deleted.slice(0, v.deletedShown ?? DELETED_PAGE)

    const row = (i: Item) => {
      if (Input && v.editingId === i.id) {
        return (
          <Box key={`i-${i.id}`} flexDirection="column" gap="xs">
            <Box flexDirection="row" gap={1}>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Input key={`edit-${i.id}`} value={v.editBase ?? i.text} submitLabel="save" autoFocus onSubmit={said => void saveEdit($, i.id, said)} />
              </Box>
              <Box flexShrink={0}>
                <Button key={`cancel-${i.id}`} label="cancel" plain dimColor onPress={() => stopEdit($)} />
              </Box>
            </Box>
            {v.editNote ? <Text dimColor>{v.editNote}</Text> : null}
          </Box>
        )
      }
      const isPinned = Boolean(i.pinnedAt)

      return (
        <Box key={`i-${i.id}`} flexDirection="row" gap={1}>
          {/* one width for the tick, so the words line up */}
          <Box width={3} flexShrink={0} justifyContent="center">
            <Button key={`tick-${i.id}`} label="○" plain dimColor onPress={() => press($, i.id, 'done')} />
          </Box>
          {/* your own words, whole: they wrap instead of being cut */}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight={isPinned ? 'semibold' : undefined}>{i.text}</Text>
          </Box>
          <Box flexShrink={0} width={Input ? 8 : 5} flexDirection="row" justifyContent="flex-end" gap={1}>
            <Box>
              <Button key={`pin-${i.id}`} label={isPinned ? '★' : '☆'} plain dimColor onPress={() => press($, i.id, isPinned ? 'unpin' : 'pin')} />
            </Box>
            {Input ? (
              <Box>
                <Button key={`edit-${i.id}`} label="✎" plain dimColor onPress={() => startEdit($, i)} />
              </Box>
            ) : null}
            <Box>
              <Button key={`del-${i.id}`} label="✕" plain dimColor onPress={() => press($, i.id, 'delete')} />
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {!hasSvg && e.props.scroll.bodyRows >= PUPPY_MIN_ROWS && e.props.bodyColumns >= PUPPY_COLUMNS && (
          <Box key="puppy" flexDirection="column">
            {stillBlocks(mood).map((runs, i) => (
              <Text key={`puppy-${i}`}>
                {/* a blank row is one space: an empty Text takes no row, and the puppy must keep all 13 */}
                {runs.length ? runs.map(([text, fg, bg]) => <Text color={fg ?? undefined} backgroundColor={bg ?? undefined}>{text}</Text>) : ' '}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box flexDirection="row" alignItems="center" gap={1}>
            {hasSvg && 'Svg' in ui && (
              <ui.Svg source={mascot(mood)} alt={`the puppy ${mood}`} width={68} height={52} />
            )}
            <Text dimColor>{open.length === 0 ? 'all clear' : `${open.length} to-do`}</Text>
          </Box>
          <Button key="refresh" label="refresh" dimColor onPress={() => load($)} />
        </Box>

        <Box key="card-list" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          {Input ? (
            <Input
              key={`add-${v.added ?? 0}`}
              placeholder="add a to-do…"
              submitLabel="add"
              onSubmit={said => {
                if (said.trim() !== '') {
                  void add($, said)
                }
              }}
            />
          ) : null}
          {open.map(row)}
          {open.length === 0 ? <Text dimColor>nothing to do. the puppy naps.</Text> : null}
        </Box>

        {v.lastDeleted ? (
          <Box key="undo" flexDirection="row" gap={1}>
            <Box flexShrink={1} minWidth={0}>
              <Text dimColor wrap="truncate-end">{`deleted “${v.lastDeleted.text}”`}</Text>
            </Box>
            <Box flexShrink={0}>
              <Button key="undo-delete" label="undo" dimColor onPress={() => press($, v.lastDeleted!.id, 'restore', v.lastDeleted!.deletedAt)} />
            </Box>
          </Box>
        ) : null}

        {done.length > 0 && (
          <Box flexDirection="column">
            <Button
              key="show-done"
              label={`${v.isShowingDone ? '▾' : '▸'} done ${done.length}`}
              dimColor
              onPress={() => update($, view, was => ({ ...EMPTY, ...was, isShowingDone: !was.isShowingDone }))}
            />
            {v.isShowingDone
              ? done.map(i => (
                  <Box key={`d-${i.id}`} flexDirection="row" gap={1}>
                    <Box width={3} flexShrink={0} justifyContent="center">
                      <Button key={`untick-${i.id}`} label="☑" plain dimColor onPress={() => press($, i.id, 'open')} />
                    </Box>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text dimColor strikethrough>
                        {i.text}
                      </Text>
                    </Box>
                  </Box>
                ))
              : null}
          </Box>
        )}

        {deleted.length > 0 && (
          <Box flexDirection="column">
            <Button
              key="show-deleted"
              label={`${v.isShowingDeleted ? '▾' : '▸'} deleted ${deleted.length}`}
              dimColor
              onPress={() => update($, view, was => ({ ...EMPTY, ...was, isShowingDeleted: !was.isShowingDeleted, deletedShown: DELETED_PAGE }))}
            />
            {v.isShowingDeleted
              ? shownDeleted.map(i => (
                  <Box key={`x-${i.id}`} flexDirection="row" gap={1}>
                    <Box width={3} flexShrink={0} justifyContent="center">
                      <Button key={`restore-${i.id}`} label="↺" plain dimColor onPress={() => press($, i.id, 'restore')} />
                    </Box>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text dimColor>{i.status === 'done' ? `${i.text} (done)` : i.text}</Text>
                    </Box>
                  </Box>
                ))
              : null}
            {v.isShowingDeleted && deleted.length > shownDeleted.length ? (
              <Button
                key="more-deleted"
                label={`▸ ${deleted.length - shownDeleted.length} more`}
                dimColor
                onPress={() => update($, view, was => ({ ...EMPTY, ...was, deletedShown: (was.deletedShown ?? DELETED_PAGE) + DELETED_PAGE }))}
              />
            ) : null}
          </Box>
        )}

        {v.saveError ? <Text color="error">{v.saveError}</Text> : null}
        {v.notes.length > 0 ? <Text color="error">{v.notes.join(' · ')}</Text> : null}
      </Box>
    )
  })
}
