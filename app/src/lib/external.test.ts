import { expect, test } from 'vitest'
import { InFlight, Refreshes, WhenIdle } from './external'
import type { Output } from './types'

/** A WhenIdle whose replays run when the test says so. */
function idle() {
  const state = { busy: false }
  const later: (() => void)[] = []
  const w = new WhenIdle(
    () => state.busy,
    (f) => later.push(f),
  )
  const tick = () => later.splice(0).forEach((f) => f())
  return { w, state, later, tick }
}

test('WhenIdle runs a handler at once when nothing runs', () => {
  const { w } = idle()
  const ran: string[] = []
  w.run(() => ran.push('a'))
  expect(ran).toEqual(['a'])
})

test('WhenIdle holds handlers while a command runs and replays them, in order, after it settled', () => {
  const { w, state, later, tick } = idle()
  const ran: string[] = []
  state.busy = true
  w.run(() => ran.push('a'))
  w.run(() => ran.push('b'))
  expect(ran).toEqual([])
  // Still busy (the next command already started): nothing is scheduled.
  w.settled()
  expect(later.length).toBe(0)
  state.busy = false
  w.settled()
  w.settled()
  expect(later.length).toBe(1)
  expect(ran).toEqual([])
  tick()
  expect(ran).toEqual(['a', 'b'])
})

test('WhenIdle holds a replayed handler again if a command started meanwhile, never dropping it', () => {
  const { w, state, tick } = idle()
  const ran: string[] = []
  state.busy = true
  w.run(() => ran.push('a'))
  state.busy = false
  w.settled()
  state.busy = true
  tick()
  expect(ran).toEqual([])
  state.busy = false
  w.settled()
  tick()
  expect(ran).toEqual(['a'])
})

test('Refreshes keeps at most one refresh queued per key', async () => {
  const runs: { key: string; done: () => void }[] = []
  const r = new Refreshes((key) => new Promise<void>((done) => runs.push({ key, done })))
  r.request('a')
  r.request('a')
  r.request('b')
  expect(runs.map((x) => x.key)).toEqual(['a', 'b'])
  runs[0].done()
  await Promise.resolve()
  await Promise.resolve()
  r.request('a')
  expect(runs.map((x) => x.key)).toEqual(['a', 'b', 'a'])
})

test('Refreshes takes a new request after a failed run', async () => {
  let fail: () => void = () => {}
  let n = 0
  const r = new Refreshes(() => {
    n++
    return new Promise<void>((_, reject) => (fail = () => reject(new Error('x'))))
  })
  r.request('a')
  fail()
  await Promise.resolve()
  await Promise.resolve()
  r.request('a')
  expect(n).toBe(2)
})

function inFlight() {
  const later: (() => void)[] = []
  const f = new InFlight((g) => later.push(g))
  const pending: { type: string; resolve: () => void }[] = []
  const invoke = f.wrap(
    (req) =>
      new Promise<Output>((resolve) =>
        pending.push({ type: req.command.type, resolve: () => resolve({} as Output) }),
      ),
  )
  return { f, later, pending, invoke }
}

test('InFlight holds shell events while a counted command runs, then replays them', async () => {
  const { f, later, pending, invoke } = inFlight()
  const ran: string[] = []
  const p = invoke({ generation: 0, command: { type: 'block.setText', id: 1, text: 'x' } })
  f.idle.run(() => ran.push('event'))
  expect(ran).toEqual([])
  pending[0].resolve()
  await p
  later.splice(0).forEach((g) => g())
  expect(ran).toEqual(['event'])
})

test('InFlight does not count page.refs or pages.list', () => {
  const { f, pending, invoke } = inFlight()
  void invoke({ generation: 0, command: { type: 'page.refs', key: 'a' } })
  void invoke({ generation: 0, command: { type: 'pages.list' } })
  const ran: string[] = []
  f.idle.run(() => ran.push('event'))
  expect(ran).toEqual(['event'])
  expect(pending).toHaveLength(2)
})

test('Refreshes forgets its queued keys for a new folder, so the same key can be asked for again', () => {
  const runs: string[] = []
  const r = new Refreshes((key) => (runs.push(key), new Promise<void>(() => {})))
  r.request('a')
  r.clear()
  r.request('a')
  expect(runs).toEqual(['a', 'a'])
})
