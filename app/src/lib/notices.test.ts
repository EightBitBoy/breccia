import { expect, test } from 'vitest'
import { addNotice, isUnsent, noticeKey, UNSENT } from './notices'
import type { Notice } from './types'

const MSG = 'This block changed on disk while you were editing it.'

function conflict(page: string, block: number, mine: string): Notice {
  return { kind: 'conflict', page, block, mine, theirs: 'disk', message: MSG }
}

function add(items: { key: string; n: Notice }[], n: Notice) {
  return addNotice(items, n, { key: noticeKey(n), n })
}

test('conflicts of two blocks with the same message are both shown', () => {
  let items = add([], conflict('p', 1, 'a'))
  items = add(items, conflict('p', 2, 'b'))
  items = add(items, conflict('q', 1, 'c'))
  expect(items.map((i) => i.n.kind === 'conflict' && i.n.mine)).toEqual(['a', 'b', 'c'])
})

test('a newer conflict of the same block replaces the older', () => {
  let items = add([], conflict('p', 1, 'old'))
  items = add(items, conflict('p', 2, 'other'))
  items = add(items, conflict('p', 1, 'new'))
  expect(items.map((i) => i.n.kind === 'conflict' && i.n.mine)).toEqual(['other', 'new'])
})

test('other notices are shown once per message', () => {
  const refused: Notice = { kind: 'refused', message: 'no' }
  let items = add([], refused)
  const same = add(items, { ...refused })
  expect(same).toBe(items)
  items = add(items, { kind: 'refused', message: 'other' })
  expect(items.length).toBe(2)
})

test('isUnsent: only the notice holding text the core never got', () => {
  expect(isUnsent({ kind: 'conflict', page: 'p', block: 1, mine: 'x', theirs: null, message: UNSENT })).toBe(true)
  // Deleted on disk while typing: the core kept the text as a new block.
  expect(isUnsent({ kind: 'conflict', page: 'p', block: 1, mine: 'x', theirs: null, message: 'kept' })).toBe(false)
  expect(isUnsent(conflict('p', 1, 'a'))).toBe(false)
  expect(isUnsent({ kind: 'refused', message: UNSENT })).toBe(false)
})
