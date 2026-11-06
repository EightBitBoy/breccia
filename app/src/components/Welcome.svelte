<script lang="ts">
  import type { RecentFolder } from '../lib/types'
  import RecentFolders from './RecentFolders.svelte'

  let {
    recent,
    onpick,
    onopen,
    onforget,
    onmissing,
  }: {
    /** The recent folders, all of them (none is open). */
    recent: RecentFolder[]
    /** "Open folder…" or "New folder…": the parent asks for the folder. */
    onpick: (type: 'folder.open' | 'folder.create') => void
    onopen: (path: string) => void
    onforget: (path: string) => void
    onmissing: (path: string) => void
  } = $props()
</script>

<div class="welcome">
  <h1>Breccia</h1>
  <p>Pick the folder that holds your notes.</p>
  <div class="actions">
    <button class="primary" onclick={() => onpick('folder.open')}>Open folder…</button>
    <button onclick={() => onpick('folder.create')}>New folder…</button>
  </div>
  {#if recent.length}
    <div class="welcome-recent">
      <h2>Recent folders</h2>
      <RecentFolders list={recent} {onopen} {onforget} {onmissing} />
    </div>
  {/if}
</div>
