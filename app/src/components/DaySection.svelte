<script lang="ts">
  import type { Action } from 'svelte/action'
  import type { JournalDay, PageView } from '../lib/types'
  import Outline from './Outline.svelte'

  let {
    day,
    page,
    folded,
    editingId,
    selected,
    onedit,
    ontoggle,
    onopen,
    onstart,
    index,
    style,
    measure,
  }: {
    day: JournalDay
    /** The day's page; null while it is not loaded yet. */
    page: PageView | null
    folded: Set<number>
    editingId: number | null
    selected: number[]
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
    onopen: (key: string) => void
    onstart: (key: string) => void
    /** The feed's row, position and size registration (set by `JournalFeed`). */
    index?: number
    style?: string
    measure?: Action<HTMLElement>
  } = $props()

  const register: Action<HTMLElement> = (node) => measure?.(node)
</script>

<section class="day" data-testid="day" data-day={day.key} data-index={index} {style} use:register>
  <div class="ptitle">
    <h2 class="day-title-h"><button class="day-title" data-testid="day-title" onclick={() => onopen(day.key)}>{day.title}</button></h2>
  </div>
  {#if page}
    {#if page.preambleHtml}
      <div class="preamble">{@html page.preambleHtml}</div>
    {/if}
    <Outline
      blocks={page.blocks}
      {folded}
      {editingId}
      {selected}
      {onedit}
      {ontoggle}
      onstart={() => onstart(day.key)}
    />
  {:else}
    <div class="day-loading">…</div>
  {/if}
</section>
