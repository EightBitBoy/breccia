// The start of the window: the shell opens the last folder in the background, so the window shows at once with
// "Opening ‹folder›…" and asks the core for the folder only once the open is over (`folder:opened`).
import type { Notice } from './types'

export interface OpeningEnv {
  /** The folder the shell is opening at startup, or null when it is not opening one (any more). */
  opening(): Promise<string | null>
  /** Calls `cb` when the shell's startup open is over; returns the unsubscribe. */
  onOpened(cb: () => void): () => void
}

/**
 * Waits for the shell's startup open. It subscribes first, then asks, so an open that ends in between is not missed:
 * `null` resolves at once; a path is shown with `show` and the promise resolves on `folder:opened`. An event that comes
 * before the answer resolves it too, and nothing is shown.
 */
export async function awaitStartupOpen(env: OpeningEnv, show: (path: string) => void): Promise<void> {
  let unsubscribe = () => {}
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false
      const finish = () => {
        done = true
        resolve()
      }
      unsubscribe = env.onOpened(finish)
      env.opening().then((path) => {
        if (path === null) finish()
        else if (!done) show(path)
      }, reject)
    })
  } finally {
    unsubscribe()
  }
}

export interface StartupEnv extends OpeningEnv {
  /** Shows "Opening ‹folder›…" for `path`. */
  show(path: string): void
  /** Asks `folder.status`; true if a folder is open. */
  folderStatus(): Promise<boolean>
  /** Asks `git.status`. */
  gitStatus(): Promise<void>
  /** Loads the open folder's views (the journal first). */
  openFolder(): Promise<void>
  /** What the startup open has to tell the user (load warnings, or why it failed). */
  notices(): Promise<Notice[]>
  notify(n: Notice): void
}

/**
 * The window's start, once the shell listens: waits for the startup open, then asks the core what is open. `'folder'`:
 * the folder's views are loaded; `'welcome'`: no folder opened (none was asked for, or it failed and the notices say
 * why), so the Welcome screen shows.
 */
export async function startupSequence(env: StartupEnv): Promise<'welcome' | 'folder'> {
  await awaitStartupOpen(env, (path) => env.show(path))
  const open = await env.folderStatus()
  // After the shell's listeners are ready: every later change arrives as `git:changed`.
  await env.gitStatus()
  if (open) await env.openFolder()
  for (const n of await env.notices()) env.notify(n)
  return open ? 'folder' : 'welcome'
}

/** "Opening ‹folder name›…" for the folder at `path`; a drive root keeps its whole path. */
export function openingText(path: string): string {
  const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  return `Opening ${name && !name.endsWith(':') ? name : path}…`
}
