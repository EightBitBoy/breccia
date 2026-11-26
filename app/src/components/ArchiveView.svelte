<script lang="ts">
  // The Archive view: every archived task, newest done date first; a row opens its page at the block.
  import { onMount } from 'svelte'
  import { countLabel, formatDate } from '../lib/archive'
  import type { Archive } from '../lib/archive.svelte'
  import { fixedRows } from '../lib/fixedRows.svelte'
  import type { ArchivedView } from '../lib/types'

  let {
    archive,
    scroller,
    onopen,
  }: {
    archive: Archive
    /** The `.main` element, which scrolls. */
    scroller: HTMLElement
    onopen: (row: ArchivedView) => void
  } = $props()

  /** Every row is this tall (CSS `.prow` agrees), so nothing is measured. */
  const ROW = 33

  const visible = $derived(archive.visible())
  const total = $derived(archive.total())
  const filtered = $derived(archive.filter.trim() !== '')

  let filterEl: HTMLInputElement | undefined = $state()
  let rowsEl: HTMLDivElement | undefined = $state()
  let headEl: HTMLDivElement | undefined = $state()
  // Only the rows on screen are drawn.
  const list = fixedRows({
    scroller: () => scroller,
    rows: () => visible,
    key: (r) => r.id,
    rowHeight: ROW,
    rowsEl: () => rowsEl,
    headEl: () => headEl,
  })
  onMount(() => filterEl?.focus())

  /** A changed filter shows its rows from the first one, not a window below where the longer list was scrolled to. */
  function toTop() {
    scroller.scrollTop = 0
  }

  /** Enter opens the first row; Escape empties the filter (as in All pages). */
  function onFilterKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (visible.length) onopen(visible[0])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (archive.filter !== '') {
        archive.filter = ''
        toTop()
      }
    }
  }
</script>

<section class="archive" data-testid="archive">
  <div class="top" bind:this={headEl}>
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
      oninput={toTop}
      onkeydown={onFilterKey}
    />
  </div>
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
      <div class="arows prows" role="rowgroup" bind:this={rowsEl} style:height="{list.height}px">
        {#each list.items as it (it.key)}
          {@const r = visible[it.index]}
          {#if r}
          <!-- The task's button takes the keyboard; a click anywhere on the row opens the page at the block. -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="prow" role="row" tabindex="-1" data-testid="archive-row" data-id={r.id} style="transform: translateY({it.start - list.margin}px)" onclick={() => onopen(r)}>
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
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</section>
