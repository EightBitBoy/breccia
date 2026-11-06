<script lang="ts">
  import type { RefsView } from '../lib/types'
  import { visible } from '../lib/tree'
  import BlockRow from './BlockRow.svelte'

  let {
    refs,
    folded,
    editingId,
    onedit,
    ontoggle,
    onopen,
  }: {
    refs: RefsView
    folded: ReadonlySet<number>
    editingId: number | null
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
    /** Open a source page by name. */
    onopen: (name: string) => void
  } = $props()
</script>

{#if refs.count > 0}
  <section class="refs" data-testid="linked-refs">
    <h3>Linked references · {refs.count}</h3>
    {#each refs.groups as g (g.page)}
      <button class="refsrc" onclick={() => onopen(g.page)}>{g.title}</button>
      {#each g.refs as r (r.blocks[0]?.id)}
        <div class="ref">
          {#if r.crumbs.length}
            <div class="crumbs">{r.crumbs.join(' › ')}</div>
          {/if}
          {#each visible(r.blocks, folded) as b (b.id)}
            <BlockRow
              block={b}
              editing={b.id === editingId}
              selected={false}
              folded={folded.has(b.id)}
              {onedit}
              {ontoggle}
            />
          {/each}
        </div>
      {/each}
    {/each}
  </section>
{/if}
