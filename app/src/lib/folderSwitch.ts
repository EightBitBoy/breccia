// Switching the notes folder: nothing typed may be lost, so the switch is refused while anything is unsaved.
import { flushBeforeClose, type Client } from './api'
import type { RecentFolder } from './types'

/** What the shown notices hold back from a switch. */
export interface NoticesHeld {
  /** Notices holding text the core never got. */
  unsent: number
  /**
   * The pages (their names) of notices still offering Keep mine or Use theirs: "mine" may be held only by the
   * notice (another program changed a saved block while it was being edited), so a switch would lose it.
   */
  unresolved: string[]
}

/** Why the folder was not switched, or null when nothing is unsaved. */
export function switchPrompt(dirty: { title: string }[], unsent: number, unresolved: string[] = []): string | null {
  if (dirty.length === 0 && unsent === 0 && unresolved.length === 0) return null
  const parts: string[] = []
  if (dirty.length) parts.push(`changes to ${dirty.map((d) => d.title).join(', ')} could not be saved`)
  if (unsent) parts.push(`text in ${unsent} notice${unsent === 1 ? '' : 's'} is not saved anywhere`)
  if (unresolved.length === 1) parts.push(`the notice about ${unresolved[0]} still asks you to choose Keep mine or Use theirs`)
  else if (unresolved.length) {
    parts.push(`the notices about ${unresolved.join(', ')} still ask you to choose Keep mine or Use theirs`)
  }
  return `Breccia did not switch folders: ${parts.join('; ')}. Resolve the notices first (Reload from disk or Keep mine), or copy the text.`
}

const COULD_NOT = 'Breccia could not check for unsaved changes, so it did not switch folders. Try again.'

/**
 * Before a switch: sends pending text, then asks the core for unsaved pages (each step waits at most `ms`), then
 * counts what the shown notices hold (`held`).
 * Unlike closing, a failing or late `session.dirty` counts as not clean: a switch can be tried again.
 * Never rejects.
 */
export async function switchCheck(
  client: Pick<Client, 'flush' | 'run'>,
  held: () => NoticesHeld,
  ms = 5000,
): Promise<string | null> {
  await flushBeforeClose(client, ms)
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))
  try {
    const out = await Promise.race([client.run({ type: 'session.dirty' }), late])
    if (out === null) {
      console.error('session.dirty did not answer in time')
      return COULD_NOT
    }
    const h = held()
    return switchPrompt(out.dirty ?? [], h.unsent, h.unresolved)
  } catch (e) {
    console.error('session.dirty failed', e)
    return COULD_NOT
  } finally {
    clearTimeout(timer)
  }
}

const same = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** The recent folders without the open one. */
export function recentRows(list: RecentFolder[], current: string | null): RecentFolder[] {
  if (current === null) return list
  const c = same(current)
  return list.filter((r) => same(r.path) !== c)
}

/** The notice for a click on a recent folder that no longer exists: nothing opens. */
export function missingFolder(path: string): string {
  return `This folder no longer exists: ${path}`
}

/**
 * Asks for a folder with the system dialog (`dialog` opens it); null when cancelled. A dialog that cannot open
 * is reported through `onerror`, also null.
 */
export async function pickFolder(
  dialog: () => Promise<string | string[] | null>,
  onerror: (message: string) => void,
): Promise<string | null> {
  let path: string | string[] | null
  try {
    path = await dialog()
  } catch (e) {
    onerror(`Could not open the folder picker: ${e}`)
    return null
  }
  return typeof path === 'string' ? path : null
}
