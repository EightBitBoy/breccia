// Following changes made outside this view: events from the shell are held
// while a command runs, and the shown page is loaded again through the queue.
import type { Invoke } from './api'
import { countsInFlight } from './sync'

/**
 * Runs event handlers once no command is running. The shell emits a command's
 * events before the command answers, so an event that arrives meanwhile may be
 * our own echo: it is held, never dropped, and replayed after the output is
 * applied (when it can be told apart from news).
 */
export class WhenIdle {
  private held: (() => void)[] = []
  private scheduled = false

  constructor(
    private busy: () => boolean,
    /** Runs `f` after the outputs of finished commands are applied. */
    private later: (f: () => void) => void = (f) => void setTimeout(f, 0),
  ) {}

  run(f: () => void) {
    if (this.busy()) this.held.push(f)
    else f()
  }

  /** A command finished: replay the held handlers, unless another one runs already. */
  settled() {
    if (this.scheduled || this.held.length === 0 || this.busy()) return
    this.scheduled = true
    this.later(() => {
      this.scheduled = false
      for (const f of this.held.splice(0)) this.run(f)
    })
  }
}

/**
 * Loads pages again: at most one refresh queued per key. A request while one
 * is queued is served by it, since it runs after everything queued before.
 */
export class Refreshes {
  private queued = new Set<string>()

  /** `run` queues the refresh and settles once its output is applied. */
  constructor(private run: (key: string) => Promise<unknown>) {}

  request(key: string) {
    if (this.queued.has(key)) return
    this.queued.add(key)
    const done = () => void this.queued.delete(key)
    this.run(key).then(done, done)
  }

  /** A new notes folder: the old folder's keys are forgotten (their late answers are refused as stale). */
  clear() {
    this.queued.clear()
  }
}

/** Counts the commands in flight; shell events wait for them (`idle`). */
export class InFlight {
  private n = 0
  /** Shell events run through this: held while a counted command runs. */
  readonly idle: WhenIdle

  constructor(later?: (f: () => void) => void) {
    this.idle = new WhenIdle(() => this.n > 0, later)
  }

  /** `invoke`, counting the commands for which `countsInFlight(type)` holds. */
  wrap(invoke: Invoke): Invoke {
    return async (request) => {
      const counted = countsInFlight(request.command.type)
      if (counted) this.n++
      try {
        return await invoke(request)
      } catch (e) {
        throw typeof e === 'object' && e !== null ? e : { code: 'internal', message: String(e) }
      } finally {
        if (counted) {
          this.n--
          this.idle.settled()
        }
      }
    }
  }
}
