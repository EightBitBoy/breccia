<script lang="ts">
  import {
    PALETTE,
    addState,
    keywordCommit,
    keywordCommitFor,
    keywordProblem,
    moveState,
    normalizeKeyword,
    removeCommit,
    usageLabel,
    withState,
  } from '../../lib/stateEdit'
  import { untrack } from 'svelte'
  import { CONFIG_NOTE, keepDrafts, settleRows } from '../../lib/settingsForm'
  import type { StateRename, StateUsage, StateView } from '../../lib/types'

  let {
    states,
    version,
    usage,
    skipped,
    onstates,
    onconfirm,
    onready,
    onusage,
  }: {
    states: StateView[]
    /** The config version `states` came from: a change made from them carries it. */
    version: number
    usage: StateUsage[]
    /** Pages that did not load (named in the rename question). */
    skipped: number
    /** Sends the new list, made from the states of `version`; settles once it is answered. */
    onstates: (states: StateView[], renames: StateRename[], version: number) => Promise<void>
    /** Asks `message`; true on `ok`. */
    onconfirm: (message: string, ok: string) => Promise<boolean>
    /** Settles once every config write sent before is answered: `states` and `version` are then current. */
    onready: () => Promise<void>
    /** As `onready`, then the blocks are counted again: `usage` is then current. */
    onusage: () => Promise<void>
  } = $props()

  /** The keyword boxes as typed; a new list from the file keeps each state's typing, wherever its row is now. */
  let drafts = $state<string[]>([])
  /** The keywords the boxes last followed. */
  let shown: string[] = []
  $effect.pre(() => {
    const next = states.map((s) => s.keyword)
    untrack(() => (drafts = keepDrafts(drafts, shown, next)))
    shown = next
  })
  /** A change is being asked or sent: the boxes commit nothing more until it is answered. */
  let busy = $state(false)

  /** `made`: the version the list was made from, taken when the change was decided (before any question). */
  async function send(list: StateView[], made: number, renames: StateRename[] = []) {
    busy = true
    try {
      await onstates(list, renames, made)
    } finally {
      busy = false
    }
  }

  function type(i: number, e: Event) {
    const box = e.currentTarget as HTMLInputElement
    const at = box.selectionStart
    box.value = box.value.toUpperCase()
    if (at !== null) box.setSelectionRange(at, at)
    drafts = drafts.with(i, box.value)
  }

  /**
   * Enter or leaving the box: a rename, asked first when blocks use the old keyword. The blocks are counted again
   * first, so a state added or used since Settings opened is never taken for unused.
   */
  async function commit(i: number) {
    if (busy) return
    const draft = drafts[i] ?? ''
    if (keywordCommit(draft, states, i, usage, skipped).kind !== 'rename') return
    // The row is the state the user typed into, found again by keyword after the wait.
    const from = states[i].keyword
    busy = true
    try {
      await onusage()
    } finally {
      busy = false
    }
    // Decided now: a hand edit while the question is open makes the core refuse it, never rename another state.
    const c = keywordCommitFor(draft, from, states, usage, skipped)
    const made = version
    if (c.kind !== 'rename') return
    if (c.question !== null) {
      busy = true
      const yes = await onconfirm(c.question, 'Rename').finally(() => (busy = false))
      if (!yes) {
        drafts = settleRows(drafts, states.map((s) => s.keyword), [from]) // Cancel: the old keyword is back
        return
      }
    }
    await send(c.states, made, [{ from: c.from, to: c.to }])
    drafts = settleRows(drafts, states.map((s) => s.keyword), [c.from, c.to]) // a refused rename shows the keyword the file has
  }

  function key(i: number, e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit(i)
    } else if (e.key === 'Escape') {
      drafts = drafts.with(i, states[i].keyword)
    }
  }

  /** Remove: asked first when blocks use it, counted again first as for a rename. */
  async function remove(i: number) {
    if (busy) return
    const k = states[i]?.keyword
    busy = true
    try {
      await onusage()
    } finally {
      busy = false
    }
    const at = states.findIndex((s) => s.keyword === k)
    if (at < 0) return // gone meanwhile
    const r = removeCommit(states, at, usage)
    const made = version
    if (r.question !== null) {
      busy = true
      const yes = await onconfirm(r.question, 'Remove').finally(() => (busy = false))
      if (!yes) return
    }
    await send(r.states, made)
  }

  /**
   * A change to the row of state `k` (any row when null), made from the states shown once earlier writes are answered,
   * so it carries their version. The row is found again by its keyword; a state gone meanwhile changes nothing.
   */
  async function change(k: string | null, make: (current: StateView[], at: number) => StateView[]) {
    if (busy) return
    busy = true
    try {
      await onready()
    } finally {
      busy = false
    }
    const at = k === null ? -1 : states.findIndex((s) => s.keyword === k)
    if (k !== null && at < 0) return
    await send(make(states, at), version)
  }

  /** A flag box shows the file's value again once its change is answered (or ignored while another is on its way). */
  async function flag(i: number, which: 'finished' | 'inCycle', box: HTMLInputElement) {
    const checked = box.checked
    await change(states[i]?.keyword ?? null, (list, at) => withState(list, at, { [which]: checked }))
    box.checked = states[i]?.[which] ?? box.checked // the rows are keyed by place
  }
</script>

<p class="settings-note">{CONFIG_NOTE}</p>
<dl class="settings-hint flag-help" data-testid="states-help">
  <dt>finished</dt>
  <dd>
    <ul>
      <li>The task counts as done.</li>
      <li>Setting the state adds a <code>done::</code> date to the block; leaving it removes the date.</li>
      <li>Its text is greyed out in pages and struck through on board cards.</li>
      <li>It can be archived automatically some days after its done date (see Boards).</li>
    </ul>
  </dd>
  <dt>in cycle</dt>
  <dd>
    <ul>
      <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> steps through these states, in the order listed here.</li>
      <li>After the last one, it starts again at the first.</li>
      <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> removes the state (or delete the word).</li>
      <li>With no state in the cycle, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> only shows a note.</li>
      <li>A state not in the cycle (such as WAITING) is set by typing it, or by moving a card on a board.</li>
    </ul>
  </dd>
</dl>
<div class="state-list">
  {#each states as s, i (i)}
    {@const problem = keywordProblem(normalizeKeyword(drafts[i] ?? ''), states, i)}
    <div class="state-row" data-testid="state-row" data-keyword={s.keyword}>
      <div class="state-main">
        <input
          class="state-keyword"
          data-testid="state-keyword"
          aria-label="Keyword"
          value={drafts[i]}
          oninput={(e) => type(i, e)}
          onkeydown={(e) => key(i, e)}
          onblur={() => void commit(i)}
          spellcheck="false"
        />
        <div class="swatches" role="radiogroup" aria-label="Colour">
          {#each PALETTE as c (c)}
            <button
              type="button"
              class="swatch"
              role="radio"
              aria-checked={s.color === c}
              aria-label={c}
              title={c}
              data-testid="state-color"
              data-color={c}
              style:background="var(--c-{c})"
              onclick={() => s.color !== c && void change(s.keyword, (list, at) => withState(list, at, { color: c }))}
            ></button>
          {/each}
        </div>
        <label class="state-flag" title="Entering this state adds a done:: date; leaving it removes the date">
          <input
            type="checkbox"
            data-testid="state-finished"
            checked={s.finished}
            onchange={(e) => void flag(i, 'finished', e.currentTarget)}
          />finished
        </label>
        <label class="state-flag" title="Ctrl+Enter steps through the states marked in cycle, in this order, and starts again after the last">
          <input
            type="checkbox"
            data-testid="state-in-cycle"
            checked={s.inCycle}
            onchange={(e) => void flag(i, 'inCycle', e.currentTarget)}
          />in cycle
        </label>
        <span class="state-usage">{usageLabel(usage.find((u) => u.keyword === s.keyword))}</span>
        <span class="row-tools">
          <button type="button" aria-label="Move up" disabled={i === 0} onclick={() => void change(s.keyword, (list, at) => moveState(list, at, -1))}>↑</button>
          <button
            type="button"
            aria-label="Move down"
            disabled={i === states.length - 1}
            onclick={() => void change(s.keyword, (list, at) => moveState(list, at, 1))}>↓</button
          >
          {#if states.length > 1}
            <button type="button" data-testid="state-remove" onclick={() => void remove(i)}>Remove</button>
          {/if}
        </span>
      </div>
      {#if problem}
        <div class="field-problem">{problem}</div>
      {/if}
    </div>
  {/each}
</div>
<button type="button" data-testid="state-add" onclick={() => void change(null, addState)}>Add state</button>

<style>
  /* The two flags explained: a term per line, its points below it. */
  .flag-help {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 14px;
  }
  .flag-help dt {
    font-weight: 600;
    color: var(--text);
  }
  .flag-help dd {
    margin: 0;
  }
  .flag-help ul {
    margin: 0;
    padding-left: 16px;
  }
  .flag-help li + li {
    margin-top: 2px;
  }
</style>
