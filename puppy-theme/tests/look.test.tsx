import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { colorsFor, fullLook } from '../hooks/look'
import { PALETTES, type PaletteName } from '../hooks/palette'
import { sceneFor, sceneId } from '../hooks/scene'

const NAMES = Object.keys(PALETTES) as PaletteName[]
const backdrop = (scene: string) =>
  ({ plugin: 'puppy-theme', component: 'Backdrop', props: { plugin: 'puppy-theme', scene, glass: { blur: 20, opacity: 0.6 } } }) as const

test('every palette uses only names the app knows, and Desktop paints it', () => {
  for (const name of NAMES) {
    const { colors, problems } = colorsFor(name)
    expect(problems.filter(line => line.startsWith("Desktop won't paint"))).toEqual([])
    // checkColors also lists the soft contrast lines; keep only the ones that
    // would paint nothing or stop the theme
    const hard = checkColors(colors).filter(line => !/ is [\d.]+:1 in (light|dark) mode/.test(line))
    expect(hard).toEqual([])
  }
})

test('no palette carries orange: in the brand it is the headphones alone', () => {
  for (const name of NAMES) {
    expect(JSON.stringify(PALETTES[name]).toLowerCase()).not.toMatch(/#f08a3c|#d65d0e|#fe8019|#af3a03/)
  }
})

test('the scenes are pure vector, slow and small enough', () => {
  for (const name of NAMES) {
    const scene = sceneFor(name)
    expect(scene.length).toBeLessThan(131_072)
    expect(scene).not.toMatch(/<image|<text|<foreignObject|href|CDATA|undefined/)
    expect(scene).toContain('crispEdges')
    // every animation lasts 7 seconds or more: nothing flashes
    for (const [, s] of scene.matchAll(/(\d+(?:\.\d+)?)s (?:ease|linear)/g)) {
      expect(Number(s)).toBeGreaterThanOrEqual(7)
    }
  }
})

test('session start sets the whole look once, warm grey first', async ($, on) => {
  const sets: unknown[] = []
  const logs: unknown[] = []
  on('ui.log', (_, e) => {
    logs.push(e)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('command.register', () => ({ value: { command: 'puppy-look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]).toMatchObject({ backdrop: { scene: sceneId('warm') } })
  expect(sets[0]).toMatchObject({ style: fullLook('warm').style })
  expect(logs).toEqual([])
})

test('a build that refuses style or sound still gets colors and the backdrop', async ($, on) => {
  const sets: Record<string, unknown>[] = []
  const logs: unknown[] = []
  on('ui.log', (_, e) => {
    logs.push(e)
    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    if ('sound' in e) {
      throw new Error('sound is not taken here')
    }
    sets.push(e)
    return { value: { isDrawn: true as const, requestId: 'test' } }
  })
  on('command.register', () => ({ value: { command: 'puppy-look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]).toHaveProperty('colors')
  expect(sets[0]).not.toHaveProperty('style')
  expect(JSON.stringify(logs)).toContain('colors only')
})

test('the backdrop draws our scenes on the desktop and leaves others alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const name of NAMES) {
    const ui = await $.ui.mount({ ...backdrop(sceneId(name)), surface: 'desktop' })
    expect(await ui.find({ type: 'Svg' })).toBeTruthy()
    await ui.unmount()
  }
  const other = await $.ui.mount({ ...backdrop('pond'), surface: 'desktop' })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})
