// How a web address typed into the text is shown in a rendered block. Display only: the text on disk and the link's
// target are untouched, and the block being edited always shows the raw text.

export interface LinkDisplay {
  /** Leave out `https://` (or `http://`). */
  hideScheme: boolean
  /** Show only the first characters after the host, then an ellipsis. */
  shorten: boolean
}

/** How many characters after the host's `/` stay visible when shortening. */
export const SHORT_LENGTH = 8

// The core writes a bare address as `<a class="ext" href="U">U</a>` with U escaped the same way twice.
const BARE = /<a class="ext" href="([^"]*)">([^<]*)<\/a>/g
const SCHEME = /^https?:\/\//

/** The first `n` characters of escaped text (an entity such as `&amp;` counts as one), and whether more followed. */
function head(escaped: string, n: number): { text: string; cut: boolean } {
  const parts = escaped.match(/&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);|[\s\S]/gu) ?? []
  return { text: parts.slice(0, n).join(''), cut: parts.length > n }
}

/** `html` with each bare web address's visible text changed as `opts` ask; named links and mail links stay as they are. */
export function shortenLinks(html: string, opts: LinkDisplay): string {
  if (!opts.hideScheme && !opts.shorten) return html
  return html.replace(BARE, (whole, href: string, text: string) => {
    if (href !== text || !SCHEME.test(text)) return whole
    let shown = text
    if (opts.shorten) {
      const slash = text.indexOf('/', text.indexOf('//') + 2)
      if (slash >= 0) {
        const { text: kept, cut } = head(text.slice(slash + 1), SHORT_LENGTH)
        if (cut) shown = `${text.slice(0, slash + 1)}${kept}…`
      }
    }
    if (opts.hideScheme) shown = shown.replace(SCHEME, '')
    return `<a class="ext" href="${href}">${shown}</a>`
  })
}
