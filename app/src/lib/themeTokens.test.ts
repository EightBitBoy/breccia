import { afterEach, expect, test, vi } from 'vitest'
import { themeTokens, watchThemeTokens } from './themeTokens.svelte'

const light: Record<string, string> = {
  '--bg': ' #fbfaf8',
  '--text': ' #2b2a28',
  '--link': ' #4b4bc4',
  '--tag': ' #2f7d6d',
  '--pc-wash': ' 28%',
  '--pc-l': ' 0.66',
  '--pc-cs': ' 1',
  '--pc-ds': ' 1',
}
const dark: Record<string, string> = { ...light, '--bg': ' #1b1b1d', '--text': ' #d9d9dc', '--pc-l': ' 0.6' }

/** A fake page: the computed style of `root`, its attribute observer and the colour scheme query. */
function fakePage() {
  const page = {
    style: light,
    styled: [] as unknown[],
    observed: [] as [unknown, MutationObserverInit | undefined][],
    mutate: () => {},
    disconnected: 0,
    schemeChange: null as (() => void) | null,
    query: '',
  }
  vi.stubGlobal('getComputedStyle', (el: unknown) => {
    page.styled.push(el)
    return { getPropertyValue: (n: string) => page.style[n] ?? '' }
  })
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(cb: () => void) {
        page.mutate = cb
      }
      observe(el: unknown, init?: MutationObserverInit) {
        page.observed.push([el, init])
      }
      disconnect() {
        page.disconnected++
      }
    },
  )
  vi.stubGlobal('matchMedia', (q: string) => {
    page.query = q
    return {
      addEventListener: (_: string, cb: () => void) => (page.schemeChange = cb),
      removeEventListener: (_: string, cb: () => void) => {
        if (page.schemeChange === cb) page.schemeChange = null
      },
    }
  })
  return page
}

afterEach(() => {
  vi.unstubAllGlobals()
  themeTokens.current = null
})

const root = { id: 'root' } as unknown as HTMLElement

test('reads the tokens of the root right away', () => {
  const page = fakePage()
  const stop = watchThemeTokens(root)
  expect(themeTokens.current).toEqual({
    bg: '#fbfaf8',
    text: '#2b2a28',
    link: '#4b4bc4',
    tag: '#2f7d6d',
    wash: 0.28,
    l: 0.66,
    cs: 1,
    ds: 1,
  })
  expect(page.styled).toContain(root)
  stop()
})

test('a theme change on the root reads them again, as a new object', () => {
  const page = fakePage()
  const stop = watchThemeTokens(root)
  const before = themeTokens.current
  expect(page.observed).toEqual([[root, { attributes: true, attributeFilter: ['data-theme'] }]])
  page.style = dark
  page.mutate()
  expect(themeTokens.current).not.toBe(before)
  expect(themeTokens.current?.bg).toBe('#1b1b1d')
  expect(themeTokens.current?.l).toBe(0.6)
  stop()
})

test('a change of the system colour scheme reads them again', () => {
  const page = fakePage()
  const stop = watchThemeTokens(root)
  expect(page.query).toBe('(prefers-color-scheme: dark)')
  const before = themeTokens.current
  page.style = dark
  page.schemeChange?.()
  expect(themeTokens.current).not.toBe(before)
  expect(themeTokens.current?.text).toBe('#d9d9dc')
  stop()
})

test('the returned function stops watching', () => {
  const page = fakePage()
  const stop = watchThemeTokens(root)
  stop()
  expect(page.disconnected).toBe(1)
  expect(page.schemeChange).toBeNull()
})

test('a theme without the tokens keeps the last ones and logs the error', () => {
  const page = fakePage()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const stop = watchThemeTokens(root)
  const before = themeTokens.current
  page.style = { ...light, '--pc-l': '' }
  page.mutate()
  expect(themeTokens.current).toBe(before)
  expect(error).toHaveBeenCalledOnce()
  error.mockRestore()
  stop()
})
