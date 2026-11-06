<script lang="ts">
  import { onMount } from 'svelte'
  import { Virtualizer, elementScroll, observeElementOffset, observeElementRect, type VirtualItem } from '@tanstack/virtual-core'
  import { COLUMNS, countLabel, folderLabel, formatDay, formatDayTime } from '../lib/allPages'
  import type { AllPages } from '../lib/allPages.svelte'
  import type { PageRowView } from '../lib/types'

  let {
    pages,
    scroller,
    onopen,
  }: {
    pages: AllPages
    /** The `.main` element, which scrolls. */
    scroller: HTMLElement
    /** Opens the page of this row. */
    onopen: (row: PageRowView) => void
  } = $props()

  /** Every row is this tall (CSS `.prow` agrees), so nothing is measured. */
  const ROW = 33

  const visible = $derived(pages.visible())
  const total = $derived(pages.total())
  const filtered = $derived(pages.filter.trim() !== '')

  let filterEl: HTMLInputElement | undefined = $state()
  let rowsEl: HTMLDivElement | undefined = $state()
  let headEl: HTMLDivElement | undefined = $state()
  let items = $state<VirtualItem[]>([])
  let height = $state(0)
  /** Where the rows start inside the scroller's content. */
  let margin = $state(0)

  function options(count: number, scrollMargin: number) {
    return {
      count,
      getItemKey: (i: number) => visible[i]?.key ?? i,
      estimateSize: () => ROW,
      overscan: 10,
      scrollMargin,
      getScrollElement: () => scroller,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: (v: Virtualizer<HTMLElement, HTMLElement>) => {
        items = [...v.getVirtualItems()]
        height = v.getTotalSize()
      },
    }
  }

  const virtualizer = new Virtualizer<HTMLElement, HTMLElement>(options(0, 0))

  // The rows' offset in the scroller's content: the padding, title, filter bar and header.
  // Measured again when the header block changes size (a theme or font change, a narrow window).
  $effect(() => {
    if (!rowsEl || !headEl) return
    const read = () => {
      if (!rowsEl) return
      const r = rowsEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      margin = Math.round(r + scroller.scrollTop)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(headEl)
    return () => ro.disconnect()
  })

  $effect(() => virtualizer._didMount())

  $effect(() => {
    virtualizer.setOptions(options(visible.length, margin))
    virtualizer._willUpdate()
    items = [...virtualizer.getVirtualItems()]
    height = virtualizer.getTotalSize()
  })

  onMount(() => filterEl?.focus())

  /** Enter opens the first row; Escape empties the filter. */
  function onFilterKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (visible.length) onopen(visible[0])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      pages.filter = ''
    }
  }
</script>

<section class="all-pages" data-testid="all-pages">
  <div class="top" bind:this={headEl}>
  <div class="ptitle">
    <h1>All pages</h1>
    {#if pages.rows !== null}
      <span class="arr" data-testid="pages-count">{countLabel(visible.length, total, filtered)}</span>
    {/if}
  </div>
  <div class="tbar">
    <input
      class="filter"
      data-testid="pages-filter"
      placeholder="Filter pages…"
      spellcheck="false"
      bind:this={filterEl}
      bind:value={pages.filter}
      onkeydown={onFilterKey}
    />
    <label class="tog"><input type="checkbox" data-testid="show-journals" bind:checked={pages.showJournals} /> Show journal pages</label>
  </div>
  </div>
  <div class="ptable" role="table" aria-label="All pages">
    <div class="phead" role="rowgroup">
      <div class="prow" role="row">
        {#each COLUMNS as col (col.key)}
          {@const sorted = pages.sort.key === col.key ? pages.sort.dir : null}
          <div role="columnheader" class:num={col.numeric} aria-sort={sorted === null ? 'none' : sorted === 'asc' ? 'ascending' : 'descending'}>
            <button
              data-testid="col"
              data-col={col.key}
              data-sorted={sorted ?? undefined}
              class:sorted={sorted !== null}
              title={col.title}
              onclick={() => {
                if (pages.sortBy(col.key)) scroller.scrollTop = 0
              }}>{col.label}{sorted === 'asc' ? ' ▲' : sorted === 'desc' ? ' ▼' : ''}</button
            >
          </div>
        {/each}
      </div>
    </div>
    <div class="prows" role="rowgroup" bind:this={rowsEl} style:height="{height}px">
      {#each items as it (it.key)}
        {@const r = visible[it.index]}
        {#if r}
          <div class="prow" role="row" data-testid="page-row" data-key={r.key} style="transform: translateY({it.start - margin}px)">
            <div role="cell" data-cell="name" class="name">
              <button
                class="name"
                class:linked-only={r.linkedOnly}
                title={r.linkedOnly ? `${r.title}: only linked to, no text of its own yet` : r.title}
                onclick={() => onopen(r)}>{r.title}</button
              >
            </div>
            <div role="cell" data-cell="folder" class="dim">{folderLabel(r)}</div>
            <div role="cell" data-cell="created" class="dim">{formatDay(r.created)}</div>
            <div role="cell" data-cell="edited">{formatDayTime(r.edited)}</div>
            <div role="cell" data-cell="linkedFrom" class="num">{r.linkedFrom}</div>
            <div role="cell" data-cell="linksOut" class="num">{r.linksOut}</div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
  {#if pages.rows !== null && total === 0}
    <p class="pempty">No pages yet.</p>
  {:else if pages.rows !== null && visible.length === 0}
    <p class="pempty">No pages match.</p>
  {/if}
</section>
