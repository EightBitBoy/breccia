import { describe, expect, it } from 'vitest'
import { JustRenamed, followRename, removalFor } from './followRename'

describe('followRename', () => {
  it('follows when the shown page is the renamed one', () => {
    expect(followRename('old', { from: 'old', to: 'new' })).toBe('new')
  })

  it('does nothing for another page or with no page shown', () => {
    expect(followRename('other', { from: 'old', to: 'new' })).toBeNull()
    expect(followRename(null, { from: 'old', to: 'new' })).toBeNull()
  })

  it('follows a fast A→B→C rename to the newest key while the page is still on A', () => {
    const r = new JustRenamed(() => 1000)
    // A→B is followed, but showing B fails: B was renamed to C meanwhile.
    expect(followRename('a', { from: 'a', to: 'b' }, r)).toBe('b')
    r.add('a', 'b')
    expect(removalFor('a', 'a', r)).toBe('renamed')
    expect(followRename('a', { from: 'b', to: 'c' }, r)).toBe('c')
    r.add('b', 'c')
    expect(removalFor('a', 'b', r)).toBe('other')
    expect(r.newest('a')).toBe('c')
  })

  it('does not follow an expired chain', () => {
    let now = 1000
    const r = new JustRenamed(() => now, 5000)
    r.add('a', 'b')
    now += 5000
    expect(followRename('a', { from: 'b', to: 'c' }, r)).toBeNull()
  })
})

describe('removalFor', () => {
  it('tells the shown page, its old key and other pages apart', () => {
    const r = new JustRenamed(() => 1000)
    expect(removalFor(null, 'a', r)).toBe('other')
    expect(removalFor('a', 'x', r)).toBe('other')
    expect(removalFor('a', 'a', r)).toBe('removed')
    r.add('a', 'b')
    expect(removalFor('a', 'a', r)).toBe('renamed')
    expect(removalFor('a', 'a', r)).toBe('removed') // a second removal is news
  })

  it('reports the page removed when the key it was on its way to is removed', () => {
    const r = new JustRenamed(() => 1000)
    r.add('a', 'b') // followed, but showing b failed and b was then deleted
    expect(removalFor('a', 'a', r)).toBe('renamed')
    expect(removalFor('a', 'b', r)).toBe('removed')
  })
})

describe('JustRenamed', () => {
  it('swallows exactly the removal of a just-renamed key, once', () => {
    const now = 1000
    const r = new JustRenamed(() => now)
    r.add('old', 'new')
    expect(r.swallow('other')).toBe(false)
    expect(r.swallow('old')).toBe(true)
    expect(r.swallow('old')).toBe(false) // a second removal is news
    expect(r.newest('old')).toBe('new') // the chain outlives the swallowed removal
  })

  it('expires', () => {
    let now = 1000
    const r = new JustRenamed(() => now, 5000)
    r.add('old', 'new')
    now += 5000
    expect(r.swallow('old')).toBe(false)
    expect(r.newest('old')).toBe('old')
    r.add('old', 'new')
    now += 4999
    expect(r.swallow('old')).toBe(true)
  })

  it('stops on a cycle', () => {
    const r = new JustRenamed(() => 1000)
    r.add('a', 'b')
    r.add('b', 'a')
    expect(['a', 'b']).toContain(r.newest('a'))
  })
})

describe('JustRenamed.clear', () => {
  it('forgets the renames of the old folder', () => {
    const r = new JustRenamed(() => 1000)
    r.add('a', 'b')
    r.clear()
    expect(r.newest('a')).toBe('a')
    expect(removalFor('a', 'a', r)).toBe('removed')
  })
})
