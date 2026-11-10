/** The ids from `anchor` to `to`, inclusive, in document order. `order` is the visible ids in order. */
export function extend(order: number[], anchor: number, to: number): number[] {
  const a = order.indexOf(anchor)
  const b = order.indexOf(to)
  if (a < 0 || b < 0) return []
  return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** The id next to `id` in `order` (`dir` -1 up, 1 down); `id` itself at either end or when it is not there. */
export function neighbour(order: number[], id: number, dir: -1 | 1): number {
  const i = order.indexOf(id)
  if (i < 0) return id
  return order[i + dir] ?? id
}

/** The note shown when `Ctrl Enter` finds no state in the cycle: the core's `noCycle` message. */
export const NO_CYCLE = 'No state is in the cycle (Settings → States)'

/**
 * The state after `current` in the cycle, with the rule of `Config::cycle_next`: the first in-cycle state after
 * `current` in list order (from the start for none or an unknown keyword), wrapping from the last to the first.
 * Null only when no state is in the cycle: cycling never removes the state.
 */
export function nextState(states: { keyword: string; inCycle: boolean }[], current: string | null): string | null {
  const i = current === null ? -1 : states.findIndex((s) => s.keyword === current)
  const next = states.slice(i + 1).find((s) => s.inCycle) ?? states.find((s) => s.inCycle)
  return next?.keyword ?? null
}

export type SelectionAction =
  | 'extendUp'
  | 'extendDown'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'delete'
  | 'cycleState'
  | 'removeState'
  | 'undo'
  | 'redo'
  | 'clear'

/** What a key press means while blocks are selected (not editing), or null. */
export function selectionAction(
  e: { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean },
  mac: boolean,
): SelectionAction | null {
  const mod = mac ? e.meta : e.ctrl
  if (mac ? e.ctrl : e.meta) return null
  if (mod) {
    if (e.alt) return null
    const key = e.key.toLowerCase()
    if (key === 'enter') return e.shift ? 'removeState' : 'cycleState'
    if (key === 'z') return e.shift ? 'redo' : 'undo'
    if (key === 'y' && !e.shift) return 'redo'
    if (key === 'k' && e.shift) return 'delete'
    return null
  }
  if (e.alt) {
    if (e.shift) return null
    if (e.key === 'ArrowUp') return 'moveUp'
    if (e.key === 'ArrowDown') return 'moveDown'
    return null
  }
  switch (e.key) {
    case 'ArrowUp':
      return e.shift ? 'extendUp' : null
    case 'ArrowDown':
      return e.shift ? 'extendDown' : null
    case 'Tab':
      return e.shift ? 'outdent' : 'indent'
    case 'Backspace':
    case 'Delete':
      return e.shift ? null : 'delete'
    case 'Escape':
      return 'clear'
    default:
      return null
  }
}
