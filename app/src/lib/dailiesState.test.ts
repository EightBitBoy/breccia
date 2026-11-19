import { expect, test } from 'vitest'
import { Dailies, type DailiesEnv } from './dailies.svelte'
import type { Command, DailyView, Notice, Output } from './types'

const daily = (id: number, checked: string | null = null): DailyView => ({ id, text: `d${id}`, checked, nested: false })
const at = (h: number, m = 0, s = 0, day = 10) => new Date(2026, 10, day, h, m, s)

// `refuse`: the core refuses every command but `dailies.list`; 'all': `dailies.list` fails too.
function setup(start: Date, refuse: boolean | 'all' = false) {
  let clock = start
  const sent: Command[] = []
  const notices: Notice[] = []
  const timers = new Map<number, { f: () => void; ms: number; every: boolean }>()
  let next = 1
  const env: DailiesEnv = {
    run: (cmd) => {
      sent.push(cmd)
      if (refuse === 'all' && cmd.type === 'dailies.list') return Promise.reject({ code: 'internal', message: 'No list.' })
      if (refuse && cmd.type !== 'dailies.list') return Promise.reject({ code: 'unknownDaily', message: 'That daily is gone.' })
      return Promise.resolve({} as Output)
    },
    notify: (n) => notices.push(n),
    now: () => clock,
    setTimeout: (f, ms) => (timers.set(next, { f, ms, every: false }), next++),
    clearTimeout: (h) => void timers.delete(h),
    setInterval: (f, ms) => (timers.set(next, { f, ms, every: true }), next++),
    clearInterval: (h) => void timers.delete(h),
  }
  const d = new Dailies(env)
  const once = () => [...timers.entries()].filter(([, t]) => !t.every)
  const fire = (h: number) => {
    const t = timers.get(h)!
    if (!t.every) timers.delete(h)
    t.f()
  }
  return { d, sent, notices, timers, once, fire, setClock: (c: Date) => (clock = c) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('the_timer_fires_at_the_reset', () => {
  const { d, once, fire, setClock } = setup(at(3, 59, 30))
  d.setReset('04:00')
  d.apply([daily(1, '2026-11-10 03:00')])
  d.start()
  expect(d.item?.text).toBe('Dailies ✓')
  expect(once().map(([, t]) => t.ms)).toEqual([30_000])
  setClock(at(4, 0, 0))
  fire(once()[0][0])
  expect(d.item?.text).toBe('Dailies 1 open')
  expect(once().map(([, t]) => t.ms)).toEqual([24 * 3600_000])
})

test('a_late_tick_after_sleep_unchecks', () => {
  const { d, timers, setClock } = setup(at(8))
  d.setReset('04:00')
  d.apply([daily(1, '2026-11-10 07:00')])
  d.start()
  expect(d.allDone).toBe(true)
  setClock(at(18, 0, 0, 10))
  setClock(at(6, 0, 0, 11))
  const tickH = [...timers.entries()].find(([, t]) => t.every)![0]
  timers.get(tickH)!.f()
  expect(d.allDone).toBe(false)
  expect(timers.get(tickH)!.ms).toBe(60_000)
})

test('wake sets now', () => {
  const { d, setClock } = setup(at(8))
  d.setReset('04:00')
  d.apply([daily(1, '2026-11-10 07:00')])
  setClock(at(6, 0, 0, 11))
  expect(d.allDone).toBe(true)
  d.wake()
  expect(d.allDone).toBe(false)
})

test('a_reset_change_rearms_the_timer', () => {
  const { d, once, timers } = setup(at(3, 59, 30))
  d.setReset('04:00')
  d.start()
  const [old] = once()[0]
  d.setReset('05:00')
  expect(timers.has(old)).toBe(false)
  expect(once().map(([, t]) => t.ms)).toEqual([3600_000 + 30_000])
  expect(d.reset).toBe('05:00')
})

test('a_folder_switch_drops_the_list', () => {
  const { d, once, timers } = setup(at(8))
  d.apply([daily(1)])
  d.start()
  const before = [...timers.keys()]
  expect(d.item).not.toBeNull()
  d.forget()
  expect([d.list, d.item]).toEqual([null, null])
  expect(d.groups).toEqual({ open: [], checked: [] })
  expect([...timers.keys()]).toEqual(before)
  expect(once().length).toBe(1)
  d.apply([daily(2)])
  expect(d.list?.map((x) => x.id)).toEqual([2])
})

test('stop_clears_every_timer', () => {
  const { d, timers } = setup(at(8))
  const stop = d.start()
  expect(timers.size).toBe(2)
  stop()
  expect(timers.size).toBe(0)
  d.setReset('05:00')
  expect(timers.size).toBe(0)
})

test('start twice does not leak timers', () => {
  const { d, timers } = setup(at(8))
  d.start()
  d.start()
  expect(timers.size).toBe(2)
})

test('commands_send_the_right_names', async () => {
  const { d, sent } = setup(at(8))
  d.apply([daily(1), daily(2)])
  const [one, two] = d.list!
  await d.check(one)
  await d.uncheck(one)
  await d.add('x')
  await d.edit(two, 'y')
  await d.remove(two)
  await d.move(one, null)
  await d.load()
  expect(sent).toEqual([
    { type: 'dailies.check', id: 1, shown: 'd1' },
    { type: 'dailies.uncheck', id: 1, shown: 'd1' },
    { type: 'dailies.add', text: 'x' },
    { type: 'dailies.edit', id: 2, text: 'y', shown: 'd2' },
    { type: 'dailies.delete', id: 2, shown: 'd2', nested: false },
    { type: 'dailies.move', id: 1, before: null, shown: 'd1' },
    { type: 'dailies.list' },
  ])
})

test('a command sends the text of the row the window showed, not the newer list', async () => {
  // A confirm or an edit field stayed open while the watcher took an outside change.
  const { d, sent } = setup(at(8))
  d.apply([daily(1)])
  const row = d.list![0]
  d.apply([{ ...daily(1), text: 'other' }])
  await d.remove(row)
  await d.edit(row, 'y')
  expect(sent).toEqual([
    { type: 'dailies.delete', id: 1, shown: 'd1', nested: false },
    { type: 'dailies.edit', id: 1, text: 'y', shown: 'd1' },
  ])
})

test('remove sends nested from the row the question was asked for', async () => {
  const { d, sent } = setup(at(8))
  d.apply([{ ...daily(1), nested: true }])
  const row = d.list![0]
  // Lines vanish outside while the confirm is open: the row still says nested.
  d.apply([daily(1)])
  await d.remove(row)
  expect(sent).toEqual([{ type: 'dailies.delete', id: 1, shown: 'd1', nested: true }])
})

test('check on a checked daily sends nothing', async () => {
  const { d, sent } = setup(at(8))
  d.setReset('04:00')
  d.apply([daily(1, '2026-11-10 07:00')])
  await d.check(d.list![0])
  expect(sent).toEqual([])
})

test('a refusal is one notice and one reload', async () => {
  const { d, sent, notices } = setup(at(8), true)
  d.apply([daily(1)])
  await d.check(d.list![0])
  await tick()
  expect(notices).toEqual([{ kind: 'refused', message: 'That daily is gone.' }])
  expect(sent).toEqual([{ type: 'dailies.check', id: 1, shown: 'd1' }, { type: 'dailies.list' }])
})

test('a_refused_change_gives_one_notice_even_when_the_reload_fails', async () => {
  const { d, sent, notices } = setup(at(8), 'all')
  d.apply([daily(1)])
  await d.check(d.list![0])
  expect(notices).toEqual([{ kind: 'refused', message: 'That daily is gone.' }])
  expect(sent).toEqual([{ type: 'dailies.check', id: 1, shown: 'd1' }, { type: 'dailies.list' }])
})

test('a failed load is one refused notice with the error text', async () => {
  const { d, notices } = setup(at(8), 'all')
  await d.load()
  expect(notices).toEqual([{ kind: 'refused', message: 'No list.' }])
})

test('open shows and loads; close hides and keeps the list', async () => {
  const { d, sent } = setup(at(8))
  d.apply([daily(1)])
  await d.open()
  expect([d.shown, sent]).toEqual([true, [{ type: 'dailies.list' }]])
  d.close()
  expect([d.shown, d.list?.length]).toEqual([false, 1])
})

test('add answers whether the daily was added, so the field can keep refused text', async () => {
  expect(await setup(at(8)).d.add('Check emails')).toBe(true)
  expect(await setup(at(8), true).d.add('Check emails')).toBe(false)
})
