<script lang="ts">
  import { untrack } from 'svelte'
  import { CONFIG_NOTE, daysProblem, keepDraft, settledDraft } from '../../lib/settingsForm'
  import type { BoardSummary } from '../../lib/types'

  let {
    boards,
    archiveDays,
    autoArchive,
    onboard,
    onmoveboard,
    onnewboard,
    onarchivedays,
    onautoarchive,
  }: {
    boards: BoardSummary[]
    archiveDays: number
    /** `[board] auto_archive`. */
    autoArchive: boolean
    /** "Edit…": the board dialog (rename, columns, delete). */
    onboard: (i: number) => void
    onmoveboard: (i: number, dir: -1 | 1) => void
    onnewboard: () => void
    /** Settles once answered. */
    onarchivedays: (n: number) => Promise<void>
    /** The switch was turned on or off; settles once answered. */
    onautoarchive: (on: boolean) => Promise<void>
  } = $props()

  /** The days box as typed; a new value of it from the file puts it back, any other change keeps the typing. */
  let days = $state('')
  /** The file's value the box last followed. */
  let shown = ''
  $effect.pre(() => {
    const next = String(archiveDays)
    untrack(() => (days = keepDraft(days, shown, next)))
    shown = next
  })
  const problem = $derived(daysProblem(days))

  async function commit() {
    if (problem !== null || Number(days) === archiveDays) return
    const sent = days
    await onarchivedays(Number(days))
    days = settledDraft(days, sent, String(archiveDays)) // a refused change shows the file's value again
  }
</script>

<p class="settings-note">{CONFIG_NOTE}</p>
<div class="board-list">
  {#each boards as b, i (i)}
    <div class="settings-board" data-testid="settings-board">
      <span class="board-name">{b.name}</span>
      <span class="board-chips">
        {#each b.columns as k (k)}<span class="chip">{k}</span>{/each}
      </span>
      <span class="row-tools">
        <button type="button" onclick={() => onboard(i)}>Edit…</button>
        <button type="button" aria-label="Move up" disabled={i === 0} onclick={() => onmoveboard(i, -1)}>↑</button>
        <button type="button" aria-label="Move down" disabled={i === boards.length - 1} onclick={() => onmoveboard(i, 1)}
          >↓</button
        >
      </span>
    </div>
  {/each}
</div>
<button type="button" onclick={onnewboard}>New board</button>
<div class="settings-field">
  <!-- One line: the switch, and the number the column menu's "Archive finished …" uses too. -->
  <label>
    <input
      type="checkbox"
      data-testid="auto-archive"
      checked={autoArchive}
      onchange={async (e) => {
        const box = e.currentTarget
        await onautoarchive(box.checked)
        box.checked = autoArchive // a refused change shows the file's value again
      }}
    />
    Archive finished tasks automatically after
  </label>
  <input
    class="number"
    data-testid="archive-days"
    aria-label="Days after which finished tasks are archived"
    inputmode="numeric"
    bind:value={days}
    onkeydown={(e) => e.key === 'Enter' && commit()}
    onblur={commit}
  />
  days
  {#if problem}<div class="field-problem">{problem}</div>{/if}
</div>
