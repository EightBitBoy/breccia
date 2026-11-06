import { expect, test } from 'vitest'
import { dialogVersion, foreignAfterRefusal, gitCommand, WriteQueue, writeConfig, type WriteEnv } from './configWrite'
import type { Command } from './types'

/** A fake core: a hand edit lands while typed text is flushed, and a write from an older version is refused. */
function core() {
  let version = 1
  const sent: Command[] = []
  const order: string[] = []
  const env: WriteEnv = {
    version: () => version,
    leave: () => void order.push('leave'),
    flush: async () => {
      order.push('flush')
      version = 2 // config:changed from a hand edit arrives meanwhile
    },
    send: async (cmd) => {
      order.push('send')
      sent.push(cmd)
      return 'version' in cmd && cmd.version === version
    },
  }
  return { env, sent, order }
}

test('a write carries the version captured before the flush, so a hand edit meanwhile refuses it', async () => {
  const { env, sent, order } = core()
  const ok = await writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 7, version }))
  expect(order).toEqual(['leave', 'flush', 'send'])
  expect(sent).toEqual([{ type: 'config.setBoard', archiveAfterDays: 7, version: 1 }])
  expect(ok).toBe(false)
})

test('a version captured earlier (a dialog opened, a question asked) is the one sent', async () => {
  const { env, sent } = core()
  await writeConfig(env, (version) => ({ type: 'boards.set', boards: [], version }), 0)
  expect(sent).toEqual([{ type: 'boards.set', boards: [], version: 0 }])
})

test('without a change meanwhile the write goes through', async () => {
  const { env } = core()
  env.flush = async () => {}
  expect(await writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 7, version }))).toBe(true)
})

/** A fake core whose accepted write raises the version, as the real one does; the answer is applied when it settles. */
function versioned() {
  let version = 1
  const sent: Command[] = []
  const env: WriteEnv = {
    version: () => version,
    leave: () => {},
    flush: async () => {},
    send: async (cmd) => {
      sent.push(cmd)
      await new Promise((r) => setTimeout(r, 1)) // the answer takes a moment
      const ok = 'version' in cmd && cmd.version === version
      if (ok) version += 1
      return ok
    },
  }
  return { env, sent }
}

test('two quick writes in a row: the second waits for the first answer and carries its version', async () => {
  const { env } = versioned()
  const q = new WriteQueue()
  const a = q.run(() => writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 7, version })))
  const b = q.run(() => writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 8, version })))
  expect(await Promise.all([a, b])).toEqual([true, true])
})

test('without the queue the second write carries the old version and is refused (the false notice)', async () => {
  const { env } = versioned()
  const a = writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 7, version }))
  const b = writeConfig(env, (version) => ({ type: 'config.setBoard', archiveAfterDays: 8, version }))
  expect(await Promise.all([a, b])).toEqual([true, false])
})

test('a refused or failed write does not stop the next one', async () => {
  const q = new WriteQueue()
  const first = q.run(async () => {
    throw new Error('gone')
  })
  await expect(first).rejects.toThrow('gone')
  expect(await q.run(async () => 5)).toBe(5)
})

test('a Git change sets only what was changed, over the settings shown when it is sent', () => {
  const shown = { enabled: true, commitDelayMinutes: 10, pullIntervalMinutes: 5 }
  expect(gitCommand(shown, { enabled: false }, 4)).toEqual({
    type: 'config.setGit',
    enabled: false,
    commitDelayMinutes: 10,
    pullIntervalMinutes: 5,
    version: 4,
  })
  expect(gitCommand(shown, { commitDelayMinutes: 1, pullIntervalMinutes: 2 }, 4)).toMatchObject({
    enabled: true,
    commitDelayMinutes: 1,
    pullIntervalMinutes: 2,
  })
})

test('dialogVersion builds on own changes and refuses after a foreign one', () => {
  expect(dialogVersion(3, 5, 2)).toBe(5)
  expect(dialogVersion(3, 5, 3)).toBe(5)
  expect(dialogVersion(3, 5, 4)).toBe(3)
})

test('a configChanged refusal counts every later version as foreign', () => {
  // The dialog opened at 5; a write sent at 5 is refused because of a hand edit that no config:changed reports.
  const foreign = foreignAfterRefusal(0, 5, 5)
  expect(dialogVersion(5, 6, foreign)).toBe(5) // the dialog opened before it: refused
  expect(dialogVersion(6, 6, foreign)).toBe(6) // opened on the reloaded file: builds on it
  expect(foreignAfterRefusal(9, 5, 5)).toBe(9) // never goes back
})

test("a board dialog's own intended refusal marks nothing foreign", () => {
  // The dialog opened at 3 and a hand edit came since (foreign 4): it sends 3 on purpose and is refused. The core read
  // nothing new, so the shown version 5 stays the file's: a later own change must not refuse a dialog opened at 5.
  const foreign = foreignAfterRefusal(4, 5, 3)
  expect(foreign).toBe(4)
  expect(dialogVersion(5, 6, foreign)).toBe(6)
})
