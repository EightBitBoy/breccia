import { expect, test, vi } from 'vitest'
import { closeOnPressOutside } from './pressOutside'

/** A press whose target is `target`, as the document's capture listener sees it. */
function press(doc: EventTarget, target: unknown, button = 0) {
  const e = new Event('pointerdown')
  Object.defineProperty(e, 'target', { value: target })
  Object.defineProperty(e, 'button', { value: button })
  doc.dispatchEvent(e)
}

const inside = { id: 'day' }
const outside = { id: 'block text' }
const isInside = (t: EventTarget | null) => t === (inside as unknown)

test('a press outside closes at once, before any timer runs', () => {
  vi.useFakeTimers()
  try {
    const doc = new EventTarget()
    const close = vi.fn()
    closeOnPressOutside(doc, isInside, close)
    press(doc, outside)
    expect(close).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

test('the press is decided when it happens, even if its element is gone right after', () => {
  const doc = new EventTarget()
  const removed = { isConnected: false }
  const close = vi.fn()
  closeOnPressOutside(doc, isInside, close)
  press(doc, removed)
  expect(close).toHaveBeenCalledTimes(1)
})

test('a press inside does not close', () => {
  const doc = new EventTarget()
  const close = vi.fn()
  closeOnPressOutside(doc, isInside, close)
  press(doc, inside)
  expect(close).not.toHaveBeenCalled()
})

test('a press with any button outside closes', () => {
  const doc = new EventTarget()
  const close = vi.fn()
  closeOnPressOutside(doc, isInside, close)
  press(doc, outside, 2)
  expect(close).toHaveBeenCalledTimes(1)
})

test('it listens in the capture phase, and stops when undone', () => {
  // Node's EventTarget does not remove a capture listener, so this document only records them.
  const listeners: { type: string; fn: unknown; capture: unknown }[] = []
  const doc = {
    addEventListener: (type: string, fn: unknown, capture: unknown) => listeners.push({ type, fn, capture }),
    removeEventListener: (type: string, fn: unknown, capture: unknown) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
      if (i >= 0) listeners.splice(i, 1)
    },
  } as unknown as EventTarget
  const undo = closeOnPressOutside(doc, isInside, vi.fn())
  expect(listeners).toEqual([{ type: 'pointerdown', fn: expect.any(Function), capture: true }])
  undo()
  expect(listeners).toEqual([])
})
