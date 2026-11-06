// The Settings screen's state: whether it is shown, which section was asked for, and how much the notes use each state.
import type { StateUsage } from './types'

export type SettingsSection = 'folder' | 'states' | 'boards' | 'git' | 'journal' | 'appearance' | 'keyboard'

export class SettingsScreen {
  shown = $state(false)
  /** The section to scroll to when opened; null for the top. */
  section = $state<SettingsSection | null>(null)
  usage = $state.raw<StateUsage[]>([])
  /** Pages that did not load, so are neither counted nor renamed (`Output.usageSkipped`). */
  skipped = $state(0)

  open(section?: SettingsSection): void {
    this.section = section ?? null
    this.shown = true
  }

  close(): void {
    this.shown = false
  }

  applyUsage(u: StateUsage[], skipped = 0): void {
    this.usage = u
    this.skipped = skipped
  }
}
