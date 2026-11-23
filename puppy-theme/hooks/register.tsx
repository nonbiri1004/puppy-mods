import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CueName, Prefs, Wall } from '../types'
import { baseLook, colorsFor, lookFor, unpainted } from './look'
import { PALETTES, type PaletteName } from './palette'
import { CUES, DEFAULT_PREFS, parsePrefs, STORE_KEY, WALLS } from './prefs'
import { paletteOfScene, sceneFor } from './scene'
import { SOUND } from './sound'

const PANE = 'look'

// What the pane draws from: the session's copy of what $.store keeps.
const prefsAtom = atom({ plugin: 'puppy-theme', key: 'prefs' } as const, DEFAULT_PREFS)
// The cue the wall's click plays for now, from the pane's ▶; this session only.
const listeningAtom = atom({ plugin: 'puppy-theme', key: 'listening' } as const, null as CueName | null)
// Wall clicks the app reported while listening, so the pane can say they arrive.
const heardAtom = atom({ plugin: 'puppy-theme', key: 'heard' } as const, 0)

// How long a borrowed click lasts before the wall's own click comes back.
export const LISTEN_MS = 60_000
let backSoon: Timer | undefined

const WALL_LABEL: Record<Wall, string> = { sky: 'night sky frame', plain: 'plain wall' }
const CUE_LABEL: Record<CueName, string> = {
  send: 'you send a message',
  tool: 'a tool starts',
  compact: 'the chat is compacted',
  done: 'claude finishes',
  ask: 'something asks you',
  error: 'a turn breaks',
  click: 'you click the wall',
}
const shortName = (name: PaletteName): string => PALETTES[name].label.replace('lofi puppy · ', '')

// Sets the whole look; a build that refuses style or sound gets colors and
// the backdrop alone.
const wear = async ($: EngineInterface, prefs: Prefs): Promise<void> => {
  const listening = (await read($, listeningAtom)) ?? null
  const problem = unpainted(colorsFor(prefs.palette).problems)
  if (problem !== undefined) {
    $.ui.log(`puppy-theme: ${problem}`)
  }
  let set
  try {
    set = await $.theme.set(lookFor(prefs, listening))
  } catch (error) {
    $.ui.log(`puppy-theme: style or sound refused, colors only (${String(error)})`)
    set = await $.theme.set(baseLook(prefs))
  }
  if (!set.isDrawn) {
    $.ui.log(`puppy-theme: not drawn (${set.reason})`)
  }
}

// One change from the pane: keep it, then wear it.
const pick = async ($: EngineInterface, change: (p: Prefs) => Prefs): Promise<void> => {
  await update($, prefsAtom, was => change(parsePrefs(was)))
  const now = parsePrefs(await read($, prefsAtom))
  await $.store.set(STORE_KEY, now)
  await wear($, now)
}

// A cue whose notes play one after another: on the wall they come one a click.
const isStepped = (cue: CueName): boolean =>
  (SOUND.cues?.[cue]?.layers ?? []).some(l => 'step' in l && l.step !== undefined && 'notes' in l && l.notes.length > 1)

// ▶ in the pane: the wall's click plays that cue for a minute, so the app's
// own sound can be heard. ▶ again (■), another ▶, or the minute ends it.
const listen = async ($: EngineInterface, cue: CueName | null): Promise<void> => {
  backSoon?.cancel()
  backSoon = undefined
  await update($, listeningAtom, () => cue)
  await update($, heardAtom, () => 0)
  await wear($, parsePrefs(await read($, prefsAtom)))
  if (cue !== null) {
    backSoon = $.clock.after(LISTEN_MS, () => void listen($, null))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'look', description: "pick the puppy's palette, wall, message style and sounds" })
    const prefs = parsePrefs(await $.store.get(STORE_KEY))
    await update($, prefsAtom, () => prefs)
    await update($, listeningAtom, () => null)
    await wear($, prefs)
    return next(e)
  })

  on('command.run', { command: 'look' }, async $ => {
    await $.ui.open({ id: PANE, title: 'look' })
    return { text: 'look opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const prefs = parsePrefs(await read($, prefsAtom))
    const listening = (await read($, listeningAtom)) ?? null
    const heard = (await read($, heardAtom)) ?? 0
    const drawsHere = e.surface === 'desktop' || e.surface === 'mobile'

    const choice = (key: string, isOn: boolean, label: string, onPress: () => Promise<void>) => (
      <Button key={key} label={`${isOn ? '●' : '○'} ${label}`} plain dimColor={!isOn} onPress={onPress} />
    )
    const toggle = (
      key: string,
      isOn: boolean,
      label: string,
      note: string,
      onPress: () => Promise<void>,
      play?: { isPlaying: boolean; onPress: () => Promise<void> },
    ) => (
      <Box key={`row-${key}`} flexDirection="row" gap={1}>
        <Box width={3} flexShrink={0}>
          <Button key={key} label={isOn ? '☑' : '☐'} plain dimColor onPress={onPress} />
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor={!isOn} wrap="truncate-end">
            {label}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Text dimColor>{note}</Text>
          {play === undefined ? null : (
            <Button key={`play-${key}`} label={play.isPlaying ? '■' : '▶'} plain dimColor={!play.isPlaying} onPress={play.onPress} />
          )}
        </Box>
      </Box>
    )
    const cuesOn = CUES.filter(c => prefs.cues[c]).length

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {drawsHere ? 'kept on this computer, for every session' : 'the look draws in the desktop app; picks here count there'}
        </Text>
        <Box key="card-palette" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">palette</Text>
            <Text dimColor>{shortName(prefs.palette)}</Text>
          </Box>
          {(Object.keys(PALETTES) as PaletteName[]).map(name =>
            choice(`palette-${name}`, prefs.palette === name, shortName(name), () => pick($, p => ({ ...p, palette: name }))),
          )}
        </Box>
        <Box key="card-wall" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">wall</Text>
            <Text dimColor>{WALL_LABEL[prefs.wall]}</Text>
          </Box>
          {WALLS.map(w => choice(`wall-${w}`, prefs.wall === w, WALL_LABEL[w], () => pick($, p => ({ ...p, wall: w }))))}
        </Box>
        <Box key="card-messages" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">messages</Text>
            <Text dimColor>{prefs.style ? 'on' : 'off'}</Text>
          </Box>
          {toggle('style', prefs.style, 'pixel cards, airier text, quiet tool rows', '', () =>
            pick($, p => ({ ...p, style: !p.style })),
          )}
        </Box>
        <Box key="card-sounds" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
          <Box flexDirection="row" justifyContent="space-between">
            <Text weight="semibold">sounds</Text>
            <Text dimColor>{`${cuesOn} of ${CUES.length}`}</Text>
          </Box>
          <Text dimColor>play once the speaker in the title bar is on</Text>
          {drawsHere && listening !== null ? (
            <Box key="listening" flexDirection="row" gap={1}>
              <Text color="warning">click the wall</Text>
              <Text dimColor wrap="truncate-end">
                {isStepped(listening)
                  ? `to hear ${listening}: left to right, one note each`
                  : `to hear ${listening}`}
                {heard > 0 ? ` · ${heard} heard` : ''}
              </Text>
            </Box>
          ) : null}
          {CUES.map(c =>
            toggle(
              `cue-${c}`,
              prefs.cues[c],
              c,
              CUE_LABEL[c],
              () => pick($, p => ({ ...p, cues: { ...p.cues, [c]: !p.cues[c] } })),
              drawsHere ? { isPlaying: listening === c, onPress: () => listen($, listening === c ? null : c) } : undefined,
            ),
          )}
        </Box>
      </Box>
    )
  })

  // The app tells the mod of a click on the bare wall; count it while listening.
  on('ui.pointer', async ($, e, next) => {
    if ((await read($, listeningAtom)) != null) {
      await update($, heardAtom, n => (n ?? 0) + 1)
    }
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const name = paletteOfScene(e.props.scene)
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || name === undefined) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg source={sceneFor(name)} alt="a small framed night sky on the wall" />
  })
}
