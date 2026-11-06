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
}

export interface Hooks {
  /** Every successful result, including those of debounced and flushed sends. */
  onOutput?(out: Output, cmd: Command): void
  /** Failures of debounced and flushed sends; `run` rejects to its caller instead. */
  onError?(err: unknown, cmd: Command): void
  /** Whether typed text is still on its way to the core (in the typing pause or sent and not yet answered); on change only. */
  onUnsaved?(unsaved: boolean): void
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
  const pending = new Map<BlockId, { text: string; generation: number; timer: ReturnType<typeof setTimeout> }>()

  function reportUnsaved(): void {
    const now = pending.size + sending > 0
    if (now === unsaved) return
    unsaved = now
    safely(() => hooks.onUnsaved?.(now))
  }

  // The generation is captured when the command is queued, not when it is sent.
  function enqueue(command: Command, gen: number): Promise<Output> {
    const p = tail.then(() => invoke({ generation: gen, command }))
    tail = p.then(
      (out) => safely(() => hooks.onOutput?.(out, command)),
      () => {},
    )
    return p
  }

  function enqueueBackground(command: Command, gen: number): void {
    sending++
    enqueue(command, gen)
      .catch((e) => safely(() => hooks.onError?.(e, command)))
      .finally(() => {
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
