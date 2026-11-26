<script lang="ts">
  // The Git history: the notes folder's commits, newest first, read-only.
  import { tick, untrack } from 'svelte'
  import { formatWhen, formatWhenFull } from '../lib/gitLog'
  import { firstShown, rowsMoved } from '../lib/keepRows'
  import { fixedRows } from '../lib/fixedRows.svelte'
  import type { GitLog } from '../lib/gitLog.svelte'
  import type { LogEntry } from '../lib/types'

  let {
    log,
    scroller,
  }: {
    log: GitLog
    /** The `.main` element, which scrolls. */
    scroller: HTMLElement
  } = $props()

  /** Every row is this tall (CSS `.prow` agrees), so nothing is measured. */
  const ROW = 33
  const NONE: LogEntry[] = []

  const entries = $derived(log.entries ?? NONE)
  const count = $derived(entries.length)

  let rowsEl: HTMLDivElement | undefined = $state()
  let headEl: HTMLDivElement | undefined = $state()
  // Only the rows on screen are drawn; a row keeps its element by its hash.
  const list = fixedRows({
    scroller: () => scroller,
    rows: () => entries,
    key: (e) => e.hash,
    rowHeight: ROW,
    rowsEl: () => rowsEl,
    headEl: () => headEl,
  })

  // A new commit on top (or a pull's commits) while the history is scrolled down: the scroll position goes down by the
  // rows that came in above, so the rows on screen stay where they are. At the top it stays, and the new commit shows.
  let shownKeys: string[] = []
  $effect.pre(() => {
    const next = entries.map((e) => e.hash)
    const before = shownKeys
    shownKeys = next
    if (before.length === 0) return
    const moved = untrack(() => rowsMoved(before, next, firstShown(scroller.scrollTop, list.margin, ROW)))
    if (moved !== 0) {
      void tick().then(() => {
        scroller.scrollTop += moved * ROW
      })
    }
  })
</script>

<section class="git-log" data-testid="git-log">
  <div class="top" bind:this={headEl}>
  <div class="ptitle">
    <h1>Git history</h1>
    {#if log.entries !== null && count > 0}
      <span class="arr" data-testid="log-count">{log.more ? `newest ${count} commits` : count === 1 ? '1 commit' : `${count} commits`}</span>
    {/if}
  </div>
  {#if log.error !== null}
    <p class="pempty warning" data-testid="log-error">Could not read the history: {log.error}</p>
  {/if}
  </div>
  {#if log.entries !== null && count === 0 && log.error === null}
    <p class="pempty" data-testid="log-empty">No commits yet</p>
  {:else if log.entries !== null && count > 0}
    <div class="ptable log-table" role="table" aria-label="Git history">
      <div class="phead" role="rowgroup">
        <div class="prow" role="row">
          <div role="columnheader">When</div>
          <div role="columnheader">Message</div>
          <div role="columnheader">Author</div>
          <div role="columnheader">Commit</div>
        </div>
      </div>
      <div class="lrows prows" role="rowgroup" bind:this={rowsEl} style:height="{list.height}px">
        {#each list.items as it (it.key)}
          {@const e = entries[it.index]}
          {#if e}
          <div class="prow" role="row" data-testid="log-row" data-hash={e.hash} style="transform: translateY({it.start - list.margin}px)">
            <div role="cell" data-cell="when" title={formatWhenFull(e.timeMs)}>{formatWhen(e.timeMs)}</div>
            <div role="cell" data-cell="message" class="message">
              <span class="subject" title={e.subject}>{e.subject}</span>
              {#if !e.pushed}
                <span class="unpushed" data-testid="log-unpushed" title="The remote does not have this commit yet">not pushed</span>
              {/if}
            </div>
            <div role="cell" data-cell="author" class="dim" title={e.author}>{e.author}</div>
            <div role="cell" data-cell="commit" class="dim hash" title={e.hash}>{e.short}</div>
          </div>
          {/if}
        {/each}
      </div>
    </div>
    {#if log.more}
      <button class="log-more" data-testid="log-more" disabled={log.loadingMore} onclick={() => void log.showMore()}>
        {log.loadingMore ? 'Loading…' : 'Show more'}
      </button>
    {/if}
  {/if}
</section>
