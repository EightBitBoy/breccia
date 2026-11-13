// The status bar's items (§7.13): short state along the bottom of the window.
import { THEME_NAMES, type ThemeChoice } from './theme'
import type { IndexProgress } from './types'

export interface StatusItem {
  id: string
  side: 'left' | 'right'
  /** Lower comes first on its side; ties go by id. */
  order: number
  text: string
  /** From 0 to 1, or null for no progress line. */
  progress: number | null
  tone: 'normal' | 'warning'
  /** Renders as a button. */
  action?: boolean
  /** Hover text. */
  tip?: string
  /** Shown as this icon, with `tip` as its name; `text` is then empty. */
  icon?: 'history'
  /** A button that is pressed (its view is open). */
  pressed?: boolean
  /** The button's accessible name, when its text is a symbol. */
  label?: string
}

/** The items split by side, each sorted by `order`, then `id`. */
export function placeItems(items: StatusItem[]): { left: StatusItem[]; right: StatusItem[] } {
  const sorted = [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { left: sorted.filter((i) => i.side === 'left'), right: sorted.filter((i) => i.side === 'right') }
}

const count = (n: number) => n.toLocaleString('en-GB')

/**
 * The search index item while a build runs; null once it is finished (or there is nothing to build);
 * 'ignore' for an event of another folder generation (an old loop's last event).
 * The new loop's first `index:changed` can arrive before the folder answer sets `generation`, so it is
 * ignored as "old"; the next chunk's event shows the item, so this is harmless.
 */
export function indexItem(p: IndexProgress, generation: number | null): StatusItem | null | 'ignore' {
  if (generation !== null && p.generation !== generation) return 'ignore'
  if (p.total === 0 || p.done >= p.total) return null
  return {
    id: 'index',
    side: 'left',
    order: 10,
    text: `Indexing for search · ${count(p.done)} of ${count(p.total)} pages`,
    progress: p.done / p.total,
    tone: 'normal',
  }
}

/** The "?" button at the bottom right that opens the list of keyboard shortcuts (also `F1`). */
export function helpItem(shown: boolean): StatusItem {
  return {
    id: 'help',
    side: 'right',
    order: 40,
    text: '?',
    progress: null,
    tone: 'normal',
    action: true,
    tip: 'Keyboard shortcuts (F1)',
    pressed: shown,
  }
}

/** The button just left of "?" that opens the theme menu (the same choices as Settings > Themes). */
export function themeItem(c: ThemeChoice): StatusItem {
  return {
    id: 'theme',
    side: 'right',
    order: 35,
    text: '◐',
    progress: null,
    tone: 'normal',
    action: true,
    tip: `Theme: ${THEME_NAMES[c]}. Scroll to switch.`,
    label: 'Theme',
  }
}
