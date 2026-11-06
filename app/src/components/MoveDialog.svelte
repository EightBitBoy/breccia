<script lang="ts">
  import { Dialog } from 'bits-ui'

  let {
    title,
    targets,
    onok,
    oncancel,
  }: {
    title: string
    targets: { path: string; label: string }[]
    onok: (path: string) => void
    oncancel: () => void
  } = $props()

  let chosen = $state<string | null>(null)
</script>

<Dialog.Root open onOpenChange={(o) => !o && oncancel()}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="dialog" aria-describedby={undefined}>
      <Dialog.Title class="dialog-title">{title}</Dialog.Title>
      {#if targets.length}
        <div class="targets" role="listbox" aria-label="Move to">
          {#each targets as t (t.path)}
            <button
              type="button"
              class="target"
              class:on={chosen === t.path}
              role="option"
              aria-selected={chosen === t.path}
              data-target={t.path}
              onclick={() => (chosen = t.path)}
              ondblclick={() => onok(t.path)}
            >
              {t.label}
            </button>
          {/each}
        </div>
      {:else}
        <p>There is no other folder.</p>
      {/if}
      <div class="dialog-actions">
        <button type="button" onclick={oncancel}>Cancel</button>
        <button
          type="button"
          class="primary"
          data-testid="dialog-ok"
          disabled={chosen === null}
          onclick={() => chosen !== null && onok(chosen)}
        >
          Move
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
