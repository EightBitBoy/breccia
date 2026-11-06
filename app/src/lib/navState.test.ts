import { expect, test } from 'vitest'
import { Nav } from './nav.svelte'
import type { NavPlace } from './nav'

const pg = (key: string): NavPlace => ({ kind: 'page', key })

/** One Back as App does it: step, the view arrives, the restore settles. */
function back(nav: Nav, here: NavPlace | null) {
  const e = nav.back(here)
  if (e) nav.arrive(e.place)
  nav.settle()
  return e
}

test('arrivals are steps; null and the place shown again are not', () => {
  const nav = new Nav()
  expect(nav.canBack).toBe(false)
  nav.arrive(pg('A'))
  nav.arrive(null)
  nav.arrive(pg('B'))
  nav.arrive(pg('C'))
  nav.arrive(pg('C'))
  expect(nav.canBack).toBe(true)
  expect(nav.canForward).toBe(false)
  expect(back(nav, pg('C'))?.place).toEqual(pg('B'))
  expect(back(nav, pg('B'))?.place).toEqual(pg('A'))
  expect(nav.canBack).toBe(false)
})

test('back marks a restore as busy until it settles; forward goes the other way', () => {
  const nav = new Nav()
  ;['A', 'B', 'C'].forEach((k) => nav.arrive(pg(k)))
  const e = nav.back(pg('C'))
  expect(e?.place).toEqual(pg('B'))
  expect(nav.busy).toBe(true)
  nav.arrive(pg('B'))
  nav.settle()
  expect(nav.busy).toBe(false)
  expect(nav.canForward).toBe(true)
  const f = nav.forward(pg('B'))
  expect(f?.place).toEqual(pg('C'))
  nav.arrive(pg('C'))
  nav.settle()
  expect(nav.forward(pg('C'))).toBeNull()
  const first = new Nav()
  first.arrive(pg('A'))
  expect(first.canBackFrom(pg('A'))).toBe(false)
  expect(first.canBackFrom(null)).toBe(true)
  expect(first.back(pg('A'))).toBeNull()
  expect(first.busy).toBe(false)
})

test('a new step after going back drops the forward steps', () => {
  const nav = new Nav()
  ;['A', 'B', 'C'].forEach((k) => nav.arrive(pg(k)))
  back(nav, pg('C'))
  nav.arrive(pg('D'))
  expect(nav.canForward).toBe(false)
  expect(nav.forward(pg('D'))).toBeNull()
  expect(back(nav, pg('D'))?.place).toEqual(pg('B'))
})

test('the history keeps the newest 50 steps', () => {
  const nav = new Nav()
  for (let i = 0; i <= 50; i++) nav.arrive(pg(`P${i}`))
  let here = pg('P50')
  for (let i = 49; i >= 1; i--) {
    const e = back(nav, here)
    expect(e?.place).toEqual(pg(`P${i}`))
    here = e!.place
  }
  expect(nav.back(here)).toBeNull()
})

test('remember keeps the scroll of the current entry, but not during a restore', () => {
  const nav = new Nav()
  nav.arrive(pg('A'))
  nav.remember(120, null)
  nav.arrive({ kind: 'feed', day: null })
  nav.remember(0, '2026-03-12')
  const e = nav.back({ kind: 'feed', day: null })
  expect(e).toEqual({ place: pg('A'), scroll: 120, top: null })
  nav.remember(999, null) // the restore's own leave
  nav.arrive(pg('A'))
  nav.settle()
  expect(nav.forward(pg('A'))).toEqual({ place: { kind: 'feed', day: null }, scroll: 0, top: '2026-03-12' })
  nav.settle()
  expect(nav.back({ kind: 'feed', day: null })?.scroll).toBe(120)
})

test('back from a view that is not the current entry returns that entry', () => {
  const nav = new Nav()
  nav.arrive(pg('A'))
  nav.arrive(pg('B'))
  expect(nav.canBackFrom(null)).toBe(true)
  expect(nav.canBackFrom(pg('B'))).toBe(true)
  expect(nav.back(null)?.place).toEqual(pg('B'))
  nav.arrive(pg('B'))
  nav.settle()
  expect(nav.back(pg('B'))?.place).toEqual(pg('A'))
})

test('drop removes the entry stepped to; the next step goes on past it', () => {
  const nav = new Nav()
  ;['A', 'B', 'C'].forEach((k) => nav.arrive(pg(k)))
  expect(nav.back(pg('C'))?.place).toEqual(pg('B'))
  nav.drop()
  expect(nav.back(pg('C'))?.place).toEqual(pg('A'))
  nav.arrive(pg('A'))
  nav.settle()
  expect(nav.forward(pg('A'))?.place).toEqual(pg('C'))
  nav.settle()
  const fwd = new Nav()
  ;['A', 'B', 'C'].forEach((k) => fwd.arrive(pg(k)))
  back(fwd, pg('C'))
  back(fwd, pg('B'))
  expect(fwd.forward(pg('A'))?.place).toEqual(pg('B'))
  fwd.drop()
  expect(fwd.forward(pg('A'))?.place).toEqual(pg('C'))
})

test('renames are followed; removals go and equal neighbours merge', () => {
  const nav = new Nav()
  nav.arrive(pg('A'))
  nav.arrive({ kind: 'board', name: 'Tasks' })
  nav.arrive(pg('X'))
  nav.arrive(pg('A'))
  nav.arrive(pg('B'))
  nav.renamed('A', 'A2')
  nav.boardRenamed('Tasks', 'Work')
  nav.removed('B') // the current entry: the one before becomes current
  expect(nav.canForward).toBe(false)
  expect(back(nav, pg('A2'))?.place).toEqual(pg('X'))
  expect(back(nav, pg('X'))?.place).toEqual({ kind: 'board', name: 'Work' })
  expect(back(nav, { kind: 'board', name: 'Work' })?.place).toEqual(pg('A2'))
  const merge = new Nav()
  ;['A', 'X', 'A', 'B'].forEach((k) => merge.arrive(pg(k)))
  merge.removed('X')
  expect(back(merge, pg('B'))?.place).toEqual(pg('A'))
  expect(merge.canBack).toBe(false)
})

test('clear empties the history', () => {
  const nav = new Nav()
  ;['A', 'B', 'C'].forEach((k) => nav.arrive(pg(k)))
  back(nav, pg('C'))
  nav.clear()
  expect(nav.canBack).toBe(false)
  expect(nav.canForward).toBe(false)
  expect(nav.back(null)).toBeNull()
})
