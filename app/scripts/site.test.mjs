import { get } from 'node:http'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ICONS, IMAGES, assemble, checkSite, serve } from './site.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Breccia</title>
<meta name="description" content="An outliner.">
<meta property="og:title" content="Breccia">
<meta property="og:description" content="An outliner.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://example.github.io/breccia/">
<meta property="og:image" content="https://example.github.io/breccia/images/a.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="icons/icon.svg">
<link rel="stylesheet" href="style.css">`

const page = (body, head = HEAD, lang = ' lang="en"') =>
  `<!doctype html>\n<html${lang}><head>\n${head}\n</head><body>\n${body}\n</body></html>\n`

const BODY = `<h1>Breccia</h1>
<h2 id="why">Why</h2>
<a href="#why">Why</a>
<img src="images/a.png" alt="A shot" width="10" height="10">
<script type="module" src="main.js"></script>`

const VALID = page(BODY)

const roots = []
function fixture(files = {}, { base = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'site-test-'))
  roots.push(root)
  const siteDir = join(root, 'site')
  const all = base
    ? {
        'index.html': VALID,
        'style.css': 'body { color: red }',
        'main.js': 'export const x = 1',
        'icons/icon.svg': '<svg/>',
        'images/a.png': 'png',
        ...files,
      }
    : files
  mkdirSync(siteDir)
  for (const [name, text] of Object.entries(all)) {
    const file = join(siteDir, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return siteDir
}
const withBody = (body) => ({ 'index.html': page(body) })
const withHead = (head) => ({ 'index.html': page(BODY, head) })

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function request(port, path) {
  return new Promise((ok, fail) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }))
    }).on('error', fail)
  })
}

describe('checkSite', () => {
  it('a_valid_page_has_no_problems', () => {
    expect(checkSite(fixture())).toEqual([])
  })

  it('refuses_a_missing_alt', () => {
    const p = checkSite(fixture(withBody(BODY.replace(' alt="A shot"', ''))))
    expect(p).toEqual([expect.stringContaining('images/a.png')])
    expect(p[0]).toContain('alt')
  })

  it('allows_empty_alt_only_inside_aria_hidden', () => {
    const plain = BODY.replace('alt="A shot"', 'alt=""')
    expect(checkSite(fixture(withBody(plain)))).toEqual([expect.stringContaining('images/a.png')])
    const hidden = BODY.replace(
      /<img[^>]*>/,
      '<div aria-hidden="true"><span><img src="images/a.png" alt="" width="10" height="10"></span></div>',
    )
    expect(checkSite(fixture(withBody(hidden)))).toEqual([])
  })

  it('refuses_an_image_without_size', () => {
    const p = checkSite(fixture(withBody(BODY.replace(' width="10"', ''))))
    expect(p).toEqual([expect.stringContaining('images/a.png')])
    expect(p[0]).toContain('width')
  })

  it('refuses_an_eager_image_below_the_first', () => {
    const second = '<img src="images/b.png" alt="B" width="10" height="10">'
    const files = { 'images/b.png': 'png' }
    expect(checkSite(fixture({ ...files, ...withBody(BODY + second.replace('>', ' loading="lazy">')) }))).toEqual([])
    const p = checkSite(fixture({ ...files, ...withBody(BODY + second) }))
    expect(p).toEqual([expect.stringContaining('images/b.png')])
  })

  it('refuses_a_missing_local_file', () => {
    const p = checkSite(fixture(withBody(BODY + '<a href="gone.html">x</a>')))
    expect(p).toEqual([expect.stringContaining('gone.html')])
  })

  it('refuses_a_missing_anchor', () => {
    const p = checkSite(fixture(withBody(BODY + '<a href="#nowhere">x</a>')))
    expect(p).toEqual([expect.stringContaining('#nowhere')])
  })

  it('refuses_root_absolute_paths', () => {
    const p = checkSite(fixture(withBody(BODY.replace('src="images/a.png"', 'src="/images/a.png"'))))
    expect(p).toEqual([expect.stringContaining('/images/a.png')])
    expect(p[0]).toContain('root-absolute')
  })

  it('refuses_an_external_script_or_stylesheet', () => {
    const s = checkSite(fixture(withBody(BODY + '<script src="https://cdn.example.com/x.js"></script>')))
    expect(s).toEqual([expect.stringContaining('https://cdn.example.com/x.js')])
    const l = checkSite(fixture(withHead(HEAD + '<link rel="stylesheet" href="//fonts.example.com/f.css">')))
    expect(l).toEqual([expect.stringContaining('//fonts.example.com/f.css')])
  })

  it('refuses_an_external_css_url_and_import', () => {
    const u = checkSite(fixture({ 'style.css': 'a { background: url("https://x.example.com/a.png") }' }))
    expect(u).toEqual([expect.stringContaining('https://x.example.com/a.png')])
    const i = checkSite(fixture({ 'style.css': '@import "https://x.example.com/b.css";' }))
    expect(i).toEqual([expect.stringContaining('https://x.example.com/b.css')])
    expect(checkSite(fixture({ 'style.css': 'a { background: url(images/a.png) }' }))).toEqual([])
  })

  it('refuses_a_fetch_to_another_origin', () => {
    const p = checkSite(fixture({ 'main.js': "fetch('https://api.example.com/v1')" }))
    expect(p).toEqual([expect.stringContaining('https://api.example.com/v1')])
    const i = checkSite(fixture({ 'main.js': "import { a } from 'https://esm.example.com/a.js'" }))
    expect(i).toEqual([expect.stringContaining('https://esm.example.com/a.js')])
  })

  it('allows_external_links_and_og_urls', () => {
    const body = BODY + '<a href="https://github.com/EightBitBoy/breccia">Source</a>'
    expect(checkSite(fixture(withBody(body)))).toEqual([])
  })

  it('refuses_http_links', () => {
    const p = checkSite(fixture(withBody(BODY + '<a href="http://example.com/x">x</a>')))
    expect(p).toEqual([expect.stringContaining('http://example.com/x')])
  })

  it('refuses_cookies_and_target_blank', () => {
    const c = checkSite(fixture({ 'main.js': 'document.cookie = "a=b"' }))
    expect(c).toEqual([expect.stringContaining('document.cookie')])
    const t = checkSite(fixture(withBody(BODY + '<a href="https://example.com" target="_blank">x</a>')))
    expect(t).toEqual([expect.stringContaining('_blank')])
  })

  it('refuses_inline_handlers', () => {
    const p = checkSite(fixture(withBody(BODY + '<div onclick="go()">x</div>')))
    expect(p).toEqual([expect.stringContaining('onclick')])
  })

  it('refuses_skipped_heading_levels', () => {
    const p = checkSite(fixture(withBody(BODY + '<h4>deep</h4>')))
    expect(p).toEqual([expect.stringContaining('h4')])
  })

  it('refuses_two_h1', () => {
    const p = checkSite(fixture(withBody(BODY + '<h1>Again</h1>')))
    expect(p).toEqual([expect.stringContaining('h1')])
  })

  it('refuses_missing_social_meta', () => {
    for (const key of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'twitter:card']) {
      const head = HEAD.split('\n')
        .filter((l) => !l.includes(`"${key}"`))
        .join('\n')
      const p = checkSite(fixture(withHead(head)))
      expect(p, key).toEqual([expect.stringContaining(key)])
    }
    const relative = HEAD.replace('https://example.github.io/breccia/images/a.png', 'images/a.png')
    expect(checkSite(fixture(withHead(relative)))).toEqual([expect.stringContaining('og:image')])
    const card = HEAD.replace('summary_large_image', 'summary')
    expect(checkSite(fixture(withHead(card)))).toEqual([expect.stringContaining('twitter:card')])
  })

  it('refuses_missing_head_meta', () => {
    const cases = {
      lang: { 'index.html': page(BODY, HEAD, '') },
      charset: withHead(HEAD.replace('<meta charset="utf-8">', '')),
      viewport: withHead(HEAD.replace(/<meta name="viewport"[^>]*>/, '')),
      title: withHead(HEAD.replace('<title>Breccia</title>', '')),
      description: withHead(HEAD.replace(/<meta name="description"[^>]*>/, '')),
      icon: withHead(HEAD.replace(/<link rel="icon"[^>]*>/, '')),
    }
    for (const [name, files] of Object.entries(cases)) {
      const p = checkSite(fixture(files))
      expect(p, name).toEqual([expect.stringContaining(name)])
    }
  })

  it('refuses_a_missing_srcset_or_import_target', () => {
    const img =
      '<img srcset="images/a.png 1x, images/gone@2x.png 2x" src="images/a.png" alt="x" width="1" height="1" loading="lazy">'
    const s = checkSite(fixture(withBody(BODY + img)))
    expect(s).toEqual([expect.stringContaining('images/gone@2x.png')])
    const i = checkSite(fixture({ 'main.js': "import { a } from './missing.js'" }))
    expect(i).toEqual([expect.stringContaining('./missing.js')])
    expect(checkSite(fixture({ 'main.js': "import './other.js'", 'other.js': '' }))).toEqual([])
  })

  it('refuses_a_site_without_index', () => {
    const p = checkSite(fixture({ 'style.css': '' }, { base: false }))
    expect(p).toEqual(['index.html: missing'])
  })

  it('refuses_a_button_without_a_name', () => {
    const p = checkSite(fixture(withBody(BODY + '<button id="b"><svg></svg></button>')))
    expect(p).toEqual([expect.stringContaining('button')])
    expect(checkSite(fixture(withBody(BODY + '<button aria-label="Theme"><svg></svg></button>')))).toEqual([])
    expect(checkSite(fixture(withBody(BODY + '<button>Go</button>')))).toEqual([])
  })

  it('refuses_duplicate_ids', () => {
    const p = checkSite(fixture(withBody(BODY + '<p id="why">again</p>')))
    expect(p).toEqual([expect.stringContaining('"why"')])
  })
})

describe('assemble', () => {
  it('assemble_copies_screenshots_and_icons', () => {
    const siteDir = fixture({}, { base: false })
    assemble(REPO, siteDir)
    for (const f of IMAGES) {
      expect(statSync(join(siteDir, 'images', f)).size).toBe(statSync(join(REPO, 'docs', 'images', f)).size)
    }
    for (const f of ICONS) {
      expect(statSync(join(siteDir, 'icons', f)).size).toBe(statSync(join(REPO, 'app', 'src-tauri', 'icons', f)).size)
    }
    expect(IMAGES.length + ICONS.length).toBe(5)
  })
})

describe('serve', () => {
  it('serve_maps_breccia_and_refuses_escapes', async () => {
    const siteDir = fixture()
    writeFileSync(join(siteDir, '..', 'secret.txt'), 'TOP-SECRET')
    const server = serve(siteDir, 0)
    await once(server, 'listening')
    const { port } = server.address()
    try {
      const root = await request(port, '/')
      expect(root.status).toBe(302)
      expect(root.headers.location).toBe('/breccia/')
      const index = await request(port, '/breccia/')
      expect(index.status).toBe(200)
      expect(index.headers['content-type']).toContain('text/html')
      expect(index.body).toContain('<h1>Breccia</h1>')
      const css = await request(port, '/breccia/style.css')
      expect(css.status).toBe(200)
      expect(css.headers['content-type']).toContain('text/css')
      for (const path of [
        '/breccia/..%2fsecret.txt',
        '/breccia/../secret.txt',
        '/breccia/..%5csecret.txt',
        '/breccia/%2e%2e/secret.txt',
        '/other',
        '/breccia/nothing.html',
      ]) {
        const r = await request(port, path)
        expect(r.status, path).toBe(404)
        expect(r.body, path).not.toContain('TOP-SECRET')
      }
    } finally {
      server.close()
      server.closeAllConnections()
    }
  })
})

// ---------------------------------------------------------------- the real site

const read = (...p) => readFileSync(join(REPO, ...p), 'utf8')

/** The body of the rule whose selector is exactly `selector` (blocks here have no nested braces). */
function block(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^{}]*)\\}`, 'm').exec(css)
  if (!m) throw new Error(`no block ${selector}`)
  return m[1]
}
const props = (body, names) =>
  Object.fromEntries([...body.matchAll(new RegExp(`(${names})\\s*:\\s*([^;]+);`, 'g'))].map((m) => [m[1], m[2].trim()]))
const PALETTE = '--pc-(?!wash|l\\b|cs|ds)[a-z]+(?![a-z-])'
const SCHEME = '--(?:bg|surface|text|muted|accent|on-accent|focus)(?![a-z-])'
const palette = (body) => props(body, PALETTE)

const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('the real site', () => {
  it('the_real_site_passes_the_check', () => {
    assemble(REPO)
    expect(checkSite(join(REPO, 'site'))).toEqual([])
  })

  it('site_palette_matches_the_app', () => {
    const tokens = read('app', 'src', 'styles', 'tokens.css')
    const css = read('site', 'site.css')
    const appLight = palette(block(tokens, ':root, [data-theme="light"]'))
    const appDark = palette(block(tokens, '[data-theme="dark"]'))
    expect(Object.keys(appLight)).toHaveLength(25)
    expect(Object.keys(appDark)).toHaveLength(25)
    expect(palette(block(css, ':root'))).toEqual(appDark)
    expect(palette(block(css, '[data-scheme="light"]'))).toEqual(appLight)
    expect(palette(block(css, ':root:not([data-scheme])'))).toEqual(appLight)
  })

  it('site_text_has_enough_contrast', () => {
    const css = read('site', 'site.css')
    for (const sel of [':root', '[data-scheme="light"]', ':root:not([data-scheme])']) {
      const p = props(block(css, sel), SCHEME)
      expect(Object.keys(p), sel).toHaveLength(7)
      for (const v of Object.values(p)) expect(v, sel).toMatch(/^#[0-9a-f]{6}$/)
      const pairs = [
        ['--text', '--bg'],
        ['--text', '--surface'],
        ['--muted', '--bg'],
        ['--muted', '--surface'],
        ['--on-accent', '--accent'],
      ]
      for (const [fg, bg] of pairs) {
        expect(contrast(p[fg], p[bg]), `${sel} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(p['--focus'], p['--bg']), `${sel} focus`).toBeGreaterThanOrEqual(3)
    }
  })

  it('site_copy_comes_from_the_readme', () => {
    const html = read('site', 'index.html')
    const tagline = 'Breccia is a notes app where the fragments of everyday work and tasks bind into one body of knowledge.'
    const rock = 'Breccia is a rock made of broken fragments cemented together into one stone.'
    expect(read('README.md')).toContain(tagline)
    expect(read('README.md')).toContain(rock)
    expect(html).toContain(tagline)
    expect(html).toContain(rock)
    expect(html).toContain('href="https://github.com/EightBitBoy/breccia/releases/latest"')
    expect(html).not.toMatch(/\d+\.\d+\.\d+/)
    const names = [
      'Journal',
      'Pages, links and tags',
      'Page colors',
      'Tasks and Kanban boards',
      'Git sync',
      'Six themes',
      'Graph',
      'Local-first, plain Markdown',
      'Keyboard-driven',
    ]
    for (const h of names) expect(html, h).toMatch(new RegExp(`<h3[^>]*>\\s*${h}\\s*</h3>`))
  })
})
