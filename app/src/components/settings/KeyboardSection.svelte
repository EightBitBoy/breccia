<script lang="ts">
  import { shortcutRows } from '../../lib/shortcuts'

  let { mac, onhelp }: { mac: boolean; onhelp: () => void } = $props()

  const rows = $derived(shortcutRows(mac))
</script>

<p class="settings-hint">
  Press <kbd>F1</kbd> to see these anywhere, or
  <button type="button" class="link" data-testid="open-shortcuts" onclick={onhelp}>open the list</button>.
</p>
<table class="shortcuts">
  <tbody>
    {#each rows as r, i (i)}
      <tr><td><kbd>{r.keys}</kbd></td><td>{r.what}</td></tr>
    {/each}
  </tbody>
</table>
