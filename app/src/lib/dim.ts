function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The marks the editor dims: `[[`, `]]`, the `#` of a tag, and a task keyword
 * at the start of a line followed by a space or the line end. Highlighting only:
 * the core decides what the text means. Groups 1-4 hold any text before the dimmed part.
 */
export function dimPattern(keywords: string[]): RegExp {
  const kws = keywords.filter(Boolean).map(escapeRe)
  const kw = kws.length ? `|^()(?:${kws.join('|')})(?= |$)` : ''
  return new RegExp(`()\\[\\[|()\\]\\]|(^|\\s)#(?=[^\\s#])${kw}`, 'g')
}

/** The dimmed part of one match of `dimPattern`, and whether it is a keyword. */
export function dimRange(m: RegExpMatchArray): { from: number; to: number; keyword: boolean } {
  const lead = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
  const from = m.index! + lead.length
  return { from, to: m.index! + m[0].length, keyword: m[4] !== undefined }
}

/** The [from, to) ranges `dimPattern` dims in `line` (offsets in the line). */
export function dimRanges(line: string, keywords: string[], firstLine = true): [number, number][] {
  const out: [number, number][] = []
  for (const m of line.matchAll(dimPattern(keywords))) {
    const r = dimRange(m)
    if (r.keyword && !firstLine) continue
    out.push([r.from, r.to])
  }
  return out
}
