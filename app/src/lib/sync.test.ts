import { describe, expect, test } from 'vitest'
import {
  afterOutput,
  afterRefresh,
  blockCommand,
  carryOver,
  countsInFlight,
  heldDelete,
  kindOf,
  mapCaret,
  typedAfter,
  type OutputState,
} from './sync'
import type { Command } from './types'

describe('carryOver', () => {
  test('a plain insert at the caret moves to the new block', () => {
    expect(carryOver('alphabeta', 5, 'alphaXYbeta')).toEqual({ kind: 'carry', d: 'XY' })
  })

  test('an insert with AltGr characters such as [[ moves too', () => {
    expect(carryOver('ab', 2, 'ab[[Ben]] {x}')).toEqual({ kind: 'carry', d: '[[Ben]] {x}' })
    expect(carryOver('ab', 1, 'a@€[[b')).toEqual({ kind: 'carry', d: '@€[[' })
  })

  test('nothing typed gives an empty carry', () => {
    expect(carryOver('ab', 1, 'ab')).toEqual({ kind: 'carry', d: '' })
    expect(carryOver('', 0, '')).toEqual({ kind: 'carry', d: '' })
  })

  test('an edit before the caret keeps all text in the old block', () => {
    // Backspace past the caret: the tail is intact, so it is dropped from the old block.
    expect(carryOver('alphabeta', 5, 'alphbeta')).toEqual({ kind: 'keep', text: 'alph' })
    // The head was edited and text typed: the old block keeps it all but the moved tail.
    expect(carryOver('alphabeta', 5, 'Xalphayybeta')).toEqual({ kind: 'keep', text: 'Xalphayy' })
  })

  test('an edit of the tail keeps the whole text', () => {
    expect(carryOver('alphabeta', 5, 'alphabetZ')).toEqual({ kind: 'keep', text: 'alphabetZ' })
  })

  test('a deletion is never a carry', () => {
    // 'a|aa' lost its first 'a': the old block is left empty, the tail is in the new block.
    expect(carryOver('aaa', 1, 'aa')).toEqual({ kind: 'keep', text: '' })
  })
})

describe('typedAfter', () => {
  test('finds text appended after the send', () => {
    expect(typedAfter('ab', 'abcd')).toBe('cd')
    expect(typedAfter('ab', 'ab')).toBe('')
    expect(typedAfter('ab', 'xab')).toBeNull()
  })
})

describe('kindOf', () => {
  test('sorts commands by how they touch the editor', () => {
    expect(kindOf('block.setText')).toBe('typing')
    expect(kindOf('block.split')).toBe('split')
    expect(kindOf('blocks.indent')).toBe('structure')
    expect(kindOf('blocks.moveDown')).toBe('structure')
    expect(kindOf('block.cycleState')).toBe('text')
    expect(kindOf('block.stepState')).toBe('text')
    expect(kindOf('history.undo')).toBe('text')
    expect(kindOf('page.reload')).toBe('text')
    expect(kindOf('block.merge')).toBe('text')
    expect(kindOf('block.delete')).toBe('text')
    // A drop on a board rewrites the card's text (state, priority), as a change of state does.
    expect(kindOf('board.place')).toBe('text')
    expect(kindOf('page.open')).toBe('other')
    expect(kindOf('block.insert')).toBe('other')
    expect(kindOf('page.get')).toBe('refresh')
  })
})

describe('afterOutput', () => {
  const base: OutputState = {
    kind: 'typing',
    editing: 1,
    issuedFrom: 1,
    editedText: 'a',
    focus: null,
    sent: { id: 1, text: 'a' },
    current: 'a',
  }
  const bullets = { id: 1, text: 'a\n- b' }

  test('a text command issued from selection mode leaves a block edited since alone', () => {
    const s = { ...base, kind: 'text' as const, issuedFrom: null, editing: 2, editedText: 'typed' }
    expect(afterOutput(s)).toEqual({ do: 'none' })
    expect(afterOutput({ ...s, focus: { id: 3, cursor16: 0 } })).toEqual({ do: 'none' })
  })

  test('a text command issued while not editing, still not editing, changes nothing', () => {
    expect(afterOutput({ ...base, kind: 'text', issuedFrom: null, editing: null, editedText: null })).toEqual({
      do: 'none',
    })
  })

  test('a typing echo with the sent text changes nothing', () => {
    expect(afterOutput(base)).toEqual({ do: 'none' })
  })

  test('typing ahead of a plain echo changes nothing', () => {
    expect(afterOutput({ ...base, current: 'abc' })).toEqual({ do: 'none' })
  })

  test('text the core reshaped replaces the editor text', () => {
    const sent = { id: 1, text: 'a\n```' }
    expect(afterOutput({ ...base, sent, current: sent.text, editedText: 'a\n```\n```' })).toEqual({
      do: 'setText',
      text: 'a\n```\n```',
      extra: '',
    })
  })

  test('new blocks made by typing move the editor to the focus', () => {
    const s = { ...base, sent: bullets, current: bullets.text, focus: { id: 2, cursor16: 1 } }
    expect(afterOutput(s)).toEqual({ do: 'edit', id: 2, cursor16: 1, extra: '' })
  })

  test('text typed at the end since the send moves along', () => {
    const s = { ...base, sent: bullets, current: 'a\n- bcd', focus: { id: 2, cursor16: 1 } }
    expect(afterOutput(s)).toEqual({ do: 'edit', id: 2, cursor16: 3, extra: 'cd' })
  })

  test('text edited elsewhere since the send stays as typed', () => {
    expect(afterOutput({ ...base, sent: bullets, current: 'Xa\n- b', focus: { id: 2, cursor16: 1 } })).toEqual({
      do: 'none',
    })
  })

  test('the edited block gone closes the editor', () => {
    expect(afterOutput({ ...base, editedText: null })).toEqual({ do: 'close' })
  })

  test('an echo of another block leaves the editor alone', () => {
    expect(afterOutput({ ...base, editing: 2, sent: { id: 1, text: 'x' }, editedText: 'b' })).toEqual({ do: 'none' })
  })

  test('a text command shows the output text', () => {
    expect(afterOutput({ ...base, kind: 'text', editedText: 'TODO a' })).toEqual({ do: 'setText', text: 'TODO a' })
  })

  test('a text command whose block is gone closes the editor', () => {
    expect(afterOutput({ ...base, kind: 'text', editedText: null })).toEqual({ do: 'close' })
  })

  test('a merge or split output after the user left does not reopen the editor', () => {
    const focus = { id: 0, cursor16: 3 }
    expect(afterOutput({ ...base, kind: 'text', editing: null, focus })).toEqual({ do: 'none' })
    expect(afterOutput({ ...base, kind: 'split', editing: 7, focus })).toEqual({ do: 'none' })
    expect(afterOutput({ ...base, kind: 'text', focus })).toEqual({ do: 'edit', id: 0, cursor16: 3 })
  })

  test('moving blocks keeps the editor and its text', () => {
    expect(afterOutput({ ...base, kind: 'structure', editedText: 'stale' })).toEqual({ do: 'keep' })
    expect(afterOutput({ ...base, kind: 'structure', editing: null })).toEqual({ do: 'none' })
  })

  test('other commands follow their focus or drop a vanished block', () => {
    const o = { ...base, kind: 'other' as const, issuedFrom: null }
    expect(afterOutput({ ...o, focus: { id: 5, cursor16: 0 } })).toEqual({ do: 'edit', id: 5, cursor16: 0 })
    expect(afterOutput({ ...o, editedText: null })).toEqual({ do: 'close' })
    expect(afterOutput({ ...o, editing: null, editedText: null })).toEqual({ do: 'none' })
    expect(afterOutput(o)).toEqual({ do: 'none' })
  })
})

describe('afterRefresh', () => {
  test('afterRefresh keeps the edit in progress and reports a changed block', () => {
    expect(afterRefresh({ editing: null, editorText: null, before: 'a', after: 'b' })).toEqual({ do: 'none' })
    expect(afterRefresh({ editing: 1, editorText: 'a', before: 'a', after: null })).toEqual({ do: 'close' })
    expect(afterRefresh({ editing: 1, editorText: 'a', before: 'a', after: 'b' })).toEqual({
      do: 'conflict',
      mine: 'a',
      theirs: 'b',
    })
    expect(afterRefresh({ editing: 1, editorText: 'mine', before: 'a', after: 'a' })).toEqual({ do: 'none' })
    expect(afterRefresh({ editing: 1, editorText: 'mine', before: 'a', after: 'mine' })).toEqual({ do: 'none' })
  })

  test('an editor not mounted yet has nothing to keep', () => {
    expect(afterRefresh({ editing: 1, editorText: null, before: 'a', after: 'b' })).toEqual({ do: 'none' })
  })
})

describe('mapCaret', () => {
  test('keeps the caret on its text when a keyword is added or removed in front', () => {
    expect(mapCaret('task', 2, 'TODO task')).toBe(7)
    expect(mapCaret('TODO task', 7, 'task')).toBe(2)
    expect(mapCaret('task', 4, 'DONE task')).toBe(9)
  })

  test('clamps when the text after the caret changed', () => {
    expect(mapCaret('abcdef', 5, 'xyz')).toBe(3)
    expect(mapCaret('abc', 1, 'abX')).toBe(1)
  })
})

describe('blockCommand', () => {
  test('every outline move is a structure command', () => {
    for (const type of Object.values(blockCommand)) expect(kindOf(type)).toBe('structure')
  })
})

describe('heldDelete', () => {
  test('Backspace at the split caret is a merge of the new block', () => {
    expect(heldDelete('Backspace', 3, 3)).toBe('deleteBack')
  })

  test('Backspace elsewhere stays with the old editor', () => {
    expect(heldDelete('Backspace', 2, 3)).toBeNull()
    expect(heldDelete('Backspace', 5, 3)).toBeNull()
  })

  test('Delete at or after the split caret belongs to the new block', () => {
    expect(heldDelete('Delete', 3, 3)).toBe('deleteForward')
    expect(heldDelete('Delete', 4, 3)).toBe('deleteForward')
    expect(heldDelete('Delete', 2, 3)).toBeNull()
  })

  test('other keys are never held', () => {
    expect(heldDelete('a', 3, 3)).toBeNull()
  })
})

describe('countsInFlight', () => {
  test('archive.list is a query; archive.auto answers with pages and holds events', () => {
    expect(countsInFlight('archive.list')).toBe(false)
    expect(countsInFlight('archive.auto')).toBe(true)
  })
  test('feed queries are still counted as in flight', () => {
    expect(countsInFlight('journal.feed')).toBe(true)
    expect(countsInFlight('pages.get')).toBe(true)
  })
  test('board.get is not counted, like page.refs', () => {
    expect(countsInFlight('board.get')).toBe(false)
  })
  test('page.renameReach (the rename question) is not counted', () => {
    expect(countsInFlight('page.renameReach')).toBe(false)
  })
  test('search.query is not counted', () => {
    expect(countsInFlight('search.query')).toBe(false)
  })
  test('journal.day (the date picker asking for a day) is not counted', () => {
    expect(countsInFlight('journal.day')).toBe(false)
  })
  test('pages.table is not counted either', () => {
    expect(countsInFlight('pages.table')).toBe(false)
  })
  test('graph.get is not counted', () => {
    expect(countsInFlight('graph.get')).toBe(false)
  })
  test('graph.saveLayout is not counted', () => {
    expect(countsInFlight('graph.saveLayout')).toBe(false)
  })
})
