import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeResult } from 'claude-code'

import type { CueName, MessageStyle, PaletteName, Prefs, Wall } from '../types'
import { baseLook, lookColors, lookFor, unpainted } from './look'
import { CUES, DEFAULT_PREFS, keepUnknown, MESSAGE_STYLES, parsePrefs, SOUND_SETS, STORE_KEY, WALLS } from './prefs'
import { PALETTE_NAMES } from './palette'
import { drawScene, type Period, periodOf, readSceneName } from './scene'
import { SOUND_LABEL } from './sound'

const PANE = 'look'

// What the pane draws from: the session's copy of what $.store keeps.
const prefsAtom = atom({ plugin: 'puppy-theme', key: 'prefs' } as const, DEFAULT_PREFS)

const PALETTE_LABEL: Record<PaletteName, string> = { baibai: 'baibai · the brand greys', eyecare: 'eye care · softer text, warmer light paper' }
const WALL_LABEL: Record<Wall, string> = { sky: 'framed sky', plain: 'plain wall' }
const GLASS_LABEL = { true: 'frosted · the frame a little soft', false: 'clear · the sky as it is' } as const
const MESSAGE_LABEL: Record<MessageStyle, string> = {
  pixel: 'pixel card with a tail',
  tape: 'taped paper notes',
  bookmark: 'card with a blue bookmark',
  app: "the app's own rows",
}
const CUE_LABEL: Record<CueName, string> = {
  send: 'you send a message',
  tool: 'a tool starts',
  compact: 'the chat is compacted',
  done: 'claude finishes',
  ask: 'something asks you',
  error: 'a turn breaks',
  click: 'you click the wall',
}

// The local hour, for the sky's time of day.
const hourNow = async ($: EngineInterface): Promise<number> => new Date(await $.clock.now()).getHours()

// A build that refused style or sound once gets colors and the backdrop from
// then on, so the note shows once and no full look is sent to be refused again.
let colorsOnly = false
// The palettes whose paint note was shown, so it shows once a palette.
const noted = new Set<PaletteName>()

// Puts the look on. The paint check is only a note, so it runs after.
const wear = async ($: EngineInterface, prefs: Prefs, known?: number): Promise<void> => {
  const hour = known ?? (await hourNow($))
  let set: ThemeResult | undefined
  if (!colorsOnly) {
    try {
      set = await $.theme.set(lookFor(prefs, hour))
    } catch (error) {
      // only if colors alone go on was it the style or sound: a failure of
      // both is passed up, and the next try sends the whole look again
      set = await $.theme.set(baseLook(prefs, hour))
      colorsOnly = true
      $.ui.log(`puppy-theme: style or sound refused, colors only (${String(error)})`)
    }
  }
  set ??= await $.theme.set(baseLook(prefs, hour))
  // Not drawn yet is normal when the session starts before the app's window
  // attaches (after a restart, in the background, in a side chat): the theme
  // stands and draws when it attaches. So the line goes to the debug log only.
  if (!set.isDrawn) {
    $.ui.log(`puppy-theme: not drawn (${set.reason})`, { to: 'debug' })
  }
  const problem = unpainted(lookColors(prefs.colors).problems)
  if (problem !== undefined && !noted.has(prefs.colors)) {
    noted.add(prefs.colors)
    $.ui.log(`puppy-theme: ${problem}`)
  }
}

// Takes the look from what this session wore to these picks: on, it wears
// them; turned off, it clears, and only then (a clear wipes any mod's theme, so
// it waits for the person's own off, never a session start or a reload).
const apply = async ($: EngineInterface, prefs: Prefs, was: Prefs | undefined, hour?: number): Promise<void> => {
  if (prefs.on) {
    await wear($, prefs, hour)
  } else if (was?.on === true) {
    await $.theme.clear()
  }
}

// What this session last wore (undefined until the first wear works), and the
// presses so far: the watch skips a round a press came in during. dirty: a
// round's wear finished after a press's, so it may stand over it; the next
// round wears the stored picks again.
let worn: Prefs | undefined
let presses = 0
let dirty = false
const same = (a: Prefs | undefined, b: Prefs): boolean => JSON.stringify(a) === JSON.stringify(b)

// One change from the pane, made to what the store keeps now (not this
// session's copy, which can be a few seconds old), so a pick made in another
// session a moment ago stays. Fields a newer version stored stay too.
const pick = async ($: EngineInterface, change: (p: Prefs) => Prefs): Promise<void> => {
  presses += 1
  const raw = await $.store.get(STORE_KEY)
  const now = change(parsePrefs(raw))
  const was = worn
  worn = now
  await Promise.all([$.store.set(STORE_KEY, keepUnknown(raw, now)), update($, prefsAtom, () => now)])
  try {
    await apply($, now, was)
  } catch (error) {
    worn = was // not worn after all: the watch tries again
    throw error
  }
}

// The watch: picks made in another session and the time of day; a reload starts a new one.
let watch: { cancel: () => void } | undefined
let period: Period = 'night'
const WATCH_MS = 5_000

// One round of the watch. What it wore is kept only once the wear works, so a
// failed round is tried again on the next.
const follow = async ($: EngineInterface): Promise<void> => {
  const pressed = presses
  const [stored, at] = await Promise.all([$.store.get(STORE_KEY), $.clock.now()])
  if (presses !== pressed) return // the press stored newer picks; the next round reads them
  const picks = parsePrefs(stored)
  const hour = new Date(at).getHours()
  const changed = dirty || !same(worn, picks)
  const crossed = periodOf(hour) !== period
  if (!changed && !crossed) return
  if (changed) await update($, prefsAtom, () => picks)
  // after a dirty round the look may be on whatever was stored, so an off clears
  const was = dirty ? { ...picks, on: true } : worn
  if (changed || (picks.on && picks.wall === 'sky')) await apply($, picks, was, hour)
  if (presses !== pressed) {
    dirty = true
    return
  }
  worn = picks
  dirty = false
  period = periodOf(hour)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Each session shows the app's own look until this runs, so the look goes on
    // as soon as the picks and the hour are read; the command and the pane's copy
    // of the picks are set up alongside, not before. A look that fails to go on
    // is noted, and the watch below still starts and tries again.
    colorsOnly = false
    noted.clear()
    const [kept, now] = await Promise.all([$.store.get(STORE_KEY), $.clock.now()])
    const prefs = parsePrefs(kept)
    const hour = new Date(now).getHours()
    const [isWorn] = await Promise.all([
      apply($, prefs, undefined, hour).then(
        () => true,
        (error: unknown) => {
          $.ui.log(`puppy-theme: the look didn't go on (${String(error)}); trying again in a few seconds`)
          return false
        },
      ),
      $.command.register({ name: 'look', description: "pick the puppy's colors, wall, glass, messages and sounds" }),
      update($, prefsAtom, () => prefs),
    ])
    worn = isWorn ? prefs : undefined
    period = periodOf(hour)
    // Every few seconds: if another session's /look stored new picks, take them
    // (each session wears its own look, and the store has no change event); and
    // if the hour crossed into dawn, day, dusk or night, wear the sky again.
    watch?.cancel()
    watch = $.clock.every(WATCH_MS, () => {
      void follow($).catch((error: unknown) => {
        $.ui.log(`puppy-theme: a sync round failed (${String(error)})`, { to: 'debug' })
      })
    })
    return next(e)
  })

  on('command.run', { command: 'look' }, async $ => {
    await $.ui.open({ id: PANE, title: 'look' })
    return { text: 'look opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const prefs = parsePrefs(await read($, prefsAtom))
    const drawsHere = e.surface === 'desktop' || e.surface === 'mobile'

    const choice = (key: string, isOn: boolean, label: string, onPress: () => Promise<void>) => (
      <Button key={key} label={`${isOn ? '●' : '○'} ${label}`} plain dimColor={!isOn} onPress={onPress} />
    )
    const toggle = (key: string, isOn: boolean, label: string, note: string, onPress: () => Promise<void>) => (
      <Box key={`row-${key}`} flexDirection="row" gap={1}>
        <Box width={3} flexShrink={0}>
          <Button key={key} label={isOn ? '☑' : '☐'} plain dimColor onPress={onPress} />
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor={!isOn} wrap="truncate-end">
            {label}
          </Text>
        </Box>
        {note === '' ? null : (
          <Box flexShrink={0}>
            <Text dimColor>{note}</Text>
          </Box>
        )}
      </Box>
    )
    const cuesOn = CUES.filter(c => prefs.cues[c]).length

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {drawsHere ? 'kept on this computer, for every session' : 'the look draws in the desktop app; picks here count there'}
        </Text>
        <Box key="card-reset" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">look</Text>
            <Text dimColor>{prefs.on ? 'on' : "off · the app's own"}</Text>
          </Box>
          {toggle('on', prefs.on, 'wear the puppy look', '', () => pick($, p => ({ ...p, on: !p.on })))}
          {prefs.on ? null : <Text dimColor>the picks below wait until the look is on</Text>}
          <Button key="reset" label="↺ back to the puppy's defaults" plain dimColor onPress={() => pick($, () => DEFAULT_PREFS)} />
        </Box>
        <Box key="card-colors" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">colors</Text>
            <Text dimColor>{prefs.colors === 'eyecare' ? 'eye care' : 'baibai'}</Text>
          </Box>
          {PALETTE_NAMES.map(n =>
            choice(`colors-${n}`, prefs.colors === n, PALETTE_LABEL[n], () => pick($, p => ({ ...p, colors: n }))),
          )}
        </Box>
        <Box key="card-wall" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">wall</Text>
            <Text dimColor>{WALL_LABEL[prefs.wall]}</Text>
          </Box>
          {WALLS.map(w => choice(`wall-${w}`, prefs.wall === w, WALL_LABEL[w], () => pick($, p => ({ ...p, wall: w }))))}
        </Box>
        <Box key="card-glass" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">glass</Text>
            <Text dimColor>{prefs.glass ? 'frosted' : 'clear'}</Text>
          </Box>
          <Text dimColor>{prefs.wall === 'sky' ? 'the panels over the framed sky' : 'shows with the framed sky'}</Text>
          {([true, false] as const).map(frosted =>
            choice(`glass-${frosted ? 'frosted' : 'clear'}`, prefs.glass === frosted, GLASS_LABEL[`${frosted}`], () =>
              pick($, p => ({ ...p, glass: frosted })),
            ),
          )}
        </Box>
        <Box key="card-messages" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">messages</Text>
            <Text dimColor>{MESSAGE_LABEL[prefs.messages]}</Text>
          </Box>
          <Text dimColor>your messages; replies and tool rows stay quiet</Text>
          {MESSAGE_STYLES.map(m =>
            choice(`messages-${m}`, prefs.messages === m, MESSAGE_LABEL[m], () => pick($, p => ({ ...p, messages: m }))),
          )}
        </Box>
        <Box key="card-sounds" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">sounds</Text>
            <Text dimColor>{`${SOUND_LABEL[prefs.sounds].split(' · ')[0]} · ${cuesOn} of ${CUES.length}`}</Text>
          </Box>
          <Text dimColor>play once the speaker in the title bar is on</Text>
          {SOUND_SETS.map(set =>
            choice(`sounds-${set}`, prefs.sounds === set, SOUND_LABEL[set], () => pick($, p => ({ ...p, sounds: set }))),
          )}
          <Text dimColor>when each one plays</Text>
          {CUES.map(c =>
            toggle(`cue-${c}`, prefs.cues[c], c, CUE_LABEL[c], () =>
              pick($, p => ({ ...p, cues: { ...p.cues, [c]: !p.cues[c] } })),
            ),
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const scene = readSceneName(String(e.props.scene ?? ''))
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || scene === undefined) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const alt = scene.weather === 'rain' ? 'a small framed window of rain on the wall' : `a small framed ${scene.period} sky on the wall`
    return <Svg source={drawScene(scene.palette, scene.period, scene.weather)} alt={alt} />
  })
}
