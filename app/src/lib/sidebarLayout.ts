// The sidebar's width: default, limits and dragging, and the saved layout read at startup.
import type { UiState } from './types'
import { clampColumn } from './boardWidth'
import { parseZoom } from './zoom'
import { parseTheme, type ThemeChoice } from './theme'

export const SIDEBAR_DEFAULT = 250
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 480

/** A width within the limits; a missing or invalid one is the default. */
export function clampWidth(w: number | null | undefined): number {
  if (w === null || w === undefined || !Number.isFinite(w)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
}

/**
 * The saved sidebar layout from `get`, clamped. One that cannot be read is
 * logged and the default layout is used, so startup goes on.
 */
export async function loadLayout(get: () => Promise<UiState>): Promise<{ width: number; hidden: boolean; theme: ThemeChoice; boardColumn: number | null; zoom: number }> {
  try {
    const ui = await get()
    return { width: clampWidth(ui.sidebarWidth), hidden: ui.sidebarHidden,
      theme: parseTheme(ui.theme),
      boardColumn: clampColumn(ui.boardColumnWidth),
      zoom: parseZoom(ui.zoomPercent),
    }
  } catch (e) {
    console.error('could not read the saved layout', e)
    return { width: clampWidth(null), hidden: false, theme: 'system', boardColumn: null, zoom: 100 }
  }
}
