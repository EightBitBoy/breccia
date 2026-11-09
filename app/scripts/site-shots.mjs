// Screenshots and checks of the website in headless Edge. Writes PNGs to target/site-shots/.
// Prints one PASS line per assertion; any FAIL line makes the exit code 1. Without Edge: "SKIP Edge not found", exit 0.
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { assemble, serve } from './site.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(REPO, 'target', 'site-shots')
const WIDTHS = [375, 768, 1280]
const SCHEMES = ['dark', 'light']

let failed = 0
function check(ok, what, detail = '') {
  if (ok) console.log(`PASS ${what}`)
  else {
    failed++
    console.log(`FAIL ${what}${detail ? ` (${detail})` : ''}`)
  }
}

/** Scroll to the bottom in steps and wait until every img is complete with naturalWidth > 0. */
async function loadAllImages(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, innerHeight / 2)
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => requestAnimationFrame(r))
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForFunction(
    () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    undefined,
    { timeout: 10000 },
  ).catch(() => {})
}

/** Collect requests, responses and console problems on a page. */
function watch(page) {
  const seen = { requests: [], responses: [], errors: [] }
  page.on('request', (r) => seen.requests.push(r.url()))
  page.on('response', (r) => seen.responses.push({ url: r.url(), status: r.status() }))
  page.on('console', (m) => {
    if (m.type() === 'error') seen.errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => seen.errors.push(`pageerror: ${e.message}`))
  return seen
}

async function main() {
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
  } catch (e) {
    console.log(`SKIP Edge not found (${String(e.message).split('\n')[0]})`)
    return
  }
  assemble(REPO)
  mkdirSync(OUT, { recursive: true })
  const server = serve(join(REPO, 'site'), 0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/breccia/`
  try {
    for (const width of WIDTHS) {
      for (const scheme of SCHEMES) {
        const tag = `${width} ${scheme}`
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: scheme,
          reducedMotion: 'reduce',
        })
        const page = await ctx.newPage()
        const seen = watch(page)
        await page.goto(url, { waitUntil: 'load' })
        await loadAllImages(page)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(OUT, `${width}-${scheme}.png`), fullPage: true })

        const foreign = seen.requests.filter((u) => new URL(u).hostname !== '127.0.0.1')
        check(foreign.length === 0, `${tag}: every request goes to 127.0.0.1`, foreign.join(', '))
        const bad = seen.responses.filter((r) => r.status >= 400)
        check(
          bad.length === 0 && seen.responses.length > 0,
          `${tag}: every response has status < 400`,
          bad.map((r) => `${r.status} ${r.url}`).join(', '),
        )
        check(seen.errors.length === 0, `${tag}: no console error, no page error`, seen.errors.join(' | '))
        const dims = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: innerWidth,
        }))
        check(dims.sw <= dims.iw, `${tag}: no sideways scroll`, `scrollWidth ${dims.sw} > ${dims.iw}`)
        if (width === 375) {
          const pre = await page.evaluate(() => {
            const p = document.querySelector('pre')
            const s = getComputedStyle(p)
            return { sw: p.scrollWidth, cw: p.clientWidth, ox: s.overflowX }
          })
          check(
            pre.ox === 'auto' && pre.sw > pre.cw && dims.sw <= dims.iw,
            `${tag}: the code block scrolls inside its own box`,
            JSON.stringify(pre),
          )
        }
        const imgs = await page.evaluate(() =>
          [...document.images].map((i) => ({
            src: i.getAttribute('src'),
            ok: i.complete && i.naturalWidth > 0,
          })),
        )
        const broken = imgs.filter((i) => !i.ok).map((i) => i.src)
        check(imgs.length > 0 && broken.length === 0, `${tag}: all ${imgs.length} images loaded`, broken.join(', '))
        const shot = await page.evaluate(() => {
          const i = document.querySelector('img.shot')
          return i && { ok: i.complete && i.naturalWidth > 0, opacity: getComputedStyle(i).opacity }
        })
        check(!!shot && shot.ok && shot.opacity === '1', `${tag}: img.shot is loaded and opaque`, JSON.stringify(shot))
        await ctx.close()
      }
    }

    // Without JavaScript (own context): the screenshot shows, the toggle stays hidden.
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        javaScriptEnabled: false,
      })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'load' })
      const box = await page.locator('img.shot').boundingBox()
      const vis = await page.locator('img.shot').isVisible()
      check(vis && !!box && box.width > 0 && box.height > 0, 'no JavaScript: the screenshot is visible')
      const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('img.shot')).opacity)
      check(opacity === '1', 'no JavaScript: the screenshot is opaque', `opacity ${opacity}`)
      check(!(await page.locator('button.scheme').isVisible()), 'no JavaScript: button.scheme is hidden')
      await ctx.close()
    }

    // With JavaScript: the toggle, the reload, the keyboard.
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'load' })
      const button = page.locator('button.scheme')
      check(await button.isVisible(), 'toggle: button.scheme is visible with JavaScript')
      await button.click()
      await page.waitForFunction(() => document.documentElement.getAttribute('data-scheme') === 'light')
      check((await button.getAttribute('aria-pressed')) === 'true', 'toggle: aria-pressed is true after the click')
      await page.reload({ waitUntil: 'load' })
      const kept = await page.evaluate(() => document.documentElement.getAttribute('data-scheme'))
      check(kept === 'light', 'toggle: data-scheme="light" is kept after a reload', `got ${kept}`)
      check((await page.locator('button.scheme').getAttribute('aria-pressed')) === 'true', 'toggle: aria-pressed kept after a reload')

      let focused = false
      for (let i = 0; i < 40 && !focused; i++) {
        await page.keyboard.press('Tab')
        focused = await page.evaluate(() => document.activeElement?.matches('a.download') ?? false)
      }
      check(focused, 'keyboard: Tab reaches the download link')
      if (focused) {
        const ring = await page.evaluate(() => {
          const s = getComputedStyle(document.activeElement)
          return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }
        })
        check(
          (ring.style !== 'none' && ring.width > 0) || ring.shadow !== 'none',
          'keyboard: the focused download link has a focus ring',
          JSON.stringify(ring),
        )
        await page.screenshot({ path: join(OUT, 'focus.png') })
      }
      await ctx.close()
    }
  } finally {
    server.close()
    await browser.close()
  }
}

await main()
if (failed) {
  console.log(`${failed} check(s) failed`)
  process.exit(1)
}
