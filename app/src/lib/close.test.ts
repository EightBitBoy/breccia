import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { closeCheck, closePrompt } from './close'
import type { Command, Output } from './types'

test('closePrompt', () => {
  expect(closePrompt([])).toBeNull()
  expect(closePrompt([{ title: 'A' }])).toBe('Changes to 1 page could not be saved: A. Close anyway?')
  expect(closePrompt([{ title: 'A' }, { title: 'B' }])).toBe('Changes to 2 pages could not be saved: A, B. Close anyway?')
})

test('closePrompt names text shown in unsent notices', () => {
  expect(closePrompt([], 0)).toBeNull()
  expect(closePrompt([], 1)).toBe('Text in 1 notice was not saved. Close anyway?')
  expect(closePrompt([], 2)).toBe('Text in 2 notices was not saved. Close anyway?')
  expect(closePrompt([{ title: 'A' }], 1)).toBe(
    'Changes to 1 page could not be saved: A. Text in 1 notice was not saved. Close anyway?',
  )
})

function output(dirty: Output['dirty']): Output {
  return {
    page: null,
    focus: null,
    notices: [],
    folder: null,
    config: null,
    refs: null,
    names: null,
    tree: null,
    changed: [],
    feed: null,
    pages: [],
    board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
    removed: [],
    dirty,
  }
}

describe('closeCheck', () => {
  let log: string[]
  beforeEach(() => {
    log = []
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('closeCheck flushes first, then asks the core which pages are unsaved', async () => {
    const client = {
      flush: async () => void log.push('flush'),
      run: async (cmd: Command) => (log.push(cmd.type), output([{ key: 'a', title: 'A' }])),
    }
    await expect(closeCheck(client, () => 0)).resolves.toBe('Changes to 1 page could not be saved: A. Close anyway?')
    expect(log).toEqual(['flush', 'flush', 'session.dirty'])
  })

  test('closeCheck asks while an unsent-text notice is shown, counted after the flush', async () => {
    let unsent = 0
    const client = {
      // The flush itself can fail with unknownBlock and show an unsent notice.
      flush: async () => void (unsent = 1),
      run: async () => output([]),
    }
    await expect(closeCheck(client, () => unsent)).resolves.toBe('Text in 1 notice was not saved. Close anyway?')
  })

  test('closeCheck still asks about unsent notices when session.dirty fails', async () => {
    const client = { flush: async () => {}, run: () => Promise.reject({ code: 'internal', message: 'boom' }) }
    await expect(closeCheck(client, () => 2)).resolves.toBe('Text in 2 notices was not saved. Close anyway?')
  })

  test('closeCheck lets the window close when nothing is unsaved', async () => {
    const client = { flush: async () => {}, run: async () => output([]) }
    await expect(closeCheck(client, () => 0)).resolves.toBeNull()
  })

  test('closeCheck lets the window close when session.dirty fails', async () => {
    const client = { flush: async () => {}, run: () => Promise.reject({ code: 'internal', message: 'boom' }) }
    await expect(closeCheck(client, () => 0)).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  test('closeCheck never hangs on a stuck queue', async () => {
    const client = { flush: () => new Promise<void>(() => {}), run: () => new Promise<Output>(() => {}) }
    const done = vi.fn()
    void closeCheck(client, () => 0, 1000).then(done)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toHaveBeenCalledWith(null)
  })
})
