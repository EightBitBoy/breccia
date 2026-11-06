// The status bar's items; any part of Breccia can show and remove one (§7.13).
import { placeItems, type StatusItem } from './status'

export class StatusItems {
  private items = $state.raw<StatusItem[]>([])
  private placed = $derived(placeItems(this.items))

  /** Adds the item, or replaces the one with the same id. */
  set(item: StatusItem): void {
    const i = this.items.findIndex((x) => x.id === item.id)
    this.items = i < 0 ? [...this.items, item] : this.items.with(i, item)
  }

  clear(id: string): void {
    if (this.items.some((x) => x.id === id)) this.items = this.items.filter((x) => x.id !== id)
  }

  get left(): StatusItem[] {
    return this.placed.left
  }

  get right(): StatusItem[] {
    return this.placed.right
  }

  get empty(): boolean {
    return this.items.length === 0
  }
}
