// Where an output goes: the decisions `App.apply` makes, free of state so they can be tested.
import { cardOf, isBareKeyword } from './board'
import { dayOfBlock, sameDay, type Feed } from './feed'
import { pageOfBlock } from './refs'
import { placeOf, type Place } from './view'
import type { BlockId, Command, Output, PageView } from './types'

export interface ShownView {
  /** The shown page's key, or null. */
  page: string | null
  /** The feed's loaded days; null while no feed is shown. */
  days: ReadonlySet<string> | null
  /** Source pages of the shown linked references. */
  groups: ReadonlySet<string>
  /** Whether the editor is inside the linked references. */
  editingInRefs: boolean
  /** Whether a board is shown. */
  board: boolean
  /** Whether the All pages table is shown. */
  allPages: boolean
  /** Whether the Settings screen is shown. */
  settings: boolean
  /** Whether the Graph screen is shown. */
  graph: boolean
  /** Whether the Git history is shown. */
  gitLog: boolean
  /** Whether the Archive view is shown. */
  archive: boolean
  /** The open card's page key, or null. */
  card: string | null
}

export interface Route {
  /** A feed answer was applied while a page was shown: page, refs and selection go. */
  leavePage: boolean
  place: Place
  /** The page to show (place 'navigate' or 'page'), else null. */
  show: PageView | null
  /** `show` has another key than the shown page: references reset and reload. */
  moved: boolean
  clearSelection: boolean
  closeFeed: boolean
  resetScroll: boolean
  /** Loaded feed days to replace (place 'day', and changed pages that are loaded days). */
  days: PageView[]
  /** Apply `out.refs` now. */
  applyRefs: boolean
  /** Reference groups to patch with these pages. */
  patch: PageView[]
  /** A block an edit in the references focused: it stays shown there. */
  madeInRefs: BlockId | null
  refreshRefs: boolean
  /** Pages to record as our own echoes. */
  own: PageView[]
  /** For `EditorHost.apply`: whether the output's view is shown. */
  shown: boolean
  /** A navigation or an applied feed answer leaves the board. */
  leaveBoard: boolean
  /** A navigation or an applied feed answer leaves the table. */
  leaveAllPages: boolean
  /** A navigation or an applied feed answer leaves Settings. */
  leaveSettings: boolean
  /** A navigation or an applied feed answer leaves the Graph screen. */
  leaveGraph: boolean
  /** A navigation or an applied feed answer leaves the Git history. */
  leaveGitLog: boolean
  /** A navigation or an applied feed answer leaves the Archive view. */
  leaveArchive: boolean
  /** The table stays shown and the output changed pages or the tree: reload it. */
  refreshAllPages: boolean
  /** Pages the open card follows: out.page when place is 'none', and out.changed, with key === view.card. */
  cardPages: PageView[]
  /** The board reloads: it is shown and the output has a page, changed pages or removals. */
  refreshBoard: boolean
  /** A `journal.append` answer on a board: open its focus block as a new card. */
  openAdded: boolean
  /** A `journal.append` answered while no board is shown: its new block if still bare (only the keyword, no children), else null. App deletes it. */
  strayAdded: BlockId | null
  /** Hand the editor the output without its focus: it must not open on the stray block being deleted. */
  dropFocus: boolean
}

/** Call after `journal.applyFeed`; `feedShown` is its result (false when `out.feed` is null). */
export function route(out: Output, cmd: Command | undefined, view: ShownView, feedShown: boolean): Route {
  const leavePage = feedShown && view.page !== null
  const page = leavePage ? null : view.page
  const place: Place =
    out.page === null
      ? 'none'
      : placeOf(
          cmd,
          {
            page,
            days: view.days,
            board: view.board,
            allPages: view.allPages,
            settings: view.settings,
            graph: view.graph,
            gitLog: view.gitLog,
            archive: view.archive,
          },
          out.page.key,
        )
  const leaveBoard = view.board && (place === 'navigate' || feedShown)
  const leaveAllPages = view.allPages && (place === 'navigate' || feedShown)
  const leaveSettings = view.settings && (place === 'navigate' || feedShown)
  const leaveGraph = view.graph && (place === 'navigate' || feedShown)
  const leaveGitLog = view.gitLog && (place === 'navigate' || feedShown)
  const leaveArchive = view.archive && (place === 'navigate' || feedShown)
  const r: Route = {
    leavePage,
    place,
    show: null,
    moved: false,
    clearSelection: leavePage,
    closeFeed: false,
    resetScroll: false,
    days: [],
    applyRefs: false,
    patch: [],
    madeInRefs: null,
    refreshRefs: false,
    own: [],
    shown: false,
    leaveBoard,
    leaveAllPages,
    leaveSettings,
    leaveGraph,
    leaveGitLog,
    leaveArchive,
    refreshAllPages: false,
    cardPages: [],
    refreshBoard: false,
    openAdded: false,
    strayAdded: null,
    dropFocus: false,
  }
  if (out.page && place === 'day') {
    r.days.push(out.page)
    r.own.push(out.page)
  } else if (out.page && place !== 'none') {
    r.show = out.page
    r.moved = out.page.key !== page
    if ((page !== null || view.days !== null) && r.moved) r.clearSelection = true
    r.closeFeed = place === 'navigate'
    // Another page starts at its top, not at the feed's scroll position.
    r.resetScroll = place === 'navigate' && r.moved
    r.own.push(out.page)
  }
  // A rename can rewrite links in a loaded day.
  const changedDays = view.days ? out.changed.filter((p) => view.days!.has(p.key)) : []
  r.days.push(...changedDays)
  r.own.push(...changedDays)

  // App drops the references when it leaves the page, as when it moves to another.
  const groups = r.moved || leavePage ? new Set<string>() : view.groups
  const editingInRefs = r.moved || leavePage ? false : view.editingInRefs
  const shownKey = r.show ? r.show.key : page
  const refsHere = out.refs !== null && out.refs.key === shownKey
  const held = refsHere && editingInRefs
  r.applyRefs = refsHere && !held

  // Edits in a reference answer with its source page: the reference shows them.
  const inGroup = place === 'none' && out.page !== null && groups.has(out.page.key)
  if (inGroup && out.focus) r.madeInRefs = out.focus.id
  r.patch = [inGroup ? out.page : null, ...out.changed].filter((p): p is PageView => p !== null && groups.has(p.key))
  r.own.push(...r.patch)
  // A link may have come or gone: load them again (once the editor leaves them).
  r.refreshRefs =
    r.moved || held || r.patch.length > 0 || cmd?.type === 'page.rename' || out.removed.some((k) => groups.has(k))
  // On the board: its outputs' pages are our own echoes, the open card follows its page, the board reloads.
  if (view.board && !leaveBoard) {
    const touched = [place === 'none' ? out.page : null, ...out.changed].filter((p): p is PageView => p !== null)
    r.own.push(...touched)
    r.cardPages = touched.filter((p) => p.key === view.card)
    r.refreshBoard = out.page !== null || out.changed.length > 0 || out.removed.length > 0
    r.openAdded = cmd?.type === 'journal.append' && out.page !== null && out.focus !== null
  } else if (cmd?.type === 'journal.append' && out.page && out.focus) {
    // "+ Add" answered after the user left the board: its new block, never shown as a card, goes again.
    // This assumes "+ Add" is the only sender of `journal.append`; another sender (a quick capture with
    // `text: ''`) would need its own mark, or its new block would be deleted at once.
    const added = cardOf(out.page, out.focus.id)?.groups[0].refs[0].blocks
    if (added?.length === 1 && isBareKeyword(added[0].text, cmd.text)) {
      r.strayAdded = out.focus.id
      r.dropFocus = true
    }
  }
  // On the table: its outputs' pages are our own echoes too; it reloads on any page or tree change.
  if (view.allPages && !leaveAllPages) {
    r.own.push(...[place === 'none' ? out.page : null, ...out.changed].filter((p): p is PageView => p !== null))
    r.refreshAllPages = out.page !== null || out.changed.length > 0 || out.removed.length > 0 || out.tree !== null
  }
  r.shown = place !== 'none' || inGroup || feedShown || r.cardPages.length > 0
  return r
}

/** Whether Shift-click on `id` extends a selection from `from`: within the page's own outline, or within one feed day. */
export function extendsTo(feed: Feed | null, page: PageView | null, from: BlockId | null, id: BlockId): boolean {
  if (from === null) return false
  return feed ? sameDay(feed, from, id) : pageOfBlock(page, null, id) !== null
}

/** Where multi-select works: the shown page, or in the feed the loaded day of `id` (the edited or anchored block). */
export function selectionPageOf(feed: Feed | null, page: PageView | null, id: BlockId | null): PageView | null {
  if (!feed) return page
  const key = id === null ? null : dayOfBlock(feed, id)
  return key === null ? null : (feed.loaded[key] ?? null)
}
