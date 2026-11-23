import { expect, test } from 'vitest'
import { COMMANDS, type CommandInfo } from './commands'
import { countsInFlight, kindOf, type Kind } from './sync'
import type { Command } from './types'

// The full list, written out from `kindOf` and `countsInFlight` as they were before the table:
// ten commands that do not hold events, four `structure`, thirteen `text`, `typing`, `split`,
// `refresh`, and the rest `other`.
const EXPECTED: [Command['type'], Kind, boolean][] = [
  ['archive.auto', 'other', true],
  ['archive.list', 'other', false],
  ['block.cycleState', 'text', true],
  ['block.setDue', 'text', true],
  ['block.delete', 'text', true],
  ['block.insert', 'other', true],
  ['block.merge', 'text', true],
  ['block.paste', 'text', true],
  ['block.setText', 'typing', true],
  ['block.settle', 'other', true],
  ['block.split', 'split', true],
  ['block.stepState', 'text', true],
  ['blocks.delete', 'text', true],
  ['blocks.indent', 'structure', true],
  ['blocks.moveDown', 'structure', true],
  ['blocks.moveUp', 'structure', true],
  ['blocks.outdent', 'structure', true],
  ['blocks.setArchived', 'text', true],
  ['blocks.setState', 'text', true],
  ['board.archive', 'other', true],
  ['board.get', 'other', false],
  ['board.place', 'text', true],
  ['boards.set', 'other', true],
  ['config.get', 'other', true],
  ['config.setBoard', 'other', true],
  ['config.setDailies', 'other', true],
  ['config.setGit', 'other', true],
  ['dailies.add', 'other', true],
  ['dailies.check', 'other', true],
  ['dailies.delete', 'other', true],
  ['dailies.edit', 'other', true],
  ['dailies.list', 'other', true],
  ['dailies.move', 'other', true],
  ['dailies.uncheck', 'other', true],
  ['dir.create', 'other', true],
  ['dir.delete', 'other', true],
  ['dir.rename', 'other', true],
  ['files.changed', 'other', true],
  ['folder.create', 'other', true],
  ['folder.open', 'other', true],
  ['folder.status', 'other', true],
  ['folder.tree', 'other', true],
  ['git.init', 'other', true],
  ['git.log', 'other', true],
  ['git.status', 'other', true],
  ['git.sync', 'other', true],
  ['graph.get', 'other', false],
  ['graph.saveLayout', 'other', false],
  ['history.redo', 'text', true],
  ['history.undo', 'text', true],
  ['journal.append', 'other', true],
  ['journal.day', 'other', false],
  ['journal.feed', 'other', true],
  ['page.create', 'other', true],
  ['page.delete', 'other', true],
  ['page.get', 'refresh', true],
  ['page.move', 'other', true],
  ['page.open', 'other', true],
  ['page.overwrite', 'text', true],
  ['page.refs', 'other', false],
  ['page.reload', 'text', true],
  ['page.rename', 'other', true],
  ['page.renameReach', 'other', false],
  ['page.setColor', 'other', true],
  ['page.show', 'other', true],
  ['page.today', 'other', true],
  ['pages.get', 'other', true],
  ['pages.list', 'other', false],
  ['pages.table', 'other', false],
  ['search.query', 'other', false],
  ['session.dirty', 'other', true],
  ['states.set', 'other', true],
  ['states.usage', 'other', true],
]

test('every command keeps its editor kind and its event hold', () => {
  const actual = Object.keys(COMMANDS)
    .sort()
    .map((type) => [type, kindOf(type as Command['type']), countsInFlight(type as Command['type'])])
  expect(actual).toEqual([...EXPECTED].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
})

test('the table has a row for every command', () => {
  const table: Record<Command['type'], CommandInfo> = COMMANDS
  expect(Object.keys(table).length).toBe(EXPECTED.length)
})

test('a table missing one command does not type-check', () => {
  const { 'git.log': _dropped, ...rest } = COMMANDS
  // @ts-expect-error a command of the union has no row
  const short: Record<Command['type'], CommandInfo> = rest
  expect(Object.keys(short).length).toBe(EXPECTED.length - 1)
})
