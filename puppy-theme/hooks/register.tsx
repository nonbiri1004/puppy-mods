import type { EngineInterface, Register } from 'claude-code'

import { baseLook, colorsFor, fullLook, unpainted } from './look'
import { DEFAULT_PALETTE, PALETTES, type PaletteName } from './palette'
import { paletteOfScene, sceneFor } from './scene'

const isPalette = (name: string): name is PaletteName => name in PALETTES

// Sets the whole look; a build that refuses style or sound gets colors and
// the backdrop alone.
const wear = async ($: EngineInterface, name: PaletteName): Promise<void> => {
  const problem = unpainted(colorsFor(name).problems)
  if (problem !== undefined) {
    $.ui.log(`puppy-theme: ${problem}`)
  }
  let set
  try {
    set = await $.theme.set(fullLook(name))
  } catch (error) {
    $.ui.log(`puppy-theme: style or sound refused, colors only (${String(error)})`)
    set = await $.theme.set(baseLook(name))
  }
  if (!set.isDrawn) {
    $.ui.log(`puppy-theme: not drawn (${set.reason})`)
  }
}

export const register: Register = (on, options) => {
  const chosen = String(options.palette ?? '')
  const start: PaletteName = isPalette(chosen) ? chosen : DEFAULT_PALETTE

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'puppy-look',
      description: `switch the puppy's palette for this session: ${Object.keys(PALETTES).join(' or ')}`,
    })
    await wear($, start)
    return next(e)
  })

  on('command.run', { command: 'puppy-look' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()
    if (!isPalette(name)) {
      return { text: `puppy-look: pick one of ${Object.keys(PALETTES).join(', ')}` }
    }
    await wear($, name)
    return { text: `puppy-look: ${PALETTES[name].label}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const name = paletteOfScene(e.props.scene)
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || name === undefined) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg source={sceneFor(name)} alt="a small framed night sky on the wall" isInteractive />
  })
}
