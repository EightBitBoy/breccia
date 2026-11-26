// Which screen the main area shows: one value, so no two screens can be shown at once.

export type MainView =
  | { kind: 'none' } | { kind: 'newPage'; folder: string } | { kind: 'page' } | { kind: 'feed' } | { kind: 'board' }
  | { kind: 'allPages' } | { kind: 'archive' } | { kind: 'dailies' } | { kind: 'gitLog' } | { kind: 'graph' }
  | { kind: 'settings' }
export type MainKind = MainView['kind']

/** A view's part in the area: `left()` drops its data when the area shows another kind. */
export interface MainPart {
  left(): void
}

export class MainArea {
  view = $state.raw<MainView>({ kind: 'none' })
  private parts = new Map<MainKind, MainPart>()

  register(kind: MainKind, part: MainPart): void {
    this.parts.set(kind, part)
  }

  is(kind: MainKind): boolean {
    return this.view.kind === kind
  }

  /** Shows `v`; when its kind differs from the shown one, the shown part's `left()` runs first. */
  show(v: MainView): void {
    const old = this.view.kind
    if (old !== v.kind) this.parts.get(old)?.left()
    this.view = v
  }

  /** Back to 'none' when `kind` is shown (its `left()` runs); else nothing. */
  leave(kind: MainKind): void {
    if (this.view.kind === kind) this.show({ kind: 'none' })
  }

  /** Back to 'none' unless `kind` is shown (`leaveMainView(keep)`). */
  leaveFor(kind: MainKind): void {
    if (this.view.kind !== kind) this.show({ kind: 'none' })
  }
}
