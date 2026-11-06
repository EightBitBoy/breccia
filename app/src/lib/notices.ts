// Which notices are shown: one per thing they are about.
import type { Notice } from './types'

/** What a notice is about: a conflict's page and block, else its message. */
export function noticeKey(n: Notice): string {
  return n.kind === 'conflict' ? `conflict\n${n.page}\n${n.block}` : `message\n${n.message}`
}

/**
 * `items` with `item` (made from `n`) added: a newer conflict of a block replaces
 * the older one; any other notice already shown is not added again.
 */
export function addNotice<T extends { key: string }>(items: T[], n: Notice, item: T): T[] {
  if (n.kind === 'conflict') return [...items.filter((i) => i.key !== item.key), item]
  return items.some((i) => i.key === item.key) ? items : [...items, item]
}

/** The message of a notice showing text the core never got: copy it from here. */
export const UNSENT = 'This block is gone, so your text was not saved. Copy it from here:'

/** Whether `n` holds text that exists nowhere else, so closing must ask first. */
export function isUnsent(n: Notice): boolean {
  return n.kind === 'conflict' && n.theirs === null && n.message === UNSENT
}
