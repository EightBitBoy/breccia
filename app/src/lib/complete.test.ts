import { expect, test } from 'vitest'
import { completions, fuzzyTier, linkQuery, linkText } from './complete'

test('linkQuery', () => {
  expect(linkQuery('see [[Pro', '')).toEqual({ kind: 'page', from: 4, to: 9, query: 'Pro' })
  expect(linkQuery('see [[Pro', ']] x')).toEqual({ kind: 'page', from: 4, to: 11, query: 'Pro' })
  expect(linkQuery('see [[a]] b', '')).toBeNull()
  expect(linkQuery('x #an', '')).toEqual({ kind: 'tag', from: 2, to: 5, query: 'an' })
  expect(linkQuery('x#an', '')).toBeNull()
  expect(linkQuery('#[[multi wo', '')).toEqual({ kind: 'tag', from: 0, to: 11, query: 'multi wo' })
})

test('linkQuery: a bare trigger opens with an empty query; a plain tag ends at punctuation', () => {
  expect(linkQuery('[[', '')).toEqual({ kind: 'page', from: 0, to: 2, query: '' })
  expect(linkQuery('#', ' rest')).toEqual({ kind: 'tag', from: 0, to: 1, query: '' })
  expect(linkQuery('#a,', '')).toBeNull()
  expect(linkQuery('x #an', ']] y')).toEqual({ kind: 'tag', from: 2, to: 5, query: 'an' })
  expect(linkQuery('[[a\nb', '')).toBeNull()
  expect(linkQuery('😀 [[é', '')).toEqual({ kind: 'page', from: 3, to: 6, query: 'é' })
})

test('fuzzyTier', () => {
  expect(fuzzyTier('pro', 'Project X')).toBe(0)
  expect(fuzzyTier('rel', 'Website relaunch')).toBe(1)
  expect(fuzzyTier('pro', 'Reproduce')).toBe(2)
  expect(fuzzyTier('wrl', 'Website relaunch')).toBe(3)
  expect(fuzzyTier('pro', 'Expo')).toBeNull()
})

test('completions rank prefix, word, substring, subsequence; create comes last', () => {
  const names = ['Project X', 'Website relaunch', 'Expo', 'Reproduce', 'Prototype'].map((n) => ({ key: n.toLowerCase(), name: n, exists: true }))
  expect(completions(names, 'pro').map((i) => i.label)).toEqual(['Project X', 'Prototype', 'Reproduce', 'Create page “pro”'])
  expect(completions(names, 'project x').map((i) => i.kind)).toEqual(['page'])
})

test('completions: an empty query lists names by key; the limit holds', () => {
  const names = ['b', 'a', 'c'].map((n) => ({ key: n, name: n.toUpperCase(), exists: true }))
  expect(completions(names, '').map((i) => i.label)).toEqual(['A', 'B', 'C'])
  expect(completions(names, '  ', 2).map((i) => i.label)).toEqual(['A', 'B'])
  expect(completions(names, 'zz')).toEqual([{ kind: 'create', name: 'zz', label: 'Create page “zz”' }])
})

test('completions never offer a name the link syntax cannot hold', () => {
  const names = ['a]b', 'a[b', 'ab'].map((n) => ({ key: n, name: n, exists: true }))
  expect(completions(names, 'a').map((i) => i.label)).toEqual(['ab', 'Create page “a”'])
  expect(completions(names, '').map((i) => i.label)).toEqual(['ab'])
  expect(completions(names, 'a]').map((i) => i.kind)).toEqual([])
})

test('completions never offer a name with a pipe (it reads as an alias)', () => {
  const both = ['a|b', 'ab'].map((n) => ({ key: n, name: n, exists: true }))
  expect(completions(both, 'a').map((i) => i.label)).toEqual(['ab', 'Create page “a”'])
  const only = [{ key: 'ab', name: 'ab', exists: true }]
  expect(completions(only, 'a|b').map((i) => i.kind)).toEqual([])
})

test('linkText writes safe tag syntax', () => {
  expect(linkText('page', 'A b')).toBe('[[A b]]')
  expect(linkText('tag', 'infra')).toBe('#infra')
  expect(linkText('tag', 'Project X')).toBe('#[[Project X]]')
  expect(linkText('tag', 'a.b')).toBe('#[[a.b]]')
})
