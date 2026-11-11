import { describe, expect, it } from 'vitest'
import text from 'virtual:changelog'
import { changelogNote, parseChangelog, parseInline, plainText, type Block, type Inline } from './changelog'

const t = (s: string): Inline => ({ kind: 'text', text: s })
const h = (level: 1 | 2 | 3, s: string, version: string | null = null): Block => ({
  kind: 'heading',
  level,
  inlines: [t(s)],
  version,
})
const p = (s: string): Block => ({ kind: 'paragraph', inlines: [t(s)] })
const list = (...items: string[]): Block => ({ kind: 'list', items: items.map((i) => [t(i)]) })

describe('parseChangelog', () => {
  const md = '# Changelog\n\nIntro.\n\n## [1.5.0] - 2026-11-11\n\n### Features\n\n- A\n- B\n'
  const expected = [p('Intro.'), h(2, '1.5.0 - 2026-11-11', '1.5.0'), h(3, 'Features'), list('A', 'B')]

  it('parses headings, paragraphs and lists', () => {
    expect(parseChangelog(md)).toEqual(expected)
  })
  it('handles CRLF', () => {
    expect(parseChangelog(md.replace(/\n/g, '\r\n'))).toEqual(expected)
  })
  it('strips a leading BOM before the first-line check', () => {
    expect(parseChangelog('\uFEFF# Changelog\n\nIntro.')).toEqual([p('Intro.')])
  })
  it('heading levels and versions', () => {
    expect(parseChangelog('## Unreleased')).toEqual([h(2, 'Unreleased')])
    expect(parseChangelog('#### Deep')).toEqual([h(3, 'Deep')])
    expect(parseChangelog('a\n\n# Title')).toEqual([p('a'), h(1, 'Title')])
  })
  it('does not treat a linked bracket as a version', () => {
    const [b] = parseChangelog('## [1.0](https://x.org) - d')
    expect(b).toMatchObject({ kind: 'heading', version: null })
  })
  it('joins indented lines to the item and keeps nested items', () => {
    expect(parseChangelog('- one\n  continued\n  - nested\n- two')).toEqual([list('one continued', 'nested', 'two')])
  })
  it('a lazy unindented line joins the item', () => {
    expect(parseChangelog('- one\nlazy\n- two')).toEqual([list('one lazy', 'two')])
  })
  it('a blank line splits lists; lines join into a paragraph', () => {
    expect(parseChangelog('- a\n\n- b')).toEqual([list('a'), list('b')])
    expect(parseChangelog('line one\nline two')).toEqual([p('line one line two')])
  })
  it('a heading or bullet ends a paragraph without a blank line', () => {
    expect(parseChangelog('text\n## H\nmore\n- x')).toEqual([p('text'), h(2, 'H'), p('more'), list('x')])
  })
  it('skips comment lines and keeps other markup literal', () => {
    expect(parseChangelog('<!-- 1 -->\n- a')).toEqual([list('a')])
    expect(parseChangelog('<b>x</b>')).toEqual([p('<b>x</b>')])
  })
  it('drops nothing in a hostile sample', () => {
    const input = '| a | b |\n1. one\n_em_ <script>x</script> & &amp;\n- [x](ftp://h) `c`'
    const out = plainText(parseChangelog(input))
    const words = (input.match(/\w+/g) ?? []).filter((w) => w !== 'ftp' && w !== 'h')
    for (const w of words) expect(out).toContain(w)
  })
})

describe('parseInline', () => {
  it('parses code, strong and links', () => {
    const r = parseInline('Use `Ctrl K` and **bold** [site](https://x.org) [rel](docs/a.md) [js](javascript:alert(1))')
    expect(r.slice(0, 6)).toEqual([
      t('Use '),
      { kind: 'code', text: 'Ctrl K' },
      t(' and '),
      { kind: 'strong', text: 'bold' },
      t(' '),
      { kind: 'link', text: 'site', href: 'https://x.org' },
    ])
    expect(r.filter((i) => i.kind === 'link')).toHaveLength(1)
    for (const i of r) if ('href' in i) expect(i.href.startsWith('http')).toBe(true)
    expect(r[6]).toEqual(t(' rel js)'))
    expect(r).toHaveLength(7)
  })
  it('keeps unclosed markers literal', () => {
    expect(parseInline('a `b and **c')).toEqual([t('a `b and **c')])
    expect(parseInline('2 * 3 _x_')).toEqual([t('2 * 3 _x_')])
  })
})

describe('changelogNote', () => {
  it('is null outside dev builds', () => {
    expect(changelogNote(false, '1.5.0')).toBeNull()
  })
  it('names the version in dev builds', () => {
    expect(changelogNote(true, '1.5.0')).toBe(
      'This is a development build of Breccia 1.5.0. Changes made since that release are not listed yet.',
    )
    expect(changelogNote(true, null)).toBe(
      'This is a development build of Breccia. Changes made since the last release are not listed yet.',
    )
  })
})

describe('the real CHANGELOG.md', () => {
  const blocks = parseChangelog(text)
  it('keeps every version heading', () => {
    const want = [...text.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1])
    const got = blocks.flatMap((b) => (b.kind === 'heading' && b.version !== null ? [b.version] : []))
    expect(got).toEqual(want)
  })
  it('keeps every list item', () => {
    const n = (text.match(/^\s*[-*+] /gm) ?? []).length
    const got = blocks.reduce((a, b) => a + (b.kind === 'list' ? b.items.length : 0), 0)
    expect(got).toBe(n)
  })
  it('keeps every word', () => {
    const shown = plainText(blocks)
    const lines = text
      .split(/\r?\n/)
      .slice(1)
      .filter((l) => l.trim() !== '' && !/^\s*<!--.*-->\s*$/.test(l))
      .map((l) => l.replace(/\]\([^)]*\)/g, ']'))
    for (const w of lines.join('\n').match(/\w+/g) ?? []) expect(shown).toContain(w)
  })
})
