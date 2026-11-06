import { expect, test } from 'vitest'
import { NoticeCenter, type NoticeEnv } from './noticeCenter.svelte'
import { UNSENT } from './notices'
import type { Command } from './types'

function setup() {
  const calls: unknown[] = []
  const env: NoticeEnv = {
    typingMark: () => 7,
    resolveConflict: (...a) => void calls.push(['resolve', ...a]),
    exec: (cmd: Command) => void calls.push(['exec', cmd]),
  }
  return { nc: new NoticeCenter(env), calls }
}

test('a conflict with a disk version offers Keep mine and Use theirs', () => {
  const { nc, calls } = setup()
  nc.notify({ kind: 'conflict', page: 'p', block: 3, mine: 'a', theirs: 'b', message: 'm' })
  expect(nc.items[0].actions?.map((a) => a.label)).toEqual(['Keep mine', 'Use theirs'])
  nc.items[0].actions![1].run()
  expect(nc.items).toEqual([])
  expect(calls).toEqual([['resolve', 3, 'b', true, 7]])
})

test('changed on disk offers Reload from disk and Keep mine', () => {
  const { nc, calls } = setup()
  nc.notify({ kind: 'saveFailed', page: 'p', reason: 'changedOnDisk', message: 'm' })
  expect(nc.items[0].actions?.map((a) => a.label)).toEqual(['Reload from disk', 'Keep mine'])
  nc.items[0].actions![0].run()
  nc.notify({ kind: 'saveFailed', page: 'p', reason: 'changedOnDisk', message: 'm' })
  nc.items[0].actions![1].run()
  expect(calls).toEqual([
    ['exec', { type: 'page.reload', key: 'p' }],
    ['exec', { type: 'page.overwrite', key: 'p' }],
  ])
})

test('a note about what Breccia did by itself is no error and offers no action', () => {
  const { nc } = setup()
  nc.notify({ kind: 'info', message: 'Archived 2 finished tasks (done more than 14 days ago)' })
  expect(nc.items[0]).toMatchObject({ text: 'Archived 2 finished tasks (done more than 14 days ago)', error: false })
  expect(nc.items[0].actions).toBeUndefined()
})

test('unsent counts notices holding text the core never got', () => {
  const { nc } = setup()
  nc.notify({ kind: 'conflict', page: 'p', block: 3, mine: 'a', theirs: null, message: UNSENT })
  expect(nc.unsent()).toBe(1)
})

test('a new folder dismisses the notices whose actions belong to the old one; unsent text and plain notices stay', () => {
  const { nc } = setup()
  nc.notify({ kind: 'saveFailed', page: 'p', reason: 'changedOnDisk', message: 'disk' })
  nc.notify({ kind: 'conflict', page: 'p', block: 3, mine: 'a', theirs: 'b', message: 'both' })
  nc.notify({ kind: 'conflict', page: 'p', block: 4, mine: 'c', theirs: null, message: UNSENT })
  nc.notify({ kind: 'refused', message: 'plain' })
  nc.newFolder()
  // The conflict offering Keep mine stays: its text may be saved nowhere else (a switch is refused while it is shown).
  expect(nc.items.map((i) => i.text)).toEqual(['both', UNSENT, 'plain'])
})

test('unresolved names the pages whose notice still offers Keep mine or Use theirs, once each', () => {
  const { nc } = setup()
  nc.notify({ kind: 'conflict', page: 'anna', block: 3, mine: 'a', theirs: 'b', message: 'm' })
  nc.notify({ kind: 'conflict', page: 'anna', block: 4, mine: 'c', theirs: 'd', message: 'm2' })
  nc.notify({ kind: 'conflict', page: 'bob', block: 5, mine: 'e', theirs: null, message: UNSENT })
  nc.notify({ kind: 'saveFailed', page: 'p', reason: 'changedOnDisk', message: 'disk' })
  expect(nc.unresolved()).toEqual(['anna'])
  nc.items.find((i) => i.text === 'm')!.actions![0].run()
  nc.items.find((i) => i.text === 'm2')!.actions![1].run()
  expect(nc.unresolved()).toEqual([])
})

test('a Keep mine / Use theirs notice that survives a folder switch keeps its text but no longer acts on the old blocks', () => {
  const { nc, calls } = setup()
  nc.notify({ kind: 'conflict', page: 'p', block: 3, mine: 'a', theirs: 'b', message: 'both' })
  nc.newFolder()
  const item = nc.items[0]
  expect(item.text).toBe('both')
  expect(item.detail).toEqual({ mine: 'a', theirs: 'b' })
  expect(item.actions?.map((a) => a.label)).toEqual(['OK'])
  expect(nc.unresolved()).toEqual([])
  item.actions![0].run()
  expect(nc.items).toEqual([])
  expect(calls).toEqual([])
})

test("a new folder drops the old folder's could-not-be-saved notices", () => {
  const { nc } = setup()
  nc.notify({ kind: 'saveFailed', page: 'p', reason: 'io', message: 'io' })
  nc.notify({ kind: 'refused', message: 'plain' })
  nc.newFolder()
  expect(nc.items.map((i) => i.text)).toEqual(['plain'])
  nc.saved(['p'])
  expect(nc.items.map((i) => i.text)).toEqual(['plain'])
})

test('saved removes only the notices of those pages', () => {
  const { nc } = setup()
  nc.notify({ kind: 'saveFailed', page: 'a', reason: 'io', message: 'a failed' })
  nc.notify({ kind: 'saveFailed', page: 'b', reason: 'changedOnDisk', message: 'b failed' })
  nc.notify({ kind: 'refused', message: 'plain' })
  nc.saved(['a'])
  expect(nc.items.map((i) => i.text)).toEqual(['b failed', 'plain'])
  nc.saved(['b'])
  expect(nc.items.map((i) => i.text)).toEqual(['plain'])
})
