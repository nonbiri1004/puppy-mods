import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CueName, MessageStyle, PaletteName, Prefs, Wall } from '../types'
import { baseLook, lookColors, lookFor, unpainted } from './look'
import { CUES, DEFAULT_PREFS, MESSAGE_STYLES, parsePrefs, SOUND_SETS, STORE_KEY, WALLS } from './prefs'
import { PALETTE_NAMES } from './palette'
import { drawScene, periodOf, readSceneName } from './scene'
import { SOUND_LABEL } from './sound'

const PANE = 'look'

// What the pane draws from: the session's copy of what $.store keeps.
const prefsAtom = atom({ plugin: 'puppy-theme', key: 'prefs' } as const, DEFAULT_PREFS)

const PALETTE_LABEL: Record<PaletteName, string> = { baibai: 'baibai · the brand greys', eyecare: 'eye care · softer text, warmer paper' }
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

// Sets the whole look (or, turned off, takes it away); a build that refuses style or sound gets colors and
// the backdrop alone. The look goes on first; the paint check is only a note, so it runs after.
const wear = async ($: EngineInterface, prefs: Prefs, known?: number): Promise<void> => {
  if (!prefs.on) {
    await $.theme.clear()
    return
  }
  const hour = known ?? (await hourNow($))
  let set
  try {
    set = await $.theme.set(lookFor(prefs, hour))
  } catch (error) {
    $.ui.log(`puppy-theme: style or sound refused, colors only (${String(error)})`)
    set = await $.theme.set(baseLook(prefs, hour))
  }
  if (!set.isDrawn) {
    $.ui.log(`puppy-theme: not drawn (${set.reason})`)
  }
  const problem = unpainted(lookColors(prefs.colors).problems)
  if (problem !== undefined) {
    $.ui.log(`puppy-theme: ${problem}`)
  }
}

// One change from the pane: keep it, then wear it.
const pick = async ($: EngineInterface, change: (p: Prefs) => Prefs): Promise<void> => {
  await update($, prefsAtom, was => change(parsePrefs(was)))
  const now = parsePrefs(await read($, prefsAtom))
  await $.store.set(STORE_KEY, now)
  await wear($, now)
}

// The time-of-day check; a reload starts a new one.
let sky: { cancel: () => void } | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Each session shows the app's own look until this runs, so the look goes on
    // as soon as the picks and the hour are read; the command and the pane's copy
    // of the picks are set up alongside, not before.
    const [kept, now] = await Promise.all([$.store.get(STORE_KEY), $.clock.now()])
    const prefs = parsePrefs(kept)
    const hour = new Date(now).getHours()
    await Promise.all([
      wear($, prefs, hour),
      $.command.register({ name: 'look', description: "pick the puppy's colors, wall, glass, messages and sounds" }),
      update($, prefsAtom, () => prefs),
    ])
    // The sky follows the time of day: look once a minute, and wear the look
    // again only when the hour crosses into dawn, day, dusk or night.
    sky?.cancel()
    let period = periodOf(hour)
    sky = $.clock.every(60_000, () => {
      void (async () => {
        const now = periodOf(await hourNow($))
        if (now === period) return
        period = now
        const kept = parsePrefs(await read($, prefsAtom))
        if (kept.on && kept.wall === 'sky') await wear($, kept)
      })()
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
        <Box flexShrink={0}>
          <Text dimColor>{note}</Text>
        </Box>
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
          {toggle('on', prefs.on, 'wear the puppy look', 'off shows the app as it comes', () =>
            pick($, p => ({ ...p, on: !p.on })),
          )}
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
