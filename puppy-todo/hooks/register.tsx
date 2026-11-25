import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, View } from '../types'
import { mascot, stillBlocks } from './draw'
import { deleteItem, listOf, newId, parseItem, projectOf, reopen, tick } from './todo'

const PANE = 'puppy-todo'
const PUPPY_MIN_ROWS = 26
// the block frame is 34 columns; narrower, each row wraps and breaks the drawing
const PUPPY_COLUMNS = 34

const EMPTY: View = { items: [], isShowingDone: false, at: null, notes: [] }
const view = atom({ plugin: 'puppy-todo', key: 'view' } as const, EMPTY)

async function itemsDir($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? ''}/.claude/todo/items`
}

// every item file, read as loosely as parseItem allows; a file that can't be read is left out
async function readItems($: EngineInterface): Promise<Item[]> {
  const dir = await itemsDir($)
  if (!(await $.fs.exists(dir))) {
    return []
  }
  const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json'))
  const got = await Promise.all(
    files.map(f =>
      $.fs
        .read(`${dir}/${f.name}`)
        .then(parseItem)
        .catch(() => null),
    ),
  )

  return got.filter((i): i is Item => i !== null)
}

async function writeItem($: EngineInterface, item: Item): Promise<void> {
  await $.fs.write(`${await itemsDir($)}/${item.id}.json`, `${JSON.stringify(item, null, 2)}\n`)
}

// reads the list again: when the pane opens, on refresh, and after a turn while it is up.
// nothing else runs: no timer, no other folder, no github
// each read is numbered; a slower, older read that ends after a newer one is dropped
let loads = 0

async function load($: EngineInterface): Promise<void> {
  const mine = ++loads
  const notes: string[] = []
  const items = await readItems($).catch(() => {
    notes.push('could not read ~/.claude/todo/items')

    return null
  })
  const at = await $.clock.now()
  if (mine !== loads) {
    return
  }
  await update($, view, was => ({ ...EMPTY, ...was, items: items ?? was.items, at, notes }))
}

async function add($: EngineInterface, text: string): Promise<Item> {
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
  await update($, view, was => ({ ...EMPTY, ...was, items: [...was.items, item] }))

  return item
}

// a press in the pane: read the file again first, so a change from another window isn't undone
async function press($: EngineInterface, id: string, what: 'done' | 'open' | 'delete'): Promise<void> {
  const item = (await readItems($)).find(i => i.id === id)
  if (!item) {
    return
  }
  const at = new Date(await $.clock.now()).toISOString()
  const next = what === 'done' ? tick(item, at) : what === 'open' ? reopen(item, at) : deleteItem(item, at)
  await writeItem($, next)
  await update($, view, was => ({ ...EMPTY, ...was, items: was.items.map(i => (i.id === id ? next : i)) }))
}

async function isPaneUp($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)
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
    }

    return started
  })

  // another window may have changed the list: read it again after a turn, only while the pane is up
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (await isPaneUp($)) {
      void load($).catch(() => undefined)
    }

    return done
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: 'todo' })
    if (e.args.trim() === '') {
      await load($)

      return { text: 'your to-do list is open.' }
    }
    await load($)
    const item = await add($, e.args)

    return { text: `added: ${item.text}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // the phone app draws no field yet
    const Input = 'Input' in ui ? ui.Input : undefined
    // a view kept from an older version lacks the newer fields (the session's state outlives a reload)
    const v: View = { ...EMPTY, ...(await read($, view)) }
    if (v.at === null) {
      return <Text dimColor>loading…</Text>
    }
    const { open, done } = listOf(v.items, v.at)
    const mood = open.length === 0 ? 'sleeping' : 'sitting'
    const hasSvg = e.surface !== 'terminal' && 'Svg' in ui
    // the ✕ shows when the pointer is on the row (the desktop); with no pointer it always shows
    const hasPointer = e.surface === 'desktop'
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
              key="add"
              placeholder="add a to-do…"
              submitLabel="add"
              onSubmit={said => {
                if (said.trim() !== '') {
                  void add($, said)
                }
              }}
            />
          ) : null}
          {open.map(i => {
            const scope = `row-${i.id}`

            return (
              <Box key={`i-${i.id}`} flexDirection="row" gap={1} hover={{ scope }}>
                {/* one width for the tick, so the words line up */}
                <Box width={3} flexShrink={0} justifyContent="center">
                  <Button key={`tick-${i.id}`} label="○" plain dimColor onPress={() => press($, i.id, 'done')} />
                </Box>
                {/* your own words, whole: they wrap instead of being cut */}
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text>{i.text}</Text>
                </Box>
                <Box flexShrink={0} {...(hasPointer ? { display: 'none', hover: { scope, display: 'flex' } } : {})}>
                  <Button key={`del-${i.id}`} label="✕" plain dimColor onPress={() => press($, i.id, 'delete')} />
                </Box>
              </Box>
            )
          })}
          {open.length === 0 ? <Text dimColor>nothing to do. the puppy naps.</Text> : null}
        </Box>

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

        {v.notes.length > 0 ? <Text color="error">{v.notes.join(' · ')}</Text> : null}
      </Box>
    )
  })
}
