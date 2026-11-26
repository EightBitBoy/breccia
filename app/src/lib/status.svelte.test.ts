import { expect, test } from 'vitest'
import { flushSync } from 'svelte'
import { StatusItems } from './status.svelte'
import type { StatusItem } from './status'

const item = (id: string, text = id): StatusItem => ({ id, side: 'left', order: 1, text, progress: null, tone: 'normal' })

test('bind sets the item and clears it when the value turns null', () => {
  const status = new StatusItems()
  let value = $state<StatusItem | null>(item('zoom'))
  const stop = $effect.root(() => {
    status.bind('zoom', () => value)
  })
  flushSync()
  expect(status.left.map((i) => i.id)).toEqual(['zoom'])
  value = item('zoom', 'changed')
  flushSync()
  expect(status.left.map((i) => i.text)).toEqual(['changed'])
  value = null
  flushSync()
  expect(status.empty).toBe(true)
  stop()
})
