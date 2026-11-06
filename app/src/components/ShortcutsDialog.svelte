<script lang="ts">
  // The F1 overlay: every keyboard shortcut in groups, two columns, with a filter. It looks like the search box.
  import { Dialog } from 'bits-ui'
  import { escapeHelp, shortcutGroups } from '../lib/shortcuts'

  let {
    mac,
    onclose,
  }: {
    mac: boolean
    /** Esc (with an empty filter), a click outside, F1 or the ? button. */
    onclose: () => void
  } = $props()

  let text = $state('')
  let input = $state<HTMLInputElement | null>(null)
  /** Where the focus was when the list opened (a block's editor, for one); it goes back there on close. */
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const groups = $derived(shortcutGroups(mac, text))

  $effect(() => input?.focus())

  function onEscape(e: KeyboardEvent) {
    if (escapeHelp(text) === 'clear') {
      e.preventDefault()
      text = ''
    }
  }
</script>

<Dialog.Root open onOpenChange={(o) => !o && onclose()}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content
      class="dialog search-dialog shortcuts-dialog"
      data-testid="shortcuts"
      aria-describedby={undefined}
      onEscapeKeydown={onEscape}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        if (before?.isConnected) before.focus({ preventScroll: true })
      }}
    >
      <Dialog.Title class="sr-only">Keyboard shortcuts</Dialog.Title>
      <input
        bind:this={input}
        class="search-input"
        data-testid="shortcuts-filter"
        aria-label="Filter the shortcuts"
        placeholder="Filter the shortcuts…"
        spellcheck="false"
        autocomplete="off"
        bind:value={text}
      />
      {#if groups.length === 0}
        <p class="search-hint" data-testid="shortcuts-empty">No shortcut matches</p>
      {:else}
        <div class="shortcuts-groups" data-testid="shortcuts-groups">
          {#each groups as g (g.name)}
            <section class="shortcuts-group" data-group={g.name}>
              <h3>{g.name}</h3>
              <dl>
                {#each g.rows as r, i (i)}
                  <dt>{#each r.keys.split(' ') as part, j (j)}{#if part === '/' || part === ','}<span class="sep">{part}</span>{:else}<kbd>{part}</kbd>{/if}{/each}</dt>
                  <dd>{r.what}</dd>
                {/each}
              </dl>
            </section>
          {/each}
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
