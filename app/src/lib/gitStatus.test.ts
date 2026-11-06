import { describe, expect, it } from 'vitest'
import { GitStatus } from './git.svelte'
import type { GitView } from './types'

const min = 60_000
const t0 = Date.UTC(2026, 9, 30, 12, 0)
const v = (o: Partial<GitView>): GitView => ({ state: 'ready', top: 'C:/notes', remote: null, ahead: 0, lastCommit: t0 - 2 * min, lastSync: null, head: 'abc', problem: null, ...o })

describe('GitStatus', () => {
  it('item is null before any view', () => {
    expect(new GitStatus({ now: () => t0 }).item).toBeNull()
  })
  it('item follows set and tick moves the minutes on', () => {
    let now = t0
    const g = new GitStatus({ now: () => now })
    g.set(v({}))
    expect(g.item?.text).toBe('Saved to Git 2 min ago')
    now = t0 + 3 * min
    expect(g.item?.text).toBe('Saved to Git 2 min ago')
    g.tick()
    expect(g.item?.text).toBe('Saved to Git 5 min ago')
  })
  it('headChanged is true only when the head differs from the last view', () => {
    const g = new GitStatus({ now: () => t0 })
    expect(g.headChanged(v({ head: 'a' }))).toBe(true)
    g.set(v({ head: 'a' }))
    expect(g.headChanged(v({ head: 'a' }))).toBe(false)
    expect(g.headChanged(v({ head: 'b' }))).toBe(true)
  })
})
