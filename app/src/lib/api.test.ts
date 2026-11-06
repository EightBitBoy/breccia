import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createClient, flushBeforeClose } from './api'
import type { Command, Output } from './types'

function emptyOutput(): Output {
  return { page: null, focus: null, notices: [], folder: null, config: null, refs: null, names: null, tree: null, changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [] }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('flushes pending text before the next command', async () => {
  const sent: Command[] = []
  const c = createClient(async (r) => {
    sent.push(r.command)
    return emptyOutput()
  })
  c.setTextDebounced(1, 'ab')
  await c.run({ type: 'block.split', id: 1, at: 2 })
  expect(sent.map((x) => x.type)).toEqual(['block.setText', 'block.split'])
  expect(sent[0]).toMatchObject({ id: 1, text: 'ab' })
})

test('debounces typing to one setText after 300 ms', async () => {
  const sent: Command[] = []
  const c = createClient(async (r) => {
    sent.push(r.command)
    return emptyOutput()
  })
  c.setTextDebounced(1, 'a')
  await vi.advanceTimersByTimeAsync(100)
  c.setTextDebounced(1, 'ab')
  await vi.advanceTimersByTimeAsync(100)
  c.setTextDebounced(1, 'abc')
  await vi.advanceTimersByTimeAsync(299)
  expect(sent).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'abc' }])
})

test('flush sends pending text immediately and only once', async () => {
  const sent: Command[] = []
  const c = createClient(async (r) => {
    sent.push(r.command)
    return emptyOutput()
  })
  c.setTextDebounced(2, 'x')
  await c.flush()
  expect(sent).toEqual([{ type: 'block.setText', id: 2, text: 'x' }])
  await vi.advanceTimersByTimeAsync(1000)
  expect(sent).toHaveLength(1)
})

test('runs commands in call order even when invoke resolves out of order', async () => {
  const sent: string[] = []
  const delays = [50, 10, 30]
  let n = 0
  const c = createClient(
    (r) =>
      new Promise<Output>((resolve) => {
        const d = delays[n++]
        setTimeout(() => {
          sent.push(r.command.type)
          resolve(emptyOutput())
        }, d)
      }),
  )
  const done: string[] = []
  const ps = [
    c.run({ type: 'folder.status' }).then(() => done.push('a')),
    c.run({ type: 'config.get' }).then(() => done.push('b')),
    c.run({ type: 'page.today' }).then(() => done.push('c')),
  ]
  await vi.advanceTimersByTimeAsync(200)
  await Promise.all(ps)
  expect(sent).toEqual(['folder.status', 'config.get', 'page.today'])
  expect(done).toEqual(['a', 'b', 'c'])
})

test('a failed command does not block the queue', async () => {
  let n = 0
  const c = createClient(async () => {
    if (n++ === 0) throw { code: 'x', message: 'boom' }
    return emptyOutput()
  })
  await expect(c.run({ type: 'folder.status' })).rejects.toMatchObject({ code: 'x' })
  await expect(c.run({ type: 'config.get' })).resolves.toEqual(emptyOutput())
})

test('sends the current generation', async () => {
  const gens: number[] = []
  const c = createClient(async (r) => {
    gens.push(r.generation)
    return emptyOutput()
  })
  await c.run({ type: 'folder.status' })
  c.setGeneration(3)
  await c.run({ type: 'folder.status' })
  expect(gens).toEqual([0, 3])
})

test('setText keeps the generation it was typed under', async () => {
  const gens: number[] = []
  const c = createClient(async (r) => {
    gens.push(r.generation)
    return emptyOutput()
  })
  c.setGeneration(2)
  c.setTextDebounced(1, 'a')
  c.setGeneration(5)
  await c.flush()
  await c.run({ type: 'folder.status' })
  expect(gens).toEqual([2, 5])
})

test('debounced sends report output and errors through the hooks', async () => {
  const outs: Output[] = []
  const errs: unknown[] = []
  const failed: Output = {
    ...emptyOutput(),
    notices: [{ kind: 'saveFailed', page: 'p', reason: 'io', message: 'm' }],
  }
  let n = 0
  const c = createClient(
    async () => {
      if (n++ === 0) return failed
      throw { code: 'unknownBlock', message: 'x' }
    },
    { onOutput: (o) => outs.push(o), onError: (e) => errs.push(e) },
  )
  c.setTextDebounced(1, 'a')
  await vi.advanceTimersByTimeAsync(300)
  expect(outs).toEqual([failed])
  c.setTextDebounced(1, 'b')
  await vi.advanceTimersByTimeAsync(300)
  expect(errs).toEqual([{ code: 'unknownBlock', message: 'x' }])
})

test('run results reach onOutput and run errors reject only to the caller', async () => {
  const outs: Output[] = []
  const errs: unknown[] = []
  let n = 0
  const c = createClient(
    async () => {
      if (n++ === 1) throw new Error('boom')
      return emptyOutput()
    },
    { onOutput: (o) => outs.push(o), onError: (e) => errs.push(e) },
  )
  await c.run({ type: 'folder.status' })
  await expect(c.run({ type: 'folder.status' })).rejects.toThrow('boom')
  expect(outs).toHaveLength(1)
  expect(errs).toEqual([])
})

test('a throwing onOutput does not break the queue', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = createClient(async () => emptyOutput(), {
    onOutput: () => {
      throw new Error('hook')
    },
  })
  await c.run({ type: 'folder.status' })
  await expect(c.run({ type: 'config.get' })).resolves.toEqual(emptyOutput())
  await expect(c.flush()).resolves.toBeUndefined()
  spy.mockRestore()
})

test('a throwing onError does not break the queue', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  let n = 0
  const c = createClient(
    async () => {
      if (n++ === 0) throw new Error('send')
      return emptyOutput()
    },
    {
      onError: () => {
        throw new Error('hook')
      },
    },
  )
  c.setTextDebounced(1, 'a')
  await vi.advanceTimersByTimeAsync(300)
  await expect(c.run({ type: 'config.get' })).resolves.toEqual(emptyOutput())
  expect(spy).toHaveBeenCalled()
  spy.mockRestore()
})

test('cancel drops pending text of one block only', async () => {
  const sent: Command[] = []
  const c = createClient(async (r) => {
    sent.push(r.command)
    return emptyOutput()
  })
  c.setTextDebounced(1, 'a')
  c.setTextDebounced(2, 'b')
  c.cancel(1)
  await vi.advanceTimersByTimeAsync(300)
  await c.flush()
  expect(sent).toEqual([{ type: 'block.setText', id: 2, text: 'b' }])
})

test('closing sends pending text and waits for it to be written', async () => {
  const sent: Command[] = []
  let written = false
  const c = createClient(async (r) => {
    sent.push(r.command)
    await new Promise((res) => setTimeout(res, 200))
    written = true
    return emptyOutput()
  })
  c.setTextDebounced(1, 'last word')
  let closed = false
  const p = flushBeforeClose(c).then(() => (closed = true))
  await vi.advanceTimersByTimeAsync(199)
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'last word' }])
  expect(closed).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await p
  expect(written).toBe(true)
})

test('closing also sends text that applying an answer left pending', async () => {
  const sent: Command[] = []
  let carried = false
  const c = createClient(
    async (r) => {
      sent.push(r.command)
      return emptyOutput()
    },
    {
      onOutput: () => {
        if (carried) return
        carried = true
        c.setTextDebounced(2, 'typed during the split')
      },
    },
  )
  void c.run({ type: 'block.split', id: 1, at: 0 })
  await flushBeforeClose(c)
  expect(sent).toEqual([
    { type: 'block.split', id: 1, at: 0 },
    { type: 'block.setText', id: 2, text: 'typed during the split' },
  ])
})

test('closing goes on after the time limit when a command hangs', async () => {
  const c = createClient(() => new Promise<Output>(() => {}))
  c.setTextDebounced(1, 'x')
  let closed = false
  const p = flushBeforeClose(c, 1000).then(() => (closed = true))
  await vi.advanceTimersByTimeAsync(999)
  expect(closed).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await p
  expect(closed).toBe(true)
})

test('closing never rejects', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(flushBeforeClose({ flush: () => Promise.reject(new Error('x')) })).resolves.toBeUndefined()
})

test('hooks get the command of each output and of each failed background send', async () => {
  const outs: [Output, Command][] = []
  const errs: [unknown, Command][] = []
  const out = emptyOutput()
  const err = { code: 'unknownBlock', message: 'x' }
  const c = createClient(
    async (r) => {
      if (r.command.type === 'page.today') return out
      throw err
    },
    { onOutput: (o, cmd) => outs.push([o, cmd]), onError: (e, cmd) => errs.push([e, cmd]) },
  )
  await c.run({ type: 'page.today' })
  c.setTextDebounced(1, 'x')
  await c.flush()
  expect(outs).toEqual([[out, { type: 'page.today' }]])
  expect(errs).toEqual([[err, { type: 'block.setText', id: 1, text: 'x' }]])
})

test('reports unsaved text from the first keystroke until the write is answered', async () => {
  let release: () => void = () => {}
  const states: boolean[] = []
  const c = createClient(
    () => new Promise<Output>((res) => (release = () => res(emptyOutput()))),
    { onUnsaved: (u) => states.push(u) },
  )
  c.setTextDebounced(1, 'a')
  expect(states).toEqual([true])
  c.setTextDebounced(1, 'ab') // still one pending write: no repeat
  await vi.advanceTimersByTimeAsync(300)
  expect(states).toEqual([true]) // sent, not yet answered
  release()
  await vi.advanceTimersByTimeAsync(0)
  expect(states).toEqual([true, false])
})

test('cancelled text is no longer unsaved', () => {
  const states: boolean[] = []
  const c = createClient(async () => emptyOutput(), { onUnsaved: (u) => states.push(u) })
  c.setTextDebounced(1, 'a')
  c.cancel(1)
  expect(states).toEqual([true, false])
})
