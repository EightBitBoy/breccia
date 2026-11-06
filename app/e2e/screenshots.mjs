// `just screenshots`: the two README images, taken from a temp copy of docs/demo with the release exe.
// Like smoke.mjs it uses a temp config dir and BRECCIA_OFFSCREEN, so it never touches your notes or settings.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { snapshotFiles, writeShots } from './png.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exe = process.env.BRECCIA_EXE ?? join(root, 'target', 'release', 'breccia.exe')
const sample = join(root, 'docs', 'demo')
const outDir = join(root, 'docs', 'images')
const port = 9222
const WIDTH = 1280
const HEIGHT = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let app = null
let exited = null
let closing = false
let tmpDirs = []

function cleanup() {
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  for (const p of tmpDirs) {
    try {
      rmSync(p, { recursive: true, force: true, maxRetries: 10 })
    } catch {}
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL ${msg}`)
}

async function devtoolsUp() {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
  } catch {
    return false
  }
}

let failed = false
try {
  if (!existsSync(exe)) throw new Error(`${exe} not found; run "just build" first`)
  if (await devtoolsUp()) throw new Error(`port ${port} is in use (another Breccia or dev-debug?)`)

  const tmp = realpathSync.native(tmpdir())
  const configDir = mkdtempSync(join(tmp, 'breccia-shots-config-'))
  // The sidebar shows the folder's name, so the copy lives in a child with a readable one.
  const shotsRoot = mkdtempSync(join(tmp, 'breccia-shots-'))
  const folder = join(shotsRoot, 'My notes')
  tmpDirs = [configDir, shotsRoot]
  cpSync(sample, folder, { recursive: true })
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ theme: 'light' }))
  const before = snapshotFiles(folder)

  app = spawn(exe, [], {
    env: {
      ...process.env,
      BRECCIA_FOLDER: folder,
      BRECCIA_CONFIG_DIR: configDir,
      BRECCIA_TODAY: '2026-10-29',
      BRECCIA_OFFSCREEN: '1',
      GIT_CEILING_DIRECTORIES: tmp,
      GIT_TERMINAL_PROMPT: '0',
      // Its own WebView2 profile, never the installed app's (which an open Breccia holds).
      WEBVIEW2_USER_DATA_FOLDER: join(configDir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  })
  app.on('error', (e) => (exited = `app failed to start: ${e.message}`))
  app.on('exit', (code, sig) => (exited = closing ? 'closed' : `app exited early (code ${code}, signal ${sig})`))
  const end = Date.now() + 120_000
  while (!(await devtoolsUp())) {
    if (exited) throw new Error(exited)
    if (Date.now() > end) throw new Error('DevTools port did not answer within 120 s')
    await sleep(500)
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts()[0].pages()[0]
  await page.setViewportSize({ width: WIDTH, height: HEIGHT })

  // The status bar is quiet once the index is built (as smoke step 44 waits).
  await page.locator('[data-testid="status-bar"]').waitFor()
  await page.locator('[data-testid="status-item"][data-id="index"]').waitFor({ state: 'detached' })

  const shots = new Map()
  const shot = async (name) => {
    // scale 'css': one PNG pixel per CSS pixel, whatever the display scaling is.
    shots.set(name, await page.screenshot({ scale: 'css' }))
  }

  await page.locator('[data-testid="day"][data-day="2026-10-29"]').filter({ hasText: 'Standup with' }).waitFor()
  await shot('journal.png')

  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await page.locator('[data-testid="board-title"]').filter({ hasText: 'Tasks' }).waitFor()
  await page.locator('[data-testid="card"]').first().waitFor()
  await shot('board.png')

  // Close the app the normal way, then check that no note changed.
  closing = true
  spawnSync('taskkill', ['/PID', String(app.pid)], { stdio: 'ignore' }) // WM_CLOSE: the normal close path
  const closeEnd = Date.now() + 15_000
  while (!exited && Date.now() < closeEnd) await sleep(100)
  assert(exited, 'the app did not close')
  const after = snapshotFiles(folder)
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => !before.get(k)?.equals(after.get(k) ?? Buffer.alloc(0)) || !after.has(k))
  assert(changed.length === 0, `the run changed the sample copy: ${changed.join(', ')}`)
  console.log('sample copy unchanged')
  // Only now, with every check passed, do the images reach docs/images.
  for (const p of writeShots(outDir, shots, WIDTH, HEIGHT)) console.log(`${relative(root, p)} ${WIDTH}×${HEIGHT}`)
} catch (e) {
  failed = true
  console.error(e.message ?? e)
} finally {
  cleanup()
}
process.exit(failed ? 1 : 0)
