// The hidden board columns of the open notes folder, and the columns a card drag has opened.
import { SvelteSet } from 'svelte/reactivity'
import { canHide, hiddenOf, parseHidden } from './hiddenColumns'

export interface HiddenColumnsEnv {
  /** The saved map of `folder` (board name to state names), as the shell gives it. */
  load(folder: string): Promise<unknown>
  /** Saves the map of `folder`, all its boards at once. */
  save(folder: string, boards: Record<string, string[]>): Promise<void>
}

export class HiddenColumns {
  private folder: string | null = null
  private boards = $state<Record<string, string[]>>({})
  /** Hidden columns shown for the rest of a card drag. */
  readonly peek = new SvelteSet<string>()

  constructor(private env: HiddenColumnsEnv) {}

  /** Another notes folder (or none): its own saved map. A failed read is logged and hides nothing. */
  async open(folder: string | null): Promise<void> {
    this.folder = folder
    this.boards = {}
    if (folder === null) return
    let raw: unknown = {}
    try {
      raw = await this.env.load(folder)
    } catch (e) {
      console.error('could not read the hidden board columns', e)
    }
    if (this.folder === folder) this.boards = parseHidden(raw)
  }

  /** The hidden columns of board `board` with columns `keywords`. */
  of(board: string, keywords: readonly string[]): Set<string> {
    return hiddenOf(this.boards[board], keywords)
  }

  hide(board: string, keyword: string, keywords: readonly string[]): void {
    if (!canHide(keyword, keywords, this.of(board, keywords))) return
    this.set(board, [...(this.boards[board] ?? []).filter((k) => k !== keyword), keyword])
  }

  show(board: string, keyword: string): void {
    const list = this.boards[board]
    if (list?.includes(keyword)) this.set(board, list.filter((k) => k !== keyword))
  }

  /** Board `from` was renamed to `to` in Breccia: its hidden columns go with it. */
  renamed(from: string, to: string): void {
    const list = this.boards[from]
    if (!list || from === to) return
    const next = { ...this.boards, [to]: list }
    delete next[from]
    this.write(next)
  }

  /** A dragged card rested on the marker of `keyword`: the column shows until the drag ends. */
  peekOpen(keyword: string): void {
    this.peek.add(keyword)
  }

  endPeek(): void {
    this.peek.clear()
  }

  private set(board: string, list: string[]): void {
    const next = { ...this.boards }
    if (list.length) next[board] = list
    else delete next[board]
    this.write(next)
  }

  private write(next: Record<string, string[]>): void {
    this.boards = next
    if (this.folder === null) return
    this.env.save(this.folder, next).catch((e) => console.error('could not save the hidden board columns', e))
  }
}
