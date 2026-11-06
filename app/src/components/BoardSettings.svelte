<script lang="ts">
  import { Dialog } from 'bits-ui'
  import { addableColumns, moveColumn } from '../lib/board'
  import type { BoardSummary, StateView } from '../lib/types'
  import ConfirmDialog from './ConfirmDialog.svelte'

  let {
    board,
    states,
    onsave,
    ondelete,
    oncancel,
  }: {
    board: BoardSummary
    states: StateView[]
    onsave: (b: BoardSummary) => void
    ondelete: () => void
    oncancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let name = $state(board.name)
  // svelte-ignore state_referenced_locally
  let columns = $state([...board.columns])
  let confirming = $state(false)

  const addable = $derived(addableColumns(states, columns))
  const valid = $derived(name.trim() !== '' && columns.length > 0)

  function add(e: Event) {
    const select = e.currentTarget as HTMLSelectElement
    if (select.value) columns = [...columns, select.value]
    select.value = ''
  }

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (valid) onsave({ name: name.trim(), columns: [...columns] })
  }
</script>

<!-- One dialog at a time: the question replaces the settings, which keep their edits while it is open. -->
{#if confirming}
  <ConfirmDialog
    message="Delete the board “{board.name}”? Your notes are not changed."
    ok="Delete"
    onok={ondelete}
    oncancel={() => (confirming = false)}
  />
{:else}
  <Dialog.Root open onOpenChange={(o) => !o && oncancel()}>
    <Dialog.Portal>
      <Dialog.Overlay class="overlay" />
      <Dialog.Content class="dialog" aria-describedby={undefined} data-testid="board-settings">
        <Dialog.Title class="dialog-title">Board settings</Dialog.Title>
        <form onsubmit={submit}>
          <input bind:value={name} data-testid="board-name" aria-label="Board name" />
          <ul class="board-cols">
            {#each columns as k, i (k)}
              <li data-testid="settings-column" data-state={k}>
                <span class="kw">{k}</span>
                <button type="button" aria-label="Move {k} up" disabled={i === 0} onclick={() => (columns = moveColumn(columns, i, -1))}>↑</button>
                <button
                  type="button"
                  aria-label="Move {k} down"
                  disabled={i === columns.length - 1}
                  onclick={() => (columns = moveColumn(columns, i, 1))}>↓</button
                >
                <button
                  type="button"
                  aria-label="Remove {k}"
                  data-testid="remove-column"
                  data-state={k}
                  onclick={() => (columns = columns.filter((c) => c !== k))}>✕</button
                >
              </li>
            {/each}
          </ul>
          {#if addable.length}
            <select data-testid="add-column" aria-label="Add column" onchange={add}>
              <option value="">Add column…</option>
              {#each addable as k (k)}
                <option value={k}>{k}</option>
              {/each}
            </select>
          {/if}
          <div class="dialog-actions">
            <button type="button" class="danger" data-testid="delete-board" onclick={() => (confirming = true)}>Delete board…</button>
            <span class="spacer"></span>
            <button type="button" onclick={oncancel}>Cancel</button>
            <button type="submit" class="primary" data-testid="save-board" disabled={!valid}>Save</button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}
