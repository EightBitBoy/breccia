<script lang="ts">
  import { Dialog } from 'bits-ui'
  import { Virtualizer, elementScroll, observeElementOffset, observeElementRect, type VirtualItem } from '@tanstack/virtual-core'
  import { hitSegments, selectable, stateColor, type SearchRow } from '../lib/search'
  import type { Search } from '../lib/search.svelte'
  import type { StateView } from '../lib/types'

  let {
    search,
    states,
    onchoose,
  }: {
    search: Search
    /** The configured states, for the colour of a hit's chip. */
    states: StateView[]
    /** A row was clicked; the dialog is still open. Enter goes through `search.enter()`. */
    onchoose: (row: SearchRow) => void
  } = $props()

  /** Every row is this tall (CSS `.search-row` agrees), so nothing is measured. */
  const ROW = 30

  const rows = $derived(search.rows())

  let input = $state<HTMLInputElement | null>(null)
  let listEl = $state<HTMLDivElement | null>(null)
  let items = $state<VirtualItem[]>([])
  let height = $state(0)

  function options(count: number) {
    return {
      count,
      estimateSize: () => ROW,
      overscan: 8,
      getScrollElement: () => listEl,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: (v: Virtualizer<HTMLDivElement, HTMLElement>) => {
        items = [...v.getVirtualItems()]
        height = v.getTotalSize()
      },
    }
  }

  const virtualizer = new Virtualizer<HTMLDivElement, HTMLElement>(options(0))

  $effect(() => {
    if (listEl) return virtualizer._didMount()
  })

  $effect(() => {
    virtualizer.setOptions(options(rows.length))
    virtualizer._willUpdate()
    items = [...virtualizer.getVirtualItems()]
    height = virtualizer.getTotalSize()
  })

  // The selected row stays in view.
  $effect(() => {
    const at = search.selected
    if (at >= 0 && at < rows.length && listEl) virtualizer.scrollToIndex(at, { align: 'auto' })
  })

  $effect(() => input?.focus())

  function onKey(e: KeyboardEvent) {
    if (e.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      search.move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      search.enter()
    }
  }

  /** `data-page`: the page key of a hit or group, the name of a page row. */
  function pageOf(r: SearchRow): string | undefined {
    if (r.kind === 'hit' || r.kind === 'group') return r.page
    if (r.kind === 'page') return r.name
    return undefined
  }
</script>

<Dialog.Root open onOpenChange={(o) => !o && search.dismiss()}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="dialog search-dialog" data-testid="search" aria-describedby={undefined}>
      <Dialog.Title class="sr-only">Search</Dialog.Title>
      <input
        bind:this={input}
        class="search-input"
        data-testid="search-input"
        aria-label="Search"
        placeholder="Search or jump to…"
        spellcheck="false"
        autocomplete="off"
        value={search.text}
        oninput={(e) => search.type(e.currentTarget.value)}
        onkeydown={onKey}
      />
      {#if search.text === ''}
        <p class="search-hint">Type to search pages and notes, or a date</p>
      {:else if search.view && rows.length === 0}
        <p class="search-hint">Nothing found</p>
      {/if}
      <div class="search-list" bind:this={listEl} role="listbox" aria-label="Results">
        <div class="search-rows" style:height="{height}px">
          {#each items as it (it.key)}
            {@const r = rows[it.index]}
            {#if r}
              {@const sel = it.index === search.selected}
              <!-- svelte-ignore a11y_click_events_have_key_events (the input takes the keys) -->
              <div
                class="search-row"
                class:selected={sel}
                data-testid="search-row"
                data-kind={r.kind}
                data-page={pageOf(r)}
                data-id={r.kind === 'hit' ? r.id : undefined}
                data-selected={sel ? 'true' : undefined}
                role="option"
                aria-selected={sel}
                tabindex="-1"
                style="transform: translateY({it.start}px)"
                onclick={() => selectable(r) && onchoose(r)}
              >
                {#if r.kind === 'date'}
                  <span class="ic">📅</span>Go to {r.title}
                {:else if r.kind === 'page'}
                  <span class="ic">📄</span>{r.name}
                {:else if r.kind === 'create'}
                  <span class="ic">+</span>Create page “{r.name}”
                {:else if r.kind === 'group'}
                  {r.title}
                {:else if r.kind === 'hit'}
                  {#if r.state}<span class="st" data-color={stateColor(states, r.state)}>{r.state}</span>{/if}
                  {#each hitSegments(r.state, r.segments) as s, i (i)}{#if s.hit}<mark>{s.text}</mark>{:else}{s.text}{/if}{/each}
                {:else}
                  More than 200 matches. Add a word to narrow the search.
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
