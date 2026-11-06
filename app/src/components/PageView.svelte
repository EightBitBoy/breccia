<script lang="ts">
  import type { PageView, RefsView } from '../lib/types'
  import Outline from './Outline.svelte'
  import LinkedRefs from './LinkedRefs.svelte'

  let {
    page,
    refs,
    folded,
    editingId,
    selected,
    flash = null,
    onedit,
    ontoggle,
    onstart,
    onrename,
    onopen,
  }: {
    page: PageView
    /** The linked references to the page, once loaded. */
    refs: RefsView | null
    folded: Set<number>
    editingId: number | null
    /** The selected blocks (multi-select). */
    selected: number[]
    /** A block to highlight briefly (the jump from a card). */
    flash?: number | null
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
    onstart: () => void
    /** Rename the page (a journal's title cannot be renamed). */
    onrename: (name: string) => void
    /** Open a page by name (a reference's source). */
    onopen: (name: string) => void
  } = $props()

  let renaming = $state(false)
  let draft = $state('')

  function startRename() {
    draft = page.name
    renaming = true
  }

  function titleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      renaming = false
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      const name = draft.trim()
      renaming = false
      if (name !== '') onrename(name)
    }
  }
</script>

<article class="page">
  {#if renaming}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="title-input"
      data-testid="name-input"
      aria-label="Page name"
      bind:value={draft}
      autofocus
      onkeydown={titleKey}
      onblur={() => (renaming = false)}
    />
  {:else if page.kind === 'page'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <h1 class="renamable" data-testid="page-title" title="Click to rename" onclick={startRename}>{page.title}</h1>
  {:else}
    <h1 data-testid="page-title">{page.title}</h1>
  {/if}
  {#if page.preambleHtml}
    <div class="preamble">{@html page.preambleHtml}</div>
  {/if}
  <Outline blocks={page.blocks} hasFile={page.hasFile} {folded} {editingId} {selected} {flash} {onedit} {ontoggle} {onstart} />
  {#if refs}
    <LinkedRefs {refs} {folded} {editingId} {onedit} {ontoggle} {onopen} />
  {/if}
</article>
