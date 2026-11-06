<script lang="ts">
  // The Git history: the notes folder's commits, newest first, read-only.
  import { formatWhen, formatWhenFull } from '../lib/gitLog'
  import type { GitLog } from '../lib/gitLog.svelte'

  let { log }: { log: GitLog } = $props()

  const count = $derived(log.entries?.length ?? 0)
</script>

<section class="git-log" data-testid="git-log">
  <div class="ptitle">
    <h1>Git history</h1>
    {#if log.entries !== null && count > 0}
      <span class="arr" data-testid="log-count">{log.more ? `newest ${count} commits` : count === 1 ? '1 commit' : `${count} commits`}</span>
    {/if}
  </div>
  {#if log.error !== null}
    <p class="pempty warning" data-testid="log-error">Could not read the history: {log.error}</p>
  {/if}
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
      <div class="lrows" role="rowgroup">
        {#each log.entries as e (e.hash)}
          <div class="prow" role="row" data-testid="log-row" data-hash={e.hash}>
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
