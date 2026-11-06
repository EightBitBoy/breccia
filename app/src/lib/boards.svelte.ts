// The state of the shown board and its open card, and the commands that keep
// them up to date.
import { SvelteSet } from 'svelte/reactivity'
import { errorCode, errorMessage } from '../api'
import { cardRoot, isBareKeyword } from './board'
import { patchRefs, RefsRefresh } from './refs'
import type { BlockId, BoardView, Command, Notice, Output, PageView, RefsView } from './types'

export interface BoardsEnv {
  /** Queues a command; its output reaches App.apply, which hands the board back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
  /** Settles once the queued outputs are applied (the client's flush). */
  flush(): Promise<void>
  /** Shows the journal feed. */
  home(): void
}

export class Boards {
  /** The shown board's index; null while no board is shown. */
  index = $state<number | null>(null)
  view = $state<BoardView | null>(null)
  /** The open card; null while none is open. */
  card = $state<RefsView | null>(null)
  /** The column the open card is shown in. */
  cardColumn = $state<string | null>(null)
  /** Cards whose "show more" was pressed: their whole description shows for the session. */
  readonly expanded = new SvelteSet<BlockId>()
  /** The keyword of the open card if "+ Add" made it. */
  private added: string | null = null
  /** Blocks made while editing the card (for `patchRefs`). */
  private made = new Set<BlockId>()
  private closing = false
  /** Settles once the close in progress (`closing`) has run. */
  private closed: Promise<void> = Promise.resolve()
  /** The `board.get` commands sent since the last `open`: an answer to an older one may name another board now. */
  private asked = new WeakSet<Command>()
  private reloads: RefsRefresh

  constructor(private env: BoardsEnv) {
    this.reloads = new RefsRefresh({
      key: () => (this.index === null ? null : String(this.index)),
      busy: () => this.card !== null,
      run: (k) => this.get(Number(k)),
    })
  }

  /** Shows board `index`: runs `board.get` (a failure is a notice). */
  async open(index: number): Promise<void> {
    if (this.index !== index) {
      this.view = null
      this.forgetCard()
    }
    this.index = index
    this.asked = new WeakSet()
    try {
      await this.get(index)
    } catch (e) {
      // A board removed meanwhile: the journal feed, as after deleting the shown board.
      if (errorCode(e) === 'unknownBoard' && this.index === index) {
        this.close()
        this.env.notify({ kind: 'refused', message: 'That board no longer exists.' })
        this.env.home()
        return
      }
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** "show more" on card `id`. */
  expand(id: BlockId): void {
    this.expanded.add(id)
  }

  /** Another notes folder: its block ids may name other cards, so no "show more" stays pressed. */
  newFolder(): void {
    this.expanded.clear()
  }

  private get(index: number): Promise<Output> {
    const cmd: Command = { type: 'board.get', index }
    this.asked.add(cmd)
    return this.env.run(cmd)
  }

  /** No board is shown any more. */
  close(): void {
    this.index = null
    this.view = null
    this.forgetCard()
  }

  /**
   * A `board.get` answer (`cmd`, the command it answers): applied only if it is the shown board and was asked
   * since the last `open`. While a card is open it is dropped; closing the card asks again.
   */
  applyBoard(view: BoardView, cmd?: Command): void {
    if (cmd && !this.asked.has(cmd)) return
    if (this.card !== null) return
    if (this.index !== null && view.index === this.index) this.view = view
  }

  /** Opens a card in `column`; `added` is the keyword of a card made by "+ Add". */
  openCard(card: RefsView, column: string, added?: string): void {
    this.card = card
    this.cardColumn = column
    this.added = added ?? null
    this.made.clear()
  }

  /**
   * The answer to "+ Add" (`keyword` in `column`): its new block opens as a card. If the user opened another card
   * meanwhile, that card stays open and the new block, never shown, is deleted again. Returns whether it opened.
   */
  openAdded(card: RefsView, column: string, keyword: string): boolean {
    if (this.card === null) {
      this.openCard(card, column, keyword)
      return true
    }
    void this.deleteIfBare(card, keyword)
    return false
  }

  /** The open card's page changed: it follows (`focus` stays shown, as in the references); closes if its root is gone. Returns whether the card's page was `page`. */
  patchCard(page: PageView, focus: BlockId | null): boolean {
    if (!this.card || this.card.key !== page.key) return false
    if (focus !== null) this.made.add(focus)
    const next = patchRefs(this.card, page, this.made)
    if (next.groups.length === 0) {
      this.forgetCard()
      this.refresh()
    } else {
      this.card = next
    }
    return true
  }

  /**
   * Closes the card. `rootText` is the editor's text when the root is being edited; without it the client's
   * queue is flushed first, so text typed just before is not lost. A bare added card is deleted
   * (`blocks.delete`). Then the board reloads. Settles once the card is closed and such a delete is answered
   * (a second call joins the first), so a view shown next does not get the delete's answer.
   */
  closeCard(rootText?: string): Promise<void> {
    if (rootText !== undefined) return this.finishClose(rootText, this.rootId())
    if (this.closing) return this.closed
    this.closing = true
    const asked = this.rootId()
    const done = () => {
      this.closing = false
      return this.finishClose(undefined, asked)
    }
    this.closed = this.env.flush().then(done, done)
    return this.closed
  }

  private rootId(): BlockId | null {
    return cardRoot(this.card)
  }

  /** `asked`: the root of the card `closeCard` was called for; another card opened meanwhile is left alone. */
  private async finishClose(rootText: string | undefined, asked: BlockId | null): Promise<void> {
    const card = this.card
    if (!card || this.rootId() !== asked) return
    const added = this.added
    this.forgetCard()
    const deleting = this.deleteIfBare(card, added, rootText)
    if (deleting) await deleting
    else this.refresh()
  }

  /**
   * Deletes the card's block if "+ Add" made it (`keyword`, null if not) and its text (`text`, else the root's) is
   * still only the keyword, without children; the board reloads after. Returns the delete, settled once answered;
   * null if nothing is deleted.
   */
  private deleteIfBare(card: RefsView, keyword: string | null, text?: string): Promise<void> | null {
    const ref = card.groups[0]?.refs[0]
    const root = ref?.blocks[0]
    if (!root || ref.blocks.length !== 1 || keyword === null || !isBareKeyword(text ?? root.text, keyword)) return null
    return this.env
      .run({ type: 'blocks.delete', ids: [root.id] })
      .then(
        () => {},
        (e) => this.env.notify({ kind: 'refused', message: errorMessage(e) }),
      )
      .finally(() => this.refresh())
  }

  /** Reloads the board; held while a card is open (RefsRefresh, busy = card open). */
  refresh(): void {
    if (this.index !== null) this.reloads.request()
  }

  /** Another view changed `p`; `own` if it is our own echo. Returns whether the open card was patched (App reconciles the editor). */
  changed(p: PageView, own: boolean): boolean {
    if (own) return false
    if (this.card && this.card.key === p.key) return this.patchCard(p, null)
    this.refresh()
    return false
  }

  /** Pages are gone: an open card on one of them closes (nothing is deleted); the board reloads. */
  removed(keys: string[]): void {
    if (this.card && keys.includes(this.card.key)) this.forgetCard()
    this.refresh()
  }

  private forgetCard(): void {
    this.card = null
    this.cardColumn = null
    this.added = null
    this.made.clear()
  }
}
