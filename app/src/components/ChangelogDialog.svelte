<script lang="ts">
  // The changelog over Settings: CHANGELOG.md as it was when this build was made (in the bundle, so also offline).
  // Rendered from parsed blocks, never as HTML.
  import { Dialog } from 'bits-ui'
  import text from 'virtual:changelog'
  import { changelogNote, parseChangelog, type Inline } from '../lib/changelog'

  let {
    version,
    onclose,
  }: {
    /** The running program's version; null until known or if it is not. */
    version: string | null
    /** Esc or a click outside. */
    onclose: () => void
  } = $props()

  const blocks = parseChangelog(text)
  const note = $derived(changelogNote(import.meta.env.DEV, version))
  let body = $state<HTMLDivElement | null>(null)
  /** Where the focus was when the overlay opened (the "Show changelog" button); it goes back there on close. */
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
</script>

{#snippet inlines(list: Inline[])}{#each list as i, n (n)}{#if i.kind === 'code'}<code>{i.text}</code>{:else if i.kind === 'strong'}<strong>{i.text}</strong>{:else if i.kind === 'link'}<a class="ext" href={i.href}>{i.text}</a>{:else}{i.text}{/if}{/each}{/snippet}

<Dialog.Root open onOpenChange={(o) => !o && onclose()}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content
      class="dialog changelog-dialog"
      data-testid="changelog"
      aria-describedby={undefined}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        body?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        if (before?.isConnected) before.focus({ preventScroll: true })
      }}
    >
      <Dialog.Title class="dialog-title">Changelog</Dialog.Title>
      {#if note !== null}
        <p class="changelog-note" data-testid="changelog-dev-note">{note}</p>
      {/if}
      <div class="changelog-body" data-testid="changelog-body" tabindex="-1" bind:this={body}>
        {#each blocks as b, n (n)}
          {#if b.kind === 'heading'}
            {#if b.level === 3}
              <h4>{@render inlines(b.inlines)}</h4>
            {:else}
              <h3 data-version={b.version ?? undefined}>{@render inlines(b.inlines)}</h3>
            {/if}
          {:else if b.kind === 'list'}
            <ul>
              {#each b.items as item, k (k)}
                <li>{@render inlines(item)}</li>
              {/each}
            </ul>
          {:else}
            <p>{@render inlines(b.inlines)}</p>
          {/if}
        {/each}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
