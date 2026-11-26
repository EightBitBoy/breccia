import type { BlockId, Command, Output, Request } from './types'

const TYPING_DELAY_MS = 300

export type Invoke = (req: Request) => Promise<Output>

export interface Client {
  /** Queue a command; all calls run one at a time in call order. */
  run(cmd: Command): Promise<Output>
  /** Send `block.setText` 300 ms after the last call for that id. */
  setTextDebounced(id: BlockId, text: string): void
  /** Send any pending text now. */
  flush(): Promise<void>
  /** Drop the pending text of `id`, if it has not been sent yet. */
  cancel(id: BlockId): void
  setGeneration(n: number): void
  /** Whether anything is left to do: text in the typing pause, or a command queued, running or being applied. */
  busy(): boolean
  /** The typed text sent (`block.setText`) and not answered yet, in send order. */
  unanswered(): { id: BlockId; text: string }[]
}

export interface Hooks {
  /** Every successful result, including those of debounced and flushed sends. */
  onOutput?(out: Output, cmd: Command): void
  /** Failures of debounced and flushed sends; `run` rejects to its caller instead. */
  onError?(err: unknown, cmd: Command): void
  /** Whether typed text is still on its way to the core (in the typing pause or sent and not yet answered); on change only. */
  onUnsaved?(unsaved: boolean): void
  /** Whether the client has any work left (typing pause, queue, applying answers); on change only. For tests of the whole app. */
  onBusy?(busy: boolean): void
}

/** A hook must never reject the queue. */
function safely(f: () => void): void {
  try {
    f()
  } catch (e) {
    console.error('client hook failed', e)
  }
}

export function createClient(invoke: Invoke, hooks: Hooks = {}): Client {
  let generation = 0
  let tail: Promise<unknown> = Promise.resolve()
  let sending = 0
  let unsaved = false
  let queued = 0
  let busy = false
  /** The `block.setText` commands sent and not answered yet. */
  const inFlightText = new Set<{ id: BlockId; text: string }>()
  const pending = new Map<BlockId, { text: string; generation: number; timer: ReturnType<typeof setTimeout> }>()

  /** Counts pending text and queued commands; every place that changes either one calls it in the same tick. */
  function reportBusy(): void {
    const now = pending.size + queued > 0
    if (now === busy) return
    busy = now
    safely(() => hooks.onBusy?.(now))
  }

  function reportUnsaved(): void {
    reportBusy()
    const now = pending.size + sending > 0
    if (now === unsaved) return
    unsaved = now
    safely(() => hooks.onUnsaved?.(now))
  }

  // The generation is captured when the command is queued, not when it is sent.
  function enqueue(command: Command, gen: number): Promise<Output> {
    queued++
    reportBusy()
    const p = tail.then(() => invoke({ generation: gen, command }))
    tail = p
      .then(
        (out) => safely(() => hooks.onOutput?.(out, command)),
        () => {},
      )
      .finally(() => {
        queued--
        reportBusy()
      })
    return p
  }

  function enqueueBackground(command: Command, gen: number): void {
    sending++
    const text = command.type === 'block.setText' ? { id: command.id, text: command.text } : null
    if (text) inFlightText.add(text)
    enqueue(command, gen)
      .catch((e) => safely(() => hooks.onError?.(e, command)))
      .finally(() => {
        if (text) inFlightText.delete(text)
        sending--
        reportUnsaved()
      })
  }

  function flushPending(): void {
    for (const [id, { text, generation: gen, timer }] of pending) {
      clearTimeout(timer)
      enqueueBackground({ type: 'block.setText', id, text }, gen)
    }
    pending.clear()
    reportUnsaved()
  }

  return {
    run(cmd) {
      flushPending()
      return enqueue(cmd, generation)
    },
    setTextDebounced(id, text) {
      const old = pending.get(id)
      if (old) clearTimeout(old.timer)
      const timer = setTimeout(() => {
        const cur = pending.get(id)
        if (!cur) return
        pending.delete(id)
        enqueueBackground({ type: 'block.setText', id, text: cur.text }, cur.generation)
        reportUnsaved()
      }, TYPING_DELAY_MS)
      pending.set(id, { text, generation, timer })
      reportUnsaved()
    },
    async flush() {
      flushPending()
      await tail
    },
    cancel(id) {
      const p = pending.get(id)
      if (p) clearTimeout(p.timer)
      pending.delete(id)
      reportUnsaved()
    },
    setGeneration(n) {
      generation = n
    },
    busy() {
      return pending.size + queued > 0
    },
    unanswered() {
      return [...inFlightText].map((t) => ({ ...t }))
    },
  }
}

/**
 * Before the window closes: sends pending text and waits for the queue, at most
 * `ms`, so a stuck command cannot keep the window open. Never rejects. It flushes
 * twice: applying an answer can leave new pending text (a split carries what was
 * typed meanwhile over to the new block).
 */
export async function flushBeforeClose(client: Pick<Client, 'flush'>, ms = 5000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)))
  try {
    await Promise.race([client.flush().then(() => client.flush()), late])
  } catch (e) {
    console.error('flush before close failed', e)
  } finally {
    clearTimeout(timer)
  }
}
