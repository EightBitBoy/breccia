<script lang="ts">
  // The date picker: a calendar icon at the right of the sidebar's Journal row; a click or `Ctrl Shift D`
  // opens a month below it. Days with a journal file have a tinted background, today is outlined; weeks start on Monday;
  // the keys are `pickerKey`'s. A pick hands the day to `onpick`, which jumps as a typed date does.
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'
  import { WEEKDAYS, addMonths, dayKey, dayLabel, monthGrid, monthTitle, pickerKey, startDay } from '../lib/calendar'

  let {
    open = $bindable(false),
    shown,
    marked,
    onpick,
  }: {
    open: boolean
    /** The key of the page shown (a journal's is its day), or null. */
    shown: string | null
    /** The days that have a journal file. */
    marked: ReadonlySet<string>
    onpick: (key: string) => void
  } = $props()

  /** The focused day; the month shown is its month. */
  let focused = $state(dayKey(new Date()))
  let today = $state(dayKey(new Date()))
  let grid = $state<HTMLElement | null>(null)
  /** Where the focus was when the picker opened; Esc or a click outside sends it back there. */
  let before: HTMLElement | null = null
  let picked = false
  /** The focused day's button takes the focus after the next update (keys, Today, opening). */
  let focusDay = $state(false)

  const weeks = $derived(monthGrid(focused, marked, today))

  $effect.pre(() => {
    if (!open) return
    // Each opening starts afresh at the day shown, or today.
    untrack(() => {
      const a = document.activeElement
      before = a instanceof HTMLElement && a !== document.body ? a : null
      picked = false
      today = dayKey(new Date())
      focused = startDay(shown, today)
    })
  })

  $effect(() => {
    if (!focusDay || !grid) return
    grid.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus({ preventScroll: true })
    focusDay = false
  })

  function moveTo(key: string, focus: boolean) {
    focused = key
    if (focus) focusDay = true
  }

  function pick(key: string) {
    if (picked) return
    picked = true
    open = false
    onpick(key)
  }

  function onKey(e: KeyboardEvent) {
    const r = pickerKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, focused)
    if (r === null) return
    e.preventDefault()
    if (r === 'pick') pick(focused)
    else moveTo(r.move, true)
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class="date-pick-btn" data-testid="date-picker" aria-label="Go to a day" title="Go to a day (Ctrl Shift D)">
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor" stroke-width="1.3" fill="none" />
      <rect x="9" y="9" width="3" height="3" rx=".5" fill="currentColor" />
    </svg>
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="menu date-picker"
      data-testid="date-picker-popover"
      data-date-picker
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        focusDay = true
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        if (!picked && before?.isConnected) before.focus({ preventScroll: true })
      }}
    >
      <div class="dp-head">
        <button class="dp-nav" data-testid="date-picker-prev" aria-label="Previous month" title="Previous month (Page Up)" onclick={() => moveTo(addMonths(focused, -1), false)}>‹</button>
        <span class="dp-title" data-testid="date-picker-title" aria-live="polite">{monthTitle(focused)}</span>
        <button class="dp-nav" data-testid="date-picker-next" aria-label="Next month" title="Next month (Page Down)" onclick={() => moveTo(addMonths(focused, 1), false)}>›</button>
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
                  data-key={c.key}
                  data-marked={c.marked ? '' : undefined}
                  data-today={c.today ? '' : undefined}
                  aria-current={c.today ? 'date' : undefined}
                  aria-label={dayLabel(c)}
                  tabindex={c.key === focused ? 0 : -1}
                  onclick={() => pick(c.key)}>{c.day}</button
                >
              </span>
            {/each}
          </div>
        {/each}
      </div>
      <div class="dp-foot">
        <button class="dp-today" data-testid="date-picker-today" title="Show today" onclick={() => moveTo(today, true)}>Today</button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
