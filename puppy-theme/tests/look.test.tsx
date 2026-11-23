import { expect, test } from 'claude-code/testing'

import { checkColors } from '../hooks/make-colors.js'
import { LOOK, problems } from '../hooks/look'
import { SCENE, SCENE_ID } from '../hooks/scene'

const BACKDROP = { plugin: 'puppy-theme', component: 'Backdrop', props: { scene: SCENE_ID, glass: {} } } as const

test('the colors use only names the app knows, and Desktop paints them', () => {
  expect(problems.filter(line => line.startsWith("Desktop won't paint"))).toEqual([])
  // checkColors also lists the soft contrast lines makeColors gives; keep only
  // the ones that would paint nothing or stop the theme
  const hard = checkColors(LOOK.colors!).filter(line => !/ is [\d.]+:1 in (light|dark) mode/.test(line))
  expect(hard).toEqual([])
})

test('the scene is pure vector, slow and small enough', () => {
  expect(SCENE.length).toBeLessThan(131_072)
  expect(SCENE).not.toMatch(/<image|<text|<foreignObject|href|CDATA/)
  expect(SCENE).toContain('crispEdges')
  // no orange: in the brand it belongs to the headphones alone
  expect(SCENE.toLowerCase()).not.toContain('#f08a3c')
  // every animation lasts 7 seconds or more: nothing flashes
  for (const [, s] of SCENE.matchAll(/(\d+(?:\.\d+)?)s (?:ease|linear)/g)) {
    expect(Number(s)).toBeGreaterThanOrEqual(7)
  }
})

test('session start sets the whole look once', async ($, on) => {
  const sets: unknown[] = []
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets).toHaveLength(1)
  expect(sets[0]).toMatchObject({ backdrop: { scene: SCENE_ID } })
})

test('the backdrop draws on the desktop and leaves other scenes alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeTruthy()
  await ui.unmount()

  const other = await $.ui.mount({ ...BACKDROP, props: { scene: 'pond', glass: {} }, surface: 'desktop' })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})
