import { expect, test } from 'vitest'
import { applyTheme, parseTheme, storedTheme, windowTheme } from './theme'

import tokensCss from '../styles/tokens.css?raw'

const css = tokensCss

/** Custom properties of a block, in a name -> value map. */
function props(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  return props(css.slice(open + 1, css.indexOf('}', open)))
}

test('every theme defines every token', () => {
  const light = block(':root, [data-theme="light"]')
  const names = Object.keys(light).sort()
  expect(names.length).toBeGreaterThan(20)
  for (const t of ['dark', 'violet', 'graphite', 'taupe', 'teal']) {
    expect(Object.keys(block(`[data-theme="${t}"]`)).sort(), t).toEqual(names)
  }
  const media = block(':root:not([data-theme])')
  expect(media).toEqual(block('[data-theme="dark"]'))
  expect(block('[data-theme="violet"]')['--bg']).toBe('#1e1a2c')
  expect(block('[data-theme="violet"]')['--c-violet']).toBe('#8fd0ff')
  expect(block('[data-theme="graphite"]')['--bg']).toBe('#2c2f33')
  // the teal theme's two surfaces: the main view and the sidebar
  expect(block('[data-theme="teal"]')['--bg']).toBe('#002b36')
  expect(block('[data-theme="teal"]')['--side']).toBe('#023643')
})

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a #rrggbb colour: ${hex}`)
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

test('luminance rejects short colours', () => {
  expect(() => luminance('#fff')).toThrow()
})

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('faded is visible but quieter than text in every theme', () => {
  const sels = [':root, [data-theme="light"]', ...['dark', 'violet', 'graphite', 'taupe', 'teal'].map((t) => `[data-theme="${t}"]`), ':root:not([data-theme])']
  for (const s of sels) {
    const b = block(s)
    const faded = contrast(b['--faded'], b['--bg'])
    expect(faded, s).toBeGreaterThan(1.7)
    expect(faded, s).toBeLessThan(2.4)
    expect(faded, s).toBeGreaterThan(contrast(b['--line'], b['--bg']))
  }
})

const sources = import.meta.glob('/src/**/*.{css,svelte,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

test('no colour literals outside tokens', () => {
  const funcs = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/
  const hex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/
  // a named colour as a value of a colour property
  const named =
    /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?|fill|stroke|outline(?:-color)?)\s*:\s*(?:[^;{}]*\s)?(?:white|black|red|blue|green|gray|grey)\b(?!-)/
  const files = Object.entries(sources).filter(
    ([p]) => !/\.(test|bench)\.ts$/.test(p) && !p.endsWith('/styles/tokens.css'),
  )
  expect(files.length).toBeGreaterThan(20)
  const hits: string[] = []
  for (const [p, text] of files) {
    text.split('\n').forEach((l, i) => {
      if (hex.test(l) || funcs.test(l) || named.test(l)) hits.push(`${p}:${i + 1}: ${l.trim()}`)
    })
  }
  expect(hits).toEqual([])
})

test('parseTheme', () => {
  expect(parseTheme('violet')).toBe('violet')
  expect(parseTheme('pink')).toBe('system')
  expect(parseTheme(null)).toBe('system')
  expect(parseTheme(3)).toBe('system')
})

test('windowTheme and storedTheme', () => {
  expect(['light', 'taupe', 'dark', 'violet', 'graphite', 'teal', 'system'].map((t) => windowTheme(t as never))).toEqual([
    'light', 'light', 'dark', 'dark', 'dark', 'dark', null,
  ])
  expect(storedTheme('system')).toBeNull()
  expect(storedTheme('taupe')).toBe('taupe')
})

test('applyTheme sets or clears the attribute and the window theme', async () => {
  const root: { dataset: DOMStringMap } = { dataset: {} }
  const calls: unknown[] = []
  applyTheme('taupe', root, async (t) => void calls.push(t))
  expect(root.dataset.theme).toBe('taupe')
  applyTheme('system', root, async (t) => void calls.push(t))
  expect('theme' in root.dataset).toBe(false)
  expect(calls).toEqual(['light', null])
  const errs: unknown[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => void errs.push(a)
  try {
    expect(() => applyTheme('dark', root, () => Promise.reject(new Error('x')))).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  } finally {
    console.error = orig
  }
  expect(errs.length).toBe(1)
})
