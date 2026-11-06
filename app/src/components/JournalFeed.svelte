<script lang="ts">
  import {
    Virtualizer,
    defaultRangeExtractor,
    elementScroll,
    measureElement,
    observeElementOffset,
    observeElementRect,
    type VirtualItem,
  } from '@tanstack/virtual-core'
  import { dayIndex, dayOfBlock, pinRange, type Feed } from '../lib/feed'
  import DaySection from './DaySection.svelte'

  let {
    feed,
    scroller,
    folded,
    editingId,
    selected,
    onedit,
    ontoggle,
    onopen,
    onstart,
    onrange,
    target,
    ontarget,
  }: {
    feed: Feed
    /** The `.main` element, which scrolls. */
    scroller: HTMLElement
    folded: Set<number>
    editingId: number | null
    selected: number[]
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
    onopen: (key: string) => void
    onstart: (key: string) => void
    /** The virtualizer's own rows (with overscan, without the pinned day); called when they change. */
    onrange: (from: number, to: number) => void
    /** A day to scroll to once (jump to a date), or null. */
    target: string | null
    /** The feed scrolled to `target`, or does not list it. */
    ontarget: () => void
  } = $props()

  let feedEl: HTMLDivElement | undefined = $state()
  let items = $state<VirtualItem[]>([])
  let total = $state(0)
  /** Where the feed starts inside the scroller's content (its padding). */
  let margin = $state(0)

  const pinned = $derived.by(() => {
    if (editingId === null) return null
    const key = dayOfBlock(feed, editingId)
    if (key === null) return null
    const i = feed.days.findIndex((d) => d.key === key)
    return i < 0 ? null : i
  })

  // The overscanned range of the last extraction, before the pinned day joins it.
  let ownFrom = -1
  let ownTo = -1
  let reportedFrom = -1
  let reportedTo = -1

  function reportRange() {
    if (ownFrom >= 0 && (ownFrom !== reportedFrom || ownTo !== reportedTo)) {
      reportedFrom = ownFrom
      reportedTo = ownTo
      onrange(ownFrom, ownTo)
    }
  }

  function options(count: number, pin: number | null, scrollMargin: number) {
    return {
      count,
      getItemKey: (i: number) => feed.days[i]?.key ?? i,
      estimateSize: () => 160,
      overscan: 3,
      scrollMargin,
      getScrollElement: () => scroller,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      measureElement,
      rangeExtractor: (r: Parameters<typeof defaultRangeExtractor>[0]) => {
        const own = defaultRangeExtractor(r)
        ownFrom = own.length ? own[0] : -1
        ownTo = own.length ? own[own.length - 1] : -1
        return pinRange(own, pin)
      },
      onChange: (v: Virtualizer<HTMLElement, HTMLElement>) => {
        items = [...v.getVirtualItems()]
        total = v.getTotalSize()
        reportRange()
      },
    }
  }

  const virtualizer = new Virtualizer<HTMLElement, HTMLElement>(options(0, null, 0))

  // The feed's offset in the scroller's content: the `.main` padding, read from CSS and measured
  // again whenever the scroller resizes (a theme or font change, a window resize).
  $effect(() => {
    const read = () => (margin = Math.round(parseFloat(getComputedStyle(scroller).paddingTop) || 0))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(scroller)
    return () => ro.disconnect()
  })

  $effect(() => virtualizer._didMount())

  let lastPin: number | null = null
  $effect(() => {
    void feed.days // the item keys read it: a new days array refreshes them
    virtualizer.setOptions(options(feed.days.length, pinned, margin))
    virtualizer._willUpdate()
    items = [...virtualizer.getVirtualItems()]
    total = virtualizer.getTotalSize()
    if (pinned !== lastPin) {
      lastPin = pinned
      // A changed pin changes the rows without an onChange: report the range once.
      reportRange()
    }
  })

  // Jump to a date: the day's row at the top, once. Days the new range shows load through `onrange`.
  $effect(() => {
    if (target === null) return
    const i = dayIndex(feed, target)
    if (i >= 0) virtualizer.scrollToIndex(i, { align: 'start' })
    ontarget()
  })

  function measure(node: HTMLElement) {
    virtualizer.measureElement(node)
  }
</script>

<div class="feed" data-testid="journal-feed" bind:this={feedEl} style:height="{total}px">
  {#each items as it (it.key)}
    {@const day = feed.days[it.index]}
    {#if day}
      <DaySection
        {day}
        page={feed.loaded[day.key] ?? null}
        {folded}
        {editingId}
        {selected}
        {onedit}
        {ontoggle}
        {onopen}
        {onstart}
        index={it.index}
        style="transform: translateY({it.start - margin}px)"
        {measure}
      />
    {/if}
  {/each}
</div>
