<script lang="ts">
  // The due date calendar: one for every way in (the card menu, the task menu, the key), driven by `duePick`. It
  // opens at its anchor on the task's due date, marked as chosen, or at today (R7); the keys are the go-to-a-day
  // calendar's. A pick writes the day and "Remove due date" (shown only when the task has one) removes it; Esc or a
  // click outside writes nothing. A pick, "Remove due date" or Esc gives the focus back where it was when it opened;
  // a click outside leaves it where that click put it. A press outside closes it at once (`closeOnPressOutside`): the
  // library's own close comes 10 ms later and misses a quick click on a block's text, whose element is gone by then.
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'
  import MonthGrid from './MonthGrid.svelte'
  import { startDay } from '../lib/calendar'
  import { duePick } from '../lib/duePick.svelte'
  import { closeOnPressOutside } from '../lib/pressOutside'
  import { today } from '../lib/today.svelte'

  /** No journal marks here: a due date has nothing to do with the notes of the day. */
  const marked: ReadonlySet<string> = new Set()

  let focused = $state(today.key)
  /** The focused day's button takes the focus after the next update (keys, Today, opening). */
  let focusDay = $state(false)
  /** Where the focus was when the calendar opened; it goes back there on close. */
  let before: HTMLElement | null = null
  /** The calendar closes by a press outside it: the press has placed the focus, so it is not given back. */
  let outside = false

  $effect.pre(() => {
    if (!duePick.open) return
    // Each opening (and each `show` while open) starts afresh at the due date, or today.
    const due = duePick.due
    void duePick.anchor
    untrack(() => {
      const a = document.activeElement
      if (!(a instanceof HTMLElement && a.closest('[data-due-picker]'))) {
        before = a instanceof HTMLElement && a !== document.body ? a : null
      }
      outside = false
      focused = startDay(due, today.key)
      focusDay = true
    })
  })

  $effect(() => {
    if (!duePick.open) return
    return closeOnPressOutside(
      document,
      (t) => t instanceof Element && t.closest('[data-due-picker]') !== null,
      () => {
        outside = true
        duePick.close()
      },
    )
  })

  const anchor = $derived.by(() => {
    const b = duePick.anchor
    if (!b) return null
    return { getBoundingClientRect: () => new DOMRect(b.left, b.top, b.right - b.left, b.bottom - b.top) }
  })
</script>

<Popover.Root
  bind:open={
    () => duePick.open,
    (o) => {
      if (!o) duePick.close()
    }
  }
>
  <Popover.Portal>
    <Popover.Content
      class="menu date-picker"
      data-testid="due-picker"
      data-due-picker
      role="dialog"
      aria-label="Due date"
      customAnchor={anchor}
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      onInteractOutside={() => (outside = true)}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        focusDay = true
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        // bits-ui may also call this while the calendar opens (its focus scope mounts anew), so `before` is kept
        // until the next opening.
        if (!outside && before?.isConnected) before.focus({ preventScroll: true })
      }}
    >
      <MonthGrid
        bind:focused
        bind:focusDay
        today={today.key}
        {marked}
        chosen={duePick.due}
        testid="due-picker"
        onpick={(key) => duePick.pick(key)}
      />
      <div class="dp-foot">
        <button
          class="dp-today"
          data-testid="due-picker-today"
          title="Show today"
          onclick={() => {
            focused = today.key
            focusDay = true
          }}>Today</button
        >
        {#if duePick.due}
          <button class="dp-remove" data-testid="due-picker-remove" onclick={() => duePick.remove()}>Remove due date</button>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
