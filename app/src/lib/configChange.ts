// What a new `ConfigView` changes on screen: task states and board columns are computed from the config when a view is built.
import type { ConfigView } from './types'

/**
 * `tasks`: the states changed, so the shown page, the feed's days, the references and the board load again
 * (a removed state or a flipped "finished" shows at once). `board`: the board loads again (its columns,
 * cards or archive days changed). The first config of a folder (`prev` null) changes nothing already shown.
 */
export function configShift(prev: ConfigView | null, next: ConfigView): { tasks: boolean; board: boolean } {
  if (prev === null) return { tasks: false, board: false }
  const tasks = JSON.stringify(prev.states) !== JSON.stringify(next.states)
  const board = tasks || JSON.stringify(prev.boards) !== JSON.stringify(next.boards) || prev.archiveAfterDays !== next.archiveAfterDays
  return { tasks, board }
}

/** Whether a config of `incoming` version may replace the one of `shown`: a late event never brings back older settings. */
export function isNewerConfig(shown: number, incoming: number): boolean {
  return incoming >= shown
}
