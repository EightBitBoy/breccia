<script lang="ts">
  // The Archive view: every archived task, newest done date first; a row opens its page at the block.
  import { onMount } from 'svelte'
  import { countLabel, formatDate } from '../lib/archive'
  import type { Archive } from '../lib/archive.svelte'
  import type { ArchivedView } from '../lib/types'

  let { archive, onopen }: { archive: Archive; onopen: (row: ArchivedView) => void } = $props()

  const visible = $derived(archive.visible())
  const total = $derived(archive.total())
  const filtered = $derived(archive.filter.trim() !== '')

  let filterEl: HTMLInputElement | undefined = $state()
  onMount(() => filterEl?.focus())

  /** Enter opens the first row; Escape empties the filter (as in All pages). */
  function onFilterKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (visible.length) onopen(visible[0])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      archive.filter = ''
    }
  }
</script>

<section class="archive" data-testid="archive">
  <div class="ptitle">
    <h1>Archive</h1>
    {#if archive.rows !== null}
      <span class="arr" data-testid="archive-count">{countLabel(visible.length, total, filtered)}</span>
    {/if}
  </div>
  <div class="tbar">
    <input
      class="filter"
      data-testid="archive-filter"
      placeholder="Filter archived tasks…"
      spellcheck="false"
      bind:this={filterEl}
      bind:value={archive.filter}
      onkeydown={onFilterKey}
    />
  </div>
  {#if archive.rows !== null && total === 0}
    <p class="pempty" data-testid="archive-empty">No archived tasks yet.</p>
  {:else if archive.rows !== null && visible.length === 0}
    <p class="pempty" data-testid="archive-empty">No archived tasks match.</p>
  {:else if archive.rows !== null}
    <div class="ptable archive-table" role="table" aria-label="Archived tasks">
      <div class="phead" role="rowgroup">
        <div class="prow" role="row">
          <div role="columnheader">Task</div>
          <div role="columnheader">State</div>
          <div role="columnheader">Created</div>
          <div role="columnheader">Done</div>
          <div role="columnheader">Took</div>
          <div role="columnheader">Archived</div>
          <div role="columnheader">Page</div>
        </div>
      </div>
      <div class="arows" role="rowgroup">
        {#each visible as r (r.id)}
          <!-- The task's button takes the keyboard; a click anywhere on the row opens the page at the block. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="prow" role="row" tabindex="-1" data-testid="archive-row" data-id={r.id} onclick={() => onopen(r)}>
            <div role="cell" data-cell="task" class="name">
              <button class="name" title={r.text}>{r.text || '(no text)'}</button>
            </div>
            <div role="cell" data-cell="state" style:color="var(--c-{r.color})">{r.state}</div>
            <div role="cell" data-cell="created" class="dim">{formatDate(r.created)}</div>
            <div role="cell" data-cell="done" class="dim">{formatDate(r.done)}</div>
            <div role="cell" data-cell="took" class="dim">{r.took ?? '—'}</div>
            <div role="cell" data-cell="archived" class="dim">{formatDate(r.archived)}</div>
            <div role="cell" data-cell="page" class="dim" title={r.source}>{r.source}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>
