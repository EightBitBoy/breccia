import { describe, expect, it } from 'vitest'
import { firstSelectable, hitSegments, moveSelection, rowKey, searchRows, stateColor } from './search'
import type { NameView, SearchView } from './types'

const view = (over: Partial<SearchView> = {}): SearchView => ({
  query: 'lic', text: 'lic', filtered: false, date: null, more: false,
  groups: [{ page: 'licence', title: 'Licence', kind: 'page', hits: [
    { id: 7, state: 'TODO', segments: [{ text: 'the ', hit: false }, { text: 'licence', hit: true }] },
    { id: 8, state: null, segments: [{ text: 'licence notes', hit: false }] },
  ] }],
  ...over,
})
const names: NameView[] = [{ key: 'licence', name: 'Licence', exists: true }, { key: 'anna', name: 'Anna', exists: true }]

describe('searchRows', () => {
  it('lists pages first, then groups of hits', () => {
    expect(searchRows(view(), names).map((r) => r.kind)).toEqual(['page', 'create', 'group', 'hit', 'hit'])
  })
  it('offers no create row when a page has exactly the name', () => {
    expect(searchRows(view({ query: 'licence', text: 'licence' }), names).map((r) => r.kind)).toEqual(['page', 'group', 'hit', 'hit'])
  })
  it('puts the date first and offers no create row for a date', () => {
    const v = view({ query: '12 Mar', text: '12 Mar', groups: [], date: { key: '2026-03-12', title: 'Thursday, 12 Mar 2026', inFeed: false } })
    expect(searchRows(v, names)[0]).toEqual({ kind: 'date', key: '2026-03-12', title: 'Thursday, 12 Mar 2026', inFeed: false })
    expect(searchRows(v, names).some((r) => r.kind === 'create')).toBe(false)
  })
  it('offers no pages while filtered', () => {
    expect(searchRows(view({ query: 'TODO lic', filtered: true }), names).map((r) => r.kind)).toEqual(['group', 'hit', 'hit'])
  })
  it('ends with the more line', () => {
    expect(searchRows(view({ more: true }), names).at(-1)).toEqual({ kind: 'more' })
  })
  it('creates the page with the typed case', () => {
    expect(searchRows(view({ query: 'Licensing', text: 'Licensing', groups: [] }), names).at(-1)).toEqual({ kind: 'create', name: 'Licensing' })
  })
})

describe('selection', () => {
  const rows = searchRows(view({ query: 'TODO', text: '', filtered: true }), names) // group, hit, hit
  it('starts on the first selectable row and skips headers', () => {
    expect(firstSelectable(rows)).toBe(1)
    expect(moveSelection(rows, 1, -1)).toBe(1)
    expect(moveSelection(rows, 1, 1)).toBe(2)
    expect(moveSelection(rows, 2, 1)).toBe(2)
  })
  it('has nothing to select in an empty list', () => {
    expect(firstSelectable([])).toBe(-1)
  })
})

describe('a hit line', () => {
  it('drops the leading state keyword, which shows as the chip', () => {
    expect(hitSegments('TODO', [{ text: 'TODO Ask ', hit: false }, { text: 'Ben', hit: true }])).toEqual([
      { text: 'Ask ', hit: false },
      { text: 'Ben', hit: true },
    ])
  })
  it('shows a block that is only the keyword as the chip alone', () => {
    expect(hitSegments('TODO', [{ text: 'TODO', hit: false }])).toEqual([])
  })
  it('drops a first segment that is only the keyword', () => {
    expect(hitSegments('TODO', [{ text: 'TODO ', hit: false }, { text: 'lic', hit: true }])).toEqual([{ text: 'lic', hit: true }])
  })
  it('keeps the text without a state, a highlighted keyword, or a cut start', () => {
    const plain = [{ text: 'TODO list', hit: false }]
    expect(hitSegments(null, plain)).toEqual(plain)
    const marked = [{ text: 'TODO', hit: true }, { text: ' x', hit: false }]
    expect(hitSegments('TODO', marked)).toEqual(marked)
    const cut = [{ text: '…the TODO ', hit: false }, { text: 'x', hit: true }]
    expect(hitSegments('TODO', cut)).toEqual(cut)
  })
  it('colours the chip like a rendered block', () => {
    const states = [{ keyword: 'TODO', color: 'amber', finished: false, inCycle: true }]
    expect(stateColor(states, 'TODO')).toBe('amber')
    expect(stateColor(states, 'GONE')).toBeUndefined()
  })
})

describe('rowKey', () => {
  it('names each kind', () => {
    expect(rowKey({ kind: 'date', key: '2026-01-02', title: 'x', inFeed: true })).toBe('date:2026-01-02')
    expect(rowKey({ kind: 'page', name: 'Alpha' })).toBe('page:Alpha')
    expect(rowKey({ kind: 'create', name: 'New' })).toBe('create:New')
    expect(rowKey({ kind: 'hit', page: 'a', id: 7, state: null, segments: [] })).toBe('hit:7')
    expect(rowKey({ kind: 'group', page: 'a', title: 'A' })).toBe('group:a')
    expect(rowKey({ kind: 'more' })).toBe('more')
  })
})
