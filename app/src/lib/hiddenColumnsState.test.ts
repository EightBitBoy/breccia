import { expect, test } from 'vitest'
import { HiddenColumns } from './hiddenColumns.svelte'

const cols = ['TODO', 'DOING', 'WAITING', 'DONE']

function make(saved: Record<string, unknown> = {}) {
  const saves: [string, Record<string, string[]>][] = []
  const h = new HiddenColumns({
    load: async (folder) => saved[folder] ?? {},
    save: async (folder, boards) => {
      saves.push([folder, structuredClone(boards)])
    },
  })
  return { h, saves }
}

test('hide saves the folder map; show takes it back', async () => {
  const { h, saves } = make()
  await h.open('C:\notes')
  h.hide('Tasks', 'WAITING', cols)
  expect([...h.of('Tasks', cols)]).toEqual(['WAITING'])
  expect(saves.at(-1)).toEqual(['C:\notes', { Tasks: ['WAITING'] }])
  h.hide('Tasks', 'DONE', cols)
  expect(saves.at(-1)).toEqual(['C:\notes', { Tasks: ['WAITING', 'DONE'] }])
  h.show('Tasks', 'WAITING')
  expect(saves.at(-1)).toEqual(['C:\notes', { Tasks: ['DONE'] }])
  h.show('Tasks', 'DONE')
  expect(saves.at(-1)).toEqual(['C:\notes', {}])
  expect(h.of('Tasks', cols).size).toBe(0)
})

test('the last visible column is not hidden', async () => {
  const { h, saves } = make()
  await h.open('C:\notes')
  h.hide('Focus', 'DOING', ['DOING', 'WAITING'])
  h.hide('Focus', 'WAITING', ['DOING', 'WAITING'])
  expect([...h.of('Focus', ['DOING', 'WAITING'])]).toEqual(['DOING'])
  expect(saves.length).toBe(1)
})

test('a board renamed in Breccia keeps its hidden columns', async () => {
  const { h, saves } = make({ 'C:\notes': { Tasks: ['WAITING'] } })
  await h.open('C:\notes')
  h.renamed('Tasks', 'Work')
  expect([...h.of('Work', cols)]).toEqual(['WAITING'])
  expect(h.of('Tasks', cols).size).toBe(0)
  expect(saves.at(-1)).toEqual(['C:\notes', { Work: ['WAITING'] }])
  h.renamed('Nothing', 'Else')
  expect(saves.length).toBe(1)
})

test('each folder has its own map, and nothing is saved without a folder', async () => {
  const { h, saves } = make({ 'C:\a': { Tasks: ['DONE'] }, 'C:\b': { Tasks: ['TODO', 7] } })
  await h.open('C:\a')
  expect([...h.of('Tasks', cols)]).toEqual(['DONE'])
  await h.open('C:\b')
  expect([...h.of('Tasks', cols)]).toEqual(['TODO'])
  await h.open(null)
  expect(h.of('Tasks', cols).size).toBe(0)
  h.hide('Tasks', 'DONE', cols)
  expect(saves).toEqual([])
})

test('a map that cannot be read is empty', async () => {
  const h = new HiddenColumns({ load: async () => Promise.reject(new Error('no')), save: async () => {} })
  await h.open('C:\a')
  expect(h.of('Tasks', cols).size).toBe(0)
})

test('a folder switch during a load keeps the newer folder', async () => {
  let release!: (v: unknown) => void
  const h = new HiddenColumns({
    load: (f) => (f === 'C:\slow' ? new Promise((r) => (release = r)) : Promise.resolve({ Tasks: ['DONE'] })),
    save: async () => {},
  })
  const slow = h.open('C:\slow')
  await h.open('C:\fast')
  release({ Tasks: ['TODO'] })
  await slow
  expect([...h.of('Tasks', cols)]).toEqual(['DONE'])
})

test('peek shows columns during a drag, and the drag end hides them again', () => {
  const { h } = make()
  h.peekOpen('WAITING')
  expect(h.peek.has('WAITING')).toBe(true)
  h.endPeek()
  expect(h.peek.size).toBe(0)
})
