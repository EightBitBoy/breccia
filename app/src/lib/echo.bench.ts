import { test } from 'vitest'
import { Echoes } from './echo'
import type { PageView } from './types'

const text = 'x'.repeat(80)

function page(key: string, n: number): PageView {
  const blocks = Array.from({ length: n }, (_, i) => ({ id: i + 1, text, html: text, depth: 0 }))
  return { key, name: key, title: key, blocks } as unknown as PageView
}

const big = page('big', 2000)
const echoing = new Echoes()
echoing.ownPage(big)
const echo = structuredClone(big)

const others = new Echoes()
for (let i = 0; i < 8; i++) others.ownPage(page(`k${i}`, 40))
const stranger = page('other', 2000)

const days = Array.from({ length: 30 }, (_, i) => page(`day${i}`, 40))

// Vitest 5 hands `bench` to a test through its context.
test('echo detection', async ({ bench }) => {
  await bench
    .compare(
      bench('isOwnPage: a 2,000-block page that is an echo', () => {
        echoing.isOwnPage(echo)
      }),
      bench('isOwnPage: a 2,000-block page of another key, 8 own pages recorded', () => {
        others.isOwnPage(stranger)
      }),
      bench('ownPage + isOwnPage: 30 day pages of 40 blocks, one output per day', () => {
        const e = new Echoes()
        for (const d of days) {
          e.ownPage(d)
          e.isOwnPage(d)
        }
      }),
    )
})
