// Closing the window: what was typed is sent first, and pages that could not be
// saved (and text shown in unsent notices) are named before they are given up.
import { flushBeforeClose, type Client } from './api'

/**
 * The question to ask before closing with unsaved pages or `unsent` notices
 * holding text the core never got; null if there are none.
 */
export function closePrompt(dirty: { title: string }[], unsent = 0): string | null {
  if (dirty.length === 0 && unsent === 0) return null
  const parts: string[] = []
  const n = dirty.length
  if (n) parts.push(`Changes to ${n} page${n === 1 ? '' : 's'} could not be saved: ${dirty.map((d) => d.title).join(', ')}.`)
  if (unsent) parts.push(`Text in ${unsent} notice${unsent === 1 ? '' : 's'} was not saved.`)
  return `${parts.join(' ')} Close anyway?`
}

/**
 * Before the window closes: sends pending text, then asks the core for unsaved
 * pages and counts the unsent notices shown (after the flush, which can add
 * one). Each step waits at most `ms`, so a stuck command never keeps the window
 * open. Never rejects; a failure of `session.dirty` is logged and counts as no
 * unsaved pages.
 */
export async function closeCheck(
  client: Pick<Client, 'flush' | 'run'>,
  unsent: () => number,
  ms = 5000,
): Promise<string | null> {
  await flushBeforeClose(client, ms)
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))
  let dirty: { title: string }[] = []
  try {
    const out = await Promise.race([client.run({ type: 'session.dirty' }), late])
    if (out === null) console.error('session.dirty did not answer in time')
    else dirty = out.dirty ?? []
  } catch (e) {
    console.error('session.dirty failed', e)
  } finally {
    clearTimeout(timer)
  }
  return closePrompt(dirty, unsent())
}
