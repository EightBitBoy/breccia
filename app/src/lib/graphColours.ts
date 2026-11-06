// The colours sigma draws with, read from the theme's CSS custom properties at run time
// (no colour literal outside tokens.css).
export interface GraphColours {
  page: string
  journal: string
  tag: string
  missing: string
  line: string
  lineLit: string
  faded: string
  label: string
  /** The hover label's box; sigma's own default is white. */
  backdrop: string
}

export const GRAPH_TOKENS: Record<keyof GraphColours, string> = {
  page: '--link',
  journal: '--c-amber',
  tag: '--tag',
  missing: '--muted',
  line: '--line',
  lineLit: '--accent',
  faded: '--faded',
  label: '--text',
  backdrop: '--bg',
}

/** Reads every token with `read`, trimmed; an empty value falls back to `--text`. */
export function readColours(read: (name: string) => string): GraphColours {
  const fallback = read('--text').trim()
  const out = {} as GraphColours
  for (const k of Object.keys(GRAPH_TOKENS) as (keyof GraphColours)[]) {
    out[k] = read(GRAPH_TOKENS[k]).trim() || fallback
  }
  return out
}
