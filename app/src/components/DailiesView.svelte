<script lang="ts">
  // The Dailies view: open dailies in file order, then the checked ones (greyed, struck through), then "Add a daily".
  // A checked row slides to its group; rows are dragged within their group or moved with Alt ↑ / Alt ↓.
  import { onMount, tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { ContextMenu } from 'bits-ui'
  import { addShown, dailyEntries, deleteQuestion, editOutcome, doneLabel, dropPlace, moveTarget, stepTarget, tickedTip } from '../lib/dailies'
  import type { Dailies } from '../lib/dailies.svelte'
  import { dailyDrag, dailyDrop, watchDailyDrops } from '../lib/dnd'
  import type { BlockId, DailyView } from '../lib/types'

  let {
    dailies,
    onconfirm,
  }: {
    dailies: Dailies
    /** Asks a question in the app's confirm dialog; resolves true for the button `ok`. */
    onconfirm: (message: string, ok: string) => Promise<boolean>
  } = $props()

  type Group = 'open' | 'checked'

  const groups = $derived(dailies.groups)
  /** One keyed list, so a row slides from one group to the other (or into the closed "Done" section). */
  const entries = $derived(dailyEntries(groups, dailies.allDone, dailies.doneOpen))
  const ids = (g: Group) => (g === 'open' ? groups.open : groups.checked).map((d) => d.id)
  const groupOf = (id: BlockId): Group | null =>
    groups.open.some((d) => d.id === id) ? 'open' : groups.checked.some((d) => d.id === id) ? 'checked' : null

  let reduced = $state(false)
  let listEl: HTMLElement | undefined = $state()
  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!listEl) return
    return watchDailyDrops(listEl, (id, over, after) => {
      const g = groupOf(id)
      if (g === null || groupOf(over) !== g) return
      const group = ids(g)
      const place = dropPlace(group, id, over, after)
      if (place === null) return
      const d = dailies.list?.find((x) => x.id === id)
      const before = moveTarget(dailies.list ?? [], group, id, place)
      if (d && before !== undefined) void dailies.move(d, before)
    })
  })

  /** The daily whose text is being edited, the row as it was when the field opened, and the field's text. */
  let editing = $state<BlockId | null>(null)
  let editRow: DailyView | null = null
  let draft = $state('')

  function rowEl(id: BlockId): HTMLElement | null {
    return listEl?.querySelector<HTMLElement>(`[data-daily="${id}"] .daily-text`) ?? null
  }

  function startEdit(d: DailyView) {
    editing = d.id
    editRow = d
    draft = d.text
  }

  /** Enter or leaving the field saves; an unchanged field changes nothing; an emptied one asks to delete the daily. */
  async function endEdit(save: boolean) {
    const id = editing
    const row = editRow
    if (id === null || row === null) return
    editing = null
    editRow = null
    const old = dailies.list?.find((x) => x.id === id)
    const out = editOutcome(row, draft)
    // The text the field opened with goes along: a daily changed outside meanwhile is refused, not overwritten.
    if (save && old && out.kind === 'edit') void dailies.edit(row, out.text)
    if (save && old && out.kind === 'delete') await askDelete(row)
    await tick()
    rowEl(id)?.focus()
  }

  function editKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void endEdit(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      void endEdit(false)
    }
  }

  function focusField(el: HTMLInputElement) {
    el.focus()
    el.select()
  }

  /** The checkbox shows the list's answer, not the click: the click only sends the command. */
  function toggle(e: Event, d: DailyView, group: Group) {
    e.preventDefault()
    void (group === 'open' ? dailies.check(d) : dailies.uncheck(d))
  }

  function rowKey(e: KeyboardEvent, d: DailyView, group: Group) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editing !== null) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    e.stopPropagation()
    const before = stepTarget(dailies.list ?? [], ids(group), d.id, e.key === 'ArrowUp' ? -1 : 1)
    if (before !== undefined) void dailies.move(d, before)
  }

  let addText = $state('')
  /** The + beside the title opened the field (or it took the focus while there were no dailies). */
  let addOpen = $state(false)
  let addEl: HTMLInputElement | undefined = $state()
  const showAdd = $derived(addShown(dailies.list, addOpen))

  async function openAdd() {
    addOpen = true
    await tick()
    addEl?.focus()
  }

  /** Esc, or leaving the field empty, closes it; typed text keeps it open. */
  function closeAdd() {
    addOpen = false
    addText = ''
  }

  /** Enter adds the daily and empties the field, which keeps the focus; refused text comes back. */
  async function addKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeAdd()
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const text = addText.trim()
    if (text === '') return
    addText = ''
    const ok = await dailies.add(text)
    if (!ok && addText === '') addText = text
  }

  /** The row the context menu was opened on; null elsewhere in the list. */
  let menuFor = $state<DailyView | null>(null)
  /** "Edit" was chosen: the field opens once the menu has closed (it would take the focus back). */
  let editAfterMenu: DailyView | null = null

  // The edit field keeps the browser's text menu (Cut, Copy, Paste): its right-click never reaches `pick`. Any other
  // right-click while a daily is being edited opens no menu.
  function pick(e: MouseEvent) {
    const id = Number((e.target as Element | null)?.closest?.('[data-daily]')?.getAttribute('data-daily'))
    menuFor = dailies.list?.find((x) => x.id === id) ?? null
    if (menuFor === null || editing !== null) {
      menuFor = null
      e.preventDefault()
    }
  }

  async function askDelete(d: DailyView) {
    // `d` is the row the menu was opened on: a daily changed outside while the dialog was open is refused.
    if (await onconfirm(deleteQuestion(d), 'Delete')) await dailies.remove(d)
  }
</script>

<section class="dailies" data-testid="dailies">
  <div class="ptitle">
    <h1>Dailies</h1>
    <button class="daily-new" data-testid="dailies-add-open" title="Add a daily" aria-label="Add a daily" onclick={() => void openAdd()}
      >+</button
    >
  </div>
  {#if dailies.list !== null && dailies.list.length === 0}
    <p class="pempty" data-testid="dailies-empty">
      No dailies yet. Add the things you do every day, such as checking your emails.
    </p>
  {/if}
  <ContextMenu.Root>
    <ContextMenu.Trigger class="daily-zone" oncontextmenu={pick}>
      <div class="daily-list" role="list" aria-label="Dailies" bind:this={listEl}>
        {#each entries as e (e.key)}
          <div class="daily-slot" role="listitem" animate:flip={{ duration: reduced ? 0 : 150 }}>
            {#if e.key === 'done'}
              <p class="dailies-done" data-testid="dailies-done">All done for today</p>
            {:else if e.key === 'fold'}
              <button
                class="daily-fold"
                data-testid="dailies-fold"
                aria-expanded={e.open}
                onclick={() => (dailies.doneOpen = !dailies.doneOpen)}
                ><span class="tri" class:open={e.open} aria-hidden="true">▸</span>{doneLabel(e.count)}</button
              >
            {:else if 'd' in e}
              {@const d = e.d}
              {@const group = e.group}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="daily"
                class:checked={group === 'checked'}
                data-testid="daily-row"
                data-daily={d.id}
                data-checked={group === 'checked'}
                title={group === 'checked' ? tickedTip(d.checked, dailies.now) : undefined}
                use:dailyDrag={{ id: d.id, group, disabled: editing === d.id }}
                use:dailyDrop={{ id: d.id, group }}
                onkeydown={(ev) => rowKey(ev, d, group)}
              >
                <input
                  type="checkbox"
                  data-testid="daily-check"
                  aria-label={d.text}
                  checked={group === 'checked'}
                  onclick={(ev) => toggle(ev, d, group)}
                />
                {#if editing === d.id}
                  <input
                    class="daily-edit"
                    data-testid="daily-edit"
                    spellcheck="false"
                    aria-label="Daily"
                    bind:value={draft}
                    use:focusField
                    onkeydown={editKey}
                    oncontextmenu={(ev) => ev.stopPropagation()}
                    onblur={() => void endEdit(true)}
                  />
                {:else}
                  <button class="daily-text" data-testid="daily-text" onclick={() => startEdit(d)}>{d.text}</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </ContextMenu.Trigger>
    {#if menuFor}
      {@const d = menuFor}
      <ContextMenu.Portal>
        <ContextMenu.Content
          class="menu"
          data-testid="daily-menu"
          onCloseAutoFocus={(ev) => {
            if (editAfterMenu === null) return
            ev.preventDefault()
            startEdit(editAfterMenu)
            editAfterMenu = null
          }}
        >
          <ContextMenu.Item class="menu-item" data-op="edit" onSelect={() => (editAfterMenu = d)}>Edit</ContextMenu.Item>
          <ContextMenu.Item class="menu-item" data-op="delete" onSelect={() => void askDelete(d)}>Delete</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    {/if}
  </ContextMenu.Root>
  {#if showAdd}
    <input
      class="daily-add"
      data-testid="daily-add"
      placeholder="Add a daily"
      spellcheck="false"
      bind:this={addEl}
      bind:value={addText}
      onfocus={() => (addOpen = true)}
      onblur={() => {
        if (addText.trim() === '') closeAdd()
      }}
      onkeydown={(e) => void addKey(e)}
    />
  {/if}
</section>
