<script lang="ts">
  import type { RecentFolder } from '../lib/types'

  let {
    list,
    onopen,
    onforget,
    onmissing,
  }: {
    list: RecentFolder[]
    /** A click on a folder that exists. */
    onopen: (path: string) => void
    /** Remove: the folder leaves the list (never the folder itself). */
    onforget: (path: string) => void
    /** A click on a folder that no longer exists: nothing opens, the parent explains. */
    onmissing: (path: string) => void
  } = $props()
</script>

<ul class="recent-folders">
  {#each list as r (r.path)}
    <li class="recent-folder" class:missing={!r.exists} data-testid="recent-folder" data-path={r.path}>
      <button
        class="recent-open"
        title={r.exists ? `Open ${r.path}` : 'This folder no longer exists'}
        onclick={() => (r.exists ? onopen(r.path) : onmissing(r.path))}
      >
        <span class="recent-name">{r.name}{#if !r.exists}<span class="recent-missing">missing</span>{/if}</span>
        <span class="recent-path">{r.path}</span>
      </button>
      <button class="recent-remove" data-testid="recent-remove" title="Remove from this list" onclick={() => onforget(r.path)}>
        Remove
      </button>
    </li>
  {/each}
</ul>
