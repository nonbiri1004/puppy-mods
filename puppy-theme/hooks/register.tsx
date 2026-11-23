import type { Register } from 'claude-code'

import { LOOK, unpainted } from './look'
import { SCENE, SCENE_ID } from './scene'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const problem = unpainted()
    if (problem !== undefined) {
      $.ui.log(problem)
    }
    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) {
      $.ui.log(`puppy-theme: not drawn (${set.reason})`)
    }
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== SCENE_ID) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SCENE} alt="a small framed night sky on a warm grey wall" isInteractive />
  })
}
