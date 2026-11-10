import { describe, expect, it } from 'vitest'
import { SHORTCUTS, escapeHelp, shortcutGroups, shortcutRows } from './shortcuts'

describe('shortcuts', () => {
  it('has no empty entry and a group for each', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(21)
    for (const s of SHORTCUTS) for (const t of [s.group, s.keys, s.mac, s.what]) expect(t.trim()).not.toBe('')
  })
  it('lists the graph keys on both platforms', () => {
    for (const mac of [false, true]) {
      const rows = shortcutRows(mac)
      for (const k of ['↑ ↓ ← →', '+ / -', '0']) expect(rows.some((r) => r.keys === k && r.what.startsWith('In the graph')), k).toBe(true)
    }
  })
  it('lists the zoom keys', () => {
    expect(shortcutRows(false).filter((r) => /^(Zoom|Back to 100)/.test(r.what)).map((r) => r.keys)).toEqual(['Ctrl +', 'Ctrl -', 'Ctrl 0'])
    expect(shortcutRows(true).filter((r) => /^(Zoom|Back to 100)/.test(r.what)).map((r) => r.keys)).toEqual(['Cmd +', 'Cmd -', 'Cmd 0'])
  })
  it('lists the keys that were missing: F1, new page, deleting selected blocks, the open card', () => {
    const rows = shortcutRows(false)
    for (const keys of ['F1', 'Ctrl N', 'Backspace / Delete', 'Enter / Space']) expect(rows.some((r) => r.keys === keys), keys).toBe(true)
  })
  it('lists the delete-block key on both platforms', () => {
    const s = SHORTCUTS.find((x) => x.keys === 'Ctrl Shift K')
    expect(s).toEqual({ group: 'Editing', keys: 'Ctrl Shift K', mac: 'Cmd Shift K', what: 'Delete the block with its sub-blocks' })
    // Right after the Backspace line.
    expect(SHORTCUTS[SHORTCUTS.indexOf(s!) - 1].keys).toBe('Backspace')
    expect(shortcutGroups(false, 'delete').find((g) => g.name === 'Editing')?.rows.some((r) => r.keys === 'Ctrl Shift K')).toBe(true)
    expect(shortcutRows(true).some((r) => r.keys === 'Cmd Shift K')).toBe(true)
  })
  it('lists the date picker key', () => {
    expect(shortcutRows(false).find((r) => r.keys === 'Ctrl Shift D')?.what).toMatch(/date picker/)
    expect(shortcutRows(true).some((r) => r.keys === 'Cmd Shift D')).toBe(true)
  })
  it('reads Cmd on a Mac and Ctrl elsewhere', () => {
    expect(shortcutRows(false)[0].keys).toMatch(/^(Ctrl|Enter|F1)/)
    expect(shortcutRows(false).some((r) => r.keys === 'Ctrl K')).toBe(true)
    expect(shortcutRows(true).some((r) => r.keys === 'Cmd K')).toBe(true)
    expect(shortcutRows(true)).toHaveLength(SHORTCUTS.length)
    expect(shortcutRows(true).some((r) => r.keys.includes('Ctrl'))).toBe(false)
  })
})

describe('shortcutGroups', () => {
  it('keeps every entry once, grouped in order of first appearance', () => {
    const groups = shortcutGroups(false, '')
    expect(groups.map((g) => g.name)).toEqual([...new Set(SHORTCUTS.map((s) => s.group))])
    expect(groups.flatMap((g) => g.rows)).toHaveLength(SHORTCUTS.length)
  })
  it('narrows by description', () => {
    const groups = shortcutGroups(false, 'zoom')
    const all = groups.flatMap((g) => g.rows)
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((r) => r.keys === 'Ctrl +')).toBe(true)
    expect(all.some((r) => r.keys === 'Ctrl K')).toBe(false)
  })
  it('narrows by keys, with plus signs or spaces, in any case', () => {
    for (const q of ['ctrl+z', 'Ctrl Z', 'CTRL+Z']) {
      const all = shortcutGroups(false, q).flatMap((g) => g.rows)
      expect(all.map((r) => r.keys), q).toEqual(['Ctrl Z / Ctrl Y'])
    }
    expect(shortcutGroups(true, 'cmd z').flatMap((g) => g.rows).map((r) => r.keys)).toEqual(['Cmd Z / Cmd Y'])
    expect(shortcutGroups(true, 'ctrl z')).toEqual([])
  })
  it('matches a key name such as enter', () => {
    const all = shortcutGroups(false, 'enter').flatMap((g) => g.rows)
    expect(all.some((r) => r.keys === 'Enter')).toBe(true)
    expect(all.some((r) => r.keys === 'Ctrl Enter')).toBe(true)
  })
  it('matches a group name and keeps the whole group', () => {
    const groups = shortcutGroups(false, 'graph')
    expect(groups.map((g) => g.name)).toEqual(['Graph'])
    expect(groups[0].rows).toHaveLength(SHORTCUTS.filter((s) => s.group === 'Graph').length)
  })
  it('hides groups without a match and returns none when nothing matches', () => {
    expect(shortcutGroups(false, 'zoom').length).toBeLessThan(shortcutGroups(false, '').length)
    expect(shortcutGroups(false, 'qqqq')).toEqual([])
  })
  it('ignores spaces around the filter', () => {
    expect(shortcutGroups(false, '  zoom  ')).toEqual(shortcutGroups(false, 'zoom'))
  })
})

describe('escapeHelp', () => {
  it('clears a filled filter first, then closes', () => {
    expect(escapeHelp('zoom')).toBe('clear')
    expect(escapeHelp(' ')).toBe('clear')
    expect(escapeHelp('')).toBe('close')
  })
})

describe('the task state keys', () => {
  it('lists removing the state right after cycling it', () => {
    const tasks = shortcutGroups(false, '').find((g) => g.name === 'Blocks and tasks')!.rows
    const i = tasks.findIndex((r) => r.keys === 'Ctrl Enter')
    expect(tasks[i].what).toBe('Cycle the task state (after the last, back to the first)')
    expect(tasks[i + 1]).toEqual({ keys: 'Ctrl Shift Enter', what: 'Remove the task state' })
    const mac = shortcutGroups(true, 'shift+enter').flatMap((g) => g.rows)
    expect(mac.map((r) => r.keys)).toContain('Cmd Shift Enter')
  })
})

describe('back and forward', () => {
  it('lists Alt ← / Alt → under Navigation, Cmd [ / Cmd ] on a Mac', () => {
    const nav = shortcutGroups(false, '').find((g) => g.name === 'Navigation')!.rows
    expect(nav).toContainEqual({ keys: 'Alt ← / Alt →', what: 'Back / forward between views' })
    const mac = shortcutGroups(true, 'back').flatMap((g) => g.rows)
    expect(mac).toContainEqual({ keys: 'Cmd [ / Cmd ]', what: 'Back / forward between views' })
  })
})
