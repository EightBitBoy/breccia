import { describe, expect, it, vi } from 'vitest'
import { missingFolder, pickFolder, recentRows, switchCheck, switchPrompt } from './folderSwitch'
import type { Command, Output, RecentFolder } from './types'

const none = () => ({ unsent: 0, unresolved: [] })
const tail = 'Resolve the notices first (Reload from disk or Keep mine), or copy the text.'

describe('switchPrompt', () => {
  it('is null when clean', () => expect(switchPrompt([], 0)).toBeNull())
  it('names pages and notices', () => {
    expect(switchPrompt([{ title: 'A' }], 0)).toBe(`Breccia did not switch folders: changes to A could not be saved. ${tail}`)
    expect(switchPrompt([{ title: 'A' }, { title: 'B' }], 0)).toBe(`Breccia did not switch folders: changes to A, B could not be saved. ${tail}`)
    expect(switchPrompt([], 1)).toBe(`Breccia did not switch folders: text in 1 notice is not saved anywhere. ${tail}`)
    expect(switchPrompt([], 2)).toBe(`Breccia did not switch folders: text in 2 notices is not saved anywhere. ${tail}`)
    expect(switchPrompt([{ title: 'A' }], 1)).toBe(
      `Breccia did not switch folders: changes to A could not be saved; text in 1 notice is not saved anywhere. ${tail}`,
    )
  })
  it('names the pages whose notice still offers Keep mine or Use theirs (their text may be in the notice only)', () => {
    expect(switchPrompt([], 0, ['Anna'])).toBe(
      `Breccia did not switch folders: the notice about Anna still asks you to choose Keep mine or Use theirs. ${tail}`,
    )
    expect(switchPrompt([{ title: 'A' }], 0, ['Anna', 'Bob'])).toBe(
      `Breccia did not switch folders: changes to A could not be saved; the notices about Anna, Bob still ask you to choose Keep mine or Use theirs. ${tail}`,
    )
  })
})

describe('switchCheck', () => {
  const dirtyOut = (dirty: { title: string }[]) => ({ dirty }) as unknown as Output
  const couldNot = 'Breccia could not check for unsaved changes, so it did not switch folders. Try again.'
  it('flushes before asking, and is null when clean', async () => {
    const calls: string[] = []
    const client = {
      flush: vi.fn(async () => void calls.push('flush')),
      run: vi.fn(async (_c: Command) => {
        calls.push('dirty')
        return dirtyOut([])
      }),
    }
    expect(await switchCheck(client, none)).toBeNull()
    expect(calls[0]).toBe('flush')
    expect(calls.at(-1)).toBe('dirty')
    expect(calls.filter((c) => c === 'dirty')).toHaveLength(1)
  })
  it('names dirty pages', async () => {
    const client = { flush: async () => {}, run: async () => dirtyOut([{ title: 'A' }]) }
    expect(await switchCheck(client, none)).toBe(`Breccia did not switch folders: changes to A could not be saved. ${tail}`)
  })
  it('is refused while a notice still offers Keep mine or Use theirs', async () => {
    const client = { flush: async () => {}, run: async () => dirtyOut([]) }
    expect(await switchCheck(client, () => ({ unsent: 0, unresolved: ['Anna'] }))).toBe(
      `Breccia did not switch folders: the notice about Anna still asks you to choose Keep mine or Use theirs. ${tail}`,
    )
  })
  it('counts a failing session.dirty as not clean', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { flush: async () => {}, run: async () => Promise.reject(new Error('x')) }
    expect(await switchCheck(client, none)).toBe(couldNot)
  })
  it('counts a late session.dirty as not clean', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { flush: async () => {}, run: () => new Promise<Output>(() => {}) }
    expect(await switchCheck(client, none, 10)).toBe(couldNot)
  })
})

describe('recentRows', () => {
  const r = (path: string): RecentFolder => ({ path, name: path, exists: true })
  it('drops the open folder, ignoring case, separators and a trailing one', () => {
    expect(recentRows([r('C:\\Notes'), r('D:\\Other')], 'c:/notes/').map((x) => x.path)).toEqual(['D:\\Other'])
  })
  it('keeps all when none is open', () => expect(recentRows([r('C:\\Notes')], null)).toHaveLength(1))
})

describe('pickFolder', () => {
  it('gives the chosen folder, or null when the dialog was cancelled', async () => {
    const err = vi.fn()
    expect(await pickFolder(() => Promise.resolve('C:\\Notes'), err)).toBe('C:\\Notes')
    expect(await pickFolder(() => Promise.resolve(null), err)).toBeNull()
    expect(err).not.toHaveBeenCalled()
  })

  it('says when the dialog could not open', async () => {
    const err = vi.fn()
    expect(await pickFolder(() => Promise.reject(new Error('no')), err)).toBeNull()
    expect(err).toHaveBeenCalledWith('Could not open the folder picker: Error: no')
  })
})

describe('missingFolder', () => {
  it('explains a folder that no longer exists', () => {
    expect(missingFolder('C:\\Gone')).toBe('This folder no longer exists: C:\\Gone')
  })
})
