<script lang="ts">
  import type { Snippet } from 'svelte'
  import { ContextMenu } from 'bits-ui'
  import { menuFor, type Op } from '../lib/pageOps'
  import type { Row } from '../lib/treeRows'

  let {
    rows,
    onop,
    children,
  }: {
    rows: Row[]
    onop: (op: Op, row: Row | null) => void
    children: Snippet
  } = $props()

  const labels: Record<Op, string> = {
    newPage: 'New page',
    newFolder: 'New folder',
    rename: 'Rename…',
    move: 'Move…',
    delete: 'Delete',
  }

  /** The row the menu was opened on; null for the empty area and the Pages group. */
  let row = $state<Row | null>(null)
  /** The menu was opened on a heading with no operations (Tags). */
  let none = $state(false)
  const ops = $derived(none ? [] : menuFor(row))

  function pick(e: MouseEvent) {
    const target = e.target as Element | null
    const id = target?.closest?.('[data-row]')?.getAttribute('data-row')
    row = rows.find((r) => r.id === id) ?? null
    none = row === null && !!target?.closest?.('[data-no-menu]')
    // Rows without operations (Journals, years, months) get no menu, not even the native one.
    if (none || menuFor(row).length === 0) e.preventDefault()
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="tree-zone" oncontextmenu={pick}>
    {@render children()}
  </ContextMenu.Trigger>
  {#if ops.length}
    <ContextMenu.Portal>
      <ContextMenu.Content class="menu" data-testid="tree-menu">
        {#each ops as op (op)}
          <ContextMenu.Item class="menu-item" data-op={op} onSelect={() => onop(op, row)}>
            {labels[op]}
          </ContextMenu.Item>
        {/each}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  {/if}
</ContextMenu.Root>
