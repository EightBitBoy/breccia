// What the window decides per command, in one place: how its output may touch the editor
// and whether it holds back `page:changed` events while it runs. `sync.ts` reads this table.
import type { Command } from './types'

/** How a command's output may touch the editor. */
export type Kind =
  /** `block.setText`: typing. The editor is ahead of the core, unless the core reshaped the text. */
  | 'typing'
  /** `block.split`: handled with `carryOver`. */
  | 'split'
  /** Moves blocks without changing their text: the editor keeps its text. */
  | 'structure'
  /** Changes text: the editor is locked while it runs and then shows the output. */
  | 'text'
  /** Not from the editor (open a page, insert a block, ...). */
  | 'other'
  /** `page.get`: the shown page again after another program changed it; see `afterRefresh`. */
  | 'refresh'

export interface CommandInfo {
  editor: Kind
  /**
   * Whether a running command holds back `page:changed` events (its own output wins). Commands
   * that never answer with a page do not. This is the window's own decision, not the core's query
   * kind: `page.get` is a query that holds events, `graph.saveLayout` one that does not (it
   * writes only to the cache folder).
   */
  holdsEvents: boolean
}

export const COMMANDS = {
  'archive.auto': { editor: 'other', holdsEvents: true },
  'archive.list': { editor: 'other', holdsEvents: false },
  'block.cycleState': { editor: 'text', holdsEvents: true },
  'block.delete': { editor: 'text', holdsEvents: true },
  'block.insert': { editor: 'other', holdsEvents: true },
  'block.merge': { editor: 'text', holdsEvents: true },
  'block.paste': { editor: 'text', holdsEvents: true },
  'block.setText': { editor: 'typing', holdsEvents: true },
  'block.settle': { editor: 'other', holdsEvents: true },
  'block.split': { editor: 'split', holdsEvents: true },
  'block.stepState': { editor: 'text', holdsEvents: true },
  'blocks.delete': { editor: 'text', holdsEvents: true },
  'blocks.indent': { editor: 'structure', holdsEvents: true },
  'blocks.moveDown': { editor: 'structure', holdsEvents: true },
  'blocks.moveUp': { editor: 'structure', holdsEvents: true },
  'blocks.outdent': { editor: 'structure', holdsEvents: true },
  'blocks.setArchived': { editor: 'text', holdsEvents: true },
  'blocks.setState': { editor: 'text', holdsEvents: true },
  'board.archive': { editor: 'other', holdsEvents: true },
  'board.get': { editor: 'other', holdsEvents: false },
  'board.place': { editor: 'text', holdsEvents: true },
  'boards.set': { editor: 'other', holdsEvents: true },
  'config.get': { editor: 'other', holdsEvents: true },
  'config.setBoard': { editor: 'other', holdsEvents: true },
  'config.setDailies': { editor: 'other', holdsEvents: true },
  'config.setGit': { editor: 'other', holdsEvents: true },
  'dailies.add': { editor: 'other', holdsEvents: true },
  'dailies.check': { editor: 'other', holdsEvents: true },
  'dailies.delete': { editor: 'other', holdsEvents: true },
  'dailies.edit': { editor: 'other', holdsEvents: true },
  'dailies.list': { editor: 'other', holdsEvents: true },
  'dailies.move': { editor: 'other', holdsEvents: true },
  'dailies.uncheck': { editor: 'other', holdsEvents: true },
  'dir.create': { editor: 'other', holdsEvents: true },
  'dir.delete': { editor: 'other', holdsEvents: true },
  'dir.rename': { editor: 'other', holdsEvents: true },
  'files.changed': { editor: 'other', holdsEvents: true },
  'folder.create': { editor: 'other', holdsEvents: true },
  'folder.open': { editor: 'other', holdsEvents: true },
  'folder.status': { editor: 'other', holdsEvents: true },
  'folder.tree': { editor: 'other', holdsEvents: true },
  'graph.get': { editor: 'other', holdsEvents: false },
  'graph.saveLayout': { editor: 'other', holdsEvents: false },
  'history.redo': { editor: 'text', holdsEvents: true },
  'history.undo': { editor: 'text', holdsEvents: true },
  'journal.append': { editor: 'other', holdsEvents: true },
  'journal.day': { editor: 'other', holdsEvents: false },
  'journal.feed': { editor: 'other', holdsEvents: true },
  'page.create': { editor: 'other', holdsEvents: true },
  'page.delete': { editor: 'other', holdsEvents: true },
  'page.get': { editor: 'refresh', holdsEvents: true },
  'page.move': { editor: 'other', holdsEvents: true },
  'page.open': { editor: 'other', holdsEvents: true },
  'page.overwrite': { editor: 'text', holdsEvents: true },
  'page.refs': { editor: 'other', holdsEvents: false },
  'page.reload': { editor: 'text', holdsEvents: true },
  'page.rename': { editor: 'other', holdsEvents: true },
  'page.renameReach': { editor: 'other', holdsEvents: false },
  'page.setColor': { editor: 'other', holdsEvents: true },
  'page.show': { editor: 'other', holdsEvents: true },
  'page.today': { editor: 'other', holdsEvents: true },
  'pages.get': { editor: 'other', holdsEvents: true },
  'pages.list': { editor: 'other', holdsEvents: false },
  'pages.table': { editor: 'other', holdsEvents: false },
  'search.query': { editor: 'other', holdsEvents: false },
  'session.dirty': { editor: 'other', holdsEvents: true },
  'states.set': { editor: 'other', holdsEvents: true },
  'states.usage': { editor: 'other', holdsEvents: true },
  'git.status': { editor: 'other', holdsEvents: true },
  'git.sync': { editor: 'other', holdsEvents: true },
  'git.init': { editor: 'other', holdsEvents: true },
  'git.log': { editor: 'other', holdsEvents: true },} as const satisfies Record<Command['type'], CommandInfo>
