import { expect, test } from 'vitest'
import { ConfigStore } from './config.svelte'
import { Overlays } from './overlay.svelte'
import { RESET_KEY } from './dailies'
import { REPLACED } from './settingsForm'
import type { BoardSummary, Command, ConfigView, Notice, StateView } from './types'

const todo: StateView = { keyword: 'TODO', color: 'blue', finished: false, inCycle: true }
const done: StateView = { keyword: 'DONE', color: 'green', finished: true, inCycle: true }
const board = (name: string): BoardSummary => ({ name, columns: ['TODO', 'DONE'] })

function view(patch: Partial<ConfigView> = {}): ConfigView {
  return {
    states: [todo, done],
    boards: [board('A'), board('B')],
    archiveAfterDays: 14,
    autoArchive: true,
    git: { enabled: false, commitDelayMinutes: 5, pullIntervalMinutes: 10 },
    dailiesReset: '00:00',
    replaced: [],
    version: 1,
    ...patch,
  }
}

/**
 * A fake core over one `config.toml`: a write carrying another version than the file's is refused as
 * `configChanged` (the file is left as it is); an accepted write bumps the version and its answer is applied
 * through `apply`, as `App.apply` does. `handEdit` changes the file and sends `config:changed` (foreign);
 * `quietEdit` changes it with no event, as when the core first reads the change on a write.
 */
function setup(start: ConfigView = view()) {
  let file = start
  const sent: Command[] = []
  const shownRefusals: string[] = []
  const notices: Notice[] = []
  const overlays = new Overlays(() => false)
  const store: ConfigStore = new ConfigStore({
    overlays,
    exec: async (cmd, refused) => {
      sent.push(cmd)
      await Promise.resolve()
      if (cmd.type === 'config.get') {
        store.apply(file)
        return
      }
      if (cmd.type === 'states.usage') return
      if (!('version' in cmd)) throw new Error(`unexpected ${cmd.type}`)
      if (cmd.version !== file.version) {
        if (!refused?.('configChanged')) shownRefusals.push('configChanged')
        return
      }
      file = { ...written(file, cmd), version: file.version + 1 }
      store.apply(file)
    },
    leave: () => {},
    flush: async () => {},
    notify: (n) => notices.push(n),
  })
  store.apply(file)
  return {
    store,
    overlays,
    sent,
    shownRefusals,
    notices,
    file: () => file,
    handEdit(patch: Partial<ConfigView>) {
      file = { ...file, ...patch, version: file.version + 1 }
      store.apply(file, true)
    },
    quietEdit(patch: Partial<ConfigView>) {
      file = { ...file, ...patch, version: file.version + 1 }
    },
  }
}

function written(file: ConfigView, cmd: Command): ConfigView {
  switch (cmd.type) {
    case 'boards.set':
      return { ...file, boards: cmd.boards as BoardSummary[] }
    case 'config.setGit':
      return {
        ...file,
        git: { enabled: cmd.enabled, commitDelayMinutes: cmd.commitDelayMinutes, pullIntervalMinutes: cmd.pullIntervalMinutes },
      }
    case 'config.setDailies':
      return { ...file, dailiesReset: cmd.reset }
    case 'config.setBoard':
      return { ...file, archiveAfterDays: cmd.archiveAfterDays, autoArchive: cmd.autoArchive ?? file.autoArchive }
    case 'states.set':
      return { ...file, states: cmd.states as StateView[] }
    default:
      throw new Error(`unexpected ${cmd.type}`)
  }
}

const versionOf = (cmd: Command | undefined) => (cmd && 'version' in cmd ? cmd.version : undefined)

test('a write carries the version shown', async () => {
  const t = setup(view({ version: 5 }))
  await t.store.setDailiesReset('06:00')
  expect(t.sent).toEqual([{ type: 'config.setDailies', reset: '06:00', version: 5 }])
  expect(t.store.version).toBe(6)
})

test('two quick writes: the second carries the version the first answer left', async () => {
  const t = setup()
  const a = t.store.setGit({ enabled: true })
  const b = t.store.setBoardSettings({ archiveAfterDays: 3 })
  await Promise.all([a, b])
  expect(t.sent.map(versionOf)).toEqual([1, 2])
  expect(t.shownRefusals).toEqual([])
  // The second write is made from the settings the first answer left: Git stays on.
  expect(t.file().git.enabled).toBe(true)
  expect(t.file().archiveAfterDays).toBe(3)
})

test('a configChanged refusal asks config.get and counts later versions as foreign', async () => {
  const t = setup()
  t.store.editBoard(1) // opened on version 1
  t.quietEdit({ archiveAfterDays: 30 }) // the file is version 2; no event
  await t.store.setGit({ enabled: true }) // sent at 1: refused, the core read the file again
  expect(t.sent.map((c) => c.type)).toEqual(['config.setGit', 'config.get'])
  expect(t.shownRefusals).toEqual(['configChanged']) // the refusal is a notice
  expect(t.store.version).toBe(2)
  expect(t.store.archiveDays).toBe(30)
  // The dialog opened before that change: its save carries its old version and is refused.
  const r = await t.store.saveBoard(board('Renamed'))
  expect(versionOf(t.sent.at(-2))).toBe(1)
  expect(r.ok).toBe(false)
  expect(t.file().boards.map((b) => b.name)).toEqual(['A', 'B'])
})

test('a board dialog opened before a hand edit is refused and closes', async () => {
  const t = setup()
  t.store.editBoard(1)
  expect(t.store.dialog).toEqual({ index: 1, name: 'B', version: 1 })
  expect(t.overlays.current).toEqual({ kind: 'boardSettings' })
  t.handEdit({ boards: [board('A'), { name: 'B', columns: ['TODO'] }] }) // by hand, in config.toml
  const r = await t.store.saveBoard({ name: 'B', columns: ['DONE'] })
  const set = t.sent.find((c) => c.type === 'boards.set')
  expect(versionOf(set)).toBe(1)
  expect(r).toEqual({ at: 1, ok: false, renamedFrom: null })
  expect(t.shownRefusals).toEqual(['configChanged'])
  expect(t.store.dialog).toBeNull()
  expect(t.overlays.current).toBeNull()
  // The hand edit stays in the file.
  expect(t.file().boards[1]).toEqual({ name: 'B', columns: ['TODO'] })
  expect(t.file().version).toBe(2)
})

test('an own Settings change while the dialog is open does not refuse it', async () => {
  const t = setup()
  t.store.editBoard(1)
  await t.store.setGit({ enabled: true }) // version 2, own
  const r = await t.store.saveBoard({ name: 'C', columns: ['TODO'] })
  expect(versionOf(t.sent.at(-1))).toBe(2)
  expect(r).toEqual({ at: 1, ok: true, renamedFrom: 'B' })
  expect(t.store.dialog).toBeNull()
  expect(t.overlays.current).toBeNull()
  expect(t.file().boards.map((b) => b.name)).toEqual(['A', 'C'])
  expect(t.file().git.enabled).toBe(true)
})

test('the dialog follows its board by name when a hand edit reorders the boards', async () => {
  const t = setup()
  t.store.editBoard(1)
  t.handEdit({ boards: [board('b'), board('A')] })
  expect(t.store.dialog?.index).toBe(0)
  expect(t.overlays.current).toEqual({ kind: 'boardSettings' })
  expect(t.notices).toEqual([])
  // Its save is still refused (a hand edit came since it opened), but names the board where it is now.
  const r = await t.store.saveBoard(board('B'))
  expect(r.at).toBe(0)
})

test("the dialog's board removed by hand: a notice and the dialog closes", () => {
  const t = setup()
  t.store.editBoard(1)
  t.handEdit({ boards: [board('A')] })
  expect(t.store.dialog).toBeNull()
  expect(t.overlays.current).toBeNull()
  expect(t.notices).toEqual([{ kind: 'refused', message: 'The board B changed in breccia/config.toml.' }])
})

test("the dialog's own boards.set answer is not followed", async () => {
  const t = setup()
  t.store.editBoard(1)
  const r = await t.store.saveBoard({ name: 'C', columns: ['TODO'] })
  // Followed by name, the answer (A, C) would have closed it with "The board B changed".
  expect(t.notices).toEqual([])
  expect(r).toEqual({ at: 1, ok: true, renamedFrom: 'B' })
  expect(t.store.boards.map((b) => b.name)).toEqual(['A', 'C'])
})

test('an older config is ignored', () => {
  const t = setup(view({ version: 3 }))
  expect(t.store.apply(view({ version: 2, archiveAfterDays: 1, states: [todo] }))).toBeNull()
  expect(t.store.version).toBe(3)
  expect(t.store.archiveDays).toBe(14)
  expect(t.store.states).toEqual([todo, done])
})

test('the replaced keys set dailiesResetInvalid and numbersInvalid', () => {
  const t = setup()
  expect(t.store.dailiesResetInvalid).toBe(false)
  expect(t.store.numbersInvalid).toEqual({ delay: false, interval: false, archive: false })
  t.store.apply(view({ version: 2, replaced: [RESET_KEY, REPLACED.pullInterval, REPLACED.archiveDays] }))
  expect(t.store.dailiesResetInvalid).toBe(true)
  expect(t.store.numbersInvalid).toEqual({ delay: false, interval: true, archive: true })
  t.store.apply(view({ version: 3, replaced: [REPLACED.commitDelay] }))
  expect(t.store.dailiesResetInvalid).toBe(false)
  expect(t.store.numbersInvalid).toEqual({ delay: true, interval: false, archive: false })
})

test("a new folder's first config is no shift", () => {
  const t = setup()
  expect(t.store.apply(view({ version: 2, states: [todo], autoArchive: true, archiveAfterDays: 3 }))).toEqual({
    tasks: true,
    board: true,
    archiveNow: true,
  })
  t.store.newFolder()
  expect(t.store.apply(view({ version: 3, states: [done], archiveAfterDays: 7 }))).toEqual({
    tasks: false,
    board: false,
    archiveNow: false,
  })
  expect(t.store.states).toEqual([done])
})

test('a new board is added with the default columns; its index is returned', async () => {
  const t = setup()
  expect(await t.store.newBoard('C')).toBe(2)
  expect(t.file().boards.at(-1)).toEqual({ name: 'C', columns: ['TODO', 'DONE'] })
})

test('moveBoard moves the board by name in the list shown when it is sent', async () => {
  const t = setup(view({ boards: [board('A'), board('B'), board('C')] }))
  const a = t.store.moveBoard(2, -1)
  const b = t.store.moveBoard(2, -1) // ↑ ↑ on C, both named before the first answer
  await Promise.all([a, b])
  expect(t.file().boards.map((x) => x.name)).toEqual(['C', 'A', 'B'])
})

test('the board dialog is open while its overlay is: Cancel or another dialog closes it', () => {
  const t = setup()
  t.store.editBoard(0)
  t.store.closeBoardDialog()
  expect([t.store.dialog, t.overlays.current]).toEqual([null, null])
  t.store.editBoard(0)
  t.overlays.open({ kind: 'help' })
  expect(t.store.dialog).toBeNull()
  // Its board then changes by hand: nothing reopens it.
  t.handEdit({ boards: [board('B'), board('A')] })
  expect(t.overlays.current).toEqual({ kind: 'help' })
})
