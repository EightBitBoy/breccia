// The notices shown to the user, and the actions they offer.
import { addNotice, isUnsent, noticeKey } from './notices'
import type { BlockId, Command, Item, Notice } from './types'

export interface NoticeEnv {
  typingMark(): number
  resolveConflict(block: BlockId, text: string, show: boolean, since: number): void
  exec(cmd: Command): void
}

export class NoticeCenter {
  items = $state<Item[]>([])
  private nextId = 0

  constructor(private env: NoticeEnv) {}

  notify(n: Notice): void {
    const id = this.nextId++
    const item: Item = { id, key: noticeKey(n), text: n.message, error: n.kind !== 'loadWarning' && n.kind !== 'info', unsent: isUnsent(n) }
    if (n.kind === 'conflict') {
      const { block, mine, theirs } = n
      const since = this.env.typingMark()
      item.detail = { mine, theirs }
      if (theirs !== null) item.page = n.page
      item.actions =
        theirs === null
          ? [{ label: 'OK', run: () => this.dismiss(id) }]
          : [
              { label: 'Keep mine', run: () => (this.dismiss(id), this.env.resolveConflict(block, mine, false, since)) },
              { label: 'Use theirs', run: () => (this.dismiss(id), this.env.resolveConflict(block, theirs, true, since)) },
            ]
    }
    if (n.kind === 'saveFailed') item.unsavedPage = n.page
    if (n.kind === 'saveFailed' && n.reason === 'changedOnDisk') {
      const key = n.page
      item.actions = [
        { label: 'Reload from disk', run: () => (this.dismiss(id), this.env.exec({ type: 'page.reload', key })) },
        { label: 'Keep mine', run: () => (this.dismiss(id), this.env.exec({ type: 'page.overwrite', key })) },
      ]
    }
    this.items = addNotice(this.items, n, item)
  }

  dismiss(id: number): void {
    this.items = this.items.filter((n) => n.id !== id)
  }

  /** These pages are saved now: their "could not be saved" notices go. */
  saved(keys: string[]): void {
    this.items = this.items.filter((n) => n.unsavedPage === undefined || !keys.includes(n.unsavedPage))
  }

  /**
   * A new notes folder is open: notices whose actions run commands on the old folder's pages and blocks go.
   * A notice holding text saved nowhere else stays: unsent text, or a choice of Keep mine or Use theirs (a switch is
   * refused while one is shown, so this is a guard). The choice keeps its text but offers only OK: block ids start
   * again in the new folder, so Keep mine or Use theirs could write into an unrelated block.
   * A "could not be saved" notice goes too: a switch happens only when every page is saved, and the new folder's
   * pages may reuse the key, so a later save there must not be mistaken for this one.
   */
  newFolder(): void {
    this.items = this.items
      .filter((n) => n.unsavedPage === undefined)
      .filter((n) => !n.actions || n.unsent || n.page !== undefined)
      .map((n) => {
        if (n.page === undefined) return n
        const { page: _page, ...rest } = n
        return { ...rest, actions: [{ label: 'OK', run: () => this.dismiss(n.id) }] }
      })
  }

  /** The keys of the pages whose notice still offers Keep mine or Use theirs, once each, in notice order. */
  unresolved(): string[] {
    return [...new Set(this.items.flatMap((n) => (n.page === undefined ? [] : [n.page])))]
  }

  /** Shown notices holding text the core never got (for `closeCheck`). */
  unsent(): number {
    return this.items.filter((i) => i.unsent).length
  }
}
