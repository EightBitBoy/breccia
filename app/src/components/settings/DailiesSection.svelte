<script lang="ts">
  import { untrack } from 'svelte'
  import { resetCommit, resetProblem } from '../../lib/dailies'
  import { CONFIG_NOTE, keepDraft, oneAtATime, settledDraft } from '../../lib/settingsForm'

  let {
    reset,
    invalid,
    onreset,
  }: {
    /** `[dailies] reset` as `HH:MM`. */
    reset: string
    /** The file's reset is no time (read as `reset`, 00:00): the time is written even when it is the one in use. */
    invalid: boolean
    /** Sends the new time (`HH:MM`); settles once answered. */
    onreset: (reset: string) => Promise<void>
  } = $props()

  /** The box as typed; a new value of it from the file puts it back, any other change keeps the typing. */
  let time = $state('')
  /** The file's value the box last followed. */
  let shown = ''
  $effect.pre(() => {
    const next = reset
    untrack(() => (time = keepDraft(time, shown, next)))
    shown = next
  })
  const problem = $derived(resetProblem(time))

  /** Enter and then a click elsewhere save once; a commit while a save runs runs again after it. */
  const commit = oneAtATime(async () => {
    const next = resetCommit(time, reset, invalid)
    if (next === null) return
    if (next === 'tidy') {
      time = reset // `4:00` for `04:00`: the box shows the time as it is stored
      return
    }
    const sent = time
    await onreset(next.send)
    time = settledDraft(time, sent, reset) // a refused change shows the file's value again
  })
</script>

<p class="settings-note">{CONFIG_NOTE}</p>
<div class="settings-field">
  <label>
    Dailies start again at
    <input
      class="number"
      data-testid="dailies-reset"
      bind:value={time}
      onkeydown={(e) => e.key === 'Enter' && commit()}
      onblur={commit}
    />
  </label>
  {#if problem}<div class="field-problem">{problem}</div>{/if}
  <div class="settings-hint">This computer's time. A daily ticked before it counts for the day before.</div>
</div>
