import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Board, BoardItem, Item, View } from '../types'
import { ago, dueOf, entriesOf, expandHome, folderTag, linkLabel, oldestSince, parseBoard, staleLine, waited } from './board'
import { mascot, stillBlocks } from './draw'
import { deleteItem, listOf, newId, parseItem, projectOf, reopen, tick } from './todo'

const PANE = 'puppy-todo'
const PUPPY_MIN_ROWS = 26
// the block frame is 34 columns; narrower, each row wraps and breaks the drawing
const PUPPY_COLUMNS = 34

// the status folder is read while the pane is up: on /todo, on refresh, after a turn, and every minute
const REFRESH_MS = 60_000

const EMPTY: View = { items: [], isShowingDone: false, at: null, notes: [], boards: [], boardsAt: null, boardTag: '', boardNote: null, openGroups: {} }
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
// nothing else runs: no timer, no transcripts, no github
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

// the read-only cards: every *.json in the status folder with something waiting. a file that
// fails once (caught mid-write, a sync's half copy) keeps its last good card. nothing is written
let boardLoads = 0

async function loadBoards($: EngineInterface, setting: string): Promise<void> {
  if (setting.trim() === '') {
    return
  }
  const mine = ++boardLoads
  const dir = expandHome(setting.trim(), await $.env.get('HOME'))
  const prev = (await read($, view))?.boards ?? []
  let boards: Board[] = []
  let boardNote: string | null = null
  try {
    const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json') && !f.name.startsWith('.'))
    for (const f of files) {
      try {
        boards.push(parseBoard(f.name, await $.fs.read(`${dir}/${f.name}`)))
      } catch {
        const kept = prev.find(b => b.file === f.name)
        if (kept) {
          boards.push(kept)
        }
      }
    }
    boards = boards.filter(b => b.items.length > 0).sort((a, b) => a.title.localeCompare(b.title))
  } catch {
    boards = prev
    boardNote = `could not read ${setting.trim()}`
  }
  const boardsAt = await $.clock.now()
  if (mine !== boardLoads) {
    return
  }
  await update($, view, was => ({ ...EMPTY, ...was, boards, boardsAt, boardTag: folderTag(dir), boardNote }))
}

// a timer is not data: a module variable, and a reload drops both together. each tick first asks
// whether the pane is still up, and stops when it is not; /todo starts it over, never two
let reading: Timer | null = null
function stopReading(): void {
  reading?.cancel()
  reading = null
}
function startReading($: EngineInterface, setting: string): void {
  stopReading()
  if (setting.trim() === '') {
    return
  }
  reading = $.clock.every(REFRESH_MS, () => {
    void (async () => {
      if (!(await isPaneUp($))) {
        return stopReading()
      }
      await loadBoards($, setting)
    })().catch(() => undefined)
  })
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

export const register: Register = (on, options) => {
  const setting = String(options.status_dir ?? '')

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
      void loadBoards($, setting).catch(() => undefined)
      startReading($, setting)
    }

    return started
  })

  // another window may have changed the list: read it again after a turn, only while the pane is up
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (await isPaneUp($)) {
      void load($).catch(() => undefined)
      void loadBoards($, setting).catch(() => undefined)
    }

    return done
  })

  // closing the pane stops the minute's read at once (the next tick would see it gone anyway)
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (!(await isPaneUp($))) {
      stopReading()
    }

    return closed
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'todo' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: 'todo' })
    void loadBoards($, setting).catch(() => undefined)
    startReading($, setting)
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
    const Link = 'Link' in ui ? ui.Link : undefined
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
    // the boards' ages count from their last read, which comes every minute
    const now = v.boardsAt ?? v.at
    const sinceText = (t?: string) => (t ? waited(now - Date.parse(t)) : '')

    // one read-only row: the words and how long it waited, then its link and due day if it has them
    const boardItem = (b: Board, w: BoardItem) => {
      const age = sinceText(w.since)
      const due = w.due ? dueOf(w.due, now) : null

      return (
        <Box key={`bi-${b.file}:${w.id}`} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text>{w.text}</Text>
            </Box>
            {age ? (
              <Box flexShrink={0}>
                <Text dimColor>{age}</Text>
              </Box>
            ) : null}
          </Box>
          {w.url || due ? (
            <Box flexDirection="row" gap={1}>
              {/* the terminal prints a Link's whole address, so it gets the short name only (STYLE.md) */}
              {w.url ? (Link && e.surface !== 'terminal' ? <Link href={w.url} label={`↗ ${linkLabel(w.url)}`} /> : <Text dimColor>{`↗ ${linkLabel(w.url)}`}</Text>) : null}
              {due ? (due.isPast ? <Text color="warning">{due.text}</Text> : <Text dimColor>{due.text}</Text>) : null}
            </Box>
          ) : null}
        </Box>
      )
    }

    // a card per writer, under your own list: its title and the folder's name as its tag on the
    // left; how many and when it wrote, dim, on the right. no tick, no ✕: an item goes when its writer stops listing it
    const boardCard = (b: Board) => {
      const stale = staleLine(b, now)

      return (
        <Box key={`card-board-${b.file}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Box flexShrink={1} minWidth={0}>
              <Text wrap="truncate-end">
                <Text weight="semibold">{b.title}</Text>
                {v.boardTag ? <Text dimColor>{` · ${v.boardTag}`}</Text> : null}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor>{`${b.items.length} · ${ago(now - Date.parse(b.updated))}`}</Text>
            </Box>
          </Box>
          {entriesOf(b).map(en => {
            if ('item' in en) {
              return boardItem(b, en.item)
            }
            const key = `${b.file}:${en.group.id}`
            const isOpen = v.openGroups[key] === true
            const age = sinceText(oldestSince(en.items))

            return (
              <Box key={`entry-${key}`} flexDirection="column" gap="xs">
                <Button
                  key={`group-${key}`}
                  label={`${isOpen ? '▾' : '▸'} ${en.group.label} ×${en.items.length}${age ? ` · ${age}` : ''}`}
                  dimColor
                  onPress={() => update($, view, was => {
                    const { [key]: wasOpen, ...rest } = { ...EMPTY.openGroups, ...was.openGroups }

                    return { ...EMPTY, ...was, openGroups: wasOpen ? rest : { ...rest, [key]: true } }
                  })}
                />
                {isOpen ? en.items.map(w => boardItem(b, w)) : null}
              </Box>
            )
          })}
          {stale ? <Text dimColor>{stale}</Text> : null}
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
          <Button key="refresh" label="refresh" dimColor onPress={() => Promise.all([load($), loadBoards($, setting)])} />
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

        {v.boards.map(boardCard)}
        {v.boardNote ? <Text dimColor>{v.boardNote}</Text> : null}

        {v.notes.length > 0 ? <Text color="error">{v.notes.join(' · ')}</Text> : null}
      </Box>
    )
  })
}
