import { expect, test } from 'vitest'
import { OPENERS, Overlays, type Opener, type Overlay } from './overlay.svelte'

const confirm = (answers: boolean[] = []): Overlay => ({
  kind: 'confirm',
  message: 'Sure?',
  ok: 'Yes',
  answer: (yes) => answers.push(yes),
})

test('canOpen is false without a folder', () => {
  const o = new Overlays(() => true)
  expect([o.canOpen(), o.dialogOpen()]).toEqual([false, true])
  expect(new Overlays(() => false).canOpen()).toBe(true)
})

test('opening a dialog closes the date picker', () => {
  const o = new Overlays(() => false)
  let pickerOpen = true
  o.onOpen(() => (pickerOpen = false))
  o.open({ kind: 'help' })
  expect(pickerOpen).toBe(false)
  pickerOpen = true
  o.open({ kind: 'search' }) // the search box too, as today
  expect(pickerOpen).toBe(false)
})

test('close of a kind not open does nothing', () => {
  const o = new Overlays(() => false)
  o.open({ kind: 'help' })
  o.close('changelog')
  expect(o.current).toEqual({ kind: 'help' })
  o.close('help')
  expect(o.current).toBeNull()
})

test('dialogOpen ignores the search box, canOpen does not', () => {
  const o = new Overlays(() => false)
  o.open({ kind: 'search' })
  expect([o.dialogOpen(), o.canOpen()]).toEqual([false, false])
  o.open({ kind: 'flow' })
  expect([o.dialogOpen(), o.canOpen()]).toEqual([true, false])
})

test('a confirm overlay always answers: close, another open and closeAll answer no', () => {
  const answers: boolean[] = []
  const o = new Overlays(() => false)
  o.open(confirm(answers))
  o.close('confirm')
  o.open(confirm(answers))
  o.open({ kind: 'help' })
  o.open(confirm(answers))
  o.closeAll()
  expect(answers).toEqual([false, false, false])
  expect(o.current).toBeNull()
})

test('answer closes the confirm overlay first, then answers once', () => {
  const o = new Overlays(() => false)
  let seen: Overlay | null | undefined
  const answers: boolean[] = []
  o.open({ kind: 'confirm', message: 'Sure?', ok: 'Yes', answer: (yes) => (answers.push(yes), (seen = o.current)) })
  o.answer(true)
  o.answer(true) // nothing open any more
  o.close('confirm')
  expect(answers).toEqual([true])
  expect(seen).toBeNull()
})

test('a newBoard overlay keeps where it was opened from', () => {
  const o = new Overlays(() => false)
  o.open({ kind: 'newBoard', from: 'settings' })
  expect(o.is('newBoard')).toBe(true)
  expect(o.current).toEqual({ kind: 'newBoard', from: 'settings' })
})

// R3: every way to open a dialog keeps exactly its guard in today's App.svelte. `dialogOpen` is today's
// `dialogOpen()` (no folder, the close question, or a dialog other than the search box); `dialogOpen || search` is
// today's `dialogOpen() || search.shown`.
const TODAY: Record<Opener, 'dialogOpen' | 'dialogOpen || search'> = {
  openSearch: 'dialogOpen',
  toggleHelp: 'dialogOpen || search',
  startNewPage: 'dialogOpen || search',
  openGraph: 'dialogOpen || search',
  toggleGitLog: 'dialogOpen || search',
  openSettings: 'dialogOpen || search',
  confirmAsk: 'dialogOpen || search',
  togglePicker: 'dialogOpen || search',
  go: 'dialogOpen || search',
  gitSetUp: 'dialogOpen || search',
  pickDate: 'dialogOpen || search',
  pickDue: 'dialogOpen || search',
  historyKey: 'dialogOpen || search',
}

const STATES: { name: string; folder: boolean; closing: boolean; current: Overlay | null }[] = [
  { name: 'nothing open', folder: true, closing: false, current: null },
  { name: 'no folder', folder: false, closing: false, current: null },
  { name: 'the close question', folder: true, closing: true, current: null },
  { name: 'the close question over search', folder: true, closing: true, current: { kind: 'search' } },
  ...(
    [
      { kind: 'search' },
      { kind: 'help' },
      { kind: 'changelog' },
      { kind: 'flow' },
      { kind: 'boardSettings' },
      { kind: 'newBoard', from: 'sidebar' },
      confirm(),
    ] as Overlay[]
  ).map((current) => ({ name: current.kind, folder: true, closing: false, current })),
]

test('the guard table has a row for every opener', () => {
  expect([...OPENERS].sort()).toEqual(Object.keys(TODAY).sort())
})

for (const opener of OPENERS) {
  test(`${opener} keeps today's guard (${TODAY[opener]})`, () => {
    for (const s of STATES) {
      const o = new Overlays(() => !s.folder || s.closing)
      if (s.current) o.open(s.current)
      const dialogOpen = !s.folder || s.closing || (s.current !== null && s.current.kind !== 'search')
      const refused = TODAY[opener] === 'dialogOpen' ? dialogOpen : dialogOpen || s.current?.kind === 'search'
      expect([s.name, o.may(opener)]).toEqual([s.name, !refused])
    }
  })
}
