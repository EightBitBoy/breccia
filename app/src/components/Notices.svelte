<script lang="ts">
  import type { Item } from '../lib/types'
  let { items, ondismiss }: { items: Item[]; ondismiss: (id: number) => void } = $props()
</script>

{#if items.length}
  <div class="notices" role="status">
    {#each items as n (n.id)}
      <div class="notice" class:error={n.error} class:conflict={n.detail} data-testid="notice" data-unsaved-page={n.unsavedPage}>
        <span>{n.text}</span>
        {#each n.actions ?? [] as a (a.label)}
          <button class="act" onclick={a.run}>{a.label}</button>
        {/each}
        <button class="close" aria-label="Dismiss" onclick={() => ondismiss(n.id)}>×</button>
        {#if n.detail}
          <div class="versions">
            <div class="version">
              <div class="label">Yours</div>
              <pre data-testid="conflict-mine">{n.detail.mine}</pre>
            </div>
            {#if n.detail.theirs !== null}
              <div class="version">
                <div class="label">On disk</div>
                <pre data-testid="conflict-theirs">{n.detail.theirs}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
