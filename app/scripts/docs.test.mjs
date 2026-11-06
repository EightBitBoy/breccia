import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const DOCS = ['README.md', 'docs/format.md', 'docs/compatibility.md', 'docs/releasing.md', 'CHANGELOG.md']

// Drops fenced code blocks and inline code spans: link-like text there is an example, not a link.
function withoutCode(md) {
  const kept = []
  let fence = null
  for (const line of md.split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1].trim()) fence = null
      kept.push('')
    } else if (m) {
      fence = m[1]
      kept.push('')
    } else {
      kept.push(line)
    }
  }
  return kept.join('\n').replace(/(`+)(?:(?!\n[ \t]*\n)[\s\S])*?\1/g, '')
}

// Every inline link or image target and every reference definition target.
function linkTargets(md) {
  const text = withoutCode(md)
  const targets = []
  for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1])
  for (const m of text.matchAll(/^ {0,3}\[[^\]^][^\]]*\]:\s*<?(\S+?)>?(?:\s|$)/gm)) targets.push(m[1])
  return targets
}

// True when `rel` (relative to `base`) exists with every segment in exactly this letter case.
// The path is normalised first, so `..` and `.` segments resolve before the case check.
export function existsExactly(base, rel) {
  const full = resolve(base, rel)
  const root = resolve(base).split(sep)[0] + sep
  const parts = full.slice(root.length).split(sep).filter(Boolean)
  let dir = root
  for (const part of parts) {
    let names
    try {
      names = readdirSync(dir)
    } catch {
      return false
    }
    if (!names.includes(part)) return false
    dir = join(dir, part)
  }
  return existsSync(full)
}

const isExternal = (t) => /^(https?:|mailto:)/i.test(t) || t.startsWith('#')

describe('docs', () => {
  it('relative_links_resolve', () => {
    const broken = []
    for (const doc of DOCS) {
      expect(existsSync(join(root, doc)), doc).toBe(true)
      for (const t of linkTargets(read(doc))) {
        if (isExternal(t)) continue
        const path = decodeURIComponent(t.split('#')[0])
        if (!existsExactly(join(root, dirname(doc)), path)) broken.push(`${doc}: ${t}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('the_link_check_skips_code', () => {
    const md = '[a](x.md)\n`[b](inline.md)`\n```\n[c](fenced.md)\n```\n![i](img.png "t")\n[r]: ref.md\n'
    expect(linkTargets(md)).toEqual(['x.md', 'img.png', 'ref.md'])
  })

  it('the_link_check_skips_code_across_blank_lines_and_footnotes', () => {
    expect(linkTargets('`a\n\n[b](x.md)\n`c`')).toEqual(['x.md'])
    expect(linkTargets('text[^1]\n\n[^1]: some text\n[r]: ref.md\n')).toEqual(['ref.md'])
  })

  it('relative_links_must_match_case', () => {
    expect(existsExactly(root, 'README.md')).toBe(true)
    expect(existsExactly(root, 'README.MD')).toBe(false)
    expect(existsExactly(root, 'Docs/format.md')).toBe(false)
    expect(existsExactly(root, 'docs/FORMAT.md')).toBe(false)
    expect(existsExactly(join(root, 'docs'), '../README.md')).toBe(true)
    expect(existsExactly(join(root, 'docs'), '../README.MD')).toBe(false)
    expect(existsExactly(join(root, 'docs'), './format.md')).toBe(true)
    expect(existsExactly(root, 'docs/nope.md')).toBe(false)
  })

  it('readme_has_the_sections', () => {
    const readme = read('README.md')
    for (const h of ['## Features', '## Install', '## Your notes', '## Build from source', '## License']) {
      expect(readme).toMatch(new RegExp(`^${h}$`, 'm'))
    }
    const targets = linkTargets(readme)
    expect(targets).toContain('docs/images/journal.png')
    expect(targets).toContain('docs/images/board.png')
    const license = readme.slice(readme.indexOf('## License'))
    expect(license).toContain('[MIT License](LICENSE)')
  })

  // The owner chose the MIT License on 2026-11-01.
  it('the_license_is_mit', () => {
    expect(read('LICENSE').startsWith('MIT License\n\nCopyright (c) 2026 Stefan Härtel\n')).toBe(true)
  })
})
