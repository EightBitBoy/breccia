import { expect, test } from 'vitest'
import { linkClick } from './links'

const a = (
  className: string,
  text: string,
  dataPage: string | null,
  href: string | null = null,
  dataName: string | null = null,
) => ({
  className,
  text,
  dataPage,
  dataName,
  href,
})

test('a page link opens the name as written', () => {
  expect(linkClick(a('link', 'Project X', 'project x', null, 'Project X'))).toEqual({
    kind: 'page',
    name: 'Project X',
    link: true,
  })
})

test('a link opens the name the core gives', () => {
  expect(linkClick(a('link', 'Thursday, 29 Oct 2026', '2026-10-29', null, '2026-10-29'))).toEqual({
    kind: 'page',
    name: '2026-10-29',
    link: true,
  })
  expect(linkClick(a('tag', '#Infra', 'infra', null, 'Infra'))).toEqual({ kind: 'page', name: 'Infra', link: false })
})

test('without data-name the key is used', () => {
  expect(linkClick(a('link', 'Project X', 'project x'))).toEqual({ kind: 'page', name: 'project x', link: true })
})

test('an external link opens its href', () => {
  expect(linkClick(a('ext', 'site', null, 'https://example.com'))).toEqual({
    kind: 'external',
    url: 'https://example.com',
  })
  expect(linkClick(a('ext', 'site', null, null))).toEqual({ kind: 'none' })
})

test('other anchors do nothing', () => {
  expect(linkClick(a('', 'x', null, 'https://example.com'))).toEqual({ kind: 'none' })
  expect(linkClick(a('other', 'x', 'x', null, 'x'))).toEqual({ kind: 'none' })
})

test('a page link clicked with Ctrl or Cmd does nothing; an external link still opens', () => {
  expect(linkClick({ ...a('link', 'Project X', 'project x', null, 'Project X'), mod: true })).toEqual({ kind: 'none' })
  expect(linkClick({ ...a('tag', '#Infra', 'infra', null, 'Infra'), mod: true })).toEqual({ kind: 'none' })
  expect(linkClick({ ...a('ext', 'site', null, 'https://example.com'), mod: true })).toEqual({
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
