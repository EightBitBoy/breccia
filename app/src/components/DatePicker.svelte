<script lang="ts">
  // The date picker: a calendar icon at the right of the sidebar's Journal row; a click or `Ctrl Shift D`
  // opens a month below it. Days with a journal file have a tinted background, today is outlined; weeks start on Monday;
  // the keys are `pickerKey`'s. A pick hands the day to `onpick`, which jumps as a typed date does.
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'
  import CalendarIcon from './CalendarIcon.svelte'
  import MonthGrid from './MonthGrid.svelte'
  import { dayKey, startDay } from '../lib/calendar'

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
  /** Where the focus was when the picker opened; Esc or a click outside sends it back there. */
  let before: HTMLElement | null = null
  let picked = false
  /** The focused day's button takes the focus after the next update (keys, Today, opening). */
  let focusDay = $state(false)

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
</script>

<Popover.Root bind:open>
  <Popover.Trigger class="date-pick-btn" data-testid="date-picker" aria-label="Go to a day" title="Go to a day (Ctrl Shift D)">
    <CalendarIcon />
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
      <MonthGrid bind:focused bind:focusDay {today} {marked} testid="date-picker" onpick={pick} />
      <div class="dp-foot">
        <button class="dp-today" data-testid="date-picker-today" title="Show today" onclick={() => moveTo(today, true)}>Today</button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
