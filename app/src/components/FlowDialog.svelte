<script lang="ts">
  import type { PageFlows } from '../lib/pageFlows.svelte'
  import NameDialog from './NameDialog.svelte'
  import MoveDialog from './MoveDialog.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'

  /** The dialog of the page operations while one is open. */
  let { flows }: { flows: PageFlows } = $props()
</script>

{#if flows.dialog}
  {@const d = flows.dialog}
  {#if d.kind === 'name'}
    <NameDialog title={d.title} initial={d.initial} onok={(name) => flows.answer(name)} oncancel={() => flows.close()} />
  {:else if d.kind === 'move'}
    <MoveDialog title={d.title} targets={d.targets} onok={(path) => flows.answer(path)} oncancel={() => flows.close()} />
  {:else}
    <ConfirmDialog message={d.message} onok={() => flows.answer('')} oncancel={() => flows.close()} />
  {/if}
{/if}
