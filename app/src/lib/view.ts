// Where an output's page goes: the shown page, a day of the feed, or a new view.
import type { Command } from './types'

export type Place = 'navigate' | 'page' | 'day' | 'none'

/**
 * Where an output's page goes. `shown.page` is the shown page's key; `shown.days`
 * the feed's loaded days (null when no feed is shown); `shown.board` and
 * `shown.allPages` whether a board or the All pages table is shown, `shown.settings`
 * whether the Settings screen is, `shown.graph` whether the Graph screen is, `shown.gitLog` whether the Git
 * history is, `shown.archive` whether the Archive view is (then edits stay put and
 * only navigation leaves them).
 *
 * Only navigation (`page.*`, `folder.*`) may switch to another page; a late
 * answer to typing or an edit on the page the user just left must not pull them
 * back. A rename, a move, a color pick (made from a link too) and a `page.get` (a queued refresh) replace the view
 * only if they are about the shown page.
 */
export function placeOf(
  cmd: Command | undefined,
  shown: {
    page: string | null
    days: ReadonlySet<string> | null
    board: boolean
    allPages: boolean
    settings?: boolean
    graph?: boolean
    gitLog?: boolean
    archive?: boolean
  },
  key: string,
): Place {
  const other = shown.board || shown.allPages || shown.settings || shown.graph || shown.gitLog || shown.archive
  if (shown.page === null && shown.days === null && !other) return 'navigate'
  if (key === shown.page) return 'page'
  if (
    shown.days?.has(key) && cmd?.type !== 'page.open' &&
    cmd?.type !== 'page.show' &&
    cmd?.type !== 'page.today' &&
    cmd?.type !== 'page.create'
  ) {
    return 'day'
  }
  if (cmd === undefined) return 'navigate'
  switch (cmd.type) {
    case 'page.rename':
    case 'page.move':
    case 'page.get':
    case 'page.setColor':
      return cmd.key === shown.page ? 'page' : 'none'
    default:
      return cmd.type.startsWith('page.') || cmd.type.startsWith('folder.') ? 'navigate' : 'none'
  }
}
