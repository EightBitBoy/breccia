import { describe, expect, it } from 'vitest'
import { Zoom } from './zoom.svelte'

function make(start = 100) {
  const applied: number[] = []
  const saved: number[] = []
  const z = new Zoom({ apply: async (f) => void applied.push(f), save: async (p) => void saved.push(p) })
  z.restore(start)
  return { z, applied, saved }
}

describe('Zoom', () => {
  it('restore applies a stored level without saving it again', () => {
    const { z, applied, saved } = make(125)
    expect(z.percent).toBe(125)
    expect(applied).toEqual([1.25])
    expect(saved).toEqual([])
  })
  it('restore of nothing at 100 % applies nothing', () => {
    const { applied } = make(100)
    expect(applied).toEqual([])
  })
  it('in and out apply and save the new level; reset goes to 100', async () => {
    const { z, applied, saved } = make()
    await z.step(1)
    await z.step(1)
    await z.step(-1)
    expect(z.percent).toBe(110)
    await z.reset()
    expect(z.percent).toBe(100)
    expect(applied).toEqual([1.1, 1.25, 1.1, 1])
    expect(saved).toEqual([110, 125, 110, 100])
  })
  it('does nothing at the end of the range', async () => {
    const { z, applied } = make(200)
    applied.length = 0
    await z.step(1)
    expect(applied).toEqual([])
  })
  it('a failed apply keeps the old level', async () => {
    const z = new Zoom({ apply: async () => { throw new Error('no') }, save: async () => {} })
    z.restore(100)
    await z.step(1)
    expect(z.percent).toBe(100)
  })
})
