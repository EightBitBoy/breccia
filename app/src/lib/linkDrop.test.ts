import { describe, expect, it } from 'vitest'
import { canLinkDrag, linkData, linkDrop, rowLink, LINK } from './linkDrop'
import { canDrag } from './treeDrop'
import type { Row } from './treeRows'

const page: Row = { id: 'p:big ideas', depth: 0, kind: 'page', label: 'Big Ideas', key: 'big ideas' }
const linkedOnly: Row = { ...page, id: 'p:later', label: 'Later', key: 'later', linkedOnly: true }
const day: Row = { id: 'd:2026-11-24', depth: 3, kind: 'day', label: 'Tuesday, 24 November 2026', key: '2026-11-24' }
const folder: Row = { id: 'f:Work', depth: 0, kind: 'folder', label: 'Work', path: 'Work', open: true }
const month: Row = { id: 'm:2026-11', depth: 2, kind: 'month', label: 'November', open: true }

describe('rowLink', () => {
  it('links a page by the name the tree shows, as the [[ completion writes it', () => {
    expect(rowLink(page)).toBe('[[Big Ideas]]')
    expect(rowLink(linkedOnly)).toBe('[[Later]]')
  })

  it('links a journal day by its date, not its long title', () => {
    expect(rowLink(day)).toBe('[[2026-11-24]]')
  })

  it('gives no link for folders and the journal folds', () => {
    expect(rowLink(folder)).toBeNull()
    expect(rowLink(month)).toBeNull()
  })
})

describe('canLinkDrag', () => {
  it('lets a journal day be dragged for its link, though it can never be moved', () => {
    expect(canLinkDrag(day)).toBe(true)
    expect(canDrag(day)).toBe(false)
  })

  it('keeps pages and folders draggable and the folds not', () => {
    expect(canLinkDrag(page)).toBe(true)
    expect(canLinkDrag(folder)).toBe(true)
    expect(canLinkDrag(month)).toBe(false)
  })
})

describe('linkData', () => {
  it('reads the link from a drag that carries one', () => {
    expect(linkData({ [LINK]: '[[Big Ideas]]' })).toBe('[[Big Ideas]]')
  })

  it('is null for a folder drag or a card drag', () => {
    expect(linkData({ [LINK]: null })).toBeNull()
    expect(linkData({ 'breccia-card': true, id: 3, state: 'TODO' })).toBeNull()
  })
})

describe('linkDrop', () => {
  const pageOf = (id: number) => (id === 7 ? 'host' : null)

  it('puts the link at the caret under the pointer in the block being edited', () => {
    expect(linkDrop({ block: 7 }, '[[Big Ideas]]', 7, pageOf)).toEqual({ kind: 'caret', text: '[[Big Ideas]]' })
  })

  it('adds a new block after a rendered block (after its children), holding the link', () => {
    expect(linkDrop({ block: 7 }, '[[Big Ideas]]', null, pageOf)).toEqual({
      kind: 'command',
      cmd: { type: 'block.insert', page: 'host', after: 7, text: '[[Big Ideas]]' },
    })
    expect(linkDrop({ block: 7 }, '[[Big Ideas]]', 9, pageOf)).toEqual({
      kind: 'command',
      cmd: { type: 'block.insert', page: 'host', after: 7, text: '[[Big Ideas]]' },
    })
  })

  it("starts an empty page or journal day with a block holding the link", () => {
    expect(linkDrop({ page: '2026-11-24' }, '[[Big Ideas]]', null, pageOf)).toEqual({
      kind: 'command',
      cmd: { type: 'block.insert', page: '2026-11-24', after: null, text: '[[Big Ideas]]' },
    })
  })

  it('does nothing for a block whose page is not known', () => {
    expect(linkDrop({ block: 8 }, '[[Big Ideas]]', null, pageOf)).toBeNull()
  })
})
