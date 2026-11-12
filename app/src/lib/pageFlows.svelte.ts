// The flows behind the page operations: which dialog is open and what each answer runs.
import { errorMessage } from '../api'
import { baseName, deleteConfirm, folderOf, joinPath, moveTargets, parentOf, renameConfirm, type Op } from './pageOps'
import { dropCommand } from './treeDrop'
import type { Row } from './treeRows'
import type { Command, Notice, Output, TreeView } from './types'

export type Dialog =
  | { kind: 'name'; title: string; initial: string; ok: (name: string) => void }
  | { kind: 'move'; title: string; targets: { path: string; label: string }[]; ok: (path: string) => void }
  | { kind: 'confirm'; message: string; ok: () => void }

export interface FlowEnv {
  /** Runs a command; the output is applied by the app. Rejects with the core's error. */
  run(cmd: Command): Promise<Output>
  tree(): TreeView | null
  /** The key of the page shown. */
  shown(): string | null
  notify(n: Notice): void
  /** Shows the home view (the journal feed). */
  home(): Promise<unknown>
}

export class PageFlows {
  /** The dialog on screen, or null. */
  dialog = $state<Dialog | null>(null)

  constructor(private env: FlowEnv) {}

  /** The context menu chose `op` on `row` (null: the tree area). */
  start(op: Op, row: Row | null) {
    const tree = this.env.tree()
    const folder = row === null ? '' : row.kind === 'folder' ? (row.path ?? '') : tree && row.key ? folderOf(tree, row.key) : ''
    switch (op) {
      case 'newPage':
        return this.ask('New page', '', (name) => void this.go({ type: 'page.create', name, folder }))
      case 'newFolder':
        return this.ask('New folder', '', (name) => void this.go({ type: 'dir.create', path: joinPath(folder, name) }))
      case 'rename':
        if (row?.kind === 'folder' && row.path !== undefined) {
          const path = row.path
          return this.ask('Rename folder', row.label, (name) =>
            name === row.label ? undefined : void this.go({ type: 'dir.rename', path, to: joinPath(parentOf(path), name) }),
          )
        }
        if (row?.key) return this.askRename(row.key, row.label, row.kind === 'tag' ? 'Rename tag' : 'Rename page')
        return
      case 'move':
        return this.move(row)
      case 'delete':
        return this.remove(row)
    }
  }

  /** Asks for a new name for page `key` (the title click starts the flow at `rename`). */
  askRename(key: string, old: string, title = 'Rename page') {
    this.ask(title, old, (name) => void this.rename(key, old, name))
  }

  /** Renames page `key`, after asking when other pages' links change. */
  async rename(key: string, old: string, name: string) {
    if (name === old) return
    try {
      const reach = (await this.env.run({ type: 'page.renameReach', key, name })).reach
      const message = renameConfirm(old, name, reach ?? 0)
      const go = () => void this.go({ type: 'page.rename', key, name })
      if (message === null) go()
      else this.dialog = { kind: 'confirm', message, ok: go }
    } catch (e) {
      this.refuse(e)
    }
  }

  private move(row: Row | null) {
    const tree = this.env.tree()
    if (!tree || !row) return
    if (row.kind === 'folder' && row.path !== undefined) {
      const path = row.path
      const targets = moveTargets(tree, { kind: 'folder', path })
      this.dialog = {
        kind: 'move',
        title: `Move folder “${row.label}”`,
        targets,
        ok: (to) => void this.go({ type: 'dir.rename', path, to: joinPath(to, baseName(path)) }),
      }
    } else if (row.kind === 'page' && row.key) {
      const key = row.key
      const targets = moveTargets(tree, { kind: 'page', folder: folderOf(tree, key) })
      this.dialog = {
        kind: 'move',
        title: `Move page “${row.label}”`,
        targets,
        ok: (folder) => void this.go({ type: 'page.move', key, folder }),
      }
    }
  }

  /** `row` was dragged onto `folder` ('' is the top level): moves it there; nothing where it already is. */
  async moveTo(row: Row, folder: string) {
    const tree = this.env.tree()
    const cmd = tree && dropCommand(tree, row, folder)
    if (cmd) await this.go(cmd)
  }

  private remove(row: Row | null) {
    if (!row) return
    if (row.kind === 'folder' && row.path !== undefined) {
      const path = row.path
      this.dialog = {
        kind: 'confirm',
        message: deleteConfirm(row.label, true),
        ok: () => void this.go({ type: 'dir.delete', path }),
      }
    } else if (row.key && (row.kind === 'page' || row.kind === 'day')) {
      const key = row.key
      this.dialog = {
        kind: 'confirm',
        message: deleteConfirm(row.kind === 'day' ? row.key : row.label, false),
        ok: () => void this.go({ type: 'page.delete', key }),
      }
    }
  }

  private ask(title: string, initial: string, ok: (name: string) => void) {
    this.dialog = { kind: 'name', title, initial, ok }
  }

  /** Runs a changing command; if it removed the shown page, the home view is shown instead. */
  private async go(cmd: Command) {
    try {
      const out = await this.env.run(cmd)
      const shown = this.env.shown()
      if (shown !== null && out.removed.includes(shown)) {
        await this.env.home()
      }
    } catch (e) {
      this.refuse(e)
    }
    // Not every command carries the tree, and the watcher may be late. After a refusal too: the tree shown may be stale.
    await this.env.run({ type: 'folder.tree' }).catch(() => {})
  }

  private refuse(e: unknown) {
    this.env.notify({ kind: 'refused', message: errorMessage(e) })
  }

  /** The dialog was answered: it closes first, so the action may open a follow-up dialog. */
  answer(value: string) {
    const d = this.dialog
    this.dialog = null
    if (d?.kind === 'confirm') d.ok()
    else d?.ok(value)
  }

  close() {
    this.dialog = null
  }
}
