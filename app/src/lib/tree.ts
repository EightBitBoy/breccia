import type { BlockId, BlockView } from './types'

/** The blocks that are shown: those under a folded block are dropped. */
export function visible(blocks: BlockView[], folded: ReadonlySet<number>): BlockView[] {
  const out: BlockView[] = []
  let hideBelow: number | null = null
  for (const b of blocks) {
    if (hideBelow !== null) {
      if (b.depth > hideBelow) continue
      hideBelow = null
    }
    out.push(b)
    if (folded.has(b.id)) hideBelow = b.depth
  }
  return out
}

/** The ids of `id`'s ancestors in `blocks`, outermost first; [] if `id` is not there. */
export function ancestorsOf(blocks: BlockView[], id: BlockId): BlockId[] {
  const i = blocks.findIndex((b) => b.id === id)
  if (i < 0) return []
  const out: BlockId[] = []
  let d = blocks[i].depth
  for (let j = i - 1; j >= 0 && d > 0; j--) {
    if (blocks[j].depth < d) {
      out.unshift(blocks[j].id)
      d = blocks[j].depth
    }
  }
  return out
}
