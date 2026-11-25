<script lang="ts">
  // The F1 overlay, two tabs: "Shortcuts" (every keyboard shortcut in groups, two columns) and "Writing" (an example of
  // each syntax: links, tags, tasks, properties, Markdown). One filter narrows the shown tab. It looks like the search box.
  import { Dialog, Tabs } from 'bits-ui'
  import { escapeHelp, shortcutGroups } from '../lib/shortcuts'
  import { writingGroups } from '../lib/writing'

  let {
    mac,
    states,
    onclose,
  }: {
    mac: boolean
    /** The configured state keywords, for the task example (the defaults when empty). */
    states: string[]
    /** Esc (with an empty filter), a click outside, F1 or the ? button. */
    onclose: () => void
  } = $props()

  let tab = $state<'shortcuts' | 'writing'>('shortcuts')
  let text = $state('')
  let input = $state<HTMLInputElement | null>(null)
  /** Where the focus was when the list opened (a block's editor, for one); it goes back there on close. */
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const groups = $derived(shortcutGroups(mac, text))
  const writing = $derived(writingGroups(states, text))
  const what = $derived(tab === 'writing' ? 'the syntax' : 'the shortcuts')

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
      <Dialog.Title class="sr-only">Help</Dialog.Title>
      <Tabs.Root bind:value={tab}>
        <Tabs.List class="help-tabs" aria-label="Help">
          <Tabs.Trigger value="shortcuts" class="help-tab" data-testid="help-tab-shortcuts">Shortcuts</Tabs.Trigger>
          <Tabs.Trigger value="writing" class="help-tab" data-testid="help-tab-writing">Writing</Tabs.Trigger>
        </Tabs.List>
        <input
          bind:this={input}
          class="search-input"
          data-testid="shortcuts-filter"
          aria-label="Filter {what}"
          placeholder="Filter {what}…"
          spellcheck="false"
          autocomplete="off"
          bind:value={text}
        />
        <!-- Only the shown tab is in the page, so the other tab's rows never count as matches. -->
        <Tabs.Content value="shortcuts">
          {#if tab !== 'shortcuts'}{:else if groups.length === 0}
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
        </Tabs.Content>
        <Tabs.Content value="writing">
          {#if tab !== 'writing'}{:else if writing.length === 0}
            <p class="search-hint" data-testid="writing-empty">No syntax matches</p>
          {:else}
            <div class="shortcuts-groups writing-groups" data-testid="writing-groups">
              {#each writing as g (g.name)}
                <section class="shortcuts-group" data-group={g.name}>
                  <h3>{g.name}</h3>
                  <dl>
                    {#each g.rows as r, i (i)}
                      <dt><code class="writing-example">{r.example}</code></dt>
                      <dd data-testid="writing-row">{r.what}</dd>
                    {/each}
                  </dl>
                </section>
              {/each}
            </div>
          {/if}
        </Tabs.Content>
      </Tabs.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
