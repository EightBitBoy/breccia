<script lang="ts">
  // A month to pick a day from, shared by the go-to-a-day calendar (`DatePicker`) and the due date calendar
  // (`DuePicker`): the month head with its arrows, and the day grid with `pickerKey`'s keys. Weeks start on Monday;
  // days with a journal file (`marked`) have a tinted background, today is outlined, and the `chosen` day (a task's
  // due date) is filled. The gridcell's `aria-selected` follows the focused day.
  import { WEEKDAYS, addMonths, dayLabel, monthGrid, monthTitle, pickerKey } from '../lib/calendar'

  let {
    focused = $bindable(),
    focusDay = $bindable(false),
    today,
    marked,
    chosen = null,
    testid,
    onpick,
  }: {
    /** The focused day; the month shown is its month. */
    focused: string
    /** Set it to give the focused day's button the focus after the next update; it is cleared then. */
    focusDay: boolean
    today: string
    /** The days that have a journal file. */
    marked: ReadonlySet<string>
    /** The day marked as chosen, or null. */
    chosen?: string | null
    /** The prefix of the head's test ids (`date-picker` gives `date-picker-prev`, `-title`, `-next`). */
    testid: string
    onpick: (key: string) => void
  } = $props()

  let grid = $state<HTMLElement | null>(null)

  const weeks = $derived(monthGrid(focused, marked, today))

  $effect(() => {
    if (!focusDay || !grid) return
    grid.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus({ preventScroll: true })
    focusDay = false
  })

  function moveTo(key: string, focus: boolean) {
    focused = key
    if (focus) focusDay = true
  }

  function onKey(e: KeyboardEvent) {
    const r = pickerKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, focused)
    if (r === null) return
    e.preventDefault()
    if (r === 'pick') onpick(focused)
    else moveTo(r.move, true)
  }
</script>

<div class="dp-head">
  <button class="dp-nav" data-testid="{testid}-prev" aria-label="Previous month" title="Previous month (Page Up)" onclick={() => moveTo(addMonths(focused, -1), false)}>‹</button>
  <span class="dp-title" data-testid="{testid}-title" aria-live="polite">{monthTitle(focused)}</span>
  <button class="dp-nav" data-testid="{testid}-next" aria-label="Next month" title="Next month (Page Down)" onclick={() => moveTo(addMonths(focused, 1), false)}>›</button>
</div>
<div class="dp-grid" role="grid" tabindex="-1" aria-label={monthTitle(focused)} bind:this={grid} onkeydown={onKey}>
  <div class="dp-row" role="row">
    {#each WEEKDAYS as w (w)}<span class="dp-wd" role="columnheader">{w}</span>{/each}
  </div>
  {#each weeks as week (week[0].key)}
    <div class="dp-row" role="row">
      {#each week as c (c.key)}
        <span role="gridcell" aria-selected={c.key === focused}>
          <button
            class="dp-day"
            class:out={!c.inMonth}
            class:marked={c.marked}
            class:today={c.today}
            class:focused={c.key === focused}
            class:chosen={c.key === chosen}
            data-key={c.key}
            data-marked={c.marked ? '' : undefined}
            data-today={c.today ? '' : undefined}
            data-chosen={c.key === chosen ? '' : undefined}
            aria-current={c.today ? 'date' : undefined}
            aria-label={dayLabel(c)}
            tabindex={c.key === focused ? 0 : -1}
            onclick={() => onpick(c.key)}>{c.day}</button
          >
        </span>
      {/each}
    </div>
  {/each}
</div>
