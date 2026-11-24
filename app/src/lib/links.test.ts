import { expect, test } from 'vitest'
import { headingBlock, linkClick, linkHeading } from './links'

const a = (
  className: string,
  dataPage: string | null,
  href: string | null = null,
  dataName: string | null = null,
) => ({
  className,
  dataPage,
  dataName,
  href,
})

test('a page link opens the name as written', () => {
  expect(linkClick(a('link', 'project x', null, 'Project X'))).toEqual({
    kind: 'page',
    name: 'Project X',
    link: true,
  })
})

test('a link opens the name the core gives', () => {
  expect(linkClick(a('link', '2026-10-29', null, '2026-10-29'))).toEqual({
    kind: 'page',
    name: '2026-10-29',
    link: true,
  })
  expect(linkClick(a('tag', 'infra', null, 'Infra'))).toEqual({ kind: 'page', name: 'Infra', link: false })
})

test('without data-name the key is used', () => {
  expect(linkClick(a('link', 'project x'))).toEqual({ kind: 'page', name: 'project x', link: true })
})

test('an external link opens its href', () => {
  expect(linkClick(a('ext', null, 'https://example.com'))).toEqual({
    kind: 'external',
    url: 'https://example.com',
  })
  expect(linkClick(a('ext', null, null))).toEqual({ kind: 'none' })
})

test('other anchors do nothing', () => {
  expect(linkClick(a('', null, 'https://example.com'))).toEqual({ kind: 'none' })
  expect(linkClick(a('other', 'x', null, 'x'))).toEqual({ kind: 'none' })
})

test('a page link clicked with Ctrl or Cmd does nothing; an external link still opens', () => {
  expect(linkClick({ ...a('link', 'project x', null, 'Project X'), mod: true })).toEqual({ kind: 'none' })
  expect(linkClick({ ...a('tag', 'infra', null, 'Infra'), mod: true })).toEqual({ kind: 'none' })
  expect(linkClick({ ...a('ext', null, 'https://example.com'), mod: true })).toEqual({
    kind: 'external',
    url: 'https://example.com',
  })
})

test('a page link says it is a link, so a heading link opens its page; a tag does not', () => {
  expect(linkClick({ className: 'link', dataPage: 'page#setup', dataName: 'Page#Setup', href: null })).toEqual({
    kind: 'page',
    name: 'Page#Setup',
    link: true,
  })
  expect(linkClick({ className: 'tag', dataPage: 'page#tag', dataName: 'Page#tag', href: null })).toEqual({
    kind: 'page',
    name: 'Page#tag',
    link: false,
  })
})

test('a heading link names its heading; a plain link, a tag or an empty part names none', () => {
  expect(linkHeading('Page#Plans')).toBe('Plans')
  expect(linkHeading('Page # Plans and more ')).toBe('Plans and more')
  expect(linkHeading('Page#A#B')).toBe('A#B')
  expect(linkHeading('Page')).toBeNull()
  expect(linkHeading('#Plans')).toBeNull()
  expect(linkHeading('Page#')).toBeNull()
  expect(linkHeading('Page#  ')).toBeNull()
})

const b = (id: number, text: string) => ({ id, text })

test('a heading is found by its text, trimmed and in any case, at any level', () => {
  const blocks = [b(1, 'intro'), b(2, '## Old plans'), b(3, '### Plans  '), b(4, '# Plans')]
  expect(headingBlock(blocks, 'plans')).toBe(3)
  expect(headingBlock(blocks, ' OLD PLANS ')).toBe(2)
  expect(headingBlock([b(1, '###### Deep')], 'deep')).toBe(1)
  expect(headingBlock([b(1, '# Closed ##')], 'Closed')).toBe(1)
  expect(headingBlock([b(1, '# Two\nlines')], 'two')).toBe(1)
})

test('no heading matches: text that only names it, more than six #, no space, or a later line', () => {
  expect(headingBlock([b(1, 'Plans')], 'Plans')).toBeNull()
  expect(headingBlock([b(1, '####### Plans')], 'Plans')).toBeNull()
  expect(headingBlock([b(1, '#Plans')], 'Plans')).toBeNull()
  expect(headingBlock([b(1, 'intro\n# Plans')], 'Plans')).toBeNull()
  expect(headingBlock([b(1, '# Plans later')], 'Plans')).toBeNull()
  expect(headingBlock([], 'Plans')).toBeNull()
})
