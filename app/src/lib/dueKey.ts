// What `Ctrl D` in the block editor does with the edited block: open the due date calendar on a task, refuse a block
// that is not a task, or nothing.

/** What `Ctrl D` does. */
export type DueKeyAction = { kind: 'none' } | { kind: 'refuse' } | { kind: 'open'; due: string | null }

/**
 * `Ctrl D` on the block `b`. While the search or a dialog is open (`blocked`) it does nothing, as `Ctrl Shift D`. A
 * block the window no longer has (another program removed it while it was edited) gives nothing and no note: the
 * editor is closing anyway. A block with no state is refused; a task opens the calendar on its due date, or on none.
 */
export function dueKeyAction(
  b: { state: string | null; due?: string | null } | undefined,
  blocked: boolean,
): DueKeyAction {
  if (blocked || !b) return { kind: 'none' }
  if (b.state === null) return { kind: 'refuse' }
  return { kind: 'open', due: b.due ?? null }
}
