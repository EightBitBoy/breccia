// Parses CHANGELOG.md (written by git-cliff) into blocks the changelog overlay renders. Nothing is rendered as HTML:
// every marker that is not understood stays literal text.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[]; version: string | null }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; items: Inline[][] }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const pushText = (t: string) => {
    buf += t
  }
  const flush = () => {
    if (buf !== '') out.push({ kind: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '`') {
      const end = s.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ kind: 'code', text: s.slice(i + 1, end) })
        i = end + 1
        continue
      }
    } else if (c === '*' && s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ kind: 'strong', text: s.slice(i + 2, end) })
        i = end + 2
        continue
      }
    } else if (c === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(s.slice(i))
      if (m) {
        if (/^https?:\/\//.test(m[2])) {
          flush()
          out.push({ kind: 'link', text: m[1], href: m[2] })
        } else {
          pushText(m[1])
        }
        i += m[0].length
        continue
      }
    }
    pushText(c)
    i++
  }
  flush()
  return out
}

export function parseChangelog(md: string): Block[] {
  const lines = md.replace(/^\uFEFF/, '').split(/\r?\n/)
  const blocks: Block[] = []
  let para: string[] = []
  let items: string[] = []
  let seenContent = false

  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'paragraph', inlines: parseInline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (items.length) blocks.push({ kind: 'list', items: items.map(parseInline) })
    items = []
  }

  for (const line of lines) {
    if (line.trim() === '') {
      flushPara()
      flushList()
      continue
    }
    const first = !seenContent
    seenContent = true
    if (/^\s*<!--.*-->\s*$/.test(line)) continue
    const hm = /^\s{0,3}(#+)\s+(.*?)\s*$/.exec(line)
    if (hm) {
      flushPara()
      flushList()
      const level = hm[1].length >= 3 ? 3 : (hm[1].length as 1 | 2)
      if (first && level === 1) continue
      let text = hm[2]
      let version: string | null = null
      if (level === 2) {
        const vm = /^\[([^\]]+)\](?!\()/.exec(text)
        if (vm) {
          version = vm[1]
          text = vm[1] + text.slice(vm[0].length)
        }
      }
      blocks.push({ kind: 'heading', level, inlines: parseInline(text), version })
      continue
    }
    const bm = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bm) {
      flushPara()
      items.push(bm[1].trim())
      continue
    }
    if (items.length) {
      items[items.length - 1] += ' ' + line.trim()
    } else {
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return blocks
}

export function changelogNote(dev: boolean, version: string | null): string | null {
  if (!dev) return null
  return version === null
    ? 'This is a development build of Breccia. Changes made since the last release are not listed yet.'
    : `This is a development build of Breccia ${version}. Changes made since that release are not listed yet.`
}

const inlineText = (is: Inline[]) => is.map((i) => i.text).join('')

/** All text a reader sees, for tests: block texts joined by '\n'. */
export function plainText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === 'list' ? b.items.map(inlineText).join('\n') : inlineText(b.inlines)))
    .join('\n')
}
