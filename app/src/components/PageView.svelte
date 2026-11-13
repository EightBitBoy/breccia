<script lang="ts">
  import { linkDisplay } from '../lib/linkDisplay.svelte'
  import type { PageView, RefsView } from '../lib/types'
  import Outline from './Outline.svelte'
  import LinkedRefs from './LinkedRefs.svelte'
  import PageColorPicker from './PageColorPicker.svelte'
  import LinkColorMenu from './LinkColorMenu.svelte'

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
    onsetcolor,
    onlinkcolor,
    onhistory,
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
    /** Set the page's color, or remove it with null (pages only; journal days have none). */
    onsetcolor: (color: string | null) => void
    /** Give the page `key` a color, or remove it with null (journal days: a right-click on a link or tag). */
    onlinkcolor: (key: string, color: string | null) => void
    /** Undo (false) or redo (true) on the page, from the color swatch. */
    onhistory: (redo: boolean) => void
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
  <div class="title-row">
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
    {#if page.kind === 'page'}
      <PageColorPicker color={page.color ?? null} onpick={onsetcolor} {onhistory} />
    {/if}
  </div>
  {#if page.preambleHtml}
    <div class="preamble">{@html linkDisplay.apply(page.preambleHtml)}</div>
  {/if}
  {#if page.kind === 'journal'}
    <LinkColorMenu targets={page.targets ?? []} onsetcolor={onlinkcolor}>
      <Outline blocks={page.blocks} hasFile={page.hasFile} {folded} {editingId} {selected} {flash} {onedit} {ontoggle} {onstart} />
    </LinkColorMenu>
  {:else}
    <Outline blocks={page.blocks} hasFile={page.hasFile} {folded} {editingId} {selected} {flash} {onedit} {ontoggle} {onstart} />
  {/if}
  {#if refs}
    <LinkedRefs {refs} {folded} {editingId} {onedit} {ontoggle} {onopen} />
  {/if}
</article>
