// The Settings screen's state: whether it is shown, which section was asked for, and how much the notes use each state.
import type { MainArea } from './mainArea.svelte'
import type { Overlays } from './overlay.svelte'
import type { StateUsage } from './types'

export type SettingsSection = 'folder' | 'states' | 'boards' | 'git' | 'journal' | 'dailies' | 'themes' | 'appearance' | 'keyboard'

export interface SettingsEnv {
  area: MainArea
  /** The changelog opens over the screen as an overlay. */
  overlays: Overlays
}

export class SettingsScreen {
  get shown(): boolean {
    return this.env.area.is('settings')
  }
  /** The section to scroll to when opened; null for the top. */
  section = $state<SettingsSection | null>(null)
  usage = $state.raw<StateUsage[]>([])
  /** Pages that did not load, so are neither counted nor renamed (the `usage` answer's `skipped`). */
  skipped = $state(0)

  constructor(private env: SettingsEnv) {
    // The one place a leave of the screen passes through, whoever causes it: the changelog over it closes.
    env.area.register('settings', { left: () => env.overlays.close('changelog') })
  }

  open(section?: SettingsSection): void {
    this.section = section ?? null
    this.env.area.show({ kind: 'settings' })
  }

  close(): void {
    this.env.area.leave('settings')
  }

  /** "Show changelog": the changelog overlay, only while the screen is shown. */
  showChangelog(): void {
    if (this.shown) this.env.overlays.open({ kind: 'changelog' })
  }

  applyUsage(u: StateUsage[], skipped = 0): void {
    this.usage = u
    this.skipped = skipped
  }
}
