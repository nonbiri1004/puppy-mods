import { expect, mock, test } from 'claude-code/testing'

const RUN = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

// an engine with no skill files, and three commands from plugins
function engine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const registered: string[] = []
  const opened: string[] = []
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on, { now: Date.parse('2026-10-30T10:00:00Z') })
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => {
    throw new Error('missing')
  })
  on('fs.exists', () => ({ value: false }))
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.list', () => ({
    value: [
      { name: 'console', description: 'Open the console', source: 'plugin', plugin: 'puppy-console@puppy-mods' },
      { name: 'my-kit', description: 'see which skills and mods you have', source: 'plugin', plugin: 'puppy-skills@puppy-mods' },
      { name: 'my-skills', description: 'the old name of /my-kit', source: 'plugin', plugin: 'puppy-skills@puppy-mods' },
      { name: 'compact', description: 'Compact', source: 'builtin' },
    ],
  }))
  on('ui.open', (_, e) => {
    opened.push(e.title ?? '')
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { registered, opened }
}

test('/my-kit and its old name /my-skills both open the pane and list the mods', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(w.registered).toEqual(['my-kit', 'my-skills'])
  for (const command of ['my-kit', 'my-skills']) {
    expect((await $.command.run({ ...RUN, command })).text).toBe('your kit is open.')
  }
  expect(w.opened).toEqual(['kit', 'kit'])
  const ui = await $.ui.mount({
    plugin: 'puppy-skills', component: 'Pane', requestId: 'puppy-skills', surface: 'desktop',
    props: { title: 'kit', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.startsWith('/'))
  // the old name is not listed twice; builtins are not mods
  expect(rows.map(t => t.split(' ')[0])).toEqual(['/console', '/my-kit'])
  expect((await ui.find({ type: 'Text', text: /0 skills · 2 mods/ }))?.text).toBeTruthy()
  await ui.unmount()
})
