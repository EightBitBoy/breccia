import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isChecked, nextReset } from './dailies'

let oldTz: string | undefined

beforeAll(() => {
  oldTz = process.env.TZ
  process.env.TZ = 'Europe/Berlin'
})
afterAll(() => {
  if (oldTz === undefined) delete process.env.TZ
  else process.env.TZ = oldTz
})

describe('summer time', () => {
  it('runs in Europe/Berlin', () => {
    expect(new Date(2026, 2, 29, 2, 30).getHours()).toBe(3)
  })
  it('a reset inside the spring gap moves forward', () => {
    const n = nextReset(new Date(2026, 2, 29, 1, 0), '02:30')
    expect(n.getTime()).toBe(new Date(2026, 2, 29, 3, 30).getTime())
    expect(n.getHours()).toBe(3)
    expect(n.getMinutes()).toBe(30)
  })
  it('after the gap a check from before it is not checked', () => {
    expect(isChecked('2026-03-29 01:50', new Date(2026, 2, 29, 3, 10), '02:30')).toBe(false)
  })
})

describe('end of summer time', () => {
  it('the first 02:30 is the next reset', () => {
    const start = new Date(Date.UTC(2026, 9, 25, 0, 0)) // 02:00 CEST, first pass
    const n = nextReset(new Date(2026, 9, 25, 1, 0), '02:30')
    expect(n.getTime()).toBe(start.getTime() + 30 * 60_000)
  })
  it('a check at the second 02:45 counts at the second 02:50', () => {
    const second245 = new Date(Date.UTC(2026, 9, 25, 1, 45))
    expect(second245.getHours()).toBe(2)
    expect(isChecked('2026-10-25 02:45', new Date(Date.UTC(2026, 9, 25, 1, 50)), '02:30')).toBe(true)
  })
})
