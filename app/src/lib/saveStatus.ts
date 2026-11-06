// The status bar's save indicator: whether what was typed is on disk.
import type { StatusItem } from './status'

export interface SaveState {
  /** A notes folder is open. */
  folder: boolean
  /** Typed text is still on its way to the core. */
  unsaved: boolean
  /** How many pages hold a "could not be saved" notice. */
  failed: number
}

/** The item on the left: "Saving…", "All changes saved", or a warning; null with no folder open. */
export function saveItem(s: SaveState): StatusItem | null {
  if (!s.folder) return null
  const base = { id: 'save', side: 'left' as const, order: 0, progress: null }
  if (s.failed > 0) {
    const text = `${s.failed} ${s.failed === 1 ? 'page' : 'pages'} not saved`
    return { ...base, text, tone: 'warning', tip: 'Breccia could not write these pages to disk. See the notice for details.' }
  }
  if (s.unsaved) return { ...base, text: 'Saving…', tone: 'normal' }
  return { ...base, text: 'All changes saved', tone: 'normal', tip: 'Everything you typed is written to disk.' }
}
