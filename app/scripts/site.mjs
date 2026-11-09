// The website in site/: assemble (copy screenshots and icons in), check, and a local preview.
// Node built-ins only. The checker is a small regex scanner: the site is hand-written, attributes are quoted.
import { createServer } from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const IMAGES = ['journal.png', 'board.png']
export const ICONS = ['icon.svg', '32x32.png', '128x128@2x.png']

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

export function assemble(root, siteDir = join(root, 'site')) {
  const copy = (from, to, names) => {
    mkdirSync(join(siteDir, to), { recursive: true })
    for (const n of names) copyFileSync(join(root, ...from, n), join(siteDir, to, n))
  }
  copy(['docs', 'images'], 'images', IMAGES)
  copy(['app', 'src-tauri', 'icons'], 'icons', ICONS)
}

// ---------------------------------------------------------------- checker

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:)/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function parseAttrs(text) {
  const attrs = {}
  for (const m of text.matchAll(/([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
    attrs[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? ''
  }
  return attrs
}

/** Classify a reference. kind: 'a' (link), 'req' (a request the page makes). */
function checkRef(ctx, value, kind, baseDir) {
  const v = value.trim()
  if (v === '' || v === '#' || /^(?:data|mailto|tel):/i.test(v)) return
  if (/^http:/i.test(v)) return ctx.add(`http: is not allowed: ${v}`)
  if (/^https:/i.test(v)) {
    if (kind !== 'a') ctx.add(`external request: ${v}`)
    return
  }
  if (v.startsWith('//')) return ctx.add(`external request: ${v}`)
  if (ABSOLUTE.test(v)) return ctx.add(`unsupported reference: ${v}`)
  if (v.startsWith('/')) return ctx.add(`root-absolute path (the site lives under /breccia/): ${v}`)
  if (v.startsWith('#')) {
    ctx.anchors.push(v)
    return
  }
  let path = v.split(/[?#]/)[0]
  try {
    path = decodeURI(path)
  } catch {
    // keep the raw path
  }
  const target = resolve(baseDir, path)
  const rel = relative(ctx.siteDir, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return ctx.add(`reference leaves the site: ${v}`)
  const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')))
  if (!ok) ctx.add(`missing file: ${v}`)
}

function checkCss(ctx, css, baseDir) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*?))\s*\)/gi)) {
    const v = (m[1] ?? m[2] ?? m[3]).trim()
    if (v.startsWith('#')) continue
    checkRef(ctx, v, 'req', baseDir)
  }
  for (const m of text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) checkRef(ctx, m[1] ?? m[2], 'req', baseDir)
}

function checkJs(ctx, js, baseDir) {
  if (/document\.cookie/.test(js)) ctx.add('document.cookie is not allowed')
  const imports = /\bimport\s*(?:[\w\s{},*$]+?\s*\bfrom\s*)?(['"])([^'"]+)\1|\bimport\s*\(\s*(['"])([^'"]+)\3/g
  for (const m of js.matchAll(imports)) checkRef(ctx, m[2] ?? m[4], 'req', baseDir)
  // a fetch() of a relative path is resolved against the site root (the page's folder)
  for (const m of js.matchAll(/\bfetch\(\s*(['"])([^'"]+)\1/g)) checkRef(ctx, m[2], 'req', ctx.siteDir)
}

function checkHtml(ctx, html, baseDir) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '')
  const ids = new Map()
  const metas = []
  const headings = []
  const stack = []
  let hasTitle = false
  let hasLang = false
  let hasIcon = false
  let imgCount = 0
  let lastButton = null
  const buttons = []

  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g
  let pos = 0
  let m
  while ((m = tagRe.exec(text))) {
    const [, closing, rawName, rest] = m
    const name = rawName.toLowerCase()
    if (lastButton) lastButton.text += text.slice(pos, m.index)
    pos = tagRe.lastIndex
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack.length = i
          break
        }
      }
      if (name === 'button' && lastButton) {
        buttons.push(lastButton)
        lastButton = null
      }
      continue
    }
    const attrs = parseAttrs(rest)
    const hidden = stack.some((s) => s.hidden) || attrs['aria-hidden'] === 'true'
    if (!VOID.has(name) && !rest.trimEnd().endsWith('/')) stack.push({ name, hidden: attrs['aria-hidden'] === 'true' })

    if (name === 'script' || name === 'style') {
      const end = text.toLowerCase().indexOf(`</${name}`, tagRe.lastIndex)
      const body = text.slice(tagRe.lastIndex, end < 0 ? text.length : end)
      if (body.trim()) (name === 'script' ? checkJs : checkCss)(ctx, body, baseDir)
      if (end >= 0) tagRe.lastIndex = end
      pos = tagRe.lastIndex
    }

    const isSocial = name === 'meta' && /^(?:og|twitter):/.test(attrs.property ?? attrs.name ?? '')
    for (const [attr, value] of Object.entries(attrs)) {
      if (/^on[a-z]+$/.test(attr)) ctx.add(`inline handler ${attr}="${value}"`)
      if (attr === 'target' && value.toLowerCase() === '_blank') ctx.add('target="_blank" is not allowed')
      if (attr === 'style') checkCss(ctx, `x{${value}}`, baseDir)
      if (attr === 'id') ids.set(value, (ids.get(value) ?? 0) + 1)
      if (isSocial && attr === 'content') continue
      if (/\bhttp:\/\//i.test(value) && attr !== 'href' && attr !== 'src' && attr !== 'srcset') {
        ctx.add(`http: is not allowed: ${value}`)
      } else if (attr === 'href' || attr === 'src') {
        checkRef(ctx, value, name === 'a' ? 'a' : 'req', baseDir)
      } else if (attr === 'srcset') {
        for (const entry of value.split(',')) {
          const url = entry.trim().split(/\s+/)[0]
          if (url) checkRef(ctx, url, 'req', baseDir)
        }
      }
    }

    if (name === 'html' && attrs.lang) hasLang = true
    if (name === 'title') hasTitle = true
    if (name === 'meta') metas.push(attrs)
    if (name === 'link' && /\bicon\b/i.test(attrs.rel ?? '')) hasIcon = true
    if (/^h[1-6]$/.test(name)) headings.push(Number(name[1]))
    if (name === 'button') lastButton = { text: '', label: attrs['aria-label'] ?? '', id: attrs.id }
    if (name === 'img') {
      imgCount++
      const src = attrs.src ?? '(no src)'
      if (!('alt' in attrs)) ctx.add(`image ${src}: missing alt`)
      else if (attrs.alt.trim() === '' && !hidden) ctx.add(`image ${src}: empty alt outside aria-hidden`)
      for (const dim of ['width', 'height']) {
        if (!/^\d+$/.test(attrs[dim] ?? '')) ctx.add(`image ${src}: missing numeric ${dim}`)
      }
      if (imgCount > 1 && attrs.loading !== 'lazy') ctx.add(`image ${src}: needs loading="lazy"`)
    }
  }

  const meta = (key) => metas.find((a) => (a.property ?? a.name) === key)
  if (!hasLang) ctx.add('missing <html lang>')
  if (!metas.some((a) => 'charset' in a)) ctx.add('missing <meta charset>')
  if (!meta('viewport')) ctx.add('missing viewport meta')
  if (!hasTitle) ctx.add('missing <title>')
  if (!meta('description')) ctx.add('missing description meta')
  if (!hasIcon) ctx.add('missing <link rel="icon"> (icon)')
  for (const key of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'twitter:card']) {
    const a = meta(key)
    if (!a) ctx.add(`missing ${key}`)
    else if (key === 'og:image' && !/^https:\/\//.test(a.content ?? '')) {
      ctx.add(`og:image must be an absolute https URL: ${a.content ?? ''}`)
    } else if (key === 'twitter:card' && a.content !== 'summary_large_image') {
      ctx.add(`twitter:card must be summary_large_image: ${a.content ?? ''}`)
    }
  }
  const h1 = headings.filter((h) => h === 1).length
  if (h1 !== 1) ctx.add(`needs exactly one h1, found ${h1}`)
  headings.forEach((h, i) => {
    if (h > (i === 0 ? 1 : headings[i - 1] + 1)) ctx.add(`heading level skipped: h${h} after ${i ? 'h' + headings[i - 1] : 'nothing'}`)
  })
  for (const b of buttons) {
    if (!b.label.trim() && !b.text.replace(/<[^>]*>/g, '').trim()) ctx.add(`button without text or aria-label${b.id ? ` (#${b.id})` : ''}`)
  }
  for (const [id, n] of ids) if (n > 1) ctx.add(`duplicate id "${id}"`)
  for (const a of ctx.anchors.splice(0)) if (!ids.has(a.slice(1))) ctx.add(`missing anchor target: ${a}`)
}

export function checkSite(siteDir) {
  const problems = []
  const dir = resolve(siteDir)
  if (!existsSync(join(dir, 'index.html'))) problems.push('index.html: missing')
  for (const file of walk(dir)) {
    const ext = extname(file).toLowerCase()
    if (!['.html', '.css', '.js'].includes(ext)) continue
    const name = relative(dir, file).split('\\').join('/')
    const ctx = { siteDir: dir, anchors: [], add: (msg) => problems.push(`${name}: ${msg}`) }
    const text = readFileSync(file, 'utf8')
    if (ext === '.html') checkHtml(ctx, text, dirname(file))
    else if (ext === '.css') checkCss(ctx, text, dirname(file))
    else checkJs(ctx, text, dirname(file))
  }
  return problems
}

// ---------------------------------------------------------------- preview

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

export function serve(siteDir, port = 4173) {
  const root = resolve(siteDir)
  const server = createServer((req, res) => {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'cache-control': 'no-store', ...headers })
      res.end(body)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed')
    const url = (req.url ?? '/').split(/[?#]/)[0]
    if (url === '/') return send(302, '', { location: '/breccia/' })
    if (!url.startsWith('/breccia/')) return send(404, 'not found')
    let rest
    try {
      rest = decodeURIComponent(url.slice('/breccia/'.length))
    } catch {
      return send(404, 'not found')
    }
    if (rest === '') rest = 'index.html'
    const file = resolve(root, rest)
    const rel = relative(root, file)
    if (rest.includes('\0') || rel.startsWith('..') || isAbsolute(rel)) return send(404, 'not found')
    if (!existsSync(file) || !statSync(file).isFile()) return send(404, 'not found')
    send(200, readFileSync(file), { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
  })
  server.listen(port, '127.0.0.1')
  return server
}

// ---------------------------------------------------------------- CLI

function main(argv) {
  const [cmd, ...rest] = argv
  const siteDir = join(REPO, 'site')
  if (cmd === 'assemble') {
    assemble(REPO)
  } else if (cmd === 'check') {
    assemble(REPO)
    const problems = checkSite(siteDir)
    if (problems.length) {
      for (const p of problems) console.error(p)
      process.exit(1)
    }
    console.log(`site check: OK (${walk(siteDir).length} files)`)
  } else if (cmd === 'serve') {
    const i = rest.indexOf('--port')
    const port = i >= 0 ? Number(rest[i + 1]) : 4173
    assemble(REPO)
    const server = serve(siteDir, port)
    server.on('listening', () => console.log(`http://127.0.0.1:${server.address().port}/breccia/`))
  } else {
    console.error('usage: site.mjs assemble | check | serve [--port N]')
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
