// Which dialog is open over the window: one value, so no two dialogs can be open at once. The close question
// ("Close anyway?") is not one of them: it is its own layer above every dialog (`blocked`).

export type Overlay =
  | { kind: 'search' } | { kind: 'help' } | { kind: 'changelog' } | { kind: 'flow' } | { kind: 'boardSettings' }
  | { kind: 'newBoard'; from: 'sidebar' | 'settings' }
  | { kind: 'confirm'; message: string; ok: string; answer: (yes: boolean) => void }

/** Every way in App.svelte to open a dialog, a screen or the date picker that checks the open dialog first. */
export const OPENERS = [
  'openSearch',
  'toggleHelp',
  'startNewPage',
  'openGraph',
  'toggleGitLog',
  'openSettings',
  'confirmAsk',
  'togglePicker',
  'go',
  'gitSetUp',
  'pickDate',
  'pickDue',
  'historyKey',
] as const
export type Opener = (typeof OPENERS)[number]

/**
 * What refuses each opener: `dialog` while a dialog other than the search box is open (`dialogOpen`), `any` also
 * while the search box is (`canOpen`). Only the search box opens over itself (showing it again changes nothing).
 */
const GUARD: Record<Opener, 'dialog' | 'any'> = {
  openSearch: 'dialog',
  toggleHelp: 'any',
  startNewPage: 'any',
  openGraph: 'any',
  toggleGitLog: 'any',
  openSettings: 'any',
  confirmAsk: 'any',
  togglePicker: 'any',
  go: 'any',
  gitSetUp: 'any',
  pickDate: 'any',
  pickDue: 'any',
  historyKey: 'any',
}

export class Overlays {
  /** The open dialog, or null. */
  current = $state.raw<Overlay | null>(null)
  private opened: (() => void)[] = []

  /** `blocked`: no folder is open, or the close question is: then nothing opens, as under a dialog. */
  constructor(private blocked: () => boolean) {}

  /** No folder, the close question, or a dialog other than the search box is open. */
  dialogOpen(): boolean {
    return this.blocked() || (this.current !== null && this.current.kind !== 'search')
  }

  /** A folder is open and nothing is over it, not even the search box. */
  canOpen(): boolean {
    return !this.dialogOpen() && !this.is('search')
  }

  /** Whether `opener` may open now: its guard as in `GUARD`. */
  may(opener: Opener): boolean {
    return GUARD[opener] === 'dialog' ? !this.dialogOpen() : this.canOpen()
  }

  is(kind: Overlay['kind']): boolean {
    return this.current?.kind === kind
  }

  /** Opens `o` in place of the open one (a confirm it replaces answers no); the `onOpen` callbacks run. */
  open(o: Overlay): void {
    const old = this.current
    this.current = o
    if (old !== o && old?.kind === 'confirm') old.answer(false)
    for (const cb of this.opened) cb()
  }

  /** Closes `kind` if it is open (a confirm answers no); else nothing. */
  close(kind: Overlay['kind']): void {
    if (this.is(kind)) this.closeAll()
  }

  /** Closes whatever is open; a confirm answers no. */
  closeAll(): void {
    const old = this.current
    this.current = null
    if (old?.kind === 'confirm') old.answer(false)
  }

  /** The open confirm's answer: it closes first, so the answer may open another dialog. */
  answer(yes: boolean): void {
    const c = this.current
    if (c?.kind !== 'confirm') return
    this.current = null
    c.answer(yes)
  }

  /** `cb` runs whenever a dialog opens (the search box too). */
  onOpen(cb: () => void): void {
    this.opened.push(cb)
  }
}
