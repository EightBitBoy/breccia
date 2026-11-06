<script lang="ts">
  import type { BlockView } from '../lib/types'
  import { visible } from '../lib/tree'
  import { emptyPageText } from '../lib/emptyPage'
  import BlockRow from './BlockRow.svelte'

  let {
    blocks,
    folded,
    editingId,
    selected,
    flash = null,
    hasFile = false,
    onedit,
    ontoggle,
    onstart,
  }: {
    /** All of the page's blocks; folded subtrees are left out here. */
    blocks: BlockView[]
    folded: Set<number>
    editingId: number | null
    /** The selected blocks (multi-select). */
    selected: number[]
    /** A block to highlight briefly. */
    flash?: number | null
    /** Whether the page has a file (a moved page's file may be empty); the journal feed leaves it out. */
    hasFile?: boolean
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
    onstart: () => void
  } = $props()

  const shown = $derived(visible(blocks, folded))
</script>

{#if blocks.length === 0}
  <button class="start" data-testid="start-writing" onclick={onstart}>{emptyPageText(hasFile)}</button>
{:else}
  <div class="outline">
    {#each shown as b (b.id)}
      <BlockRow
        block={b}
        editing={b.id === editingId}
        selected={selected.includes(b.id)}
        folded={folded.has(b.id)}
        flash={b.id === flash}
        {onedit}
        {ontoggle}
      />
    {/each}
  </div>
{/if}
