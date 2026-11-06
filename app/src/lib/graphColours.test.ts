import { expect, test } from 'vitest'
import { GRAPH_TOKENS, readColours } from './graphColours'
import tokensCss from '../styles/tokens.css?raw'

function block(selector: string): string[] {
  const start = tokensCss.indexOf(selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const open = tokensCss.indexOf('{', start)
  const body = tokensCss.slice(open + 1, tokensCss.indexOf('}', open))
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])
}

test('every graph token exists in every theme', () => {
  expect(GRAPH_TOKENS.backdrop).toBe('--bg')
  const sels = [':root, [data-theme="light"]', ...['dark', 'violet', 'graphite', 'taupe', 'teal'].map((t) => `[data-theme="${t}"]`)]
  for (const s of sels) {
    const names = block(s)
    for (const v of Object.values(GRAPH_TOKENS)) expect(names, `${s} ${v}`).toContain(v)
  }
})

test('faded has its own token', () => {
  expect(GRAPH_TOKENS.faded).toBe('--faded')
})

test('readColours trims and falls back to --text', () => {
  const c = readColours((name) => (name === '--link' ? '  #123456 ' : name === '--text' ? '#eeeeee' : name === '--tag' ? '' : '#000000'))
  expect(c.page).toBe('#123456')
  expect(c.tag).toBe('#eeeeee')
  expect(c.label).toBe('#eeeeee')
  expect(c.backdrop).toBe('#000000')
})
