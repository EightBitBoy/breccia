<script lang="ts">
  import { untrack } from 'svelte'
  import { CONFIG_NOTE, keepDraft, minutesProblem, settledDraft, zeroNote } from '../../lib/settingsForm'
  import type { GitSettings } from '../../lib/types'

  let {
    git,
    ongit,
  }: {
    git: GitSettings
    /** The Git item's text, or null while it is hidden. */
    /** Sends only what changed, over the settings shown when it is sent; settles once answered. */
    ongit: (patch: Partial<GitSettings>) => Promise<void>
  } = $props()

  /** The boxes as typed; a new value of that setting from the file puts its box back, any other change keeps the typing. */
  let delay = $state('')
  let interval = $state('')
  /** The file's values the boxes last followed. */
  let shown = { delay: '', interval: '' }
  $effect.pre(() => {
    const next = { delay: String(git.commitDelayMinutes), interval: String(git.pullIntervalMinutes) }
    untrack(() => {
      delay = keepDraft(delay, shown.delay, next.delay)
      interval = keepDraft(interval, shown.interval, next.interval)
    })
    shown = next
  })
  const delayProblem = $derived(minutesProblem(delay))
  const intervalProblem = $derived(minutesProblem(interval))

  async function commit() {
    if (delayProblem !== null || intervalProblem !== null) return
    if (Number(delay) === git.commitDelayMinutes && Number(interval) === git.pullIntervalMinutes) return
    const sent = { delay, interval }
    await ongit({ commitDelayMinutes: Number(delay), pullIntervalMinutes: Number(interval) })
    // A refused change shows the file's values again; text typed meanwhile stays.
    delay = settledDraft(delay, sent.delay, String(git.commitDelayMinutes))
    interval = settledDraft(interval, sent.interval, String(git.pullIntervalMinutes))
  }

  function toggle(box: HTMLInputElement) {
    void ongit({ enabled: box.checked })
    box.checked = git.enabled // the file's value shows until the answer comes
  }
</script>

<p class="settings-note">{CONFIG_NOTE}</p>
<label class="settings-field">
  <input type="checkbox" data-testid="git-enabled" checked={git.enabled} onchange={(e) => toggle(e.currentTarget)} />
  Keep this notes folder in Git
</label>
<div class="settings-field">
  <label>
    Commit
    <input
      class="number"
      data-testid="git-commit-delay"
      inputmode="numeric"
      bind:value={delay}
      onkeydown={(e) => e.key === 'Enter' && commit()}
      onblur={commit}
    />
    minutes after the last change
  </label>
  {#if delayProblem}<div class="field-problem">{delayProblem}</div>{/if}
  <div class="settings-hint">{zeroNote('commit')}</div>
</div>
<div class="settings-field">
  <label>
    Pull every
    <input
      class="number"
      data-testid="git-pull-interval"
      inputmode="numeric"
      bind:value={interval}
      onkeydown={(e) => e.key === 'Enter' && commit()}
      onblur={commit}
    />
    minutes
  </label>
  {#if intervalProblem}<div class="field-problem">{intervalProblem}</div>{/if}
  <div class="settings-hint">{zeroNote('pull')}</div>
</div>
