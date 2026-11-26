// The Settings screen's state: whether it is shown, which section was asked for, and how much the notes use each state.
import type { MainArea } from './mainArea.svelte'
import type { StateUsage } from './types'

export type SettingsSection = 'folder' | 'states' | 'boards' | 'git' | 'journal' | 'dailies' | 'themes' | 'appearance' | 'keyboard'

export interface SettingsEnv {
  area: MainArea
}

export class SettingsScreen {
  get shown(): boolean {
    return this.env.area.is('settings')
  }
  /** The section to scroll to when opened; null for the top. */
  section = $state<SettingsSection | null>(null)
  /** Whether the changelog overlay is shown over the Settings screen. */
  changelog = $state(false)
  usage = $state.raw<StateUsage[]>([])
  /** Pages that did not load, so are neither counted nor renamed (the `usage` answer's `skipped`). */
  skipped = $state(0)

  constructor(private env: SettingsEnv) {
    // The one place a leave of the screen passes through, whoever causes it.
    env.area.register('settings', { left: () => (this.changelog = false) })
  }

  open(section?: SettingsSection): void {
    this.section = section ?? null
    this.env.area.show({ kind: 'settings' })
  }

  close(): void {
    this.env.area.leave('settings')
  }

  showChangelog(): void {
    if (this.shown) this.changelog = true
  }

  hideChangelog(): void {
    this.changelog = false
  }

  applyUsage(u: StateUsage[], skipped = 0): void {
    this.usage = u
    this.skipped = skipped
  }
}
