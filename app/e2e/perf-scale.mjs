// The window at 5,000 pages (plan 18): start, typing and search during the first index build, the Git history and
// the Archive at 3,000 rows, the caret on a page of 5,000 rows, and the journal scrolled back 500 days.
//
//   just perf-scale            (off-screen, like `just e2e`)
//   just perf-scale --onscreen (shows the window, for your own run)
//   just perf-scale --runs 5   (measured launches; default 3)
//
// A local measuring command: not part of `just test`, `just e2e` or any workflow. It writes the folder of
// `just graph-scale` (scaleFolder.mjs) with a hub page, 3,000 archived tasks, a page of 5,000 rows and a Git
// repository of 3,000 commits, starts the release exe once to warm Windows Defender's first-read scan (discarded),
// then measures `--runs` launches, each on a fresh config dir so the search index is cold. Every line is the median of
// the launches: `name value bar ok|OVER`. The JSON (every launch's numbers) goes to target/perf-scale/<date>.json.
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { keepForeground } from './foreground.mjs'
import { today as todayKey, writeScaleFolder } from './scaleFolder.mjs'
import { summarize } from './trace.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exe = process.env.BRECCIA_EXE ?? join(root, 'target', 'release', 'breccia.exe')
const outDir = join(root, 'target', 'perf-scale')
const port = 9224 // not e2e's 9222 or 9223, so a `just dev-debug` can stay open
const onscreen = process.argv.includes('--onscreen')
const runsArg = process.argv.indexOf('--runs')
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 3
if (!(RUNS >= 1)) throw new Error('--runs takes a number of launches, 1 or more')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => performance.timeOrigin + performance.now()
const today = todayKey()
const KEYS = 40
const ENTER_GAP = 40 // ms from one letter to the next (each letter is followed by Enter)
const CARET_PRESSES = 50
const DAYS_BACK = 500
const SHOW_MORE = 10

// The bars (plan 18, Q3). `null`: printed with "(no bar)" (owner Q2 b, pre-flight F8).
const MEASURES = [
  ['window shows', 500],
  ['journal usable', 2000],
  ['typing during first build, wait p95', 16],
  ['typing during first build, run p95', 16],
  ['search during first build', null],
  ['git history open', 200],
  [`git history show more x${SHOW_MORE}`, 200],
  ['git history scroll frame p95', 20],
  ['archive open', 200],
  ['archive scroll frame p95', 20],
  ['caret down at 5,000 rows p95', 16],
  [`journal scroll back ${DAYS_BACK} days frame p95`, 20],
]

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

function stopApp() {
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  app = null
  if (logFd !== null) {
    try {
      closeSync(logFd)
    } catch {}
    logFd = null
  }
}

async function devtoolsUp() {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
  } catch {
    return false
  }
}

const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const round1 = (x) => Math.round(x * 10) / 10

function git(cwd, env, ...args) {
  const r = spawnSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

/** Starts the exe on `folder` with its own config dir; resolves with the Playwright page and the spawn time. */
async function launch(folder, configDir, gitEnv, logPath) {
  let exited = null
  logFd = openSync(logPath, 'a')
  const spawnedAt = now()
  app = spawn(exe, [], {
    env: {
      ...process.env,
      BRECCIA_FOLDER: folder,
      BRECCIA_CONFIG_DIR: configDir,
      BRECCIA_WINDOW_TITLE: 'Breccia (test)', // a stray window is easy to tell from a real one
      BRECCIA_TRACE: '1',
      ...gitEnv,
      BRECCIA_TODAY: today,
      ...(onscreen ? {} : { BRECCIA_OFFSCREEN: '1' }),
      // Its own WebView2 profile, never the installed app's (which an open Breccia holds).
      WEBVIEW2_USER_DATA_FOLDER: join(configDir, 'webview'),
      // The app opens the DevTools port itself: WebView2 ignores WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS on CI.
      BRECCIA_DEVTOOLS_PORT: String(port),
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
    await sleep(50)
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))
  const connectedAt = now()
  // The port opens before the WebView loads the app, so this usually runs before the app's own scripts: it notes when
  // the first journal row appears. If the app was already loaded, `startTimes` falls back to an upper bound.
  await page.addInitScript((sel) => {
    window.__probe = { rowAt: null }
    const check = () => {
      if (window.__probe.rowAt !== null || !document.querySelector(sel)) return false
      // The next animation frame after the row went in, not the insertion itself.
      window.__probe.rowAt = -1
      requestAnimationFrame(() => (window.__probe.rowAt = performance.timeOrigin + performance.now()))
      return true
    }
    const mo = new MutationObserver(() => check() && mo.disconnect())
    mo.observe(document, { subtree: true, childList: true })
  }, JOURNAL_ROW)
  return { browser, page, spawnedAt, connectedAt }
}

/** Waits for the app's document (not the WebView's first blank one). */
async function appLoaded(page) {
  const end = Date.now() + 120_000
  for (;;) {
    try {
      if (!page.url().startsWith('about:')) {
        await page.waitForLoadState('domcontentloaded')
        if (await page.evaluate(() => document.querySelector('#app, body > *') !== null)) return
      }
    } catch {
      // The document went away under the check (the navigation); look again.
    }
    if (Date.now() > end) throw new Error(`the app did not load: ${page.url()}`)
    await sleep(20)
  }
}

/** Resolves when the status bar shows no index item for 2 s in a row. */
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

/** In the page: a frame recorder, a wait on a condition, and the first-row probe. */
function installHelpers(page) {
  return page.evaluate(() => {
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
    // Resolves with performance.now() when `ok()` first holds, checking on every mutation.
    window.__until = (ok) =>
      new Promise((res) => {
        const check = () => {
          if (!ok()) return false
          res(performance.now())
          return true
        }
        if (check()) return
        const mo = new MutationObserver(() => check() && mo.disconnect())
        mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
      })
    // When the index item of the status bar goes (the first build is done), on the page's wall clock.
    window.__index = { goneAt: null }
    const item = () => document.querySelector('[data-testid="status-item"][data-id="index"]')
    let seen = item() !== null
    new MutationObserver(() => {
      if (item()) seen = true
      else if (seen && window.__index.goneAt === null) window.__index.goneAt = performance.timeOrigin + performance.now()
    }).observe(document.body, { subtree: true, childList: true })
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  })
}

const INDEX_ITEM = '[data-testid="status-item"][data-id="index"]'
const JOURNAL_ROW = '[data-testid="day"] [data-testid="start-writing"], [data-testid="day"] .block'

/** Scrolls `.main` down by wheel steps until `done()` holds in the page; returns the frame gaps. */
async function wheelUntil(page, done, cap) {
  const box = await page.locator('.main').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.evaluate(() => window.__rec.start())
  let steps = 0
  while (!(await page.evaluate(done)) && steps < cap) {
    await page.mouse.wheel(0, 600)
    await page.evaluate(() => window.__frame())
    steps++
  }
  const frames = await page.evaluate(() => window.__rec.stop())
  const reached = await page.evaluate(done)
  return { frames, steps, reached }
}

/** One measured launch: every measure once. */
async function measureLaunch(folder, gitEnv, n) {
  const configDir = tmpDir('breccia-perf-config-')
  const logPath = join(configDir, 'stderr.log')
  const r = {}
  const notes = {}
  const invalid = []
  const { browser, page, spawnedAt, connectedAt } = await launch(folder, configDir, gitEnv, logPath)
  try {
    // 1, 2: the first contentful paint and the first journal row, both from the spawn. The page's clock is
    // `performance.timeOrigin + performance.now()`, the same wall clock as the spawn time here.
    await appLoaded(page)
    const start = await page.evaluate(async (sel) => {
      const fcp = () => performance.getEntriesByName('first-contentful-paint')[0]
      // Without the probe (the app loaded before it was registered), the row's time is when this call sees it.
      const probed = window.__probe !== undefined
      const shownBefore = !probed && document.querySelector(sel) !== null
      const rowAt = probed
        ? null
        : await new Promise((res) => {
            const check = () =>
              document.querySelector(sel) &&
              (requestAnimationFrame(() => res(performance.timeOrigin + performance.now())), true)
            if (check()) return
            const mo = new MutationObserver(() => check() && mo.disconnect())
            mo.observe(document.documentElement, { subtree: true, childList: true })
          })
      while (!fcp() || (probed && !(window.__probe.rowAt > 0))) await new Promise((r) => setTimeout(r, 10))
      return { fcpAt: performance.timeOrigin + fcp().startTime, rowAt: probed ? window.__probe.rowAt : rowAt, exact: !shownBefore }
    }, JOURNAL_ROW)
    r['window shows'] = start.fcpAt - spawnedAt
    // Shown, not only inserted: the row's next frame, and never before the window's first paint.
    r['journal usable'] = Math.max(start.rowAt, start.fcpAt) - spawnedAt
    notes.connectedMs = Math.round(connectedAt - spawnedAt)
    // false: the row was already shown when this script first looked, so `journal usable` is an upper bound.
    notes.journalExact = start.exact
    if (foreground && n === 0) console.log(`foreground: ${await foreground.handBack(app.pid)}`)
    await installHelpers(page)

    // 3: typing on today's journal day while the first index build runs; the times come from the trace lines.
    const indexSeen = await page
      .locator(INDEX_ITEM)
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    await page.locator('[data-testid="day"] [data-testid="start-writing"]').first().click()
    await page.locator('.cm-content[contenteditable="true"]').first().waitFor()
    // 20 letters, each followed by Enter. The editor saves a block 300 ms after its last key, so a burst of letters is
    // one `block.setText`; each Enter saves at once, as a `block.split` that carries the text. The first build is
    // over about 1.5 s after the journal shows, too soon for 40 keys with 300 ms pauses between them. The Enters
    // are paced ENTER_GAP ms apart, so a save waits for the index rather than for the save before it.
    const letters = 'abcdefghijklmnopqrst'.slice(0, KEYS / 2)
    const todayFile = join(folder, 'journals', `${today}.md`)
    const onDisk = () => (existsSync(todayFile) ? readFileSync(todayFile, 'utf8') : '')
    const typedAt = now()
    // After each Enter, the next letter waits for the split on disk and the new empty row's editor (a fixed 40 ms
    // pacing alone put letters into the wrong row: see the plan 18 Task 2 report), and at least ENTER_GAP ms.
    const emptyEditor = () => {
      const c = document.activeElement?.closest('.cm-content')
      return c !== null && c !== undefined && c.textContent === ''
    }
    for (let k = 0; k < letters.length; k++) {
      const keyAt = now()
      await page.keyboard.press(letters[k])
      await page.keyboard.press('Enter')
      const sofar = [...letters.slice(0, k + 1)].map((c) => `- ${c}\n`).join('')
      const endK = Date.now() + 30_000
      while (!(onDisk().startsWith(sofar) && (await page.evaluate(emptyEditor)))) {
        if (Date.now() > endK) throw new Error(`key ${k + 1}: today's file is ${JSON.stringify(onDisk())}`)
        await sleep(5)
      }
      const rest = ENTER_GAP - (now() - keyAt)
      if (rest > 0) await sleep(rest)
    }
    notes.typingMs = Math.round(now() - typedAt)
    // The index item still shows after the last key: every key went in during the first build.
    notes.typedDuringBuild = indexSeen && (await page.locator(INDEX_ITEM).count()) > 0
    const want = [...letters].map((c) => `- ${c}\n`).join('')
    const end3 = Date.now() + 30_000
    while (!onDisk().startsWith(want)) {
      if (Date.now() > end3) throw new Error(`today's file is ${JSON.stringify(onDisk())}`)
      await sleep(20)
    }
    await page.keyboard.press('Escape')
    // 4: a search typed during the build: the input event to the first full-text hit.
    await page.keyboard.press('Control+k')
    await page.locator('[data-testid="search-input"]').waitFor()
    // The listener is in place before the text goes in (an awaited call); the answer is read after.
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="search-input"]')
      window.__search = new Promise((res) =>
        input.addEventListener(
          'input',
          () => {
            const t0 = performance.now()
            const building = document.querySelector('[data-testid="status-item"][data-id="index"]') !== null
            window
              .__until(() => document.querySelector('[data-testid="search-row"][data-kind="hit"]'))
              .then((t) => res({ ms: t - t0, building }))
          },
          { once: true },
        ),
      )
    })
    await page.keyboard.insertText('links')
    let timer
    const search = await Promise.race([
      page.evaluate(() => window.__search),
      new Promise((_, no) => (timer = setTimeout(() => no(new Error('no full-text hit within 120 s')), 120_000))),
    ]).finally(() => clearTimeout(timer))
    r['search during first build'] = search.ms
    notes.searchDuringBuild = search.building
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="search"]').waitFor({ state: 'detached' })

    // The trace lines of the keys' saves, `block.setText` and `block.split`, summed up by trace.mjs as one row.
    const lines = readFileSync(logPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^trace run block\.(setText|split) /.test(l))
    const waits = lines.map((l) => Number(/ wait=([\d.]+)ms /.exec(l)?.[1] ?? NaN))
    notes.saves = {
      setText: lines.filter((l) => l.includes('block.setText')).length,
      split: lines.filter((l) => l.includes('block.split')).length,
      waitMax: Math.max(...waits),
    }
    const summary = summarize(lines.map((l) => l.replace(/^trace run block\.\w+ /, 'trace run typing ')).join('\n'))
    const row = summary.split('\n').find((l) => l.startsWith('run typing '))
    if (!row) throw new Error('no block.setText or block.split trace lines')
    const [, , waitP95, , runP95] = row.trim().split(/\s+/).slice(2).map(Number)
    r['typing during first build, wait p95'] = waitP95
    r['typing during first build, run p95'] = runP95
    // A line taken after the build is not "during the first build": marked INVALID, never ok or OVER.
    if (!notes.typedDuringBuild) invalid.push('typing during first build, wait p95', 'typing during first build, run p95')
    if (!notes.searchDuringBuild) invalid.push('search during first build')

    await indexQuiet(page)
    const goneAt = await page.evaluate(() => window.__index.goneAt)
    notes.indexDoneMs = goneAt === null ? null : Math.round(goneAt - spawnedAt)

    // 5: the Git history: open, then "Show more" ten times, then scroll to the end.
    r['git history open'] = await page.evaluate(async () => {
      const t0 = performance.now()
      const done = window.__until(() => document.querySelector('[data-testid="log-row"]'))
      document.querySelector('[data-testid="status-item"][data-id="gitLog"]').click()
      return (await done) - t0
    })
    const more = []
    for (let k = 0; k < SHOW_MORE; k++) {
      more.push(
        await page.evaluate(async () => {
          // The count line, not the rows in the page: a virtualised list draws only the rows in view, and the new
          // rows are below them. The count changes in the same update that adds the rows.
          const count = () => document.querySelector('[data-testid="log-count"]')?.textContent
          const before = count()
          const t0 = performance.now()
          const done = window.__until(() => count() !== before)
          document.querySelector('[data-testid="log-more"]').click()
          return (await done) - t0
        }),
      )
    }
    r[`git history show more x${SHOW_MORE}`] = Math.max(...more)
    notes.showMore = more.map(Math.round)
    notes.gitRows = await page.locator('[data-testid="log-row"]').count()
    // The count line, not the rows in the page: a virtualised list holds only the rows in view.
    const gitCount = await page.locator('[data-testid="log-count"]').innerText()
    if (gitCount !== `newest ${200 * (SHOW_MORE + 1)} commits`) throw new Error(`the Git history counts "${gitCount}"`)
    const atEnd = () => {
      const m = document.querySelector('.main')
      return m.scrollTop + m.clientHeight >= m.scrollHeight - 2
    }
    const gitScroll = await wheelUntil(page, atEnd, 1000)
    if (!gitScroll.reached) throw new Error(`the Git history did not scroll to its end in ${gitScroll.steps} steps`)
    r['git history scroll frame p95'] = p95(gitScroll.frames)
    notes.gitScroll = { frames: gitScroll.frames.length, steps: gitScroll.steps, reached: gitScroll.reached }

    // 6: the Archive: open, then scroll to the end.
    r['archive open'] = await page.evaluate(async () => {
      const t0 = performance.now()
      const done = window.__until(() => document.querySelector('[data-testid="archive-row"]'))
      document.querySelector('[data-testid="nav-archive"]').click()
      return (await done) - t0
    })
    notes.archiveCount = await page.locator('[data-testid="archive-count"]').innerText()
    // The count, not the rows in the page: a virtualised list holds only the rows in view.
    if (notes.archiveCount !== '3000 tasks') throw new Error(`the Archive counts "${notes.archiveCount}"`)
    const archiveScroll = await wheelUntil(page, atEnd, 1000)
    if (!archiveScroll.reached) throw new Error(`the Archive did not scroll to its end in ${archiveScroll.steps} steps`)
    r['archive scroll frame p95'] = p95(archiveScroll.frames)
    notes.archiveScroll = { frames: archiveScroll.frames.length, steps: archiveScroll.steps, reached: archiveScroll.reached }

    // 7: the caret down a row, 50 times, on the page of 5,000 rows: each key to the next animation frame.
    await page.keyboard.press('Control+k')
    await page.locator('[data-testid="search-input"]').waitFor()
    await page.keyboard.insertText('Long page')
    await page.locator('[data-testid="search-row"][data-kind="page"]', { hasText: 'Long page' }).first().click()
    await page.locator('[data-testid="page-title"]', { hasText: 'Long page' }).waitFor()
    await page.locator('.block .content', { hasText: /^\s*row 0\s*$/ }).first().click()
    await page.locator('.cm-content[contenteditable="true"]', { hasText: /^\s*row 0\s*$/ }).waitFor()
    await page.evaluate(() => {
      window.__keys = []
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key !== 'ArrowDown') return
          const t0 = performance.now()
          requestAnimationFrame(() => window.__keys.push(performance.now() - t0))
        },
        { capture: true },
      )
    })
    for (let k = 0; k < CARET_PRESSES; k++) {
      await page.keyboard.press('ArrowDown')
      await page.evaluate(() => window.__frame())
    }
    const keys = await page.evaluate(() => window.__keys)
    const caretAt = await page.evaluate(() => document.activeElement?.closest('.cm-content')?.textContent.trim() ?? null)
    if (keys.length !== CARET_PRESSES || caretAt !== `row ${CARET_PRESSES}`) {
      throw new Error(`caret: ${keys.length} key frames, the caret is on ${JSON.stringify(caretAt)}`)
    }
    r['caret down at 5,000 rows p95'] = p95(keys)
    await page.keyboard.press('Escape')

    // 8: the journal, scrolled back 500 days by wheel steps.
    await page.locator('[data-testid="nav-journal"]').click()
    await page.locator('[data-testid="journal-feed"]').waitFor()
    const journalScroll = await wheelUntil(
      page,
      new Function(`return [...document.querySelectorAll('[data-testid="day"]')].some((d) => Number(d.dataset.index) >= ${DAYS_BACK})`),
      5000,
    )
    if (!journalScroll.reached) throw new Error(`the journal did not reach day ${DAYS_BACK} in ${journalScroll.steps} steps`)
    r[`journal scroll back ${DAYS_BACK} days frame p95`] = p95(journalScroll.frames)
    notes.journalScroll = { frames: journalScroll.frames.length, steps: journalScroll.steps }
  } finally {
    await browser.close().catch(() => {})
    stopApp()
    for (let i = 0; i < 40 && (await devtoolsUp()); i++) await sleep(250)
  }
  return { values: r, notes, invalid }
}

try {
  if (!existsSync(exe)) throw new Error(`${exe} not found; run "just build" first`)
  if (await devtoolsUp()) throw new Error(`port ${port} is in use (another perf-scale run?)`)
  const folder = tmpDir('breccia-perf-')
  const gitHome = tmpDir('breccia-perf-git-')
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
  // No timed commit and one pull at start (there is no remote): every launch starts from the same files.
  mkdirSync(join(folder, 'breccia'))
  writeFileSync(join(folder, 'breccia', 'config.toml'), '[git]\ncommit_delay_minutes = 0\npull_interval_minutes = 0\n')
  console.log('writing the folder (5,000 notes and the extras, 3,000 commits) ...')
  const written = writeScaleFolder(folder, { git: true, archive: true, longPage: true, hub: true })
  console.log(`folder: ${written.files} notes files, ${written.links} links, ${git(folder, gitEnv, 'rev-list', '--count', 'HEAD')} commits`)
  const head = git(folder, gitEnv, 'rev-parse', 'HEAD')
  const todayFile = join(folder, 'journals', `${today}.md`)
  /**
   * Puts the folder back as written: the typed journal day goes, and so does Breccia's commit of it, if its pull at
   * start came after the typing (the branch and the index go back; the files are not touched). Nothing else may
   * have changed.
   */
  const restore = () => {
    rmSync(todayFile, { force: true })
    git(folder, gitEnv, 'reset', '-q', head)
    const status = git(folder, gitEnv, 'status', '--porcelain')
    const at = git(folder, gitEnv, 'rev-parse', 'HEAD')
    if (status !== '' || at !== head) throw new Error(`the folder changed: HEAD ${at}, status ${JSON.stringify(status)}`)
  }
  foreground = onscreen ? null : await keepForeground()

  // Launch 0: warms Defender's first-read scan of the new files; discarded.
  console.log('warm-up launch (discarded) ...')
  {
    const warmDir = tmpDir('breccia-perf-warm-')
    const warm = await launch(folder, warmDir, gitEnv, join(warmDir, 'stderr.log'))
    await warm.page.locator('[data-testid="start-writing"]').waitFor({ timeout: 120_000 })
    await indexQuiet(warm.page)
    await warm.browser.close()
    stopApp()
    for (let i = 0; i < 40 && (await devtoolsUp()); i++) await sleep(250)
    restore()
  }

  const runs = []
  for (let n = 0; n < RUNS; n++) {
    console.log(`measured launch ${n + 1} of ${RUNS} ...`)
    const run = await measureLaunch(folder, gitEnv, n)
    restore()
    console.log(`  ${JSON.stringify(Object.fromEntries(Object.entries(run.values).map(([k, v]) => [k, round1(v)])))}`)
    console.log(`  ${JSON.stringify(run.notes)}`)
    runs.push(run)
  }

  const results = MEASURES.map(([name, bar]) => {
    const value = round1(median(runs.map((x) => x.values[name])))
    // INVALID: in some launch the first build was over before the measure (see the notes), so it measured other work.
    const bad = runs.filter((x) => x.invalid.includes(name)).length
    const ok = bad ? 'INVALID' : bar === null ? null : value <= bar
    const verdict = bad ? `INVALID (after the build in ${bad} of ${RUNS} launches)` : bar === null ? '' : ok ? 'ok' : 'OVER'
    console.log(`${name} ${value}ms ${bar === null ? '(no bar)' : bar}${verdict ? ` ${verdict}` : ''}`)
    return { name, value, unit: 'ms', bar, ok, runs: runs.map((x) => round1(x.values[name])) }
  })
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `${today}.json`)
  writeFileSync(
    file,
    JSON.stringify({ onscreen, runs: RUNS, files: written.files, links: written.links, results, notes: runs.map((x) => x.notes) }, null, 2) + '\n',
  )
  console.log(`wrote ${file}`)
  console.log(results.every((x) => x.ok === true || x.ok === null) ? 'every bar met' : 'some bars missed (see OVER and INVALID)')
} finally {
  foreground?.stop()
  stopApp()
  await sleep(500)
  for (const p of made) {
    try {
      rmSync(p, { recursive: true, force: true, maxRetries: 10 })
    } catch {}
  }
}
