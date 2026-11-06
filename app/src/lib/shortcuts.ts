// The keyboard list: shown in Settings and, grouped and filterable, by the F1 overlay. Each entry follows
// what the key handlers do: `keys.ts` (`decide` in a block, `isSearchKey`, `isSettingsKey`, `isNewPageKey`,
// `isHelpKey`, `isDatePickerKey`, `navKey`), `calendar.ts` (`pickerKey`, in the date picker), `selection.ts` (blocks selected;
// `cycleState` and `removeState` are in both), the menus in `editor/menu.ts`, `zoom.ts`, `Board.svelte` and
// `graph.ts`. A new key handler gets a line here.
export type Shortcut = { group: string; keys: string; mac: string; what: string }

export const SHORTCUTS: Shortcut[] = [
  { group: 'Editing', keys: 'Enter', mac: 'Enter', what: 'New block below' },
  { group: 'Editing', keys: 'Shift Enter', mac: 'Shift Enter', what: 'New line in the block' },
  { group: 'Editing', keys: 'Tab / Shift Tab', mac: 'Tab / Shift Tab', what: 'Indent / outdent' },
  { group: 'Editing', keys: 'Alt ↑ / Alt ↓', mac: 'Alt ↑ / Alt ↓', what: 'Move the block up / down' },
  { group: 'Editing', keys: '↑ / ↓', mac: '↑ / ↓', what: 'At the first or last line: previous or next block' },
  { group: 'Editing', keys: 'Backspace', mac: 'Backspace', what: 'In an empty block: delete it; at the start: merge into the previous block' },
  { group: 'Editing', keys: 'Esc', mac: 'Esc', what: 'Stop editing, or clear the block selection' },
  { group: 'Editing', keys: 'Ctrl Z / Ctrl Y', mac: 'Cmd Z / Cmd Y', what: 'Undo / redo' },
  { group: 'Editing', keys: '/', mac: '/', what: 'The slash menu' },
  { group: 'Editing', keys: '[[', mac: '[[', what: 'Link to a page' },
  { group: 'Editing', keys: '#', mac: '#', what: 'Tag' },
  { group: 'Editing', keys: '↑ / ↓, Enter', mac: '↑ / ↓, Enter', what: 'In a menu (slash, link, tag): choose, then accept (Esc closes it)' },
  { group: 'Blocks and tasks', keys: 'Ctrl Enter', mac: 'Cmd Enter', what: 'Cycle the task state (after the last, back to the first)' },
  { group: 'Blocks and tasks', keys: 'Ctrl Shift Enter', mac: 'Cmd Shift Enter', what: 'Remove the task state' },
  { group: 'Blocks and tasks', keys: 'Shift ↑ / Shift ↓', mac: 'Shift ↑ / Shift ↓', what: 'Select blocks (Shift-click too)' },
  { group: 'Blocks and tasks', keys: 'Backspace / Delete', mac: 'Backspace / Delete', what: 'With blocks selected: delete them' },
  { group: 'Navigation', keys: 'Ctrl K', mac: 'Cmd K', what: 'Search, or jump to a date' },
  { group: 'Navigation', keys: 'Alt ← / Alt →', mac: 'Cmd [ / Cmd ]', what: 'Back / forward between views' },
  { group: 'Navigation', keys: 'Ctrl Shift D', mac: 'Cmd Shift D', what: 'The date picker: go to any journal day' },
  { group: 'Navigation', keys: '← → ↑ ↓', mac: '← → ↑ ↓', what: 'In the date picker: previous or next day or week' },
  { group: 'Navigation', keys: 'PgUp / PgDn', mac: 'PgUp / PgDn', what: 'In the date picker: previous or next month' },
  { group: 'Navigation', keys: 'Enter', mac: 'Enter', what: 'In the date picker: go to the day (Esc closes it)' },
  { group: 'Navigation', keys: 'Ctrl N', mac: 'Cmd N', what: 'New page' },
  { group: 'Navigation', keys: 'Ctrl ,', mac: 'Cmd ,', what: 'Settings' },
  { group: 'Boards', keys: 'Enter / Space', mac: 'Enter / Space', what: 'On a card: open it (on the board title: board settings)' },
  { group: 'Boards', keys: 'Esc', mac: 'Esc', what: 'Close the open card' },
  { group: 'Window and zoom', keys: 'F1', mac: 'F1', what: 'This list of keyboard shortcuts' },
  { group: 'Window and zoom', keys: 'Ctrl +', mac: 'Cmd +', what: 'Zoom in (Ctrl and the mouse wheel too)' },
  { group: 'Window and zoom', keys: 'Ctrl -', mac: 'Cmd -', what: 'Zoom out' },
  { group: 'Window and zoom', keys: 'Ctrl 0', mac: 'Cmd 0', what: 'Back to 100 %' },
  { group: 'Graph', keys: '↑ ↓ ← →', mac: '↑ ↓ ← →', what: 'In the graph: pan' },
  { group: 'Graph', keys: '+ / -', mac: '+ / -', what: 'In the graph: zoom in / out' },
  { group: 'Graph', keys: '0', mac: '0', what: 'In the graph: show everything' },
]

export function shortcutRows(mac: boolean): { keys: string; what: string }[] {
  return SHORTCUTS.map((s) => ({ keys: mac ? s.mac : s.keys, what: s.what }))
}

export type ShortcutGroup = { name: string; rows: { keys: string; what: string }[] }

/** Lower case, with `+` and runs of spaces read as one space, so `ctrl+z` finds `Ctrl Z`. */
function plain(t: string): string {
  return t.toLowerCase().replace(/[\s+]+/g, ' ').trim()
}

/**
 * The shortcuts as groups (in the order they first appear), narrowed to those whose description, group or keys
 * contain `filter`. A group name that matches keeps the whole group; groups without a match are left out.
 */
export function shortcutGroups(mac: boolean, filter: string): ShortcutGroup[] {
  const q = plain(filter)
  const groups: ShortcutGroup[] = []
  for (const s of SHORTCUTS) {
    const keys = mac ? s.mac : s.keys
    if (q && ![s.group, s.what, keys].some((t) => plain(t).includes(q))) continue
    let g = groups.find((x) => x.name === s.group)
    if (!g) groups.push((g = { name: s.group, rows: [] }))
    g.rows.push({ keys, what: s.what })
  }
  return groups
}

/** Esc first clears a filled filter, then closes the overlay. */
export function escapeHelp(filter: string): 'clear' | 'close' {
  return filter === '' ? 'close' : 'clear'
}
