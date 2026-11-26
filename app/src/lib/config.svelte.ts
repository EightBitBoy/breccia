// The folder's settings (`config.toml`) as the window shows them, and the rules of their writes: each write carries
// the version it was made from, writes run one at a time, and the board dialog follows its board by name.
import {
  boardDialogAfterConfig,
  defaultColumns,
  moveBoardNamed,
  settingsAfterSet,
  settingsIndexAfterConfig,
  withBoard,
  withoutBoard,
} from './board'
import { archiveShift } from './autoArchive'
import { configShift, isNewerConfig } from './configChange'
import { dialogVersion, foreignAfterRefusal, gitCommand, WriteQueue, writeConfig, type WriteEnv } from './configWrite'
import { DEFAULT_RESET, RESET_KEY } from './dailies'
import type { Overlays } from './overlay.svelte'
import { REPLACED } from './settingsForm'
import { statesSet } from './stateEdit'
import type { BoardSummary, Command, ConfigView, GitSettings, Notice, StateRename, StateView } from './types'

export interface ConfigEnv {
  /** The board dialog is open while the `boardSettings` overlay is. */
  overlays: Overlays
  /**
   * host.exec: runs the command; its answer's config reaches `apply` before it settles. `refused(code)` returns
   * true to keep the refusal quiet (else it is a notice).
   */
  exec(cmd: Command, refused?: (code: string | null) => boolean): Promise<void>
  /** The editor leaves its block. */
  leave(): void
  /** Typed text is sent first (§2). */
  flush(): Promise<void>
  notify(n: Notice): void
}

/** What a newly applied config changes on screen (`configShift`, `archiveShift`). */
export interface ConfigShift {
  tasks: boolean
  board: boolean
  archiveNow: boolean
}

/** The open board settings dialog: its board's index and name, and the config version its values come from. */
export interface BoardDialog {
  index: number
  name: string
  version: number
}

export class ConfigStore {
  /** The configured task states. */
  states = $state.raw<StateView[]>([])
  /** The configured boards. */
  boards = $state<BoardSummary[]>([])
  /** `[board] archive_after_days`. */
  archiveDays = $state(14)
  /** `[board] auto_archive`. */
  autoArchive = $state(true)
  /** `[git]`; null until a folder's first config. */
  git = $state<GitSettings | null>(null)
  /** `ConfigView.version` of the settings shown: the writes carry it (the core refuses an older one). */
  version = $state(0)
  /** `[dailies] reset`, `HH:MM`. */
  dailiesReset = $state(DEFAULT_RESET)
  /** The file's `[dailies] reset` is no time and is read as 00:00 (`ConfigView.replaced`). */
  dailiesResetInvalid = $state(false)
  /** The number keys whose value in the file is refused and read as the default (`ConfigView.replaced`). */
  numbersInvalid = $state({ delay: false, interval: false, archive: false })
  /** The board settings dialog's data; it is open while the `boardSettings` overlay is. */
  private dialogData = $state<BoardDialog | null>(null)

  /** The board settings dialog while open; null while closed. */
  get dialog(): BoardDialog | null {
    return this.env.overlays.is('boardSettings') ? this.dialogData : null
  }

  /** The config last applied; null until a folder's first one. */
  private last: ConfigView | null = null
  /**
   * The newest config version that came from a hand edit or pull (0: none in this folder). A board dialog opened
   * before it saves with its old version, so the core refuses it (`dialogVersion`); own Settings changes never
   * count, so they do not refuse the dialog.
   */
  private foreign = 0
  /** A `boards.set` from the dialog is on its way: its own answer is not a change to follow. */
  private boardSaving = false
  /**
   * Settings writes run one at a time: each is made once the previous answer is applied and carries its version,
   * so two quick changes are never refused as "changed on disk".
   */
  private writes = new WriteQueue()
  /** Writes: typed text first, then the write with the version its values were taken from (`writeConfig`). */
  private writeEnv: WriteEnv

  constructor(private env: ConfigEnv) {
    this.writeEnv = {
      version: () => this.version,
      leave: () => env.leave(),
      flush: () => env.flush(),
      send: async (cmd) => (await this.send(cmd)).ok,
    }
  }

  /**
   * The folder's settings: from `config.get`, a write's answer, or a hand edit or Git pull (`config:changed`, then
   * `foreign`: own writes never come that way). Null when older than the settings shown (a late event). The open
   * board dialog follows its board by name, except during its own save.
   */
  apply(c: ConfigView, foreign = false): ConfigShift | null {
    if (!isNewerConfig(this.version, c.version)) return null
    if (foreign) this.foreign = Math.max(this.foreign, c.version)
    const shift = { ...configShift(this.last, c), archiveNow: archiveShift(this.last, c) }
    this.last = c
    this.states = c.states
    if (this.dialog !== null && !this.boardSaving) {
      const d = boardDialogAfterConfig({ index: this.dialog.index, name: this.dialog.name }, c.boards)
      this.setDialog(d.index === null ? null : { ...this.dialog, index: d.index })
      if (d.notice) this.env.notify({ kind: 'refused', message: d.notice })
    }
    this.boards = c.boards
    this.archiveDays = c.archiveAfterDays
    this.autoArchive = c.autoArchive
    this.dailiesReset = c.dailiesReset
    this.dailiesResetInvalid = c.replaced.includes(RESET_KEY)
    this.numbersInvalid = {
      delay: c.replaced.includes(REPLACED.commitDelay),
      interval: c.replaced.includes(REPLACED.pullInterval),
      archive: c.replaced.includes(REPLACED.archiveDays),
    }
    this.git = c.git
    this.version = c.version
    return shift
  }

  /** A new notes folder: its first config changes nothing shown, and no hand edit of it has come yet. */
  newFolder(): void {
    this.last = null
    this.foreign = 0
  }

  /** Sends a command that writes config.toml; a refusal is a notice. Says whether it was accepted (and applied), else the refusal's code. */
  async send(cmd: Command): Promise<{ ok: boolean; code: string | null }> {
    let ok = true
    let code: string | null = null
    await this.env.exec(cmd, (c) => {
      ok = false
      code = c
      // The file changed on disk (a hand edit, a pull): the session read it again; show its settings. No
      // `config:changed` follows for it, so every version from now on counts as foreign, unless the write
      // carried an older version on purpose (a board dialog after a foreign change).
      if (c === 'configChanged') {
        this.foreign = foreignAfterRefusal(this.foreign, this.version, 'version' in cmd ? cmd.version : undefined)
        void this.env.exec({ type: 'config.get' })
      }
      return false
    })
    return { ok, code }
  }

  /** Settles once every write sent before is answered and applied. */
  ready(): Promise<void> {
    return this.writes.run(async () => {})
  }

  /** As `ready`, then the states' blocks are counted again (a rename or remove decides on fresh counts). */
  countUsage(): Promise<void> {
    return this.writes.run(() => this.env.exec({ type: 'states.usage' }))
  }

  /** `list` was made from the states of `version` (taken before any question); the usage is counted again after any answer. */
  setStates(list: StateView[], renames: StateRename[], version: number): Promise<void> {
    return this.writes.run(async () => {
      await writeConfig(this.writeEnv, (v) => statesSet(list, renames, v), version)
      await this.env.exec({ type: 'states.usage' })
    })
  }

  /** Only what the user changed changes, over the Git settings shown when it is sent. */
  setGit(patch: Partial<GitSettings>): Promise<void> {
    return this.writes.run(async () => {
      const shown = this.git
      if (shown !== null) await writeConfig(this.writeEnv, (version) => gitCommand(this.git ?? shown, patch, version))
    })
  }

  /** `[dailies] reset`, as `HH:MM`. */
  setDailiesReset(reset: string): Promise<void> {
    return this.writes.run(async () => {
      await writeConfig(this.writeEnv, (version) => ({ type: 'config.setDailies', reset, version }))
    })
  }

  /** `[board]`: only what the user changed changes, over the values shown when it is sent. */
  setBoardSettings(patch: { archiveAfterDays?: number; autoArchive?: boolean }): Promise<void> {
    return this.writes.run(async () => {
      await writeConfig(this.writeEnv, (version) => ({
        type: 'config.setBoard',
        archiveAfterDays: patch.archiveAfterDays ?? this.archiveDays,
        autoArchive: patch.autoArchive ?? this.autoArchive,
        version,
      }))
    })
  }

  /** ↑ / ↓ on a board: it moves the board with that name in the list shown when it is sent (↑ ↑ moves it twice). */
  moveBoard(i: number, dir: -1 | 1): Promise<void> {
    const name = this.boards[i]?.name
    if (name === undefined) return Promise.resolve()
    return this.writes.run(async () => {
      const list = moveBoardNamed(this.boards, name, dir)
      if (list !== null) await writeConfig(this.writeEnv, (version) => ({ type: 'boards.set', boards: list, version }))
    })
  }

  /** A new board with the default columns. The new board's index when accepted, else null. */
  async newBoard(name: string): Promise<number | null> {
    let index = 0
    const ok = await this.writes.run(() =>
      writeConfig(this.writeEnv, (version) => {
        index = this.boards.length // taken before the answer is applied
        return { type: 'boards.set', boards: [...this.boards, { name, columns: defaultColumns(this.states) }], version }
      }),
    )
    return ok ? index : null
  }

  /** Opens the settings dialog of board `i`; it edits the values of this config version. */
  editBoard(i: number): void {
    this.setDialog({ index: i, name: this.boards[i]?.name ?? '', version: this.version })
  }

  closeBoardDialog(): void {
    this.setDialog(null)
  }

  /**
   * Saves the dialog's board. After a hand edit since the dialog opened the core refuses it and the dialog closes;
   * any other refusal keeps the dialog and its edits. `at` is -1 when the board is gone (nothing is sent);
   * `renamedFrom` is the old name when an accepted save renamed it.
   */
  async saveBoard(b: BoardSummary): Promise<{ at: number; ok: boolean; renamedFrom: string | null }> {
    const old = this.dialog?.name ?? ''
    const r = await this.setDialogBoards((list, at) => withBoard(list, at, b))
    if (r.at < 0) return { at: r.at, ok: false, renamedFrom: null }
    this.afterSet(r)
    return { at: r.at, ok: r.ok, renamedFrom: r.ok && old !== b.name ? old : null }
  }

  /** Deletes the dialog's board; `at` as in `saveBoard`. */
  async deleteBoard(): Promise<{ at: number; ok: boolean }> {
    const r = await this.setDialogBoards((list, at) => withoutBoard(list, at))
    if (r.at < 0) return { at: r.at, ok: false }
    this.afterSet(r)
    return { at: r.at, ok: r.ok }
  }

  /** Every open and close of the board dialog comes through here. */
  private setDialog(d: BoardDialog | null): void {
    const was = this.dialog !== null
    this.dialogData = d
    if (d === null) this.env.overlays.close('boardSettings')
    else if (!was) this.env.overlays.open({ kind: 'boardSettings' })
  }

  /** The dialog after its `boards.set` was answered (`settingsAfterSet`). */
  private afterSet(r: { at: number; ok: boolean; code: string | null }): void {
    const d = this.dialog
    if (d !== null && settingsAfterSet(d.index, r.at, r.ok, r.code) === null) this.setDialog(null)
  }

  /**
   * A `boards.set` from the board dialog, queued after the other writes (typed text is sent first). `edit` makes
   * the list from the boards shown when it is sent and the dialog's board, found again by name (`at`, -1 when gone:
   * nothing is sent). It carries the current version unless a hand edit or pull came since the dialog opened; then
   * the version it opened on, so the core refuses it. An own state rename sent while the dialog was open is not
   * foreign: the dialog's old columns are then saved over it and kept as unknown states (a known limit, accepted).
   */
  private setDialogBoards(
    edit: (list: BoardSummary[], at: number) => BoardSummary[],
  ): Promise<{ ok: boolean; code: string | null; at: number }> {
    const d = this.dialog // as the save or delete was clicked
    return this.writes.run(async () => {
      let r: { ok: boolean; code: string | null } = { ok: false, code: null }
      const at = d === null ? -1 : (settingsIndexAfterConfig({ index: 0, name: d.name }, this.boards) ?? -1)
      if (d === null || at < 0) return { ...r, at }
      this.boardSaving = true
      try {
        await writeConfig(
          { ...this.writeEnv, send: async (cmd) => (r = await this.send(cmd)).ok },
          (version) => ({ type: 'boards.set', boards: edit(this.boards, at), version }),
          dialogVersion(d.version, this.version, this.foreign),
        )
      } finally {
        this.boardSaving = false
      }
      return { ...r, at }
    })
  }
}
