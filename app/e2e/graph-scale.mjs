// Network view at scale: 5,000 pages and 50,000 links, in the release exe.
//
//   just graph-scale            (off-screen, like `just e2e`)
//   just graph-scale --onscreen (shows the window, for your own run)
//
// Writes a temp notes folder (2,000 pages in 50 folders + 3,000 journal days, in 50 communities
// of 100 files, 50,000 distinct page pairs), starts the release exe once to warm Windows Defender's
// first-read scan (that launch is discarded), starts it again on a fresh config dir, waits for the
// search index, and measures the open, the layout, pan and zoom, hover and the reopen. One line per
// measure (`name value bar verdict`); the JSON goes to target/graph-scale/ (not committed).
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { keepForeground } from './foreground.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exe = process.env.BRECCIA_EXE ?? join(root, 'target', 'release', 'breccia.exe')
const outDir = join(root, 'target', 'graph-scale')
const port = 9222
const onscreen = process.argv.includes('--onscreen')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = 2000
const DAYS = 3000
const FILES = PAGES + DAYS
const COMMUNITIES = 50
const PAIRS = 50_000
const HUBS = 20

const pad = (n) => String(n).padStart(2, '0')
const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()
const dayKey = (k) => {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

// A fixed pseudo-random sequence: every run measures the same folder.
let seed = 20261031
const rand = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
  return (seed >>> 8) % n
}

// File i: pages first, then journal days (yesterday back, so today's page stays empty).
const spelling = (i) => (i < PAGES ? `Page ${i}` : dayKey(1 + (i - PAGES)))
const rel = (i) => (i < PAGES ? join('pages', `F${i % 50}`, `Page ${i}.md`) : join('journals', `${spelling(i)}.md`))
// Community c holds the files c, c + 50, c + 100, ...: 40 pages and 60 journal days each.
const community = (i) => i % COMMUNITIES
const member = (c, m) => c + COMMUNITIES * m

/** 50,000 distinct unordered pairs: 90% inside a community, the rest across; 20 hubs take about 20% of the cross pairs. */
function makePairs() {
  const seen = new Set()
  const pairs = []
  const add = (a, b) => {
    if (a === b) return false
    const id = Math.min(a, b) * FILES + Math.max(a, b)
    if (seen.has(id)) return false
    seen.add(id)
    pairs.push(rand(2) ? [a, b] : [b, a]) // written once, in one direction
    return true
  }
  const perCommunity = (PAIRS * 0.9) / COMMUNITIES // 900 of the 4,950 possible
  for (let c = 0; c < COMMUNITIES; c++) {
    let n = 0
    while (n < perCommunity) if (add(member(c, rand(100)), member(c, rand(100)))) n++
  }
  const cross = PAIRS - pairs.length // 5,000
  let n = 0
  while (n < cross * 0.2) {
    const hub = rand(HUBS) // files 0..19 are the hubs
    const other = rand(FILES)
    if (community(other) !== community(hub) && add(hub, other)) n++
  }
  while (pairs.length < PAIRS) {
    const a = rand(FILES)
    const b = rand(FILES)
    if (community(a) !== community(b)) add(a, b)
  }
  return pairs
}

function writeNotes(folder) {
  const outgoing = Array.from({ length: FILES }, () => [])
  for (const [a, b] of makePairs()) outgoing[a].push(b)
  for (let i = 0; i < FILES; i++) {
    const path = join(folder, rel(i))
    mkdirSync(dirname(path), { recursive: true })
    const links = outgoing[i].map((t) => `- links [[${spelling(t)}]]\n`).join('')
    writeFileSync(path, `- ${spelling(i)}\n${links}`)
  }
}

const frameStats = (deltas) => {
  const s = [...deltas].sort((a, b) => a - b)
  const sum = deltas.reduce((x, y) => x + y, 0)
  return {
    frames: deltas.length,
    fps: Math.round((deltas.length / sum) * 10_000) / 10,
    p50: s[Math.floor(s.length * 0.5)],
    p95: s[Math.floor(s.length * 0.95)],
    max: s[s.length - 1],
    over33: Math.round((deltas.filter((d) => d > 33).length / deltas.length) * 1000) / 10,
  }
}

const tmp = realpathSync.native(tmpdir())
const made = []
const tmpDir = (name) => {
  const p = mkdtempSync(join(tmp, name))
  made.push(p)
  return p
}
let app = null
let foreground = null
let logFd = null
const results = []

function stopApp() {
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  app = null
}

async function devtoolsUp() {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
  } catch {
    return false
  }
}

/** Starts the exe on `folder` with its own config dir; resolves with the Playwright page. */
async function launch(folder, configDir, gitEnv, logPath) {
  let exited = null
  logFd = openSync(logPath, 'a')
  app = spawn(exe, [], {
    env: {
      ...process.env,
      BRECCIA_FOLDER: folder,
      BRECCIA_CONFIG_DIR: configDir,
      BRECCIA_WINDOW_TITLE: 'Breccia (test)', // a stray window is easy to tell from a real one
      ...gitEnv,
      BRECCIA_TODAY: today,
      ...(onscreen ? {} : { BRECCIA_OFFSCREEN: '1' }),
      // Its own WebView2 profile, never the installed app's (which an open Breccia holds).
      WEBVIEW2_USER_DATA_FOLDER: join(configDir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: ['ignore', logFd, logFd],
  })
  const proc = app
  proc.on('error', (e) => (exited = `app failed to start: ${e.message}`))
  proc.on('exit', (code, sig) => app === proc && (exited = `app exited early (code ${code}, signal ${sig})`))
  const end = Date.now() + 120_000
  while (!(await devtoolsUp())) {
    if (exited) throw new Error(exited)
    if (Date.now() > end) throw new Error('DevTools port did not answer within 120 s')
    await sleep(500)
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts()[0].pages()[0]
  return { browser, page }
}

/** Waits for the status bar to show no index item for 2 s in a row. */
async function indexQuiet(page) {
  await page.locator('[data-testid="status-bar"]').waitFor({ timeout: 120_000 })
  const end = Date.now() + 300_000
  let quietSince = 0
  while (Date.now() < end) {
    const busy = await page.locator('[data-testid="status-item"][data-id="index"]').count()
    if (busy) quietSince = 0
    else if (!quietSince) quietSince = Date.now()
    else if (Date.now() - quietSince >= 2000) return
    await sleep(250)
  }
  throw new Error('the search index did not finish within 300 s')
}

try {
  if (!existsSync(exe)) throw new Error(`${exe} not found; run "just build" first`)
  if (await devtoolsUp()) throw new Error(`port ${port} is in use (another Breccia or dev-debug?)`)
  const folder = tmpDir('breccia-gscale-')
  const gitHome = tmpDir('breccia-gscale-git-')
  writeFileSync(
    join(gitHome, 'gitconfig'),
    '[user]\n\tname = Breccia E2E\n\temail = e2e@example.invalid\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n',
  )
  const gitEnv = {
    GIT_CONFIG_GLOBAL: join(gitHome, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: tmp,
    GIT_TERMINAL_PROMPT: '0',
  }
  const logPath = join(tmp, `breccia-gscale-${process.pid}.log`)
  made.push(logPath)
  console.log('writing 5,000 notes ...')
  writeNotes(folder)
  foreground = onscreen ? null : await keepForeground()

  // Launch 1: warms Defender's first-read scan of the 5,000 new files; discarded.
  console.log('warm-up launch (discarded) ...')
  {
    const warm = await launch(folder, tmpDir('breccia-gscale-warm-'), gitEnv, logPath)
    await warm.page.locator('[data-testid="start-writing"]').waitFor({ timeout: 120_000 })
    await indexQuiet(warm.page)
    await warm.browser.close()
    stopApp()
    for (let i = 0; i < 40 && (await devtoolsUp()); i++) await sleep(250)
  }

  const configDir = tmpDir('breccia-gscale-config-')
  console.log('measured launch ...')
  const { browser, page } = await launch(folder, configDir, gitEnv, logPath)
  await page.locator('[data-testid="start-writing"]').waitFor({ timeout: 120_000 })
  if (foreground) console.log(`foreground: ${await foreground.handBack(app.pid)}`)
  await indexQuiet(page)

  // The recorder: every animation frame's gap in ms, between start() and stop().
  await page.evaluate(() => {
    let frames = []
    let on = false
    const tick = (t) => {
      if (on) frames.push(t)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__rec = {
      start() {
        frames = []
        on = true
      },
      stop() {
        on = false
        return frames.slice(1).map((t, i) => t - frames[i])
      },
    }
    // Resolves with performance.now() when `ok()` first holds, polling on frames and mutations.
    window.__until = (ok) =>
      new Promise((res) => {
        const check = () => {
          if (!ok()) return false
          res(performance.now())
          return true
        }
        if (check()) return
        const mo = new MutationObserver(() => check() && mo.disconnect())
        mo.observe(document.body, { subtree: true, childList: true, attributes: true })
      })
  })

  const record = (name, value, unit, bar, ok, extra = {}) => {
    results.push({ name, value, unit, bar, ok, ...extra })
    console.log(`${name} ${value}${unit} ${bar} ${ok ? 'ok' : 'OVER'}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`)
  }

  // Refresh rate: the median gap of idle frames, before the graph opens.
  await page.evaluate(() => window.__rec.start())
  await sleep(1000)
  const idle = await page.evaluate(() => window.__rec.stop())
  const gap = [...idle].sort((a, b) => a - b)[Math.floor(idle.length / 2)]
  const refreshHz = Math.round(1000 / gap)
  console.log(`display refresh: about ${refreshHz} Hz (median idle frame ${gap.toFixed(1)} ms)`)

  // 1: open: the click to sigma's first render (data-drawn on the network section).
  const openMs = await page.evaluate(async () => {
    const t0 = performance.now()
    const done = window.__until(() => document.querySelector('[data-testid="network"][data-drawn="1"]'))
    document.querySelector('[data-testid="nav-graph"]').click()
    return (await done) - t0
  })
  record('open', Math.round(openMs), 'ms', 1000, openMs <= 1000, { note: 'journals hidden (the default) at this point' })

  // The layout has just started: show the journal days, then wait for it to stop.
  const hide = page.locator('[data-testid="graph-hide-journals"]')
  await hide.uncheck()
  const count = () => page.locator('[data-testid="graph-count"]').innerText()
  const want = '5,000 pages · 50,000 links'
  const end = Date.now() + 10_000
  while ((await count()) !== want && Date.now() < end) await sleep(100)
  const got = await count()
  if (got !== want) throw new Error(`graph-count reads "${got}", expected "${want}"`)

  // 2: layout: until data-layout is settled or capped.
  const layoutMs = await page.evaluate(async () => {
    const t0 = performance.now()
    const net = () => document.querySelector('[data-testid="network"]')
    await window.__until(() => ['settled', 'capped'].includes(net()?.getAttribute('data-layout')))
    return { ms: performance.now() - t0, how: net().getAttribute('data-layout') }
  })
  // The wait began a little after the layout did (the untick and the count check); the layout runs at most 10 s itself.
  record('layout', Math.round(layoutMs.ms), 'ms', 10_000, layoutMs.ms <= 10_000, { how: layoutMs.how, note: 'measured from after the untick' })

  const canvasBox = await page.locator('[data-testid="graph-canvas"]').boundingBox()
  const cx = canvasBox.x + canvasBox.width / 2
  const cy = canvasBox.y + canvasBox.height / 2
  const radius = Math.min(canvasBox.width, canvasBox.height) / 4

  // 3: pan and zoom, 10 s: drags in a circle, and alternating wheel steps. The frames of the two kinds are
  // also kept apart, to show which one is slow.
  await page.mouse.move(cx, cy)
  const dragFrames = []
  const wheelFrames = []
  const stop3 = Date.now() + 10_000
  let step = 0
  while (Date.now() < stop3) {
    await page.evaluate(() => window.__rec.start())
    await page.mouse.move(cx + radius, cy)
    await page.mouse.down()
    for (let a = 0; a <= 360 && Date.now() < stop3; a += 12) {
      const r = (a * Math.PI) / 180
      await page.mouse.move(cx + radius * Math.cos(r), cy + radius * Math.sin(r))
    }
    await page.mouse.up()
    dragFrames.push(...(await page.evaluate(() => window.__rec.stop())))
    await page.mouse.move(cx, cy)
    await page.evaluate(() => window.__rec.start())
    for (let k = 0; k < 6 && Date.now() < stop3; k++) {
      await page.mouse.wheel(0, step++ % 2 ? 240 : -240)
      await sleep(80)
    }
    wheelFrames.push(...(await page.evaluate(() => window.__rec.stop())))
  }
  const pan = frameStats([...dragFrames, ...wheelFrames])
  record('pan+zoom fps', pan.fps, ' fps', 50, pan.fps >= 50, { ...pan, drag: frameStats(dragFrames), wheel: frameStats(wheelFrames) })
  record('pan+zoom p95', pan.p95.toFixed(1), 'ms', 33, pan.p95 <= 33)

  // 4: hover, 10 s: the mouse sweeps a grid over the picture.
  await page.evaluate(() => window.__rec.start())
  const stop4 = Date.now() + 10_000
  const gridStep = 30
  while (Date.now() < stop4) {
    for (let y = canvasBox.y + 10; y < canvasBox.y + canvasBox.height - 10 && Date.now() < stop4; y += gridStep) {
      const leftToRight = Math.round((y - canvasBox.y) / gridStep) % 2 === 0
      for (let x = 0; x < canvasBox.width - 20 && Date.now() < stop4; x += gridStep) {
        await page.mouse.move(canvasBox.x + 10 + (leftToRight ? x : canvasBox.width - 20 - x), y)
      }
    }
  }
  const hover = frameStats(await page.evaluate(() => window.__rec.stop()))
  record('hover p95', hover.p95.toFixed(1), 'ms', 33, hover.p95 <= 33, hover)

  // 5: reopen from the saved positions: Journal, then Graph again.
  await page.mouse.move(10, 10)
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('[data-testid="network"]').waitFor({ state: 'detached' })
  const reopenMs = await page.evaluate(async () => {
    const t0 = performance.now()
    const done = window.__until(() => {
      const n = document.querySelector('[data-testid="network"]')
      return n?.getAttribute('data-layout') === 'saved' && n.getAttribute('data-drawn') === '1'
    })
    document.querySelector('[data-testid="nav-graph"]').click()
    return (await done) - t0
  })
  record('reopen', Math.round(reopenMs), 'ms', 1000, reopenMs <= 1000, { note: 'journals shown (filters outlast closing)' })
  const reopened = await count()
  if (reopened !== want) throw new Error(`after reopening graph-count reads "${reopened}"`)

  // The view only reads the notes: no file in the temp cache dir but the index and the layout.
  const cache = join(configDir, 'cache')
  const files = existsSync(cache) ? readdirSync(cache) : []
  if (!files.some((f) => /^graph-[0-9a-f]{16}\.json$/.test(f))) throw new Error(`no layout file in the cache dir: ${files}`)

  await browser.close()
  mkdirSync(outDir, { recursive: true })
  // Neutral file names: the committed runs carry no machine name.
  const n = readdirSync(outDir).filter((f) => /^run-\d+\.json$/.test(f)).length + 1
  const file = join(outDir, `run-${n}.json`)
  writeFileSync(file, JSON.stringify({ refreshHz, onscreen, pages: PAGES + DAYS, links: PAIRS, results }, null, 2) + '\n')
  console.log(`wrote ${file}`)
  console.log(results.every((r) => r.ok) ? 'every bar met' : 'some bars missed (see OVER)')
} finally {
  foreground?.stop()
  stopApp()
  if (logFd !== null) {
    try {
      closeSync(logFd)
    } catch {}
  }
  await sleep(500)
  for (const p of made) {
    try {
      rmSync(p, { recursive: true, force: true, maxRetries: 10 })
    } catch {}
  }
}
