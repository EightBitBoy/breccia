import { describe, expect, it } from 'vitest'
import { shortenLinks } from './linkDisplay'

const a = (url: string, text = url) => `<a class="ext" href="${url}">${text}</a>`
const both = { hideScheme: true, shorten: true, trimSlash: false }
const off = { hideScheme: false, shorten: false, trimSlash: false }

describe('shortenLinks', () => {
  it('changes nothing when both options are off', () => {
    const html = `<p>${a('https://x.com/some/very/long/link')}</p>`
    expect(shortenLinks(html, off)).toBe(html)
  })

  it('hides the scheme and keeps the href', () => {
    expect(shortenLinks(a('https://x.com/a'), { ...off, hideScheme: true })).toBe(a('https://x.com/a', 'x.com/a'))
    expect(shortenLinks(a('http://x.com/a'), { ...off, hideScheme: true })).toBe(a('http://x.com/a', 'x.com/a'))
  })

  it('keeps 8 characters after the host and adds an ellipsis', () => {
    expect(shortenLinks(a('https://x.com/some/very/long/link'), { ...off, shorten: true })).toBe(
      a('https://x.com/some/very/long/link', 'https://x.com/some/ver…'),
    )
    expect(shortenLinks(a('https://x.com/some/very/long/link'), both)).toBe(
      a('https://x.com/some/very/long/link', 'x.com/some/ver…'),
    )
  })

  it('leaves a short path alone, with no ellipsis', () => {
    expect(shortenLinks(a('https://x.com/12345678'), both)).toBe(a('https://x.com/12345678', 'x.com/12345678'))
    expect(shortenLinks(a('https://x.com'), both)).toBe(a('https://x.com', 'x.com'))
  })

  it('counts a query and an escaped character as the path text, not as markup', () => {
    expect(shortenLinks(a('https://x.com/p?a=1&amp;b=2&amp;c=3'), both)).toBe(a('https://x.com/p?a=1&amp;b=2&amp;c=3', 'x.com/p?a=1&amp;b=…'))
  })

  it('does not touch a link whose text is its own words, or a mail link', () => {
    const named = a('https://x.com/some/very/long/link', 'my link')
    expect(shortenLinks(named, both)).toBe(named)
    const mail = a('mailto:me@x.com', 'me@x.com')
    expect(shortenLinks(mail, both)).toBe(mail)
  })

  it('trims one trailing slash from the shown text only', () => {
    const trim = { ...off, trimSlash: true }
    expect(shortenLinks(a('https://x.com/docs/'), trim)).toBe(a('https://x.com/docs/', 'https://x.com/docs'))
    expect(shortenLinks(a('https://x.com/'), { ...trim, hideScheme: true })).toBe(a('https://x.com/', 'x.com'))
    expect(shortenLinks(a('https://x.com/a//'), trim)).toBe(a('https://x.com/a//', 'https://x.com/a/'))
    expect(shortenLinks(a('https://x.com/a?b=/'), trim)).toBe(a('https://x.com/a?b=/', 'https://x.com/a?b='))
    expect(shortenLinks(a('https://x.com/docs'), trim)).toBe(a('https://x.com/docs'))
  })

  it('trims before shortening, so a path that then fits keeps no ellipsis', () => {
    expect(shortenLinks(a('https://x.com/12345678/'), { ...both, trimSlash: true })).toBe(
      a('https://x.com/12345678/', 'x.com/12345678'),
    )
    expect(shortenLinks(a('https://x.com/12345678/'), both)).toBe(a('https://x.com/12345678/', 'x.com/12345678…'))
  })
})
