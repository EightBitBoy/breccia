import { expect, test } from 'vitest'
import { Archive } from './archive.svelte'
import type { ArchivedView, Command, Notice, Output } from './types'

const answer = (rows: ArchivedView[]): Output => ({ archive: rows }) as unknown as Output
const row = (id: number, text: string): ArchivedView => ({
  id, page: 'p', pageName: 'P', pageKind: 'page', source: 'P', text, state: 'DONE', color: 'green', done: null, archived: null, created: null, took: null,
})

function setup(fail = false) {
  const sent: Command[] = []
  const notices: Notice[] = []
  const pending: Array<() => void> = []
  let hold = false
  const a = new Archive({
    run: (cmd) => {
      sent.push(cmd)
      if (fail) return Promise.reject({ code: 'internal', message: 'boom' })
      if (!hold) return Promise.resolve(answer([]))
      return new Promise((res) => pending.push(() => res(answer([]))))
    },
    notify: (n) => notices.push(n),
  })
  return { a, sent, notices, pending, holdAnswers: () => (hold = true) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('open shows the view, empties the filter and runs archive.list', async () => {
  const { a, sent } = setup()
  a.filter = 'x'
  await a.open()
  expect([a.shown, a.filter]).toEqual([true, ''])
  expect(sent).toEqual([{ type: 'archive.list' }])
})

test('an answer is applied only while shown; close forgets the rows', async () => {
  const { a } = setup()
  a.applyArchive([row(1, 'a')])
  expect(a.rows).toBeNull()
  await a.open()
  a.applyArchive([row(1, 'a'), row(2, 'b')])
  a.filter = 'b'
  expect(a.visible().map((r) => r.id)).toEqual([2])
  expect(a.total()).toBe(2)
  a.close()
  expect([a.shown, a.rows]).toEqual([false, null])
})

test('a failed load is a notice', async () => {
  const { a, notices } = setup(true)
  await a.open()
  expect(notices).toEqual([{ kind: 'refused', message: 'boom' }])
})

test("another program's change reloads it, once at a time; our own echo does not; hidden, it takes nothing", async () => {
  const { a, sent, pending, holdAnswers } = setup()
  expect(a.changed(false)).toBe(false)
  await a.open()
  expect(a.changed(true)).toBe(true)
  expect(sent.length).toBe(1)
  holdAnswers()
  a.changed(false)
  a.changed(false)
  a.changed(false)
  await tick()
  expect(sent.length).toBe(2)
  pending.shift()!()
  await tick()
  await tick()
  expect(sent.length).toBe(3)
})
