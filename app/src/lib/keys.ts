export type Ctx = {
  atStart: boolean
  selectionEmpty: boolean
  onFirstLine: boolean
  onLastLine: boolean
  mac: boolean
}

export type Action =
  | 'split'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'focusPrev'
  | 'focusNext'
  | 'merge'
  | 'leave'
  | 'cycleState'
  | 'removeState'
  | 'undo'
  | 'redo'
  | 'extendUp'
  | 'extendDown'

export type KeyInput = { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

/** What a key press in a block editor means, or null to leave it to the editor. */
export function decide(e: KeyInput, ctx: Ctx): Action | null {
  const mod = ctx.mac ? e.meta : e.ctrl
  const otherMod = ctx.mac ? e.ctrl : e.meta
  if (otherMod) return null
  const plain = !mod && !e.alt

  if (mod && !e.alt) {
    const key = e.key.toLowerCase()
    if (key === 'enter') return e.shift ? 'removeState' : 'cycleState'
    if (key === 'z') return e.shift ? 'redo' : 'undo'
    if (key === 'y' && !e.shift) return 'redo'
    return null
  }
  if (!plain) {
    if (e.alt && !mod && !e.shift) {
      if (e.key === 'ArrowUp') return 'moveUp'
      if (e.key === 'ArrowDown') return 'moveDown'
    }
    return null
  }

  switch (e.key) {
    case 'Enter':
      return e.shift ? null : 'split'
    case 'Tab':
      return e.shift ? 'outdent' : 'indent'
    case 'ArrowUp':
      return ctx.onFirstLine ? (e.shift ? 'extendUp' : 'focusPrev') : null
    case 'ArrowDown':
      return ctx.onLastLine ? (e.shift ? 'extendDown' : 'focusNext') : null
    case 'Backspace':
      return !e.shift && ctx.atStart && ctx.selectionEmpty ? 'merge' : null
    case 'Escape':
      return 'leave'
    default:
      return null
  }
}

/** `Ctrl K` (`Cmd K` on a Mac) opens the quick search. */
export function isSearchKey(e: KeyInput, mac: boolean): boolean {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  return mod && !other && !e.shift && !e.alt && e.key.toLowerCase() === 'k'
}

/** `Ctrl ,` (`Cmd ,` on a Mac) opens Settings. */
export function isSettingsKey(e: KeyInput, mac: boolean): boolean {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  return mod && !other && !e.shift && !e.alt && e.key === ','
}

/** `Ctrl N` (`Cmd N` on a Mac) starts a new page. */
export function isNewPageKey(e: KeyInput, mac: boolean): boolean {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  return mod && !other && !e.shift && !e.alt && e.key.toLowerCase() === 'n'
}

/** `F1` on its own opens the list of keyboard shortcuts. */
export function isHelpKey(e: KeyInput): boolean {
  return e.key === 'F1' && !e.shift && !e.alt && !e.ctrl && !e.meta
}

/** `Ctrl Shift D` (`Cmd Shift D` on a Mac) opens the date picker. */
export function isDatePickerKey(e: KeyInput, mac: boolean): boolean {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  return mod && !other && e.shift && !e.alt && e.key.toLowerCase() === 'd'
}

/** `Alt ←` / `Alt →` (`Cmd [` / `Cmd ]` on a Mac) go back and forward between views. */
export function navKey(e: KeyInput, mac: boolean): 'back' | 'forward' | null {
  if (e.shift) return null
  if (mac) {
    if (!e.meta || e.ctrl || e.alt) return null
    return e.key === '[' ? 'back' : e.key === ']' ? 'forward' : null
  }
  if (!e.alt || e.ctrl || e.meta) return null
  return e.key === 'ArrowLeft' ? 'back' : e.key === 'ArrowRight' ? 'forward' : null
}
