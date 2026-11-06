<script lang="ts">
  let {
    onsubmit,
    oncancel,
  }: {
    /** The page gets this name (trimmed, not empty). */
    onsubmit: (name: string) => void
    oncancel: () => void
  } = $props()

  let draft = $state('')

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      const name = draft.trim()
      if (name !== '') onsubmit(name)
    }
  }
</script>

<article class="page" data-testid="new-page">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="title-input"
    data-testid="new-page-title"
    aria-label="Page title"
    placeholder="Untitled"
    bind:value={draft}
    autofocus
    onkeydown={key}
  />
  <p class="preamble">💡 This page becomes real once it has a title. Type one and press Enter, or Esc to drop it.</p>
</article>
