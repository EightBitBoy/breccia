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

/** Tab to the download link and check the ring that `.download:focus-visible` sets (3px solid, offset 3px, text colour). */
async function focusDownload(page, label, file) {
  let focused = false
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press('Tab')
    focused = await page.evaluate(() => document.activeElement?.matches('a.download') ?? false)
  }
  check(focused, `keyboard (${label}): Tab reaches the download link`)
  if (!focused) return
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement)
    const probe = document.createElement('span')
    probe.style.color = 'var(--text)'
    document.body.append(probe)
    const text = getComputedStyle(probe).color
    probe.remove()
    return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, text }
  })
  check(
    ring.style === 'solid' && ring.width === '3px' && ring.offset === '3px' && ring.color === ring.text,
    `keyboard (${label}): the download link has the 3px ring in the text colour`,
    JSON.stringify(ring),
  )
  await page.screenshot({ path: join(OUT, file) })
}

/** Records in the page when the .tiles layer comes and goes (performance.now() ms; 0 = not yet). */
function recordTiles() {
  window.__tiles = { added: 0, removed: 0 }
  new MutationObserver(() => {
    const has = !!document.querySelector('.tiles')
    if (has && !window.__tiles.added) window.__tiles.added = performance.now()
    if (!has && window.__tiles.added && !window.__tiles.removed) window.__tiles.removed = performance.now()
  }).observe(document, { subtree: true, childList: true })
}

/** Waits for n animation frames in the page: lets pointer handlers and transitions run without a fixed sleep. */
const frames = (page, n) =>
  page.evaluate(
    (n) => new Promise((done) => {
      const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : done())
      step(n)
    }),
    n,
  )

const shardTransforms = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.shard')].map((s) => getComputedStyle(s).transform))

/** Compares two PNGs in a blank page: the largest channel difference and how many pixels differ at all. */
async function pixelDiff(browser, a, b) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const result = await page.evaluate(
    async ([a, b]) => {
      const load = async (b64) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0)
        return g.getImageData(0, 0, c.width, c.height)
      }
      const [x, y] = [await load(a), await load(b)]
      if (x.width !== y.width || x.height !== y.height) return { sameSize: false, max: 255, count: -1 }
      let max = 0
      let count = 0
      for (let i = 0; i < x.data.length; i += 4) {
        let d = 0
        for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(x.data[i + k] - y.data[i + k]))
        if (d) count++
        max = Math.max(max, d)
      }
      return { sameSize: true, max, count }
    },
    [a.toString('base64'), b.toString('base64')],
  )
  await ctx.close()
  return result
}

/** The hero's assembly (hero.js): the motion, the pointer follow, reduced motion, and the CSS fallback. */
async function heroChecks(browser, url) {
  const base = { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }
  let assembledStone = null

  // With motion: the sequence runs, ends within 2 s, leaves the static page, and the frame follows the pointer.
  {
    const ctx = await browser.newContext({ ...base, reducedMotion: 'no-preference' })
    const page = await ctx.newPage()
    const seen = watch(page)
    await page.addInitScript(recordTiles)
    await page.goto(url, { waitUntil: 'commit' })
    const started = await page
      .waitForFunction(() => !!document.querySelector('.stone.assembling') && !!document.querySelector('.stone .tiles'), undefined, {
        timeout: 5000,
        polling: 'raf',
      })
      .then(() => true, () => false)
    check(started, 'hero: .stone gets class assembling and the .tiles layer appears')
    if (started) {
      const tiles = await page.evaluate(() => document.querySelectorAll('.tiles > span').length)
      check(tiles === 24, 'hero: the mosaic has 24 tiles', `got ${tiles}`)
      await page.waitForFunction(() => performance.now() - window.__tiles.added >= 300, undefined, { polling: 'raf' })
      await page.screenshot({ path: join(OUT, 'hero-assembling.png') })
      const mid = await page.evaluate(() => ({
        assembling: !!document.querySelector('.stone.assembling'),
        tiles: !!document.querySelector('.tiles'),
        moving: [...document.querySelectorAll('.tiles > span')].filter((t) => getComputedStyle(t).transform !== 'none').length,
      }))
      check(mid.assembling && mid.tiles && mid.moving > 0, 'hero: 300 ms in, the tiles are still flying', JSON.stringify(mid))
    }
    const ended = await page
      .waitForFunction(() => !document.querySelector('.tiles') && !document.querySelector('.stone.assembling'), undefined, {
        timeout: 4000,
      })
      .then(() => true, () => false)
    check(ended, 'hero: .tiles and .assembling are gone at the end')
    const t = await page.evaluate(() => window.__tiles)
    const took = t.removed - t.added
    check(t.added > 0 && t.removed > 0 && took <= 2000, `hero: the sequence ends within 2 s (${Math.round(took)} ms)`)
    await page
      .waitForFunction(() => getComputedStyle(document.querySelector('img.shot')).opacity === '1', undefined, { timeout: 1000 })
      .catch(() => {})
    const after = await page.evaluate(() => ({
      img: getComputedStyle(document.querySelector('img.shot')).opacity,
      intro: document.documentElement.classList.contains('hero-intro'),
      inline: [...document.querySelectorAll('.shard')].filter((s) => /transform|opacity|transition/.test(s.style.cssText)).length,
      overflow: getComputedStyle(document.documentElement).overflowX,
    }))
    check(
      after.img === '1' && !after.intro && after.inline === 0 && after.overflow === 'visible',
      'hero: afterwards img.shot is opaque and no state is left behind',
      JSON.stringify(after),
    )
    await page.screenshot({ path: join(OUT, 'hero-done.png') })
    assembledStone = await page.locator('.stone').screenshot({ path: join(OUT, 'hero-stone-js.png') })
    await page.evaluate(() => window.scrollTo(0, 0))

    const box = await page.locator('.hero').boundingBox()
    await page.mouse.move(box.x + 2, box.y + 2)
    const leaned = await page
      .waitForFunction(() => [...document.querySelectorAll('.shard')].some((s) => getComputedStyle(s).transform !== 'none'), undefined, {
        timeout: 2000,
      })
      .then(() => true, () => false)
    check(leaned, 'hero: at the top-left corner of the hero some frame shard moves')
    const shot = await page.evaluate(() => getComputedStyle(document.querySelector('img.shot')).transform)
    check(shot === 'none', 'hero: the screenshot itself never moves', shot)
    await page.mouse.move(2, 2) // outside the hero (it starts at x = 128)
    const back = await page
      .waitForFunction(() => [...document.querySelectorAll('.shard')].every((s) => getComputedStyle(s).transform === 'none'), undefined, {
        timeout: 2000,
      })
      .then(() => true, () => false)
    check(back, 'hero: after the pointer leaves, every frame shard is back in place', (await shardTransforms(page)).join(' '))
    check(seen.errors.length === 0, 'hero: no console error, no page error', seen.errors.join(' | '))
    await ctx.close()
  }

  // Without JavaScript the stone looks exactly like it does after the sequence.
  {
    const ctx = await browser.newContext({ ...base, reducedMotion: 'no-preference', javaScriptEnabled: false })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'load' })
    const still = await page.locator('.stone').screenshot({ path: join(OUT, 'hero-stone-nojs.png') })
    const diff = assembledStone ? await pixelDiff(browser, still, assembledStone) : null
    // Compositing after the animation can round a few pixels by one level; anything visible is far above this.
    check(
      !!diff && diff.sameSize && diff.max <= 2 && diff.count <= 200,
      'hero: after the sequence the stone looks the same as the page without JavaScript',
      JSON.stringify(diff),
    )
    await ctx.close()
  }

  // Reduced motion: no mosaic, no pointer follow.
  {
    const ctx = await browser.newContext({ ...base, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const seen = watch(page)
    await page.addInitScript(recordTiles)
    await page.goto(url, { waitUntil: 'load' })
    const box = await page.locator('.hero').boundingBox()
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.move(box.x + 40, box.y + 30)
    await frames(page, 30)
    const state = await page.evaluate(() => ({
      tiles: window.__tiles.added,
      intro: document.documentElement.classList.contains('hero-intro'),
      assembling: !!document.querySelector('.stone.assembling'),
      img: getComputedStyle(document.querySelector('img.shot')).opacity,
    }))
    check(state.tiles === 0 && !state.assembling, 'reduced motion: .tiles never appears', JSON.stringify(state))
    check(state.img === '1' && !state.intro, 'reduced motion: the screenshot shows at once', JSON.stringify(state))
    const moved = (await shardTransforms(page)).filter((t) => t !== 'none')
    check(moved.length === 0, 'reduced motion: no frame shard moves after a mouse move', moved.join(' '))
    check(seen.errors.length === 0, 'reduced motion: no console error, no page error', seen.errors.join(' | '))
    await ctx.close()
  }

  // The CSS fallback: hero.js throws right after adding .assembling; the screenshot still shows by 2.5 s.
  {
    const ctx = await browser.newContext({ ...base, reducedMotion: 'no-preference' })
    const page = await ctx.newPage()
    const seen = watch(page)
    await page.route('**/hero.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "document.querySelector('.stone').classList.add('assembling')\nthrow new Error('x')\n",
      }),
    )
    await page.goto(url, { waitUntil: 'commit' })
    const hidden = await page
      .waitForFunction(() => {
        const i = document.querySelector('img.shot')
        return !!i && getComputedStyle(i).opacity === '0'
      }, undefined, { timeout: 2000, polling: 'raf' })
      .then(() => true, () => false)
    check(hidden, 'fallback: the screenshot starts hidden')
    await page.waitForTimeout(3000) // the time is the point here: the reveal must come from CSS alone
    const state = await page.evaluate(() => ({
      img: getComputedStyle(document.querySelector('img.shot')).opacity,
      frame: getComputedStyle(document.querySelector('.frame')).opacity,
    }))
    check(state.img === '1' && state.frame === '1', 'fallback: at 3 s the screenshot and the frame show', JSON.stringify(state))
    const pageErrors = seen.errors.filter((e) => e.startsWith('pageerror'))
    check(
      pageErrors.length === 1 && seen.errors.length === 1,
      'fallback: exactly one page error, from the broken script',
      seen.errors.join(' | '),
    )
    await ctx.close()
  }
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
      const hero = await page.evaluate(() => {
        const i = document.querySelector('img.shot')
        return { complete: i.complete, w: i.naturalWidth }
      })
      check(hero.complete && hero.w > 0, 'no JavaScript: the hero image is loaded', JSON.stringify(hero))
      await ctx.close()
    }

    // Dark keyboard focus, in its own context.
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'load' })
      await focusDownload(page, 'dark', 'focus.png')
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

      await focusDownload(page, 'light', 'focus-light.png')
      await ctx.close()
    }

    await heroChecks(browser, url)
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
