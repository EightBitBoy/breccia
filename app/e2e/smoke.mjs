// End-to-end smoke test: drives the release exe over the WebView2 DevTools
// port and checks the Markdown bytes on disk after each step.
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { keepForeground } from './foreground.mjs'
import { decodePng } from './png.mjs'
import { summarize } from './trace.mjs'
import { readVersions } from '../scripts/version.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exe = process.env.BRECCIA_EXE ?? join(root, 'target', 'release', 'breccia.exe')
const port = 9222
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayKey = (k) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const yesterday = dayKey(1)
const blankDay = dayKey(2)
const older = dayKey(3)
const yearRow = `y:${d.getFullYear()}`
const monthRow = `m:${d.getFullYear()}-${pad(d.getMonth() + 1)}`

const CONFIG_TOML = `[[states]]
keyword = "TODO"
color = "grey"
finished = false
in_cycle = true

[[states]]
keyword = "DOING"
color = "amber"
finished = false
in_cycle = true

[[states]]
keyword = "WAITING"
color = "violet"
finished = false
in_cycle = false

[[states]]
keyword = "DONE"
color = "green"
finished = true
in_cycle = true

[[boards]]
name = "Tasks"
columns = ["TODO", "DOING", "WAITING", "DONE"]

[board]
archive_after_days = 14
auto_archive = true

[git]
enabled = true
commit_delay_minutes = 5
pull_interval_minutes = 5
`

let folder = ''
let folder2 = ''
let journal = ''
let app = null
let logPath = ''
let logFd = null
let exited = null // set to a message when the app exits or fails to start
let foreground = null

// The app keeps machine-local settings and window state in its config dir; the
// run points it at a temp dir (BRECCIA_CONFIG_DIR), so the user's own is never read.
let configDir = ''
let gitHome = ''
let closing = false // step 50 closes the app on purpose

function cleanup() {
  foreground?.stop()
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  if (logFd !== null) {
    try {
      closeSync(logFd)
    } catch {}
  }
  for (const p of [folder, folder2, configDir, gitHome, logPath]) {
    if (!p) continue
    try {
      rmSync(p, { recursive: true, force: true, maxRetries: 10 })
    } catch {}
  }
}

const readAt = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
// A JSON file the app writes, or {} while it is not readable yet (before its first save, or for a moment while
// Windows replaces it), so a waitFor keeps waiting instead of throwing.
const jsonAt = (path) => {
  try {
    return JSON.parse(readAt(path))
  } catch {
    return {}
  }
}
async function expectFile(step, expected, path) {
  await sleep(1000) // longer than the 300 ms save pause
  const end = Date.now() + 3000
  let actual = readAt(path)
  while (actual !== expected && Date.now() < end) {
    await sleep(100)
    actual = readAt(path)
  }
  if (actual !== expected) {
    throw new Error(
      `FAIL ${step}
  expected: ${JSON.stringify(expected)}
  actual:   ${JSON.stringify(actual)}`,
    )
  }
  console.log(`PASS ${step}`)
}
// The time Breccia writes after a done or archived date: the run's own, so matched by pattern.
const TIME = '@TIME@'
const likeRe = (expected) =>
  new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(TIME, '\\d{2}:\\d{2}:\\d{2}')}$`)
/** Like `likeRe`, for the end of a text. */
const likeEnd = (expected) =>
  new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(TIME, '\\d{2}:\\d{2}:\\d{2}')}$`)
/** Like expectFile, with each `TIME` in `expected` standing for any `HH:MM:SS`; returns the file's text. */
async function expectFileLike(step, expected, path) {
  await sleep(1000) // longer than the 300 ms save pause
  const re = likeRe(expected)
  const end = Date.now() + 3000
  let actual = readAt(path)
  while (!re.test(actual) && Date.now() < end) {
    await sleep(100)
    actual = readAt(path)
  }
  if (!re.test(actual)) {
    throw new Error(
      `FAIL ${step}
  expected: ${JSON.stringify(expected)}
  actual:   ${JSON.stringify(actual)}`,
    )
  }
  console.log(`PASS ${step}`)
  return actual
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
async function waitForDevtools() {
  const end = Date.now() + 120_000
  while (Date.now() < end) {
    if (exited) throw new Error(exited)
    if (await devtoolsUp()) return
    await sleep(500)
  }
  throw new Error('DevTools port did not answer within 120 s')
}

let failed = false
try {
  if (!existsSync(exe)) throw new Error(`${exe} not found; run "just build" first`)
  if (await devtoolsUp()) {
    throw new Error(`port ${port} is in use (another Breccia or dev-debug?)`)
  }
  // Every path is under the real temp path, so GIT_CEILING_DIRECTORIES matches even when TEMP is an 8.3 short path.
  const tmp = realpathSync.native(tmpdir())
  configDir = mkdtempSync(join(tmp, 'breccia-e2e-config-'))
  folder = mkdtempSync(join(tmp, 'breccia-e2e-'))
  folder2 = mkdtempSync(join(tmp, 'breccia-e2e-second-'))
  mkdirSync(join(folder2, 'pages'))
  writeFileSync(join(folder2, 'pages', 'Other.md'), '- other folder\n')
  const goneFolder = join(tmp, `breccia-e2e-gone-${process.pid}`) // never created, so it needs no cleanup
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ recent_folders: [folder2, goneFolder] }))
  gitHome = mkdtempSync(join(tmp, 'breccia-e2e-git-')) // also holds remote.git and the second clone
  mkdirSync(join(folder, 'journals'))
  mkdirSync(join(folder, 'pages'))
  mkdirSync(join(folder, 'breccia'))
  writeFileSync(join(folder, 'breccia', 'config.toml'), CONFIG_TOML)
  mkdirSync(join(folder, 'pages', 'Projects'))
  writeFileSync(join(folder, 'pages', 'Projects', 'Project X.md'), '- plan\n')
  writeFileSync(join(folder, 'pages', 'Anna.md'), '- hello\n')
  writeFileSync(join(folder, 'pages', 'Release.md'), `- DONE ship\n  done:: [[${yesterday}]]\n`)
  writeFileSync(join(folder, 'journals', `${yesterday}.md`), '- yesterday note\n')
  writeFileSync(join(folder, 'journals', `${blankDay}.md`), '- \n')
  writeFileSync(join(folder, 'journals', `${older}.md`), '- older note\n')
  for (let k = 4; k <= 63; k++) writeFileSync(join(folder, 'journals', `${dayKey(k)}.md`), `- day ${k}\n`)
  journal = join(folder, 'journals', `${today}.md`)
  // Git never reads the developer's own configuration or a repository above the temp dirs.
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
  const git = (cwd, ...args) => {
    const r = spawnSync('git', ['-C', cwd, ...args], { env: { ...process.env, ...gitEnv }, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`FAIL git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  logPath = join(tmp, `breccia-e2e-${process.pid}.log`)
  logFd = openSync(logPath, 'w')
  foreground = await keepForeground()
  app = spawn(exe, [], {
    env: {
      ...process.env,
      BRECCIA_FOLDER: folder,
      BRECCIA_CONFIG_DIR: configDir,
      ...gitEnv,
      BRECCIA_TODAY: today, // a midnight during the run must not shift the app's day against dayKey
      // The window starts unfocused and off screen: the run never takes the keyboard.
      BRECCIA_OFFSCREEN: '1',
      // Step 127: the first search for this text panics inside the core, once per run.
      BRECCIA_TEST_PANIC: 'zz-panic-127',
      // Its own WebView2 profile, never the installed app's (which an open Breccia holds).
      WEBVIEW2_USER_DATA_FOLDER: join(configDir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: ['ignore', logFd, logFd],
  })
  app.on('error', (e) => (exited = `app failed to start: ${e.message}`))
  app.on('exit', (code, sig) => !closing && (exited = `app exited early (code ${code}, signal ${sig})`))
  await waitForDevtools()
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts()[0].pages()[0]
  const kb = page.keyboard

  // 1
  await page.locator('[data-testid="start-writing"]').waitFor()
  // The window shows: keys typed elsewhere during the run must not reach its editor.
  console.log(`foreground: ${await foreground.handBack(app.pid)}`)
  // BRECCIA_OFFSCREEN: the window is shown far off every screen, and the page still counts as visible.
  const placed = await page.evaluate(() => ({ x: window.screenX, y: window.screenY, state: document.visibilityState }))
  console.log(`window: at ${placed.x},${placed.y}, ${placed.state}`)
  assert(placed.x < -5000 && placed.y < -5000, 'window is not off screen')
  assert(placed.state === 'visible', 'page is not visible')
  // WEBVIEW2_USER_DATA_FOLDER took effect: the profile is in the run's own folder.
  assert(existsSync(join(configDir, 'webview', 'EBWebView')), 'WebView2 profile is not in the run folder')
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('Standup with [[Anna]]')
  await expectFile('1 type first block', '- Standup with [[Anna]]\n', journal)

  // 2
  await kb.press('Enter')
  await kb.type('😀 TODO later')
  await kb.press('Home')
  await kb.press('ArrowRight')
  await kb.press('ArrowRight')
  await kb.press('Enter')
  const afterStep2 = '- Standup with [[Anna]]\n- 😀\n- TODO later\n'
  await expectFile('2 split block', afterStep2, journal)

  // 3
  await kb.press('Tab')
  await expectFile('3 indent', '- Standup with [[Anna]]\n- 😀\n\t- TODO later\n', journal)

  // 4
  await kb.press('Control+Enter')
  await sleep(400)
  await kb.press('Control+Enter')
  await expectFileLike(
    '4 cycle task state',
    `- Standup with [[Anna]]\n- 😀\n\t- DONE later\n\t  done:: [[${today}]] ${TIME}\n`,
    journal,
  )

  // 5: each undo is waited for on disk, so none is lost to the one before
  await kb.press('Control+z')
  await expectFile('5 undo DONE', '- Standup with [[Anna]]\n- 😀\n\t- DOING later\n', journal)
  await kb.press('Control+z')
  await expectFile('5 undo DOING', '- Standup with [[Anna]]\n- 😀\n\t- TODO later\n', journal)
  await kb.press('Control+z')
  await expectFile('5 undo state changes and indent', afterStep2, journal)

  // 6
  await kb.press('End')
  await kb.type(' /do')
  const menu = page.locator('[data-testid="slash-menu"]')
  await menu.waitFor()
  const selected = () => menu.locator('.selected').first().innerText()
  const first = await selected()
  await kb.press('ArrowDown')
  const second = await selected()
  assert(await menu.isVisible(), 'slash menu closed on ArrowDown')
  await kb.press('ArrowUp')
  assert(await menu.isVisible(), 'slash menu closed on ArrowUp')
  assert((await selected()) === first, `ArrowUp did not return the highlight (${first})`)
  const items = await menu.locator('.slash-item').count()
  if (items > 1) assert(second !== first, 'ArrowDown did not move the highlight')
  console.log(`PASS 6a slash menu arrows keep the menu open (${items} items)`)
  assert(first.startsWith('DOING'), `first match is not DOING: ${first}`)
  await kb.press('Enter')
  await expectFile('6 slash DOING', '- Standup with [[Anna]]\n- 😀\n- DOING later\n', journal)

  // 7
  await kb.press('Enter')
  await sleep(300)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '- a\n- b')
    document
      .querySelector('.cm-content')
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expectFile('7 paste outline', '- Standup with [[Anna]]\n- 😀\n- DOING later\n- a\n- b\n', journal)

  // 8
  await kb.press('Enter')
  await kb.type('<script>x</script>')
  await expectFile(
    '8 file keeps script text',
    '- Standup with [[Anna]]\n- 😀\n- DOING later\n- a\n- b\n- <script>x</script>\n',
    journal,
  )
  await kb.press('Escape')
  await sleep(300)
  assert((await page.locator('.outline script, [data-block-id] script').count()) === 0, 'script element in outline')
  assert(await page.getByText('<script>x</script>').first().isVisible(), 'script text not visible')
  console.log('PASS 8 no script element, text visible')

  // 9: the sidebar lists the journals, folds open, and hides
  const side = page.locator('[data-testid="sidebar"]')
  await side.waitFor()
  await side.locator('[data-row="j"]').click()
  await side.locator(`[data-row="${yearRow}"]`).click()
  await side.locator(`[data-row="${monthRow}"]`).click()
  assert((await side.locator(`[data-row="d:${today}"]`).count()) === 1, 'today missing under Journals')
  console.log('PASS 9 sidebar shows today under Journals')
  await page.getByLabel('Toggle sidebar').click()
  assert((await side.count()) === 0, 'sidebar not hidden')
  console.log('PASS 9b sidebar hides')

  // 10: page operations from the tree's context menu and the page title
  const pagesDir = join(folder, 'pages')
  const waitPath = async (step, path, want) => {
    const end = Date.now() + 5000
    while (existsSync(path) !== want && Date.now() < end) await sleep(100)
    assert(existsSync(path) === want, `${step}: ${path} ${want ? 'missing' : 'still there'}`)
  }
  const waitText = async (step, path, text) => {
    const end = Date.now() + 5000
    while (!(existsSync(path) && readFileSync(path, 'utf8').includes(text)) && Date.now() < end) await sleep(100)
    assert(existsSync(path) && readFileSync(path, 'utf8').includes(text), `${step}: ${path} lacks ${text}`)
  }
  const title = page.locator('[data-testid="page-title"]')
  const nameInput = page.locator('[data-testid="name-input"]')
  const ok = page.locator('[data-testid="dialog-ok"]')
  const pick = async (target, op) => {
    await target.click({ button: 'right' })
    await page.locator(`[data-op="${op}"]`).click()
  }
  const ask = async (name) => {
    await nameInput.fill(name)
    await ok.click()
  }
  await page.getByLabel('Toggle sidebar').click()
  await side.waitFor()
  assert((await page.locator('[data-op]').count()) === 0, 'menu open before right click')

  await side.locator('.group', { hasText: 'Pages' }).click({ button: 'right' })
  const ops = await page.locator('[data-op]').evaluateAll((els) => els.map((e) => e.getAttribute('data-op')))
  assert(ops.join() === 'newPage,newFolder', `tree menu ops: ${ops}`)
  await page.keyboard.press('Escape')
  await pick(side.locator('.group', { hasText: 'Pages' }), 'newPage')
  await ask('Alpha')
  await title.filter({ hasText: 'Alpha' }).waitFor()
  // A new page has no file until it has content.
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('first')
  await kb.press('Escape')
  await waitPath('10a new page', join(pagesDir, 'Alpha.md'), true)
  console.log('PASS 10a new page from the menu')

  await pick(side.locator('.group', { hasText: 'Pages' }), 'newPage')
  await ask('Beta')
  await title.filter({ hasText: 'Beta' }).waitFor()
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('see [[Alpha]]')
  await kb.press('Escape')
  await waitText('10b', join(pagesDir, 'Beta.md'), '[[Alpha]]')
  await pick(side.locator('[data-row="p:alpha"]'), 'rename')
  await ask('Gamma')
  const confirmText = await page.locator('[role="alertdialog"]').innerText()
  assert(confirmText.includes('Links in 1 page will be updated'), `rename confirm: ${confirmText}`)
  await ok.click()
  await waitPath('10b renamed', join(pagesDir, 'Gamma.md'), true)
  await waitPath('10b old name gone', join(pagesDir, 'Alpha.md'), false)
  await waitText('10b link rewritten', join(pagesDir, 'Beta.md'), '[[Gamma]]')
  assert((await title.innerText()).includes('Beta'), 'renaming another page changed the view')
  console.log('PASS 10b rename with link count rewrites links, view stays')

  await title.click()
  await nameInput.fill('Delta')
  await kb.press('Enter')
  await title.filter({ hasText: 'Delta' }).waitFor()
  await waitPath('10c title rename', join(pagesDir, 'Delta.md'), true)
  await waitPath('10c old name gone', join(pagesDir, 'Beta.md'), false)
  console.log('PASS 10c rename from the page title')
  await title.click()
  await nameInput.fill('Nope')
  await kb.press('Escape')
  assert((await title.innerText()).includes('Delta'), 'Escape did not cancel the title rename')

  await pick(side.locator('.group', { hasText: 'Pages' }), 'newFolder')
  await ask('Fold')
  await waitPath('10d folder', join(pagesDir, 'Fold'), true)
  await side.locator('[data-row="f:Fold"]').waitFor()
  await pick(side.locator('[data-row="p:delta"]'), 'move')
  await page.locator('[data-target="Fold"]').click()
  await ok.click()
  await waitPath('10d moved', join(pagesDir, 'Fold', 'Delta.md'), true)
  await waitPath('10d left old place', join(pagesDir, 'Delta.md'), false)
  console.log('PASS 10d new folder and move a page')

  // The moved page is shown, so the sidebar reveals its new folder by itself.
  await side.locator('[data-row="f:Fold"][aria-expanded="true"]').waitFor()

  await pick(side.locator('[data-row="p:delta"]'), 'delete')
  await ok.click()
  await waitPath('10e deleted', join(pagesDir, 'Fold', 'Delta.md'), false)
  await page.locator('[data-testid="journal-feed"]').waitFor()
  await pick(side.locator('[data-row="f:Fold"]'), 'delete')
  await ok.click()
  await waitPath('10e folder deleted', join(pagesDir, 'Fold'), false)
  console.log('PASS 10e delete a page (shown: back to the journal) and a folder')

  // 11: link autocomplete; click the last block's plain text, not a link
  const afterStep8 = '- Standup with [[Anna]]\n- 😀\n- DOING later\n- a\n- b\n- <script>x</script>\n'
  const editor = page.locator('.cm-content')
  await page.getByText('<script>x</script>').first().click()
  await editor.waitFor()
  await kb.press('End')
  await kb.press('Enter')
  await kb.type('see [[Proj')
  const linkMenu = page.locator('[data-testid="link-menu"]')
  await linkMenu.waitFor()
  const firstLink = await linkMenu.locator('.slash-item').first().innerText()
  assert(firstLink.startsWith('Project X'), `first link suggestion is not Project X: ${firstLink}`)
  await kb.press('Enter')
  const afterStep11 = `${afterStep8}- see [[Project X]]\n`
  await expectFile('11 link autocomplete picks Project X', afterStep11, journal)

  // 12: tag autocomplete
  await kb.type(' #ann')
  await linkMenu.waitFor()
  await kb.press('Enter')
  await expectFile('12 tag autocomplete picks Anna', `${afterStep11.trimEnd()} #Anna\n`, journal)
  await kb.press('Escape')

  // 13: navigate the tree to the page; its linked reference shows the block
  await side.locator('[data-row="f:Projects"]').click()
  await side.locator('[data-row="p:project x"]').click()
  await title.filter({ hasText: 'Project X' }).waitFor()
  const refs = page.locator('[data-testid="linked-refs"]')
  await refs.waitFor()
  const refsText = await refs.innerText()
  assert(refsText.includes('Linked references · 1'), `linked refs header: ${refsText}`)
  assert(refsText.includes('see Project X'), `linked refs lack the block: ${refsText}`)
  console.log('PASS 13 tree navigation shows the page and its linked reference')

  // 14: edit the block inside the reference
  await refs.getByText('see', { exact: false }).first().click({ position: { x: 3, y: 5 } })
  await editor.waitFor()
  await kb.press('End')
  await kb.type(' now')
  await expectFile('14 edit in a linked reference', `${afterStep11.trimEnd()} #Anna now\n`, journal)
  await kb.press('Escape')

  // 15: rename through the tree's context menu rewrites the links
  await pick(side.locator('[data-row="p:project x"]'), 'rename')
  await ask('Project Y')
  await ok.click() // confirm the link rewrite
  const projects = join(pagesDir, 'Projects')
  await waitPath('15 renamed', join(projects, 'Project Y.md'), true)
  await waitPath('15 old name gone', join(projects, 'Project X.md'), false)
  assert(readAt(join(projects, 'Project Y.md')) === '- plan\n', 'renamed page content changed')
  const afterStep15 = `${afterStep8}- see [[Project Y]] #Anna now\n`
  await expectFile('15 rename rewrites the link', afterStep15, journal)

  // 16: an external edit while editing shows a conflict; Keep mine wins
  // The feed is home since 10e, so no shown day page has revealed today's row: fold it open.
  // Open each row only when its child is missing, so a click never folds a row closed.
  if ((await side.locator(`[data-row="d:${today}"]`).count()) === 0) {
    if ((await side.locator(`[data-row="${monthRow}"]`).count()) === 0) {
      if ((await side.locator(`[data-row="${yearRow}"]`).count()) === 0) await side.locator('[data-row="j"]').click()
      await side.locator(`[data-row="${yearRow}"]`).click()
    }
    await side.locator(`[data-row="${monthRow}"]`).click()
  }
  await side.locator(`[data-row="d:${today}"]`).click()
  await title.filter({ hasText: /\d{4}/ }).waitFor()
  await page.getByText('Standup').first().click({ position: { x: 3, y: 5 } })
  await editor.waitFor()
  assert((await editor.innerText()).includes('Standup with [[Anna]]'), 'first block not in edit mode')
  const external = afterStep15.replace('- Standup with [[Anna]]\n', '- Standup with [[Anna]] and Ben\n')
  assert(external !== afterStep15, 'external edit did not change the text')
  writeFileSync(journal, external)
  const notice = page.locator('.notice').filter({ hasText: 'changed on disk while you were editing' })
  await notice.waitFor({ timeout: 10_000 })
  const noticeText = await notice.innerText()
  assert(noticeText.includes('Standup with [[Anna]]') && noticeText.includes('and Ben'), `conflict notice: ${noticeText}`)
  const shown = await editor.innerText()
  assert(shown.includes('Standup with [[Anna]]') && !shown.includes('and Ben'), `editor changed under the user: ${shown}`)
  await notice.getByRole('button', { name: 'Keep mine' }).click()
  await expectFile('16 keep mine restores the first line', afterStep15, journal)

  // 17: new page from the empty tree area
  await kb.press('Escape')
  await pick(side.locator('.group', { hasText: 'Pages' }), 'newPage')
  await ask('Fresh')
  await title.filter({ hasText: 'Fresh' }).waitFor()
  await page.locator('[data-testid="start-writing"]').click()
  await editor.waitFor()
  await kb.type('x')
  await expectFile('17 new page Fresh', '- x\n', join(pagesDir, 'Fresh.md'))
  await side.locator('[data-row="p:fresh"]').waitFor()
  console.log('PASS 17b new page is in the tree')

  // 18: the journal feed lists non-empty days newest first
  const feed = page.locator('[data-testid="journal-feed"]')
  const days = () => page.locator('[data-testid="day"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')))
  await kb.press('Escape')
  await page.locator('[data-testid="nav-journal"]').click()
  await feed.waitFor()
  await page.locator(`[data-day="${older}"]`).waitFor()
  const dayList = await days()
  assert(
    JSON.stringify(dayList.slice(0, 3)) === JSON.stringify([today, yesterday, older]),
    `feed day order: ${dayList.slice(0, 5)}`,
  )
  assert((await page.locator(`[data-day="${blankDay}"]`).count()) === 0, 'blank day shown in the feed')
  assert((await page.locator('[data-testid="linked-refs"]').count()) === 0, 'linked refs shown in the feed')
  console.log('PASS 18 feed order, blank day hidden, no linked refs')

  // 19: edit an older day in place
  const yesterdayFile = join(folder, 'journals', `${yesterday}.md`)
  await page.getByText('yesterday note').first().click({ position: { x: 3, y: 5 } })
  await editor.waitFor()
  await kb.press('End')
  await kb.type(' edited')
  await expectFile('19 edit yesterday in the feed', '- yesterday note edited\n', yesterdayFile)

  // 20: ArrowUp moves the editor to today's last block
  await kb.press('ArrowUp')
  await kb.type('!')
  const afterStep20 = afterStep15.replace('#Anna now\n', '#Anna now!\n')
  assert(afterStep20 !== afterStep15, 'step 20 text did not change')
  await expectFile('20 ArrowUp crosses into today', afterStep20, journal)

  // 21: virtualised feed; scroll to the oldest day while editing
  await kb.press('Escape')
  assert((await page.locator('[data-testid="day"]').count()) < 40, 'feed not virtualised')
  await page.getByText('Standup').first().click({ position: { x: 3, y: 5 } })
  await editor.waitFor()
  await kb.press('End')
  const oldest = page.locator(`[data-day="${dayKey(63)}"]`)
  const scrollEnd = Date.now() + 10_000
  while (Date.now() < scrollEnd) {
    if ((await oldest.count()) > 0) break
    await page.locator('.main').evaluate((el) => (el.scrollTop = el.scrollHeight))
    await sleep(200)
  }
  await oldest.waitFor({ timeout: 1000 })
  assert((await page.locator('[data-testid="day"]').count()) < 40, 'feed not virtualised at the oldest day')
  assert((await oldest.innerText()).includes('day 63'), 'oldest day lacks its text')
  assert((await page.locator('.cm-content').count()) === 1, 'editor count after scrolling')
  await kb.type('!')
  const afterStep21 = afterStep20.replace('- Standup with [[Anna]]\n', '- Standup with [[Anna]]!\n')
  assert(afterStep21 !== afterStep20, 'step 21 text did not change')
  await expectFile('21 editing survives scrolling the feed', afterStep21, journal)

  // 22: a day title opens the day page
  await kb.press('Escape')
  await page.locator('.main').evaluate((el) => (el.scrollTop = 0))
  const dayTitle = page.locator(`[data-day="${yesterday}"] [data-testid="day-title"]`)
  const titleText = (await dayTitle.innerText()).trim()
  await dayTitle.click()
  await title.filter({ hasText: titleText }).waitFor()
  await refs.waitFor()
  assert((await refs.innerText()).includes('ship'), 'yesterday page lacks the Release reference')
  console.log('PASS 22 day title opens the day page with linked references')

  // 23: an external change to a shown day appears in the feed
  await page.locator('[data-testid="nav-journal"]').click()
  await feed.waitFor()
  await page.locator(`[data-day="${yesterday}"]`).getByText('yesterday note edited').waitFor({ timeout: 10_000 })
  writeFileSync(yesterdayFile, '- yesterday note edited\n- from outside\n')
  await page.locator(`[data-day="${yesterday}"]`).getByText('from outside').waitFor({ timeout: 10_000 })
  console.log('PASS 23 external edit appears in the feed')

  // 24: an externally revived blank day appears in order
  writeFileSync(join(folder, 'journals', `${blankDay}.md`), '- revived\n')
  await page.locator(`[data-day="${blankDay}"]`).waitFor({ timeout: 10_000 })
  // The day lands inside the rows on screen: it is loaded, not left at "…".
  await page.locator(`[data-day="${blankDay}"]`).getByText('revived').waitFor({ timeout: 10_000 })
  const order = await days()
  const iy = order.indexOf(yesterday)
  const ib = order.indexOf(blankDay)
  const io = order.indexOf(older)
  assert(iy >= 0 && iy < ib && ib < io, `revived day order: ${order.slice(0, 6)}`)
  console.log('PASS 24 revived day appears between its neighbours')

  const waitFor = async (what, fn, want, timeout = 10_000) => {
    const end = Date.now() + timeout
    let got = await fn()
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() < end) {
      await sleep(100)
      got = await fn()
    }
    assert(JSON.stringify(got) === JSON.stringify(want), `${what}: ${JSON.stringify(got)}`)
  }
  const releaseFile = join(folder, 'pages', 'Release plan.md')
  const releaseText = (write, update, archived = false) =>
    `- TODO Release version 2\n\t- ${write} Write release notes\n\t- ${update} Update the changelog\n\t  done:: [[${older}]]\n${archived ? `\t  archived:: ${archived}\n` : ''}\t- Check with [[Anna]] about the date\n`
  const column = (state) => page.locator(`[data-testid="column"][data-state="${state}"]`)
  const cardTitled = (text) =>
    page.locator('[data-testid="card"]').filter({ has: page.locator('[data-testid="card-title"]', { hasText: new RegExp(`^${text}$`) }) })
  const titlesIn = (state) => column(state).locator('[data-testid="card-title"]').allInnerTexts()

  // 25: the board shows tasks from every page; a page added on disk appears
  await kb.press('Escape')
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await page.locator('[data-testid="board-title"]').filter({ hasText: 'Tasks' }).waitFor()
  writeFileSync(releaseFile, releaseText('TODO', 'DONE'))
  await cardTitled('Release version 2').waitFor({ timeout: 10_000 })
  const todo = await titlesIn('TODO')
  assert(todo.indexOf('Release version 2') >= 0 && todo.indexOf('Release version 2') < todo.indexOf('Write release notes'), `TODO order: ${todo}`)
  const release = await cardTitled('Release version 2').innerText()
  assert(release.includes('Check with Anna about the date') && release.includes('1/2 subtasks'), `release card: ${release}`)
  assert((await cardTitled('Write release notes').innerText()).includes('↳ Release version 2'), 'parent line missing')
  const done = await titlesIn('DONE')
  assert(done.includes('Update the changelog') && done.includes('ship'), `DONE column: ${done}`)
  const cardDeco = await cardTitled('Update the changelog')
    .locator('.done-text')
    .evaluate((el) => getComputedStyle(el).textDecorationLine)
  assert(cardDeco === 'line-through', `25 DONE card not struck through: ${cardDeco}`)
  console.log('PASS 25 board shows cards with description, subtasks and parent')

  // 26: dragging a card to another column changes the block's state in its file
  await cardTitled('Write release notes').dragTo(column('DOING'))
  await expectFile('26 drag changes the state in the file', releaseText('DOING', 'DONE'), releaseFile)
  await column('DOING').locator('[data-testid="card-title"]', { hasText: 'Write release notes' }).waitFor()

  // 27: Archive from the card menu adds archived:: and keeps the state; the card goes
  const cardMenuOf = async (text) => {
    await cardTitled(text).hover()
    await cardTitled(text).locator('[data-testid="card-menu"]').click()
  }
  await cardMenuOf('Update the changelog')
  await page.locator('[data-testid="menu-archive"]').click()
  const text27 = await expectFileLike('27 archive from the card menu', releaseText('DOING', 'DONE', `${today} ${TIME}`), releaseFile)
  const archived27 = /archived:: (\S+ \S+)\n/.exec(text27)[1]
  await cardTitled('Update the changelog').waitFor({ state: 'detached', timeout: 5000 })

  // 81: no "Show archived" on the board; Archive in the sidebar lists the archived task with its dates and page; the
  // filter narrows the list; a row opens its page at the block, highlighted, and leaves the view; nothing is written
  assert((await page.locator('[data-testid="show-archived"]').count()) === 0, '81 the board still offers Show archived')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const longDay = (key) => {
    const [y, m, dd] = key.split('-')
    return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`
  }
  const navArchive = page.locator('[data-testid="nav-archive"]')
  const archiveRows = page.locator('[data-testid="archive-row"]')
  const archiveCells = () =>
    archiveRows.evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent.trim())))
  await navArchive.click()
  await page.locator('[data-testid="archive"]').waitFor()
  await page.locator('[data-testid="board-title"]').waitFor({ state: 'detached' })
  await waitFor('81 rows', archiveCells, [['Update the changelog', 'DONE', '—', longDay(older), '—', longDay(today), 'Release plan']])
  assert((await page.locator('[data-testid="nav-archive"].active').count()) === 1, '81 Archive entry not highlighted')
  assert((await page.locator('[data-testid="archive-count"]').innerText()) === '1 task', '81 count')
  const archiveFilter = page.locator('[data-testid="archive-filter"]')
  await archiveFilter.fill('zzz')
  await page.locator('[data-testid="archive-empty"]', { hasText: 'No archived tasks match.' }).waitFor()
  await archiveFilter.press('Escape')
  await archiveFilter.fill('changelog release')
  await waitFor('81 filtered rows', async () => (await archiveCells()).map((r) => r[0]), ['Update the changelog'])
  await archiveRows.first().click()
  await title.filter({ hasText: 'Release plan' }).waitFor()
  await page.locator('.block.flash', { hasText: 'Update the changelog' }).waitFor({ timeout: 5000 })
  await page.locator('[data-testid="archive"]').waitFor({ state: 'detached' })
  assert((await page.locator('[data-testid="nav-archive"].active').count()) === 0, '81 Archive entry still highlighted')
  assert(readAt(releaseFile) === releaseText('DOING', 'DONE', archived27), '81 the Archive view wrote to the file')
  console.log('PASS 81 the Archive view lists the archived task, filters, and jumps to its block')
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await page.locator('[data-testid="board-title"]').filter({ hasText: 'Tasks' }).waitFor()

  // 28: a card opens in place, shows its children and edits the source block
  await cardTitled('Release version 2').locator('[data-testid="card-title"]').click()
  const openCard = page.locator('[data-card-open]')
  await openCard.locator('.cm-content').waitFor()
  assert((await openCard.locator('[data-block-id]').count()) === 4, 'open card does not show all children')
  await kb.press('End')
  await kb.type(' now')
  await expectFile('28 edit a card in place', releaseText('DOING', 'DONE', archived27).replace('version 2\n', 'version 2 now\n'), releaseFile)
  await kb.press('Escape')
  await kb.press('Escape')
  await openCard.waitFor({ state: 'detached', timeout: 5000 })
  await cardTitled('Release version 2 now').waitFor({ timeout: 5000 })

  // 29: + Add appends to today's journal and edits on the board; an empty add is removed again
  await column('WAITING').locator('[data-testid="add-card"]').click()
  await openCard.locator('.cm-content').waitFor()
  await kb.type('Call Ben')
  await waitText('29 + Add appends to today', journal, '- WAITING Call Ben\n')
  await kb.press('Escape')
  await kb.press('Escape')
  await cardTitled('Call Ben').waitFor({ timeout: 5000 })
  const beforeEmpty = readAt(journal)
  // The new task got its created:: line when "+ Add" made it.
  assert(likeEnd(`- WAITING Call Ben\n  created:: ${today} ${TIME}\n`).test(beforeEmpty), `journal end: ${JSON.stringify(beforeEmpty.slice(-60))}`)
  console.log('PASS 29 + Add appends to today and edits on the board')
  await column('TODO').locator('[data-testid="add-card"]').click()
  await openCard.locator('.cm-content').waitFor()
  // The bare block must reach the disk first, or the removal below proves nothing.
  await waitText('29b empty card appended', journal, beforeEmpty + '- TODO')
  await kb.press('Escape')
  await kb.press('Escape')
  await expectFile('29b an empty added card is removed', beforeEmpty, journal)

  // 67: a click on the search backdrop closes only the search; the open card stays
  await cardTitled('Release version 2 now').locator('[data-testid="card-title"]').click()
  await openCard.locator('.cm-content').waitFor()
  await kb.press('Control+k')
  await page.locator('[data-testid="search-input"]').waitFor()
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } })
  await page.locator('[data-testid="search"]').waitFor({ state: 'detached', timeout: 5000 })
  assert((await openCard.count()) === 1, 'the open card closed with the search')
  await kb.press('Escape')
  await kb.press('Escape')
  await openCard.waitFor({ state: 'detached', timeout: 5000 })
  console.log('PASS 67 a click outside search closes only search, not the open card')

  // 30: the jump icon opens the source page and highlights the block
  await cardTitled('Write release notes').hover()
  await cardTitled('Write release notes').locator('[data-testid="card-jump"]').click()
  await title.filter({ hasText: 'Release plan' }).waitFor()
  await page.locator('.flash', { hasText: 'Write release notes' }).waitFor({ timeout: 2000 })
  // A finished task on a page is greyed out, not struck through (on a card it is, step 25)
  const pageDone = page.locator('.content .done-text', { hasText: 'Update the changelog' })
  const doneDeco = await pageDone.evaluate((el) => getComputedStyle(el).textDecorationLine)
  assert(doneDeco === 'none', `30 DONE text on a page is struck through: ${doneDeco}`)
  // A link inside a finished task's text is dimmed too, not in the full link colour.
  const linkColours = await page.evaluate(() => {
    const plain = document.createElement('a')
    plain.className = 'link'
    const done = document.createElement('span')
    done.className = 'done-text'
    const inner = document.createElement('a')
    inner.className = 'link'
    done.append(inner)
    document.body.append(plain, done)
    const out = [getComputedStyle(plain).color, getComputedStyle(inner).color]
    plain.remove()
    done.remove()
    return out
  })
  assert(linkColours[0] !== linkColours[1], `30 a link in DONE text has the full link colour: ${linkColours}`)
  console.log('PASS 30 jump opens the source page and highlights the block')

  // 31: a new board with two columns is written to config.toml, the rest of the file kept
  await page.locator('[data-testid="new-board"]').click()
  await ask('Focus')
  await page.locator('[data-testid="board-title"]').filter({ hasText: 'Focus' }).waitFor()
  await page.locator('[data-testid="board-title"]').click()
  await page.locator('[data-testid="remove-column"][data-state="TODO"]').click()
  await page.locator('[data-testid="remove-column"][data-state="DONE"]').click()
  await page.locator('[data-testid="save-board"]').click()
  const configFile = join(folder, 'breccia', 'config.toml')
  await waitText('31 board written', configFile, 'name = "Focus"')
  await waitText('31 columns written', configFile, '"DOING", "WAITING"')
  assert(readAt(configFile).includes('[git]'), 'config.toml lost its [git] section')
  await column('TODO').waitFor({ state: 'detached', timeout: 5000 })
  assert((await page.locator('[data-testid="column"]').count()) === 2, 'Focus does not show two columns')
  console.log('PASS 31 new board with two columns saved to config.toml')

  const allPages = page.locator('[data-testid="all-pages"]')
  const rowNames = () => allPages.locator('[data-testid="page-row"] [data-cell="name"]').allInnerTexts()
  const cell = (key, col) => allPages.locator(`[data-testid="page-row"][data-key="${key}"] [data-cell="${col}"]`)
  const header = (col) => allPages.locator(`[data-testid="col"][data-col="${col}"]`)
  const count = () => allPages.locator('[data-testid="pages-count"]').innerText()
  const filterBox = page.locator('[data-testid="pages-filter"]')

  // 78: the + and - by the board title change the column width; it is saved in settings.json
  const colWidth = async () => Math.round((await column('TODO').boundingBox()).width)
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await page.locator('[data-testid="col-slider"]').waitFor()
  await page.locator('[data-testid="col-wider"]').click()
  await waitFor('78 first step', colWidth, 270)
  await page.locator('[data-testid="col-wider"]').click()
  await waitFor('78 second step', colWidth, 280)
  await page.locator('[data-testid="col-narrower"]').click()
  await waitFor('78 back one step', colWidth, 270)
  await waitFor('78 saved', () => jsonAt(join(configDir, 'settings.json')).board_column_width, 270)
  console.log('PASS 78 the column width buttons resize the columns and the width is saved')

  // 107: columns wider than the view scroll sideways with the main view's own scrollbar, which
  // stays at the bottom of the window; the columns have no scrollbar of their own
  await page.locator('[data-testid="col-slider"]').fill('520')
  await waitFor('107 wide columns', colWidth, 520)
  const scrollers = () =>
    page.evaluate(() => {
      const main = document.querySelector('.main')
      const cols = document.querySelector('.cols')
      return {
        main: main.scrollWidth > main.clientWidth,
        cols: getComputedStyle(cols).overflowX,
      }
    })
  await waitFor('107 the main view scrolls sideways', scrollers, { main: true, cols: 'visible' })
  // Scrolled fully right, the title row and its width control are still in sight.
  const titleInView = () =>
    page.evaluate(() => {
      const main = document.querySelector('.main')
      main.scrollLeft = main.scrollWidth
      const box = main.getBoundingClientRect()
      const title = document.querySelector('.board .ptitle').getBoundingClientRect()
      const control = document.querySelector('[data-testid="col-width"]').getBoundingClientRect()
      return main.scrollLeft > 0 && title.left >= box.left && control.right <= box.right
    })
  await waitFor('107 the title row stays in sight', titleInView, true)
  await page.evaluate(() => { document.querySelector('.main').scrollLeft = 0 })
  await page.locator('[data-testid="col-slider"]').fill('270')
  await waitFor('107 width back', () => jsonAt(join(configDir, 'settings.json')).board_column_width, 270)
  console.log('PASS 107 wide board columns scroll with the main view, whose scrollbar stays in sight')

  // 111: the scrollbars of the main view and the sidebar's page list show only while the pointer moves over them
  // or they scroll, and hide about 1 s after it rests; their space stays
  const scrollbarOf = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s)
    return { on: el.classList.contains('sb-on'), clear: getComputedStyle(el).scrollbarColor === 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)' }
  }, sel)
  for (const sel of ['.main', '.tree']) {
    const box = await page.locator(sel).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 40)
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + 45)
    await waitFor(`111 ${sel} shows its scrollbar while the pointer moves`, () => scrollbarOf(sel), { on: true, clear: false })
    await waitFor(`111 ${sel} hides it once the pointer rests`, () => scrollbarOf(sel), { on: false, clear: true }, 5000)
  }
  console.log('PASS 111 the main view and the sidebar show their scrollbars only while the pointer moves or they scroll')

  // 108: hovering a column shows a hide icon in its title; a click hides the column, which leaves a thin marker
  // whose tooltip names it and its cards; settings.json keeps it per folder and board; it stays hidden when the
  // board is opened again; a click on the marker shows the column again
  const settingsFile = join(configDir, 'settings.json')
  const hiddenSaved = () => {
    const all = jsonAt(settingsFile).hidden_columns ?? {}
    const keys = Object.keys(all)
    const norm = (p) => p.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
    if (keys.length === 0) return []
    return keys.length === 1 && norm(keys[0]) === norm(folder) ? all[keys[0]].Tasks ?? [] : `keys: ${keys}`
  }
  const marker = (state) => page.locator(`[data-testid="hidden-column"][data-state="${state}"]`)
  const waitingCards = Number(await column('WAITING').locator('.count').innerText())
  const hideIcon = (state) => column(state).locator('[data-testid="hide-column"]')
  assert(!(await hideIcon('WAITING').isVisible()), '108 the hide icon shows without a hover')
  await column('WAITING').locator('h4').hover()
  await hideIcon('WAITING').waitFor({ state: 'visible' })
  await hideIcon('WAITING').click()
  await marker('WAITING').waitFor()
  await column('WAITING').waitFor({ state: 'detached' })
  const tip = await marker('WAITING').getAttribute('title')
  assert(tip === `WAITING (${waitingCards} ${waitingCards === 1 ? 'card' : 'cards'}), click to show`, `108 tooltip: ${tip}`)
  const markerWidth = (await marker('WAITING').boundingBox()).width
  assert(markerWidth <= 16, `108 the marker is ${markerWidth} px wide`)
  await waitFor('108 saved', hiddenSaved, ['WAITING'])
  await page.locator('[data-testid="nav-journal"]').click()
  await column('TODO').waitFor({ state: 'detached' })
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await column('TODO').waitFor()
  assert((await marker('WAITING').count()) === 1 && (await column('WAITING').count()) === 0, '108 WAITING shows after reopening')
  // Showing it again is animated too, as hiding is: the column widens from its marker.
  await page.evaluate(() => {
    window.__widened = null
    const seen = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement) || n.dataset.testid !== 'column' || n.dataset.state !== 'WAITING') continue
          seen.disconnect()
          let frames = 0
          const look = () => {
            if (n.getAnimations().length > 0) window.__widened = true
            else if (++frames < 20) requestAnimationFrame(look)
            else window.__widened = false
          }
          look()
        }
      }
    })
    seen.observe(document.querySelector('.cols'), { childList: true })
  })
  await marker('WAITING').click()
  await column('WAITING').waitFor()
  await waitFor('108 showing the column is animated', () => page.evaluate(() => window.__widened), true)
  await waitFor('108 shown again', hiddenSaved, [])
  console.log('PASS 108 a column is hidden from its title icon, kept in settings.json, and shown again from its marker')

  // 109: the title icons hide columns (also a finished one); the last visible column cannot be hidden; its markers
  // bring them back. The ⋯ menu has no Hide or Show all entries (they would be clutter), and a column
  // with nothing else in it has no ⋯ menu.
  const columnMenu = async (state) => {
    await column(state).locator('h4').hover()
    await column(state).locator('[data-testid="column-menu"]').click()
  }
  assert((await column('DOING').locator('[data-testid="column-menu"]').count()) === 0, '109 DOING has an empty ⋯ menu')
  await columnMenu('DONE')
  await page.locator('[data-testid="menu-archive-old"]').waitFor()
  assert((await page.locator('[data-testid="menu-hide-column"], [data-testid="menu-show-all"]').count()) === 0, '109 the ⋯ menu offers Hide or Show all')
  await kb.press('Escape')
  await page.locator('[data-testid="menu-archive-old"]').waitFor({ state: 'detached' })
  for (const state of ['DONE', 'TODO', 'WAITING']) {
    await column(state).locator('h4').hover()
    await hideIcon(state).click()
    await marker(state).waitFor()
    await column(state).waitFor({ state: 'detached' })
  }
  await waitFor('109 saved', hiddenSaved, ['DONE', 'TODO', 'WAITING'])
  await column('DOING').locator('h4').hover()
  assert((await hideIcon('DOING').count()) === 0, '109 the last visible column has a hide icon')
  for (const state of ['DONE', 'TODO', 'WAITING']) {
    await marker(state).click()
    await column(state).waitFor()
  }
  await waitFor('109 all shown', hiddenSaved, [])
  console.log('PASS 109 the title icons hide columns, never the last one, and the markers show them again')

  // 110: a card dragged onto a hidden column's marker opens the column after a short rest; the drop moves it there,
  // and the column is hidden again once the drag ends
  const peekFile = join(folder, 'pages', 'Peek.md')
  writeFileSync(peekFile, '- TODO Peek card\n')
  await cardTitled('Peek card').waitFor({ timeout: 10_000 })
  await column('WAITING').locator('h4').hover()
  await hideIcon('WAITING').click()
  await marker('WAITING').waitFor()
  await column('WAITING').waitFor({ state: 'detached' }) // the narrowing has ended
  // The board is wider than the main view, and the hovers and clicks before scroll it sideways by varying amounts;
  // scrolled far enough, the card's left part is under the sidebar and the press below misses it.
  await page.evaluate(() => { document.querySelector('.main').scrollLeft = 0 })
  const inView110 = () =>
    page.evaluate(() => {
      const main = document.querySelector('.main').getBoundingClientRect()
      const card = [...document.querySelectorAll('[data-card]')].find((c) => c.textContent.includes('Peek card'))
      const r = card.getBoundingClientRect()
      return r.left >= main.left && r.right <= main.right
    })
  await waitFor('110 the card is in view', inView110, true)
  const from = await cardTitled('Peek card').boundingBox()
  await page.mouse.move(from.x + 20, from.y + 10)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 4 })
  const m110 = await marker('WAITING').boundingBox()
  await page.mouse.move(m110.x + m110.width / 2, m110.y + 60, { steps: 6 })
  await column('WAITING').waitFor()
  const c110 = await column('WAITING').boundingBox()
  await page.mouse.move(c110.x + c110.width / 2, c110.y + c110.height - 6, { steps: 6 })
  await page.mouse.up()
  await waitFor('110 the drop sets the state', () => readAt(peekFile).split('\n')[0], '- WAITING Peek card')
  await marker('WAITING').waitFor()
  await column('WAITING').waitFor({ state: 'detached', timeout: 5000 }) // it narrows away once the drag ends
  assert(hiddenSaved().length === 1, '110 the saved list changed')
  await marker('WAITING').click()
  await column('WAITING').waitFor()
  await waitFor('110 shown again', hiddenSaved, [])
  rmSync(peekFile)
  await cardTitled('Peek card').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('PASS 110 a card dragged onto a hidden column opens it, drops into it, and the column hides again')

  // 32: All pages lists the pages A to Z with their folders and link counts; journals hidden
  await page.locator('[data-testid="nav-all-pages"]').click()
  await allPages.waitFor()
  await waitFor('32 rows', rowNames, ['Anna', 'Fresh', 'Gamma', 'Project Y', 'Release', 'Release plan'])
  assert((await count()) === '6 pages', `count: ${await count()}`)
  assert((await cell('anna', 'linkedFrom').innerText()) === '3', 'Anna linked from')
  assert((await cell('release plan', 'linksOut').innerText()) === '2', 'Release plan links out')
  assert((await cell('project y', 'folder').innerText()) === 'Projects', 'Project Y folder')
  assert((await cell('anna', 'folder').innerText()) === '—', 'top-level folder')
  assert(!(await cell('anna', 'edited').innerText()).includes('—'), 'Anna has no edit time')
  assert((await page.locator('[data-testid="nav-all-pages"].active').count()) === 1, 'entry not highlighted')
  console.log('PASS 32 All pages lists pages with folders and link counts')

  // 33: a column sorts on click, again to reverse; ties by name
  await header('linkedFrom').click()
  await waitFor('33 desc', rowNames, ['Anna', 'Project Y', 'Fresh', 'Gamma', 'Release', 'Release plan'])
  assert((await header('linkedFrom').getAttribute('data-sorted')) === 'desc', 'not sorted desc')
  await header('linkedFrom').click()
  await waitFor('33 asc', rowNames, ['Fresh', 'Gamma', 'Release', 'Release plan', 'Project Y', 'Anna'])
  console.log('PASS 33 columns sort and reverse')

  // 34: the filter narrows by name; the switch shows journals; the list is virtualised
  await filterBox.fill('rel')
  await waitFor('34 filter', rowNames, ['Release', 'Release plan'])
  assert((await count()) === '2 of 6 pages', `count: ${await count()}`)
  await page.locator('[data-testid="show-journals"]').check()
  await filterBox.fill(yesterday)
  await waitFor('34 journal row', async () => (await rowNames()).length, 1)
  assert((await count()) === '1 of 70 pages', `count: ${await count()}`)
  assert((await cell(yesterday, 'folder').innerText()) === 'Journals', 'journal folder')
  assert((await cell(yesterday, 'linkedFrom').innerText()) === '1', 'yesterday is linked by the done date')
  await filterBox.press('Escape')
  await waitFor('34 cleared', count, '70 pages')
  assert((await allPages.locator('[data-testid="page-row"]').count()) < 60, 'All pages not virtualised')
  console.log('PASS 34 filter, journal switch and virtualised rows')

  // 35: a page written on disk appears and the counts follow. The table is
  // virtualised, so the filter brings each row into view, as a user would.
  const zeta = join(pagesDir, 'Zeta.md')
  writeFileSync(zeta, '- met [[Anna]]\n')
  await filterBox.fill('zeta')
  await cell('zeta', 'name').waitFor({ timeout: 10_000 })
  await filterBox.fill('anna')
  await waitFor('35 Anna count', () => cell('anna', 'linkedFrom').innerText(), '4')
  // Another program edits an existing page: no tree change, only page:changed (§6).
  const gamma = join(pagesDir, 'Gamma.md')
  const gammaBefore = readAt(gamma)
  const gammaAfter = `${gammaBefore}${gammaBefore.endsWith('\n') ? '' : '\n'}- also [[Anna]]\n`
  writeFileSync(gamma, gammaAfter)
  await waitFor('35 Anna count after an edit on disk', () => cell('anna', 'linkedFrom').innerText(), '5')
  assert(readAt(gamma) === gammaAfter, 'the app rewrote a file another program edited')
  console.log('PASS 35 the table follows a page written on disk')

  // 36: a name opens the page; nothing is written; sort and switch are kept, the filter is empty
  await filterBox.fill('zeta')
  await cell('zeta', 'name').click()
  await title.filter({ hasText: 'Zeta' }).waitFor()
  assert((await allPages.count()) === 0, 'table still shown')
  assert(readAt(zeta) === '- met [[Anna]]\n', 'opening the page changed its file')
  await page.locator('[data-testid="nav-all-pages"]').click()
  await allPages.waitFor()
  assert((await header('linkedFrom').getAttribute('data-sorted')) === 'asc', 'sort not kept')
  assert(await page.locator('[data-testid="show-journals"]').isChecked(), 'switch not kept')
  assert((await filterBox.inputValue()) === '', 'filter not empty')
  console.log('PASS 36 a row opens its page; sort and switch are kept')

  // 37: a name with a bracket is refused; the file stays
  await filterBox.fill('zeta')
  await cell('zeta', 'name').click()
  await title.filter({ hasText: 'Zeta' }).waitFor()
  await title.click()
  await nameInput.fill('Ze]ta')
  await kb.press('Enter')
  await page.locator('.notice').filter({ hasText: 'cannot contain [, ] or |' }).waitFor({ timeout: 5000 })
  await waitPath('37 file kept', zeta, true)
  assert(!existsSync(join(pagesDir, 'Ze]ta.md')), 'renamed to a bracket name')
  assert(readAt(zeta) === '- met [[Anna]]\n', 'refused rename changed the file')
  console.log('PASS 37 a page name with a bracket is refused')

  const dialog = page.locator('[data-testid="search"]')
  const searchInput = page.locator('[data-testid="search-input"]')
  const rows = (kind) => dialog.locator(`[data-testid="search-row"][data-kind="${kind}"]`)
  const selectedRow = () => dialog.locator('[data-testid="search-row"][data-selected="true"]')
  const openSearch = async () => {
    await kb.press('Control+k')
    await searchInput.waitFor()
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const typedDay = (key) => {
    const [, m, day] = key.split('-').map(Number)
    return `${day} ${MON[m - 1]}`
  }
  const filesUnder = (dir, rel = '') =>
    existsSync(dir)
      ? readdirSync(dir)
          .flatMap((n) => {
            const r = rel ? `${rel}/${n}` : n
            return statSync(join(dir, n)).isDirectory() ? filesUnder(join(dir, n), r) : [r]
          })
          .sort()
      : []

  // 38: Ctrl K finds page names and text, highlighted, grouped by page; the index is in the cache, not the notes
  const licence = join(pagesDir, 'Licence.md')
  writeFileSync(licence, '- TODO Ask [[Ben]] about the licence costs #budget\n- licence notes by Härtel\n\t- TODO child task\n')
  await page.locator('[data-testid="sidebar"]').getByText('Licence', { exact: true }).waitFor({ timeout: 10_000 })
  const notesBefore = filesUnder(folder)
  await openSearch()
  await searchInput.fill('licen')
  await waitFor('38 hits', () => rows('hit').count(), 2)
  assert((await rows('page').first().innerText()).includes('Licence'), 'page name not first')
  assert((await rows('group').first().innerText()).includes('Licence'), 'group header')
  assert((await dialog.locator('[data-kind="hit"] mark').first().innerText()).toLowerCase() === 'licen', 'no highlight')
  await searchInput.fill('cence')
  await waitFor('38 middle of a word', () => rows('hit').count(), 2)
  assert(filesUnder(join(configDir, 'cache')).some((f) => /^index-[0-9a-f]{16}\.sqlite3$/.test(f)), 'no index file in the cache dir')
  await kb.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert(JSON.stringify(filesUnder(folder)) === JSON.stringify(notesBefore), 'search wrote into the notes folder')
  console.log('PASS 38 Ctrl K finds pages and highlighted text; the index lives in the cache')

  // 39: accents fold; filters combine; Enter jumps to the block; nothing is written
  await openSearch()
  await searchInput.fill('hartel')
  await waitFor('39 accent', () => rows('hit').count(), 1)
  await searchInput.fill('TODO #budget')
  await waitFor('39 filtered', () => rows('hit').count(), 1)
  assert((await rows('page').count()) === 0 && (await rows('create').count()) === 0, 'pages offered while filtered')
  assert((await selectedRow().getAttribute('data-kind')) === 'hit', 'first hit not selected')
  await kb.press('Enter')
  await title.filter({ hasText: 'Licence' }).waitFor()
  await page.locator('.flash', { hasText: 'Ask' }).waitFor({ timeout: 2000 })
  assert(readAt(licence) === '- TODO Ask [[Ben]] about the licence costs #budget\n- licence notes by Härtel\n\t- TODO child task\n', 'jump changed the file')
  console.log('PASS 39 accents fold, filters combine, Enter jumps to the block')

  // 40: text typed a moment ago and text written by another program are found
  await page.locator('.block .content', { hasText: 'licence notes by Härtel' }).click()
  await kb.press('End')
  await kb.type(' quokka')
  await openSearch() // without waiting for the save: Ctrl K sends the editor's text first
  await searchInput.fill('quokka')
  await waitFor('40 typed', () => rows('hit').count(), 1)
  await waitText('40 saved', licence, '- TODO Ask [[Ben]] about the licence costs #budget\n- licence notes by Härtel quokka\n\t- TODO child task\n')
  writeFileSync(join(pagesDir, 'Outside.md'), '- wombat from outside\n')
  await searchInput.fill('wombat')
  await waitFor('40 external', () => rows('hit').count(), 1)
  await kb.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  // Escape returns to the block edited when search opened
  await page.locator('.cm-content', { hasText: 'licence notes by Härtel quokka' }).waitFor({ timeout: 2000 })
  await waitFor('40 caret back', () => page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), true)
  console.log('PASS 40 search finds just-typed and externally written text')

  // 41: the sidebar box opens search; Enter on no exact name creates the page, its file only when typing
  await page.locator('[data-testid="search-box"]').click()
  await searchInput.waitFor()
  await searchInput.fill('Brand new idea')
  await waitFor('41 create selected', () => selectedRow().getAttribute('data-kind'), 'create')
  await kb.press('Enter')
  await title.filter({ hasText: 'Brand new idea' }).waitFor()
  const brand = join(pagesDir, 'Brand new idea.md')
  assert(!existsSync(brand), 'created a file before typing')
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('x')
  await expectFile('41 new page written on typing', '- x\n', brand)
  console.log('PASS 41 Enter creates a page; its file appears on typing')

  // 65: a save into a read-only file fails with a notice; once the file is writable,
  // the next save writes the text and the notice goes
  const unsavedNotice = page.locator('[data-testid="notice"][data-unsaved-page="brand new idea"]')
  chmodSync(brand, 0o444)
  try {
    await kb.type(' ro')
    await unsavedNotice.waitFor({ timeout: 5000 })
    assert(readAt(brand) === '- x\n', `65 read-only file changed: ${JSON.stringify(readAt(brand))}`)
  } finally {
    chmodSync(brand, 0o644)
  }
  await kb.type('!')
  await unsavedNotice.waitFor({ state: 'detached', timeout: 5000 })
  await waitFor('65 saved', () => readAt(brand), '- x ro!\n')
  console.log('PASS 65 a "could not be saved" notice goes once the page is saved')

  // 76: Ctrl N and the "+" by Pages open an untitled page; Esc drops it; a title makes the page, its file only on typing
  const draftTitle = page.locator('[data-testid="new-page-title"]')
  await kb.press('Control+n')
  await draftTitle.waitFor()
  assert((await draftTitle.getAttribute('placeholder')) === 'Untitled', 'untitled placeholder')
  await kb.press('Escape')
  await draftTitle.waitFor({ state: 'detached' })
  await page.locator('[data-testid="new-page"]').click()
  await draftTitle.waitFor()
  await draftTitle.fill('Fresh idea')
  await kb.press('Enter')
  await title.filter({ hasText: 'Fresh idea' }).waitFor()
  assert(!existsSync(join(pagesDir, 'Fresh idea.md')), 'created a file before typing')
  console.log('PASS 76 Ctrl N and the + start an untitled page that becomes real with a title')

  // 77: a click on a task's label steps to the next state and wraps, without removing the label
  const stepFile = join(pagesDir, 'Stepper.md')
  writeFileSync(stepFile, '- DOING stepping\n')
  await openSearch()
  await searchInput.fill('Stepper')
  await kb.press('Enter')
  await title.filter({ hasText: 'Stepper' }).waitFor()
  const label = page.locator('.block .content .st').first()
  await label.click()
  await waitFor('77 step to DONE', () => readAt(stepFile).split('\n')[0], '- DONE stepping')
  assert(/\n {2}done:: \[\[\d{4}-\d{2}-\d{2}\]\] \d{2}:\d{2}:\d{2}\n$/.test(readAt(stepFile)), `done line: ${readAt(stepFile)}`)
  await label.click()
  await waitFor('77 wrap to TODO', () => readAt(stepFile), '- TODO stepping\n')
  console.log('PASS 77 clicking a task label steps to the next state and wraps')

  // 91: a state given with Ctrl Enter writes created:: with the time; another state leaves the line as it is;
  // finishing the task shows on the done chip how long it took; removing the state removes the line
  const tripFile = join(pagesDir, 'Trip planner.md')
  writeFileSync(tripFile, '- plan the trip\n')
  await openSearch()
  await searchInput.fill('Trip planner')
  await kb.press('Enter')
  await title.filter({ hasText: 'Trip planner' }).waitFor()
  const tripBlock = page.locator('.block .content', { hasText: 'plan the trip' }).first()
  await tripBlock.click()
  await page.locator('.cm-content').waitFor()
  await kb.press('Control+Enter')
  const made = await expectFileLike('91 a state given writes created', `- TODO plan the trip\n  created:: ${today} ${TIME}\n`, tripFile)
  await kb.press('Control+Enter')
  await expectFile('91 another state keeps created as it is', made.replace('- TODO', '- DOING'), tripFile)
  await kb.press('Control+Enter')
  await expectFileLike('91 finishing adds done after created', `${made.replace('- TODO', '- DONE')}  done:: [[${today}]] ${TIME}\n`, tripFile)
  await kb.press('Escape')
  const chip = tripBlock.locator('.chip')
  await chip.waitFor()
  const chipText = (await chip.innerText()).trim()
  assert(/^✓ \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2} after 1 minute$/.test(chipText), `91 done chip: ${chipText}`)
  assert((await tripBlock.innerText()).indexOf('created') < 0, `91 the created line is shown: ${await tripBlock.innerText()}`)
  console.log('PASS 91 the done chip says how long the task took, and created:: is not shown')
  await tripBlock.click()
  await page.locator('.cm-content').waitFor()
  // Ctrl Shift Enter removes the state; Ctrl Enter would start the cycle again at TODO
  await kb.press('Control+Shift+Enter')
  await expectFile('91 removing the state removes created and done', '- plan the trip\n', tripFile)

  // 92: a keyword typed by hand gets created:: only when the editor closes, never while typing; a
  // keyword deleted by hand loses it when the editor closes
  await kb.press('Control+Home')
  await kb.type('TODO ')
  await waitFor('92 typing writes only the keyword', () => readAt(tripFile), '- TODO plan the trip\n')
  await kb.press('Escape')
  const typed = await expectFileLike('92 leaving the block writes created', `- TODO plan the trip\n  created:: ${today} ${TIME}\n`, tripFile)
  await tripBlock.click()
  await page.locator('.cm-content').waitFor()
  await kb.press('Control+Home')
  for (let i = 0; i < 5; i++) await kb.press('Delete')
  await waitFor('92 deleting the keyword keeps the line while editing', () => readAt(tripFile), typed.replace('- TODO ', '- '))
  // A click elsewhere closes the editor too.
  await title.click()
  await expectFile('92 leaving the block removes created', '- plan the trip\n', tripFile)

  // 101: Ctrl Enter on the last state starts the cycle again at the first and keeps created::;
  // Ctrl Shift Enter removes the state with its lines, and on a block without a state it writes nothing
  const wrapFile = join(pagesDir, 'Wrap hundred one.md')
  writeFileSync(wrapFile, '- DONE wrap\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-02]] 09:00:00\n')
  await openSearch()
  await searchInput.fill('Wrap hundred one')
  await kb.press('Enter')
  await title.filter({ hasText: 'Wrap hundred one' }).waitFor()
  const wrapBlock = (text) => page.locator('.block .content', { hasText: text }).first()
  await wrapBlock('wrap').click()
  await page.locator('.cm-content').waitFor()
  await kb.press('Control+Enter')
  await expectFile('101 Ctrl Enter on DONE wraps to TODO and keeps created', '- TODO wrap\n  created:: 2026-10-01 08:00:00\n', wrapFile)
  await kb.press('Control+Shift+Enter')
  await expectFile('101 Ctrl Shift Enter removes the state and created', '- wrap\n', wrapFile)
  await kb.press('Control+Shift+Enter')
  // Nothing changes on disk for a block without a state: the typing after it shows that the key wrote nothing. The
  // editor is locked while the command runs, so the typing waits for it to be editable again.
  await page.locator('.cm-content[contenteditable="true"]').waitFor()
  await kb.press('Control+End')
  await kb.type('!')
  await expectFile('101 Ctrl Shift Enter on a block without a state writes nothing', '- wrap!\n', wrapFile)
  await kb.press('Escape')
  console.log('PASS 101 Ctrl Enter wraps from DONE to TODO; Ctrl Shift Enter removes the state')

  // 102: on selected blocks, the first block's next state goes to all of them (DONE wraps to
  // TODO); Ctrl Shift Enter removes every state with created:: and priority::; one undo brings them back
  writeFileSync(wrapFile, '- DONE one\n- TODO two\n  priority:: 2\n- three\n')
  await wrapBlock('three').waitFor()
  await wrapBlock('one').click()
  await page.locator('.cm-content').waitFor()
  await wrapBlock('three').click({ modifiers: ['Shift'] })
  await waitFor('102 three blocks selected', () => page.locator('.block.selected').count(), 3)
  await kb.press('Control+Enter')
  const all102 = await expectFileLike(
    '102 Ctrl Enter on a selection wraps with its first block',
    `- TODO one\n- TODO two\n  priority:: 2\n- TODO three\n  created:: ${today} ${TIME}\n`,
    wrapFile,
  )
  await kb.press('Control+Shift+Enter')
  await expectFile('102 Ctrl Shift Enter removes every state, with created and priority', '- one\n- two\n- three\n', wrapFile)
  await kb.press('Control+z')
  await expectFile('102 one undo brings the states back', all102, wrapFile)
  await kb.press('Escape')
  await waitFor('102 selection cleared', () => page.locator('.block.selected').count(), 0)
  console.log('PASS 102 Ctrl Enter and Ctrl Shift Enter on selected blocks')

  // 103: with no state in the cycle, Ctrl Enter and a click on the label change nothing and say
  // so; Settings → States and F1 describe the wrap and the remove key
  const settings103 = page.locator('[data-testid="settings"]')
  const inCycle103 = () => settings103.locator('[data-testid="state-in-cycle"]:checked').count()
  const config103 = readAt(configFile)
  writeFileSync(`${configFile}.tmp`, config103.replaceAll('in_cycle = true', 'in_cycle = false'))
  renameSync(`${configFile}.tmp`, configFile)
  await kb.press('Control+Comma')
  await settings103.waitFor()
  await waitFor('103 no state in the cycle', inCycle103, 0)
  const help103 = await settings103.locator('section[data-section="states"]').innerText()
  assert(help103.includes('After the last one, it starts again at the first.'), `103 states help: ${help103}`)
  assert(/Ctrl\s*\+\s*Shift\s*\+\s*Enter\s*removes the state/.test(help103), `103 remove key in the help: ${help103}`)
  await openSearch()
  await searchInput.fill('Wrap hundred one')
  await kb.press('Enter')
  await title.filter({ hasText: 'Wrap hundred one' }).waitFor()
  const note103 = page.locator('[data-testid="notice"]', { hasText: 'No state is in the cycle (Settings → States)' })
  await wrapBlock('one').click()
  await page.locator('.cm-content').waitFor()
  await kb.press('Control+Enter')
  await note103.waitFor()
  // The editor is locked while the command runs; Esc waits for it.
  await page.locator('.cm-content[contenteditable="true"]').waitFor()
  await kb.press('Escape')
  await page.locator('.cm-content').waitFor({ state: 'detached' })
  await note103.locator('.close').click()
  await waitFor('103 note dismissed', () => note103.count(), 0)
  await wrapBlock('one').locator('.st').click()
  await note103.waitFor()
  await note103.locator('.close').click()
  await expectFile('103 nothing written with no state in the cycle', all102, wrapFile)
  await kb.press('F1')
  await page.locator('[data-testid="shortcuts-filter"]').fill('shift+enter')
  await page.locator('[data-testid="shortcuts"]', { hasText: 'Remove the task state' }).waitFor()
  await kb.press('Escape')
  await kb.press('Escape')
  await page.locator('[data-testid="shortcuts"]').waitFor({ state: 'detached' })
  writeFileSync(`${configFile}.tmp`, config103)
  renameSync(`${configFile}.tmp`, configFile)
  await kb.press('Control+Comma')
  await settings103.waitFor()
  await waitFor('103 the cycle is back', inCycle103, 3)
  await page.locator('[data-testid="nav-journal"]').click()
  await settings103.waitFor({ state: 'detached' })
  console.log('PASS 103 with no state in the cycle a note says so; Settings and F1 describe the keys')

  // 104: a card's jump icon opens its page; Alt ← shows the board again, Alt → the page;
  // the ← → buttons do the same; Back with a card open closes the card and goes on back
  writeFileSync(join(pagesDir, 'Back hundred four.md'), '- TODO back hundred four\n')
  const boardTitle104 = page.locator('[data-testid="board-title"]')
  const navBack = page.locator('[data-testid="nav-back"]')
  const navForward = page.locator('[data-testid="nav-forward"]')
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await boardTitle104.filter({ hasText: 'Tasks' }).waitFor()
  await cardTitled('back hundred four').waitFor({ timeout: 10_000 })
  assert(await navForward.isDisabled(), '104 forward enabled with nothing ahead')
  await cardTitled('back hundred four').hover()
  await cardTitled('back hundred four').locator('[data-testid="card-jump"]').click()
  await title.filter({ hasText: 'Back hundred four' }).waitFor()
  await kb.press('Alt+ArrowLeft')
  await boardTitle104.filter({ hasText: 'Tasks' }).waitFor()
  await title.waitFor({ state: 'detached' })
  await page.locator('[data-testid="nav-forward"]:not([disabled])').waitFor()
  await kb.press('Alt+ArrowRight')
  await title.filter({ hasText: 'Back hundred four' }).waitFor()
  await boardTitle104.waitFor({ state: 'detached' })
  assert(await navForward.isDisabled(), '104 forward enabled at the newest step')
  await navBack.click()
  await boardTitle104.filter({ hasText: 'Tasks' }).waitFor()
  await navForward.click()
  await title.filter({ hasText: 'Back hundred four' }).waitFor()
  await navBack.click()
  await boardTitle104.filter({ hasText: 'Tasks' }).waitFor()
  // The step before the board is the journal (step 103 ended there).
  await cardTitled('back hundred four').locator('[data-testid="card-title"]').click()
  await openCard.locator('.cm-content').waitFor()
  await kb.press('Alt+ArrowLeft')
  await page.locator('[data-testid="journal-feed"]').waitFor()
  await openCard.waitFor({ state: 'detached' })
  await boardTitle104.waitFor({ state: 'detached' })
  console.log('PASS 104 Alt ← / Alt → and the ← → buttons go back and forward between a board and a page')

  // 105: the scroll position comes back on a page; in the journal, the day at the top; Back right
  // after typing keeps the text
  const long105 = join(pagesDir, 'Long hundred five.md')
  const lines105 = Array.from({ length: 80 }, (_, i) => `- line ${i}\n`).join('')
  writeFileSync(long105, `${lines105}- go to [[Target hundred five]]\n`)
  await openSearch()
  await searchInput.fill('Long hundred five')
  await kb.press('Enter')
  await title.filter({ hasText: 'Long hundred five' }).waitFor()
  const main105 = page.locator('.main-wrap .main')
  await page.locator('.block .content a', { hasText: 'Target hundred five' }).waitFor()
  const scrolled105 = await main105.evaluate((el) => ((el.scrollTop = el.scrollHeight), el.scrollTop))
  assert(scrolled105 > 500, `105 the page does not scroll: ${scrolled105}`)
  await page.locator('.block .content a', { hasText: 'Target hundred five' }).click()
  await title.filter({ hasText: 'Target hundred five' }).waitFor()
  await waitFor('105 the new page starts at the top', () => main105.evaluate((el) => el.scrollTop), 0)
  await kb.press('Alt+ArrowLeft')
  await title.filter({ hasText: 'Long hundred five' }).waitFor()
  await waitFor('105 the scroll position is back', () => main105.evaluate((el, at) => Math.abs(el.scrollTop - at) <= 2, scrolled105), true)
  await page.locator('.block .content').getByText('line 79', { exact: true }).click()
  await page.locator('.cm-content').waitFor()
  await kb.press('End')
  await kb.type('x')
  await kb.press('Alt+ArrowLeft')
  await page.locator('[data-testid="journal-feed"]').waitFor()
  await expectFile('105 Back right after typing keeps the text', `${lines105.replace('- line 79\n', '- line 79x\n')}- go to [[Target hundred five]]\n`, long105)
  const day105 = dayKey(30)
  const topDay105 = () =>
    main105.evaluate((m) => {
      const edge = m.getBoundingClientRect().top + (parseFloat(getComputedStyle(m).paddingTop) || 0)
      const first = [...m.querySelectorAll('[data-testid="day"]')]
        .map((e) => ({ key: e.getAttribute('data-day'), r: e.getBoundingClientRect() }))
        .sort((a, b) => a.r.top - b.r.top)
        .find((x) => x.r.bottom > edge)
      return first ? first.key : null
    })
  await openSearch()
  await searchInput.fill(day105)
  await waitFor('105 date row first', () => dialog.locator('[data-testid="search-row"]').first().getAttribute('data-kind'), 'date')
  await kb.press('Enter')
  await waitFor('105 the feed shows the day at the top', topDay105, day105)
  await page.locator(`[data-day="${day105}"] [data-testid="day-title"]`).click()
  await page.locator('[data-testid="journal-feed"]').waitFor({ state: 'detached' })
  await kb.press('Alt+ArrowLeft')
  await page.locator('[data-testid="journal-feed"]').waitFor()
  await waitFor('105 back in the feed at the same day', topDay105, day105)
  console.log('PASS 105 Back brings the scroll position back and keeps typed text')

  // 106: a page deleted meanwhile is skipped; a page renamed elsewhere (title::) is followed
  for (const n of ['A', 'X', 'B']) writeFileSync(join(pagesDir, `${n} hundred six.md`), `- ${n} six\n`)
  for (const n of ['A', 'X', 'B']) {
    await openSearch()
    await searchInput.fill(`${n} hundred six`)
    await waitFor(`106 ${n} found`, () => dialog.locator('[data-testid="search-row"]').first().innerText().then((t) => t.includes(`${n} hundred six`)), true)
    await kb.press('Enter')
    await title.filter({ hasText: `${n} hundred six` }).waitFor()
  }
  const notices106 = () => page.locator('[data-testid="notice"]').allInnerTexts()
  const before106 = (await notices106()).length
  const row106 = side.locator('[data-row="p:x hundred six"]')
  await row106.waitFor()
  unlinkSync(join(pagesDir, 'X hundred six.md'))
  await row106.waitFor({ state: 'detached' })
  await kb.press('Alt+ArrowLeft')
  await title.filter({ hasText: 'A hundred six' }).waitFor()
  assert((await notices106()).length === before106, `106 a notice for the skipped page: ${await notices106()}`)
  // Another program gives the page a new name with a title:: line: the shown page and its step follow it.
  writeFileSync(join(pagesDir, 'A hundred six.md'), 'title:: A hundred six b\n- A six\n')
  await title.filter({ hasText: 'A hundred six b' }).waitFor()
  await openSearch()
  await searchInput.fill('B hundred six')
  await waitFor('106 B found again', () => dialog.locator('[data-testid="search-row"]').first().innerText().then((t) => t.includes('B hundred six')), true)
  await kb.press('Enter')
  await title.filter({ hasText: 'B hundred six' }).waitFor()
  await kb.press('Alt+ArrowLeft')
  await title.filter({ hasText: 'A hundred six b' }).waitFor()
  // The pages of steps 104 to 106 go again, so the sidebar is as the later steps expect it.
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('[data-testid="journal-feed"]').waitFor()
  for (const f of ['Back hundred four', 'Long hundred five', 'A hundred six', 'B hundred six']) unlinkSync(join(pagesDir, `${f}.md`))
  for (const k of ['back hundred four', 'long hundred five', 'target hundred five', 'a hundred six b', 'b hundred six']) {
    await side.locator(`[data-row="p:${k}"]`).waitFor({ state: 'detached' })
  }
  console.log('PASS 106 Back skips a deleted page and follows a renamed one')

  // 42: a past day without an entry opens as its empty day page; typing creates its file
  const past = dayKey(70)
  const pastFile = join(folder, 'journals', `${past}.md`)
  assert(!existsSync(pastFile), 'past day already has a file')
  await openSearch()
  await searchInput.fill(past)
  await waitFor('42 date row first', () => dialog.locator('[data-testid="search-row"]').first().getAttribute('data-kind'), 'date')
  await kb.press('Enter')
  await page.locator('[data-testid="start-writing"]').waitFor()
  assert(!existsSync(pastFile), 'jumping wrote the day file')
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('past entry')
  await expectFile('42 past day written', '- past entry\n', pastFile)
  console.log('PASS 42 jump to an empty past day; its file appears on typing')

  // 43: a typed day with an entry opens the feed scrolled to that day; nothing is written
  await openSearch()
  await searchInput.fill(typedDay(past))
  await waitFor('43 date row', () => rows('date').count(), 1)
  await kb.press('Enter')
  await page.locator('[data-testid="nav-journal"].active').waitFor()
  const dayEl = page.locator(`[data-day="${past}"]`)
  await dayEl.waitFor({ timeout: 5000 })
  const box = await dayEl.boundingBox()
  const main = await page.locator('.main').boundingBox()
  assert(box && main && box.y >= main.y - 1 && box.y < main.y + main.height, `day not in view: ${JSON.stringify({ box, main })}`)
  assert(readAt(pastFile) === '- past entry\n', 'jump changed the day file')
  console.log('PASS 43 jump to a day with an entry scrolls the feed to it')

  // 44: the status bar spans the bottom of the window and is quiet once the index is built
  // (the folder has about 75 pages, more than one chunk, so the build reported progress and must have cleared it)
  const bar = page.locator('[data-testid="status-bar"]')
  await bar.waitFor()
  await waitFor('44 no index item', () => page.locator('[data-testid="status-item"][data-id="index"]').count(), 0)
  const barBox = await bar.boundingBox()
  const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  assert(barBox && Math.abs(barBox.y + barBox.height - view.h) <= 1 && barBox.width >= view.w - 1, `status bar not at the bottom: ${JSON.stringify({ barBox, view })}`)
  await waitFor('44 all saved', () => page.locator('[data-testid="status-item"][data-id="save"]').innerText(), 'All changes saved')
  console.log('PASS 44 the status bar is at the bottom and quiet once the index is built')

  const gitItem = page.locator('[data-testid="status-item"][data-id="git"]')
  const gitText = () => gitItem.innerText()
  const subject = () => git(folder, 'log', '-1', '--format=%s')

  const settingsJson = () => jsonAt(join(configDir, 'settings.json'))
  const screen = page.locator('[data-testid="settings"]')
  const notesFiles = () => Object.fromEntries(filesUnder(folder).filter((f) => f.endsWith('.md')).map((f) => [f, readAt(join(folder, f))]))

  // 51: Settings opens from the sidebar footer and with Ctrl+, and lists its sections in order
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  await page.locator('[data-testid="nav-journal"]').click()
  await page.keyboard.press('Control+Comma')
  await screen.waitFor()
  const sections = await screen.locator('section[data-section]').evaluateAll((s) => s.map((e) => e.dataset.section))
  assert(JSON.stringify(sections) === JSON.stringify(['folder', 'states', 'boards', 'git', 'journal', 'appearance', 'keyboard', 'about', 'troubleshooting']), `sections: ${sections}`)
  await page.locator('[data-testid="nav-journal"]').click()
  await screen.waitFor({ state: 'detached' })
  await page.locator('[data-testid="nav-settings"]').click()
  await screen.waitFor()
  console.log('PASS 51 Settings opens from the footer and with Ctrl+, with its seven sections')

  // 52: a theme applies at once, is kept in settings.json, and the notes folder is untouched
  const config51 = readAt(configFile)
  await page.locator('[data-testid="theme-option"][data-theme-choice="violet"]').click()
  await waitFor('52 attr', () => page.evaluate(() => document.documentElement.dataset.theme ?? ''), 'violet')
  assert((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())) === '#1e1a2c', 'violet --bg')
  await waitFor('52 stored', () => settingsJson().theme ?? null, 'violet')
  await page.locator('[data-testid="theme-option"][data-theme-choice="system"]').click()
  await waitFor('52 system', () => page.evaluate(() => document.documentElement.dataset.theme ?? ''), '')
  await waitFor('52 stored system', () => settingsJson().theme ?? null, null)
  assert(readAt(configFile) === config51, 'config.toml changed by a theme')
  console.log('PASS 52 a theme applies at once and is stored on this computer only')

  // 53: a hand edit of config.toml is followed: a new state shows in Settings
  const later = '[[states]]\nkeyword = "LATER"\ncolor = "blue"\n'
  const handText = config51 + later + '# kept by Breccia\n[custom]\nkey = 1\n'
  // atomic, like most editors: a write in place can be read half-written
  writeFileSync(`${configFile}.tmp`, handText)
  renameSync(`${configFile}.tmp`, configFile)
  await screen.locator('[data-testid="state-row"][data-keyword="LATER"]').waitFor()
  console.log('PASS 53 an outside edit of config.toml is followed')

  // 54: the Git switch writes only `enabled`, and the Git item follows it
  await screen.locator('[data-testid="git-enabled"]').click()
  await waitFor('54 off', () => readAt(configFile), handText.replace('enabled = true', 'enabled = false'))
  await waitFor('54 item gone', () => gitItem.count(), 0)
  await screen.locator('[data-testid="git-enabled"]').click()
  await waitFor('54 on', () => readAt(configFile), handText)
  await waitFor('54 item back', gitText, 'Not in Git · Set up…')
  console.log('PASS 54 the Git switch changes one value in config.toml and the Git item follows')

  // 55: renaming a used state asks first, then changes only the keyword in the notes and the boards
  const before55 = notesFiles()
  const journalRel = Object.keys(before55).find((f) => before55[f].includes('- WAITING Call Ben\n'))
  assert(journalRel, 'no WAITING block to rename')
  const kw = screen.locator('[data-testid="state-row"][data-keyword="WAITING"] [data-testid="state-keyword"]')
  await kw.fill('blocked')
  await kw.press('Enter')
  const confirm55 = page.locator('[data-testid="confirm-dialog"]')
  await confirm55.waitFor()
  assert(/Rename WAITING to BLOCKED\? 1 block in 1 page starts with WAITING\./.test(await confirm55.innerText()), `question: ${await confirm55.innerText()}`)
  await page.locator('[data-testid="dialog-ok"]').click()
  const config55 = handText.replaceAll('"WAITING"', '"BLOCKED"')
  await waitFor('55 config', () => readAt(configFile), config55)
  await waitFor('55 journal', () => readAt(join(folder, journalRel)), before55[journalRel].replace('- WAITING Call Ben\n', '- BLOCKED Call Ben\n'))
  const after55 = notesFiles()
  for (const f of Object.keys(before55)) if (f !== journalRel) assert(after55[f] === before55[f], `${f} changed by the rename`)
  console.log('PASS 55 a state rename asks, then rewrites only the keyword in the notes and the boards')

  // 56: removing an unused state asks nothing and removes only its table
  await screen.locator('[data-testid="state-row"][data-keyword="LATER"] [data-testid="state-remove"]').click()
  await waitFor('56 config', () => readAt(configFile), config55.replace(later, ''))
  assert((await page.locator('[data-testid="confirm-dialog"]').count()) === 0, 'asked for an unused state')
  console.log('PASS 56 removing an unused state removes its table, keeps the comment and unknown table')

  // 66: a box keeps what is typed while config.toml changes on disk; Enter then writes only that value
  const config56 = readAt(configFile)
  assert(config56.includes('\narchive_after_days = 14\n'), 'config.toml has no archive_after_days = 14')
  assert(config56.includes('\ncommit_delay_minutes = 5\n'), 'config.toml has no commit_delay_minutes = 5')
  const delay66 = screen.locator('[data-testid="git-commit-delay"]')
  const days66 = screen.locator('[data-testid="archive-days"]')
  await delay66.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('7')
  const hand66 = config56.replace('\narchive_after_days = 14\n', '\narchive_after_days = 30\n')
  writeFileSync(`${configFile}.tmp`, hand66)
  renameSync(`${configFile}.tmp`, configFile)
  await waitFor('66 days', () => days66.inputValue(), '30')
  assert((await delay66.inputValue()) === '7', `the commit delay box lost its typing: ${await delay66.inputValue()}`)
  await delay66.press('Enter')
  await waitFor('66 config', () => readAt(configFile), hand66.replace('\ncommit_delay_minutes = 5\n', '\ncommit_delay_minutes = 7\n'))
  console.log('PASS 66 a Settings box keeps what is typed while config.toml changes on disk')

  // 68: a board dialog open across a hand edit of config.toml is refused, so the hand edit stays
  await screen.locator('[data-testid="settings-board"]').first().getByRole('button', { name: 'Edit…' }).click()
  const dialog68 = page.locator('[data-testid="board-settings"]')
  await dialog68.waitFor()
  const config68 = readAt(configFile)
  assert(config68.includes('\narchive_after_days = 30\n'), 'config.toml has no archive_after_days = 30')
  const hand68 = config68.replace('\narchive_after_days = 30\n', '\narchive_after_days = 45\n') + '# hand edit 68\n'
  writeFileSync(`${configFile}.tmp`, hand68)
  renameSync(`${configFile}.tmp`, configFile)
  // the app has read the hand edit before the dialog saves (the version check refuses it, not the file check)
  await waitFor('68 days', () => days66.inputValue(), '45')
  await dialog68.locator('[data-testid="board-name"]').fill('Renamed 68')
  await dialog68.locator('[data-testid="save-board"]').click()
  const notice68 = page.locator('.notice').filter({ hasText: 'breccia/config.toml changed on disk, so this change was not saved.' })
  await notice68.waitFor({ timeout: 10_000 })
  const disk68 = readAt(configFile)
  assert(disk68.includes('# hand edit 68') && !disk68.includes('Renamed 68'), `the board dialog overwrote the hand edit: ${JSON.stringify(disk68)}`)
  assert(disk68 === hand68, 'config.toml changed after the refused board save')
  await dialog68.waitFor({ state: 'detached' })
  await notice68.getByRole('button', { name: 'Dismiss' }).click()
  console.log('PASS 68 a board saved after a hand edit of config.toml keeps the hand edit')

  // 83: automatic archiving. The switch writes only `auto_archive`; while it is off, a change of the days
  // archives nothing; switched on, only the task done more than N days ago gets `archived::` (bytes on disk), with a
  // note; the board leaves it out and the Archive view lists it
  const config83 = readAt(configFile)
  assert(config83.includes('\narchive_after_days = 45\n') && config83.includes('\nauto_archive = true\n'), `83 config: ${config83}`)
  const switch83 = screen.locator('[data-testid="auto-archive"]')
  assert(await switch83.isChecked(), '83 the switch is not on')
  await switch83.uncheck()
  const off83 = config83.replace('\nauto_archive = true\n', '\nauto_archive = false\n')
  await waitFor('83 switch off written', () => readAt(configFile), off83)
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  const oldTasks = join(pagesDir, 'Old tasks.md')
  const tasks83 = `- DONE long ago\n  done:: [[${dayKey(60)}]]\n- DONE lately\n  done:: [[${dayKey(10)}]]\n- DONE without a date\n`
  writeFileSync(oldTasks, tasks83)
  await side.getByText('Old tasks', { exact: true }).waitFor({ timeout: 10_000 })
  await days66.fill('40')
  await days66.press('Enter')
  const days83 = off83.replace('\narchive_after_days = 45\n', '\narchive_after_days = 40\n')
  await waitFor('83 days written', () => readAt(configFile), days83)
  await expectFile('83 nothing is archived while the switch is off', tasks83, oldTasks)
  await switch83.check()
  await waitFor('83 switch on written', () => readAt(configFile), days83.replace('\nauto_archive = false\n', '\nauto_archive = true\n'))
  await expectFileLike(
    '83 switched on, only the task done long ago is archived',
    `- DONE long ago\n  done:: [[${dayKey(60)}]]\n  archived:: ${today} ${TIME}\n- DONE lately\n  done:: [[${dayKey(10)}]]\n- DONE without a date\n`,
    oldTasks,
  )
  const note83 = page.locator('.notice', { hasText: 'Archived 1 finished task (done more than 40 days ago)' })
  await note83.waitFor()
  assert(!(await note83.evaluate((el) => el.classList.contains('error'))), '83 the note is shown as an error')
  await note83.getByRole('button', { name: 'Dismiss' }).click()
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await cardTitled('lately').waitFor({ timeout: 10_000 })
  assert((await cardTitled('long ago').count()) === 0, '83 the archived task is still on the board')
  await navArchive.click()
  await waitFor('83 Archive lists it', async () => (await archiveCells()).map((r) => r[0]), ['Update the changelog', 'long ago'])
  console.log('PASS 83 finished tasks are archived by themselves once switched on, and only those done long ago')

  // 84: Ctrl + / Ctrl - / Ctrl 0 and Ctrl with the wheel zoom the window, also while a block is edited; the level is
  // kept in settings.json and shown (and reset by a click) in the status bar
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  const text84 = await page.locator('.cm-content').innerText()
  const zoomItem84 = page.locator('[data-testid="status-item"][data-id="zoom"]')
  const dpr84 = () => page.evaluate(() => window.devicePixelRatio)
  const base84 = await dpr84()
  const zoomSaved84 = () => jsonAt(join(configDir, 'settings.json')).zoom_percent
  assert((await zoomItem84.count()) === 0, '84 a zoom item shows at 100 %')
  await kb.press('Control+Equal')
  await zoomItem84.waitFor()
  await waitFor('84 item 110', () => zoomItem84.innerText(), '110 %')
  await waitFor('84 scale 110', async () => Math.round(((await dpr84()) / base84) * 100), 110)
  await waitFor('84 saved 110', zoomSaved84, 110)
  await kb.press('Control+Shift+Equal')
  await waitFor('84 item 125', () => zoomItem84.innerText(), '125 %')
  await kb.press('Control+NumpadAdd')
  await waitFor('84 item 150', () => zoomItem84.innerText(), '150 %')
  await kb.press('Control+Minus')
  await kb.press('Control+NumpadSubtract')
  await waitFor('84 item 110 again', () => zoomItem84.innerText(), '110 %')
  // The wheel with Ctrl: one notch is one step.
  await kb.down('Control')
  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, -100)
  await kb.up('Control')
  await waitFor('84 wheel in', () => zoomItem84.innerText(), '125 %')
  await waitFor('84 saved 125', zoomSaved84, 125)
  assert((await page.locator('.cm-content').innerText()) === text84, '84 a zoom key changed the edited text')
  await zoomItem84.click()
  await zoomItem84.waitFor({ state: 'detached' })
  await waitFor('84 scale 100', async () => Math.round(((await dpr84()) / base84) * 100), 100)
  await waitFor('84 saved 100', zoomSaved84, 100)
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  await kb.press('Control+Equal')
  await zoomItem84.waitFor()
  await kb.press('Control+Digit0')
  await zoomItem84.waitFor({ state: 'detached' })
  assert((await page.locator('.cm-content').innerText()) === text84, '84 Ctrl 0 changed the edited text')
  await kb.press('Escape')
  console.log('PASS 84 Ctrl + and Ctrl - and Ctrl 0 and Ctrl with the wheel zoom the window, kept in settings.json')

  // 93: F1 shows every keyboard shortcut, also while a block is edited; the filter narrows the list, Esc
  // clears the filter and then closes, F1 and a click on the ? button close it too, and the focus (and the text)
  // of the edited block stay as they were
  const help92 = page.locator('[data-testid="shortcuts"]')
  const filter92 = page.locator('[data-testid="shortcuts-filter"]')
  const focused92 = () => page.evaluate(() => (document.activeElement?.closest('.cm-editor') ? 'editor' : (document.activeElement?.getAttribute('data-testid') ?? 'other')))
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  const text92 = await page.locator('.cm-content').innerText()
  await waitFor('93 editing', focused92, 'editor')
  await kb.press('F1')
  await help92.waitFor()
  await waitFor('93 filter has the focus', focused92, 'shortcuts-filter')
  assert((await page.locator('.shortcuts-group').count()) >= 6, '93 fewer than 6 groups')
  assert((await page.locator('.shortcuts-group[data-group="Window and zoom"] kbd', { hasText: 'F1' }).count()) === 1, '93 F1 is not listed')
  await kb.type('ctrl+z')
  await waitFor('93 narrowed to one row', () => page.locator('.shortcuts-group dd').allInnerTexts(), ['Undo / redo'])
  await kb.press('Escape')
  await waitFor('93 Esc clears the filter', () => filter92.inputValue(), '')
  await waitFor('93 all groups back', async () => (await page.locator('.shortcuts-group').count()) >= 6, true)
  assert((await help92.count()) === 1, '93 the first Esc closed the list')
  await kb.type('qqqq')
  await page.locator('[data-testid="shortcuts-empty"]').waitFor()
  await kb.press('Escape')
  await kb.press('Escape')
  await help92.waitFor({ state: 'detached' })
  await waitFor('93 focus back in the editor', focused92, 'editor')
  assert((await page.locator('.cm-content').innerText()) === text92, '93 F1 changed the edited text')
  await kb.press('F1')
  await help92.waitFor()
  await kb.press('F1')
  await help92.waitFor({ state: 'detached' })
  await waitFor('93 focus back after F1', focused92, 'editor')
  await kb.press('Escape')
  const helpBtn92 = page.locator('[data-testid="status-item"][data-id="help"]')
  await helpBtn92.click()
  await help92.waitFor()
  const box92 = await helpBtn92.boundingBox()
  await page.mouse.click(box92.x + box92.width / 2, box92.y + box92.height / 2)
  await help92.waitFor({ state: 'detached' })
  await page.keyboard.press('Control+Comma')
  await page.locator('[data-testid="open-shortcuts"]').click()
  await help92.waitFor()
  await kb.press('Escape')
  await help92.waitFor({ state: 'detached' })
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 93 F1 shows every keyboard shortcut, also while editing, with a filter, Esc, the ? button and a Settings link')

  // 94: the date picker by the sidebar's Journal row. The icon and Ctrl Shift D (also while a block is edited)
  // open it at today's month, today outlined and focused, days with a journal file dotted; the keys move by day, week
  // and month (across a year), the ‹ › buttons by month; Esc closes and the focus goes back (the icon, or the edited
  // block with its text). A day with a note scrolls the feed to it; an empty past day and a future day open as their
  // page and write nothing, and typing on the past day writes its file.
  {
    const picker = page.locator('[data-testid="date-picker-popover"]')
    const title = () => picker.locator('[data-testid="date-picker-title"]').innerText()
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const fmt = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
    // One Page Up or Down at a time, each clamped to the month's length (31 Mar, Page Up: 28 Feb), as the picker does.
    const monthsOn = (n) => {
      let x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      for (let i = 0; i < Math.abs(n); i++) {
        const m = x.getMonth() + Math.sign(n)
        const last = new Date(x.getFullYear(), m + 1, 0).getDate()
        x = new Date(x.getFullYear(), m, Math.min(x.getDate(), last))
      }
      return fmt(x)
    }
    const titleOf = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
    const focusedKey = () =>
      page.evaluate(() => {
        const a = document.activeElement
        if (a?.closest('.cm-editor')) return 'editor'
        return a?.getAttribute('data-key') ?? a?.getAttribute('data-testid') ?? 'other'
      })
    const journalCount = () => readdirSync(join(folder, 'journals')).length
    const files94 = journalCount()

    await page.locator('[data-testid="date-picker"]').click()
    await picker.waitFor()
    await waitFor('94 the month shown is today', title, titleOf(today))
    await waitFor('94 today has the focus', focusedKey, today)
    const todayCell = picker.locator(`[data-key="${today}"]`)
    assert((await todayCell.getAttribute('aria-current')) === 'date', '94 today is not marked as today')
    assert((await picker.locator('[data-today]').count()) === 1, '94 more than one today')
    const heads = await picker.locator('.dp-wd').allInnerTexts()
    assert(heads.join(' ') === 'Mo Tu We Th Fr Sa Su', `94 weekdays: ${heads}`)
    await kb.press('ArrowLeft')
    await waitFor('94 ArrowLeft goes to yesterday', focusedKey, yesterday)
    assert((await picker.locator(`[data-key="${yesterday}"][data-marked]`).count()) === 1, '94 yesterday is not marked as having a note')
    // A day with a note has a tinted background, not a dot (a dot could belong to
    // the day above or below). Read without the focus, which has its own background.
    const noteLook = await picker.locator(`[data-key="${yesterday}"]`).evaluate((el) => {
      el.classList.remove('focused')
      const out = { fill: getComputedStyle(el).backgroundColor, dot: getComputedStyle(el, '::after').content }
      el.classList.add('focused')
      return out
    })
    assert(noteLook.fill !== 'rgba(0, 0, 0, 0)' && noteLook.dot === 'none', `94 a day with a note: ${JSON.stringify(noteLook)}`)
    // "Today" looks like a button: a visible border and a filled background.
    const todayLook = await picker.locator('[data-testid="date-picker-today"]').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { border: parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none', fill: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' }
    })
    assert(todayLook.border && todayLook.fill, `94 Today does not look like a button: ${JSON.stringify(todayLook)}`)
    const unmarked = monthsOn(-3)
    await kb.press('Escape')
    await picker.waitFor({ state: 'detached' })
    await waitFor('94 Esc gives the focus back to the icon', focusedKey, 'date-picker')

    // A day with a note, picked from a page: the feed opens scrolled to it; nothing is written.
    const noted = dayKey(20)
    const notedText = readAt(join(folder, 'journals', `${noted}.md`))
    await page.locator('[data-row="p:anna"]').click()
    await page.locator('[data-testid="nav-journal"].active').waitFor({ state: 'detached' })
    await page.locator('[data-testid="date-picker"]').click()
    await waitFor('94 open again at today', focusedKey, today)
    for (let i = 0; i < 2; i++) await kb.press('ArrowUp')
    for (let i = 0; i < 6; i++) await kb.press('ArrowLeft')
    await waitFor('94 the keys reach the day 20 days back', focusedKey, noted)
    assert((await picker.locator(`[data-key="${noted}"][data-marked]`).count()) === 1, '94 the noted day is not marked as having a note')
    await kb.press('Enter')
    await picker.waitFor({ state: 'detached' })
    await page.locator('[data-testid="nav-journal"].active').waitFor()
    const dayEl94 = page.locator(`[data-day="${noted}"]`)
    await dayEl94.waitFor({ timeout: 5000 })
    await waitFor(
      '94 the picked day is in view',
      async () => {
        const box = await dayEl94.boundingBox()
        const main = await page.locator('.main').boundingBox()
        return !!(box && main && box.y >= main.y - 1 && box.y < main.y + main.height)
      },
      true,
    )
    assert(readAt(join(folder, 'journals', `${noted}.md`)) === notedText, '94 picking changed the day file')
    console.log('PASS 94 the date picker opens at today, marks days with a note, and a day with a note scrolls the feed to it')

    // 95: Ctrl Shift D while editing; Esc gives the focus back to the same editor with its text.
    await page.locator(`[data-day="${noted}"] .block .content`).first().click()
    await waitFor('95 editing', focusedKey, 'editor')
    const text95 = await page.locator('.cm-content').innerText()
    await kb.press('Control+Shift+D')
    await picker.waitFor()
    await waitFor('95 the feed starts the picker at today', focusedKey, today)
    await kb.press('Escape')
    await picker.waitFor({ state: 'detached' })
    await waitFor('95 focus back in the editor', focusedKey, 'editor')
    assert((await page.locator('.cm-content').innerText()) === text95, '95 the picker changed the edited text')

    // Twelve Page Ups are a year back, the › button a month on; then an empty past day 3 months back opens as its page.
    await kb.press('Control+Shift+D')
    await picker.waitFor()
    for (let i = 0; i < 12; i++) await kb.press('PageUp')
    await waitFor('95 twelve Page Ups are a year back', title, titleOf(monthsOn(-12)))
    await waitFor('95 the focus follows', focusedKey, monthsOn(-12))
    await picker.locator('[data-testid="date-picker-next"]').click()
    await waitFor('95 the next-month button', title, titleOf(monthsOn(-11)))
    await picker.locator('[data-testid="date-picker-prev"]').click()
    await picker.locator('[data-testid="date-picker-prev"]').click()
    await waitFor('95 the previous-month button twice', title, titleOf(monthsOn(-13)))
    await picker.locator('[data-testid="date-picker-today"]').click()
    await waitFor('95 Today shows today', title, titleOf(today))
    await waitFor('95 Today focuses today', focusedKey, today)
    for (let i = 0; i < 3; i++) await kb.press('PageUp')
    await waitFor('95 three months back', focusedKey, unmarked)
    const emptyFile = join(folder, 'journals', `${unmarked}.md`)
    assert(!existsSync(emptyFile), '95 the day 3 months back has a file')
    assert((await picker.locator(`[data-key="${unmarked}"][data-marked]`).count()) === 0, '95 an empty day has a dot')
    // Each pick waits for the page title to change: every empty day shows the same "start writing" placeholder.
    const pageTitle = page.locator('[data-testid="page-title"]')
    const shownTitle = async () => ((await pageTitle.count()) ? (await pageTitle.innerText()).trim() : '')
    await kb.press('Enter')
    await waitFor('95 the empty day opens as its page', async () => (await shownTitle()) !== '', true)
    const unmarkedTitle = await shownTitle()
    await page.locator('[data-testid="start-writing"]').waitFor()
    assert(journalCount() === files94, '95 picking an empty day wrote a file')
    // A future day: its page, no file.
    const future = monthsOn(1)
    const futureFile = join(folder, 'journals', `${future}.md`)
    await page.locator('[data-testid="date-picker"]').click()
    await waitFor('95 a journal page starts the picker at its day', focusedKey, unmarked)
    await picker.locator('[data-testid="date-picker-today"]').click()
    await kb.press('PageDown')
    await waitFor('95 next month', focusedKey, future)
    await kb.press('Enter')
    await picker.waitFor({ state: 'detached' })
    await waitFor('95 the future day opens as its page', async () => {
      const shown = await shownTitle()
      return shown !== '' && shown !== unmarkedTitle
    }, true)
    await page.locator('[data-testid="start-writing"]').waitFor()
    // Back to the empty past day: typing writes its file (and the future day still has none).
    await kb.press('Control+Shift+D')
    await picker.waitFor()
    await waitFor('95 the future page starts the picker at its day', focusedKey, future)
    await picker.locator('[data-testid="date-picker-today"]').click()
    for (let i = 0; i < 3; i++) await kb.press('PageUp')
    await waitFor('95 back at the empty day', focusedKey, unmarked)
    await kb.press('Enter')
    await waitFor('95 the empty day opens again', shownTitle, unmarkedTitle)
    await page.locator('[data-testid="start-writing"]').click()
    await page.locator('.cm-content').waitFor()
    await kb.type('picked day')
    await expectFile('95 typing on the picked day writes its file', '- picked day\n', emptyFile)
    assert(!existsSync(futureFile), '95 picking a future day wrote its file')
    assert(journalCount() === files94 + 1, '95 picking wrote another file')
    await kb.press('Escape')
    await page.locator('[data-testid="nav-journal"]').click()
    console.log('PASS 95 Ctrl Shift D while editing; months across a year; an empty past or future day writes nothing until typing')
  }

  // 96 to 100: a page only linked to is moved into a folder, which writes its file, empty; pages and folders
  // are dragged onto folders, onto a page in a folder, and onto the "Pages" heading; a deleted page still linked to
  // stays listed in italics.
  {
    const link96 = join(pagesDir, 'Link96.md')
    const link96Text = '- [[Idea Ninety Six]] and [[Aaa Ninety Eight]]\n'
    writeFileSync(link96, link96Text)
    await pick(side.locator('.group', { hasText: 'Pages' }), 'newFolder')
    await ask('Fold96')
    await waitPath('96 folder', join(pagesDir, 'Fold96'), true)
    const fold = side.locator('[data-row="f:Fold96"]')
    await fold.waitFor()
    const idea = side.locator('[data-row="p:idea ninety six"]')
    await side.locator('[data-row="p:idea ninety six"].linked-only').waitFor()
    await idea.click({ button: 'right' })
    const linkedOps = await page.locator('[data-op]').evaluateAll((els) => els.map((e) => e.getAttribute('data-op')))
    assert(linkedOps.join() === 'newPage,newFolder,rename,move', `96 menu of a linked-only page: ${linkedOps}`)
    await page.locator('[data-op="move"]').click()
    assert((await page.locator('[data-target=""]').count()) === 0, '96 a linked-only page is offered the top level')
    // The folders offered look like things to click: a border and a pointer.
    const targetLook = await page.locator('[data-target="Fold96"]').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { border: parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none', cursor: cs.cursor }
    })
    assert(targetLook.border && targetLook.cursor === 'pointer', `96 a folder target looks like plain text: ${JSON.stringify(targetLook)}`)
    await page.locator('[data-target="Fold96"]').click()
    await ok.click()
    const ideaFile = join(pagesDir, 'Fold96', 'Idea Ninety Six.md')
    await waitPath('96 the move writes the file', ideaFile, true)
    assert(statSync(ideaFile).size === 0, `96 the file is not empty: ${JSON.stringify(readAt(ideaFile))}`)
    assert(!existsSync(join(pagesDir, 'Idea Ninety Six.md')), '96 a top-level file was written')
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
    // The row is in Fold96 now (right below it), upright.
    await side.locator('[data-row="f:Fold96"] + [data-row="p:idea ninety six"]:not(.linked-only)').waitFor()
    await idea.click({ button: 'right' })
    const fileOps = await page.locator('[data-op]').evaluateAll((els) => els.map((e) => e.getAttribute('data-op')))
    assert(fileOps.join() === 'newPage,newFolder,rename,move,delete', `96 menu of the moved page: ${fileOps}`)
    await kb.press('Escape')
    await page.locator('[data-op]').first().waitFor({ state: 'detached' })
    await idea.click()
    await title.filter({ hasText: 'Idea Ninety Six' }).waitFor()
    const start96 = page.locator('[data-testid="start-writing"]')
    await waitFor('96 the empty page says so', () => start96.innerText(), '💡 Empty page. Start writing…')
    await start96.click()
    await page.locator('.cm-content').waitFor()
    await kb.type('hi')
    await expectFile('96 typing on the moved page writes its file', '- hi\n', ideaFile)
    await kb.press('Escape')
    console.log('PASS 96 a linked-only page is moved into a folder from the menu: an empty file, then a normal page')

    // 97: a page with a file is dragged onto a folder (highlighted, the row dimmed), onto a page in it, onto the
    // heading, and onto a top-level page row (nothing happens: checked after the next drop has fetched the tree).
    const drag97 = join(pagesDir, 'Drag97.md')
    const drag97Text = '- drag me\n'
    writeFileSync(drag97, drag97Text)
    const row97 = side.locator('[data-row="p:drag97"]')
    await row97.waitFor()
    await row97.hover()
    await page.mouse.down()
    await fold.hover({ position: { x: 20, y: 5 } })
    await fold.hover()
    await side.locator('[data-row="f:Fold96"].drop-over').waitFor()
    assert((await side.locator('[data-row="p:drag97"].dragging').count()) === 1, '97 the dragged row is not dimmed')
    // Over a page in the folder, the folder shows the highlight.
    await idea.hover({ position: { x: 30, y: 5 } })
    await idea.hover()
    await side.locator('[data-row="f:Fold96"].drop-over').waitFor()
    assert((await side.locator('[data-row="p:idea ninety six"].drop-over').count()) === 0, '97 the page row is highlighted')
    await page.mouse.up()
    const moved97 = join(pagesDir, 'Fold96', 'Drag97.md')
    await waitPath('97 dropped on a page in Fold96', moved97, true)
    await waitPath('97 the old place', drag97, false)
    assert(readAt(moved97) === drag97Text, `97 bytes changed: ${JSON.stringify(readAt(moved97))}`)
    assert((await side.locator('.drop-over').count()) === 0, '97 a highlight is left after the drop')
    await side.locator('[data-row="f:Fold96"][aria-expanded="true"]').waitFor()
    await row97.dragTo(side.locator('[data-testid="pages-group"]'))
    await waitPath('97 dropped on the Pages heading', drag97, true)
    await waitPath('97 left Fold96', moved97, false)
    assert(readAt(drag97) === drag97Text, `97 bytes changed at the top: ${JSON.stringify(readAt(drag97))}`)
    await row97.dragTo(side.locator('[data-row="p:link96"]'))
    await waitFor('97 the drag ended', () => side.locator('.dragging').count(), 0)
    console.log('PASS 97 a page is dragged onto a folder, onto a page in it, and onto the Pages heading')

    // 98: a page only linked to is dragged onto a folder: its file is written there, empty.
    // Its name sorts right below the folders, so neither row scrolls the tree while it is dragged (a scroll between the
    // press and the first move starts the drag on another row).
    const row98 = side.locator('[data-row="p:aaa ninety eight"].linked-only')
    await row98.dragTo(fold)
    const file98 = join(pagesDir, 'Fold96', 'Aaa Ninety Eight.md')
    try {
      await waitPath('98 the drop writes the file', file98, true)
    } catch (e) {
      const notes = await page.locator('[data-testid="notice"]').allInnerTexts()
      const rows = await side.locator('[data-row]').evaluateAll((els) => els.map((x) => `${x.dataset.row}|${x.className}`))
      console.log(`98 notices: ${JSON.stringify(notes)}
98 rows: ${JSON.stringify(rows)}
98 Fold96: ${readdirSync(join(pagesDir, 'Fold96'))}`)
      throw e
    }
    assert(statSync(file98).size === 0, `98 the file is not empty: ${JSON.stringify(readAt(file98))}`)
    await side.locator('[data-row="p:aaa ninety eight"]:not(.linked-only)').waitFor()
    // The drop on a top-level page row in 97 changed nothing.
    assert(readAt(drag97) === drag97Text, '97 a drop on a top-level page changed the file')
    assert(!existsSync(moved97), '97 a drop on a top-level page moved it')
    assert(readAt(link96) === link96Text, '97 the linking page changed')
    console.log('PASS 98 a linked-only page dragged onto a folder gets its file there; 97 a drop where it is does nothing')

    // 99: a folder is dragged onto another; never onto itself (no highlight).
    await pick(side.locator('.group', { hasText: 'Pages' }), 'newFolder')
    await ask('Inner99')
    await waitPath('99 folder', join(pagesDir, 'Inner99'), true)
    const page99Text = '- ninety nine\n'
    writeFileSync(join(pagesDir, 'Inner99', 'Page99.md'), page99Text)
    const inner = side.locator('[data-row="f:Inner99"]')
    await inner.click()
    await side.locator('[data-row="p:page99"]').waitFor()
    await fold.hover()
    await page.mouse.down()
    await fold.hover({ position: { x: 20, y: 5 } })
    await fold.hover()
    await side.locator('[data-row="f:Fold96"].dragging').waitFor()
    await side.locator('[data-row="p:drag97"]').hover()
    await side.locator('[data-testid="pages-group"]').hover()
    await fold.hover()
    assert((await side.locator('.drop-over').count()) === 0, '99 a folder dragged over itself or its parent is highlighted')
    await page.mouse.up()
    await inner.dragTo(fold)
    const moved99 = join(pagesDir, 'Fold96', 'Inner99', 'Page99.md')
    await waitPath('99 the folder moved', moved99, true)
    await waitPath('99 the old folder', join(pagesDir, 'Inner99'), false)
    assert(readAt(moved99) === page99Text, `99 bytes changed: ${JSON.stringify(readAt(moved99))}`)
    assert(existsSync(join(pagesDir, 'Fold96', 'Idea Ninety Six.md')), '99 a drop on itself moved Fold96')
    // It was open, so it stays open at its new place.
    await side.locator('[data-row="f:Fold96/Inner99"][aria-expanded="true"]').waitFor()
    console.log('PASS 99 a folder is dragged into another folder; over itself there is no highlight')

    // 100: a deleted page that is still linked to stays listed in italics at the top level; one nothing links to goes.
    await pick(idea, 'delete')
    await ok.click()
    await waitPath('100 deleted', ideaFile, false)
    await side.locator('[data-row="p:idea ninety six"].linked-only').waitFor()
    await waitFor('100 the row is at the top level', () => idea.evaluate((e) => getComputedStyle(e).paddingLeft), '10px')
    assert(readAt(link96) === link96Text, '100 the linking page changed')
    await pick(row97, 'delete')
    await ok.click()
    await waitPath('100 deleted, not linked', drag97, false)
    await row97.waitFor({ state: 'detached' })
    console.log('PASS 100 a deleted page still linked to stays in the sidebar as linked-only; one nothing links to goes')
  }

  // 85 to 90: a card dragged to a place in a column keeps it as `priority::` (bytes on disk); other cards in
  // DOING are left alone, so only the order of the Prio cards is checked
  const prioFile = join(pagesDir, 'Prio.md')
  const prio2File = join(pagesDir, 'Prio two.md')
  writeFileSync(prioFile, '- DOING Prio A\n- DOING Prio B\n- DOING Prio C\n')
  writeFileSync(prio2File, '- DOING Prio D\n')
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await page.locator('[data-testid="board-title"]').filter({ hasText: 'Tasks' }).waitFor()
  await cardTitled('Prio D').waitFor({ timeout: 10_000 })
  await cardTitled('Prio C').waitFor({ timeout: 10_000 })
  const doingCards = column('DOING').locator('[data-testid="card"]')
  const prioOrder = async () => (await titlesIn('DOING')).filter((t) => t.startsWith('Prio '))
  // Onto the top edge of a card: the drop lands above it.
  const dropAbove = (card, target) => cardTitled(card).dragTo(target, { targetPosition: { x: 20, y: 3 } })

  // 85: a drag to the top of a column whose cards have no priority writes 1
  await dropAbove('Prio C', doingCards.first())
  await expectFile('85 a drop at the top writes priority 1', '- DOING Prio A\n- DOING Prio B\n- DOING Prio C\n  priority:: 1\n', prioFile)
  await waitFor('85 on top', () => doingCards.first().locator('[data-testid="card-title"]').innerText(), 'Prio C')

  // 86: another to the top writes one more than the top card
  await dropAbove('Prio D', cardTitled('Prio C'))
  await expectFile('86 a second drop at the top writes 2', '- DOING Prio D\n  priority:: 2\n', prio2File)
  await waitFor('86 order', prioOrder, ['Prio D', 'Prio C', 'Prio A', 'Prio B'])

  // 87: a drop between D (2) and C (1) writes 2 and raises D, on its own page, to 3
  await dropAbove('Prio B', cardTitled('Prio C'))
  await expectFile('87 the dropped card', '- DOING Prio A\n- DOING Prio B\n  priority:: 2\n- DOING Prio C\n  priority:: 1\n', prioFile)
  await expectFile('87 the card above is raised', '- DOING Prio D\n  priority:: 3\n', prio2File)
  await waitFor('87 order', prioOrder, ['Prio D', 'Prio B', 'Prio C', 'Prio A'])

  // 88: a drop at the end of the column, among the cards without a priority, removes the line
  const doingBox = await column('DOING').boundingBox()
  await cardTitled('Prio B').dragTo(column('DOING'), { targetPosition: { x: 20, y: doingBox.height - 4 } })
  await expectFile('88 a drop among the unprioritized cards removes the line', '- DOING Prio A\n- DOING Prio B\n- DOING Prio C\n  priority:: 1\n', prioFile)

  // The board shows the drop before the next drag starts (a reload in the middle of a drag would end it).
  await waitFor('88 order', prioOrder, ['Prio D', 'Prio C', 'Prio A', 'Prio B'])

  // 89: a drag to DONE removes the line and writes the done date with its time. With the wide columns of step 78 the
  // board is wider than the window: the main view scrolled to its right end, DOING and DONE are both on screen (a drag does not
  // scroll the board by itself).
  await page.locator('.main').evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await cardTitled('Prio C').dragTo(column('DONE'), { targetPosition: { x: 20, y: 20 } })
  await expectFileLike('89 finishing removes the priority', `- DOING Prio A\n- DOING Prio B\n- DONE Prio C\n  done:: [[${today}]] ${TIME}\n`, prioFile)
  assert(readAt(prio2File) === '- DOING Prio D\n  priority:: 3\n', `89 Prio two changed: ${JSON.stringify(readAt(prio2File))}`)

  // 90: the order holds after the board loads again
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('[data-testid="board-title"]').waitFor({ state: 'detached' })
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  await cardTitled('Prio D').waitFor()
  await waitFor('90 order after a reload', prioOrder, ['Prio D', 'Prio A', 'Prio B'])
  assert((await doingCards.first().locator('[data-testid="card-title"]').innerText()) === 'Prio D', '90 Prio D is not at the top')
  console.log('PASS 90 the places hold after the board loads again')

  // 57: switching folders sends just-typed text first, then shows the other folder; and back
  await page.locator('[data-testid="nav-journal"]').click()
  const yFile = join(folder, 'journals', `${yesterday}.md`)
  const y57 = readAt(yFile)
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  await kb.press('End')
  await kb.type(' switch')
  // No Keep mine / Use theirs choice is open, so the switch is not refused for one.
  const choices = await page.locator('.notice button').filter({ hasText: /^(Keep mine|Use theirs)$/ }).count()
  assert(choices === 0, `a Keep mine / Use theirs notice is open before the switch (${choices} buttons)`)
  await page.locator('[data-testid="folder-name"]').click()
  await screen.locator(`[data-testid="recent-folder"][data-path="${folder2.replaceAll('\\', '\\\\')}"]`).click()
  await waitFor('57 other', () => page.locator('[data-testid="folder-name"]').innerText(), basename(folder2))
  assert(readAt(yFile) === y57.replace(/\n$/, ' switch\n'), `typed text not saved before the switch: ${JSON.stringify(readAt(yFile))}`)
  await side.getByText('Other', { exact: true }).waitFor()
  await page.locator('[data-testid="folder-name"]').click()
  await screen.locator(`[data-testid="recent-folder"][data-path="${folder.replaceAll('\\', '\\\\')}"]`).click()
  await waitFor('57 back', () => page.locator('[data-testid="folder-name"]').innerText(), basename(folder))
  await waitFor('57 list', () => (settingsJson().recent_folders ?? []).slice(0, 2).join('|'), `${folder}|${folder2}`)
  console.log('PASS 57 switching folders saves typed text first and the recent list follows')

  // 58: a folder that no longer exists is shown as missing and can be removed from the list
  await page.locator('[data-testid="folder-name"]').click()
  const goneRow = screen.locator(`[data-testid="recent-folder"][data-path="${goneFolder.replaceAll('\\', '\\\\')}"]`)
  assert(await goneRow.evaluate((e) => e.classList.contains('missing')), 'missing folder not marked')
  await goneRow.locator('[data-testid="recent-remove"]').click()
  await waitFor('58 forgotten', () => (settingsJson().recent_folders ?? []).includes(goneFolder), false)
  await goneRow.waitFor({ state: 'detached' })
  console.log('PASS 58 a missing folder is marked and removed from the list')

  // 64: Settings ends with an About section: name, the version in Cargo.toml, developer
  const versionLine = page.locator('[data-testid="app-version"]')
  await waitFor('64 version', () => versionLine.innerText(), readVersions(root).cargo)
  assert((await page.locator('[data-testid="app-name"]').innerText()) === 'Breccia', 'about: name')
  assert((await page.locator('[data-testid="app-developer"]').innerText()) === 'Stefan Härtel', 'about: developer')
  assert((await page.locator('[data-testid="app-license"]').innerText()) === 'MIT License', 'about: license')
  // The source link is an external link (class ext), so a click opens the system browser, never
  // the webview. Not clicked here: that would open a browser on the machine running e2e.
  const repo = page.locator('[data-testid="app-source"] a')
  assert((await repo.innerText()) === 'github.com/EightBitBoy/breccia', `about: source text ${await repo.innerText().catch(() => '(none)')}`)
  assert((await repo.getAttribute('href')) === 'https://github.com/EightBitBoy/breccia', 'about: source href')
  assert((await repo.getAttribute('class'))?.split(/\s+/).includes('ext'), 'about: source link is not class ext')
  assert(await page.locator('[data-testid="app-icon"]').evaluate((e) => e.complete && e.naturalWidth > 0), 'about: icon not loaded')
  // The icon is shown large (32 px was too small).
  const iconSize = await page.locator('[data-testid="app-icon"]').evaluate((e) => [e.clientWidth, e.clientHeight])
  assert(iconSize[0] === 96 && iconSize[1] === 96, `about: icon is ${iconSize}, not 96 x 96`)
  console.log('PASS 64 Settings shows the version of the running app')

  // 134: Settings > About shows the changelog built into the app (CHANGELOG.md, in the bundle); Esc returns to Settings
  {
    const md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    const versions = [...md.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1])
    const items = (md.match(/^\s*[-*+] /gm) ?? []).length
    const showBtn = page.locator('[data-testid="show-changelog"]')
    const overlay = page.locator('[data-testid="changelog"]')
    const body = overlay.locator('[data-testid="changelog-body"]')
    const scrollTop = () => body.evaluate((e) => e.scrollTop)
    const focusedTestid = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
    // 1. the button opens the overlay
    assert((await showBtn.innerText()) === 'Show changelog', `134 button text: ${await showBtn.innerText()}`)
    await showBtn.click()
    await overlay.waitFor()
    assert((await overlay.locator('.dialog-title').innerText()) === 'Changelog', '134 title is not Changelog')
    // 2. every release, newest first, and every bullet
    const shown = await overlay.locator('[data-version]').evaluateAll((els) => els.map((e) => e.getAttribute('data-version')))
    assert(JSON.stringify(shown) === JSON.stringify(versions), `134 versions: ${JSON.stringify(shown)} vs ${JSON.stringify(versions)}`)
    assert(shown[0] === readVersions(root).cargo, `134 newest ${shown[0]} is not the running version ${readVersions(root).cargo}`)
    const lis = await overlay.locator('li').count()
    assert(lis === items, `134 ${lis} list items, CHANGELOG.md has ${items}`)
    // 3. a release build: no dev note; links open in the system browser
    assert((await page.locator('[data-testid="changelog-dev-note"]').count()) === 0, '134 dev note in a release build')
    const linkClasses = await overlay.locator('a').evaluateAll((els) => els.map((e) => e.classList.contains('ext')))
    assert(linkClasses.every(Boolean), `134 a link without class ext: ${JSON.stringify(linkClasses)}`)
    // 4. focus on the body at the top; PageDown scrolls it
    await waitFor('134 focus', focusedTestid, 'changelog-body')
    assert((await scrollTop()) === 0, `134 opens at ${await scrollTop()}, not the top`)
    await kb.press('PageDown')
    await waitFor('134 PageDown scrolls', async () => (await scrollTop()) > 0, true)
    // 5. F1 opens no shortcut list over it
    await kb.press('F1')
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    assert((await page.locator('[data-testid="shortcuts"]').count()) === 0, '134 F1 opened the shortcuts over the changelog')
    // 6. the oldest release is reachable; Esc closes it, Settings stays, focus is back on the button
    await body.evaluate((e) => (e.scrollTop = e.scrollHeight))
    const inView = () =>
      body.evaluate((e) => {
        const h = e.querySelector('[data-version="1.0.0"]')
        if (!h) return 'missing'
        const a = e.getBoundingClientRect()
        const b = h.getBoundingClientRect()
        return b.top >= a.top && b.bottom <= a.bottom
      })
    await waitFor('134 1.0.0 in view', inView, true)
    await kb.press('Escape')
    await overlay.waitFor({ state: 'detached' })
    assert(await page.locator('[data-testid="settings"]').isVisible(), '134 Settings gone after Esc')
    assert(await page.locator('section[data-section="about"]').isVisible(), '134 About gone after Esc')
    await waitFor('134 focus back', focusedTestid, 'show-changelog')
    // 7. it opens at the top again; a click outside closes it
    await showBtn.click()
    await overlay.waitFor()
    await waitFor('134 focus again', focusedTestid, 'changelog-body')
    assert((await scrollTop()) === 0, `134 reopens at ${await scrollTop()}, not the top`)
    await page.locator('.overlay').click({ position: { x: 4, y: 4 } })
    await overlay.waitFor({ state: 'detached' })
    assert(await page.locator('[data-testid="settings"]').isVisible(), '134 Settings gone after a click outside')
  }
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 134 Settings > About shows the changelog built into the app; Esc returns to Settings')

  // 59: the Graph entry opens the network view; the defaults; nothing is written
  const net = page.locator('[data-testid="network"]')
  const graphCount = () => page.locator('[data-testid="graph-count"]').innerText()
  const before59 = notesFiles()
  const otherFiles = () => filesUnder(folder).filter((f) => !f.endsWith('.md')) // e.g. a graph-*.json
  const others59 = otherFiles()
  const config59 = readAt(configFile)
  await page.locator('[data-testid="nav-graph"]').click()
  await net.waitFor()
  assert((await page.locator('[data-testid="nav-graph"].active').count()) === 1, 'Graph entry not highlighted')
  assert(/^\d[\d,]* pages? · \d[\d,]* links?$/.test(await graphCount()), `count: ${await graphCount()}`)
  assert(await page.locator('[data-testid="graph-hide-journals"]').isChecked(), 'journals shown by default')
  assert(!(await page.locator('[data-testid="graph-hide-tags"]').isChecked()), 'tag-only hidden by default')
  // log, do not assert: do requestAnimationFrame callbacks run off-screen?
  console.log('59 rAF within 1 s:', await page.evaluate(() => new Promise((res) => { let n = 0; const t = setTimeout(() => res(false), 1000); const f = () => { if (++n >= 2) { clearTimeout(t); res(true) } else requestAnimationFrame(f) }; requestAnimationFrame(f) })))
  await waitFor('59 layout', async () => ['settled', 'capped', 'saved'].includes(await net.getAttribute('data-layout')), true, 20000)
  assert(JSON.stringify(notesFiles()) === JSON.stringify(before59), 'the graph changed a notes file')
  assert(readAt(configFile) === config59, 'the graph changed config.toml')
  console.log('PASS 59 the Graph entry opens the network view and writes nothing')

  // 60: pages written on disk appear while the graph is shown; Limit to a folder
  const netDir = join(pagesDir, 'Net')
  mkdirSync(netDir, { recursive: true })
  const hubText = '- [[Spoke A]] and [[Spoke B]] #nettag\n'
  const spokeAText = '- back to [[Hub]]\n'
  writeFileSync(join(netDir, 'Hub.md'), hubText)
  writeFileSync(join(netDir, 'Spoke A.md'), spokeAText)
  writeFileSync(join(netDir, 'Spoke B.md'), '- quiet\n')
  const limit = page.locator('[data-testid="graph-limit"]')
  await waitFor('60 option', () => limit.locator('option[value="folder:Net"]').count(), 1)
  await limit.selectOption('folder:Net')
  await waitFor('60 folder', graphCount, '3 pages · 2 links')
  const spokeBText = '- quiet\n- see [[Spoke A]]\n'
  writeFileSync(join(netDir, 'Spoke B.md'), spokeBText)
  await waitFor('60 live', graphCount, '3 pages · 3 links')
  console.log('PASS 60 the graph follows pages written on disk and limits to a folder')

  // 61: Limit to a tag; hide tag-only pages
  await limit.selectOption('tag:nettag')
  await waitFor('61 tag', graphCount, '2 pages · 1 link')
  await page.locator('[data-testid="graph-hide-tags"]').check()
  await waitFor('61 tag-only hidden', graphCount, '1 page · 0 links')
  await page.locator('[data-testid="graph-hide-tags"]').uncheck()
  await limit.selectOption('all')
  console.log('PASS 61 limit to a tag and hide tag-only pages')

  // 62: Find centres and highlights a page; hover marks it; a click opens it
  await waitFor('62 still', async () => ['settled', 'capped', 'saved'].includes(await net.getAttribute('data-layout')), true, 20000)
  const find = page.locator('[data-testid="graph-find"]')
  await find.fill('Hub')
  await waitFor('62 list', async () => (await page.locator('[data-testid="graph-find-row"]').count()) > 0, true)
  assert((await find.getAttribute('aria-controls')) === 'graph-find-list', 'Find: aria-controls')
  const active62 = () => find.getAttribute('aria-activedescendant')
  const selected62 = async () => page.locator('#' + (await active62()) + '[aria-selected="true"]').count()
  await waitFor('62 active row', selected62, 1)
  const first62 = await active62()
  if ((await page.locator('[data-testid="graph-find-row"]').count()) > 1) {
    await find.press('ArrowDown')
    await waitFor('62 next row', async () => ((await active62()) !== first62 ? await selected62() : 0), 1)
  }
  await find.press('Enter')
  await waitFor('62 highlight', () => net.getAttribute('data-highlight'), 'hub')
  const box62 = await page.locator('[data-testid="graph-canvas"]').boundingBox() // not `box`: step 43 declares it in the same block
  const cx = box62.x + box62.width / 2
  const cy = box62.y + box62.height / 2
  await waitFor('62 hover', async () => {
    await page.mouse.move(cx + 2, cy)
    await page.mouse.move(cx, cy)
    return net.getAttribute('data-hovered')
  }, 'hub')
  await page.mouse.click(cx, cy)
  await waitFor('62 opened', () => title.innerText(), 'Hub')
  await net.waitFor({ state: 'detached' })
  assert((await page.locator('[data-testid="nav-graph"].active').count()) === 0, 'Graph entry still highlighted')
  console.log('PASS 62 Find centres a page, hover marks it, and a click opens it')

  // 63: reopening shows the saved layout at once; only the cache file was written
  await page.locator('[data-testid="nav-graph"]').click()
  await waitFor('63 saved', () => net.getAttribute('data-layout'), 'saved')
  const cacheDir = join(configDir, 'cache')
  const layoutFile = readdirSync(cacheDir).find((f) => /^graph-[0-9a-f]{16}\.json$/.test(f))
  assert(layoutFile, `no layout file in ${cacheDir}`)
  const saved = JSON.parse(readAt(join(cacheDir, layoutFile)))
  assert(saved.version === 1 && Array.isArray(saved.positions.hub), 'Hub has no saved position')
  const after63 = notesFiles()
  const netRel = (n) => `pages/Net/${n}.md` // filesUnder keys use `/`; `join` would give `\` on Windows
  assert(after63[netRel('Hub')] === hubText && after63[netRel('Spoke A')] === spokeAText && after63[netRel('Spoke B')] === spokeBText, 'the Net pages changed')
  for (const f of Object.keys(before59)) assert(after63[f] === before59[f], `${f} changed while the graph was shown`)
  assert(Object.keys(after63).length === Object.keys(before59).length + 3, 'a notes file appeared')
  assert(JSON.stringify(otherFiles()) === JSON.stringify(others59), `a non-.md file appeared in the notes folder: ${otherFiles()}`)
  assert(readAt(configFile) === config59, 'the graph changed config.toml')
  // A new Find text drops the old highlight
  const find63 = page.locator('[data-testid="graph-find"]')
  await find63.fill('Hub')
  await find63.press('Enter')
  await waitFor('63 highlight', () => net.getAttribute('data-highlight'), 'hub')
  await find63.fill('Spoke')
  await waitFor('63 highlight cleared', () => net.getAttribute('data-highlight'), null)
  await page.locator('[data-testid="nav-journal"]').click() // steps 45-50 start from the journal with the sidebar shown
  console.log('PASS 63 the saved layout reopens at once, and only the cache file was written')

  // 69: an alias link and a heading link open their page and write nothing. The files are
  // outside edits, here and not earlier, so no earlier step's counts change.
  const kubeText69 = '---\naliases:\n  - k8s\n---\n- the cluster\n'
  const opsText69 = '- see [[k8s]] and [[Kubernetes#Setup|setup]]\n'
  writeFileSync(join(pagesDir, 'Kubernetes.md'), kubeText69)
  writeFileSync(join(pagesDir, 'Ops 69.md'), opsText69)
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  // The watcher has loaded both files (the alias with them) before any click.
  await side.locator('[data-row="p:kubernetes"]').waitFor({ timeout: 10_000 })
  await side.locator('[data-row="p:ops 69"]').waitFor({ timeout: 10_000 })
  const before69 = notesFiles()
  await side.locator('[data-row="p:ops 69"]').click()
  await waitFor('69 Ops 69 shown', () => title.innerText(), 'Ops 69')
  const outline69 = page.locator('[data-block-id]')
  await outline69.locator('a.link', { hasText: 'k8s' }).click()
  await waitFor('69 alias opens Kubernetes', () => title.innerText(), 'Kubernetes')
  const refs69 = page.locator('[data-testid="linked-refs"]')
  await waitFor('69 refs', async () => {
    const t = await refs69.innerText().catch(() => '')
    return t.includes('Linked references · 1') && t.includes('Ops 69')
  }, true)
  await side.locator('[data-row="p:ops 69"]').click()
  await waitFor('69 back to Ops 69', () => title.innerText(), 'Ops 69')
  await outline69.locator('a.link', { hasText: 'setup' }).click()
  await waitFor('69 heading opens Kubernetes', () => title.innerText(), 'Kubernetes')
  const pageFiles69 = readdirSync(pagesDir)
  assert(!pageFiles69.includes('k8s.md'), 'pages/k8s.md was written')
  assert(!pageFiles69.some((f) => f.startsWith('Kubernetes#')), `a Kubernetes# file was written: ${pageFiles69}`)
  assert(readAt(join(pagesDir, 'Kubernetes.md')) === kubeText69, 'Kubernetes.md changed')
  assert(readAt(join(pagesDir, 'Ops 69.md')) === opsText69, 'Ops 69.md changed')
  assert(JSON.stringify(notesFiles()) === JSON.stringify(before69), 'a click wrote a notes file')
  console.log('PASS 69 an alias link and a heading link open their page and write nothing')

  // 70: a new page whose name cannot be a file name lists that name as an Obsidian alias
  await pick(side.locator('.group', { hasText: 'Pages' }), 'newPage')
  await ask('Q&A: seventy')
  await title.filter({ hasText: 'Q&A: seventy' }).waitFor()
  await page.locator('[data-testid="start-writing"]').click()
  await page.locator('.cm-content').waitFor()
  await kb.type('x')
  await kb.press('Escape')
  await expectFile(
    '70 alias block',
    '---\naliases:\n  - "Q&A: seventy"\n---\ntitle:: Q&A: seventy\n- x\n',
    join(pagesDir, 'Q&A_ seventy.md'),
  )
  console.log('PASS 70 a new page with a colon in its name lists the name as an alias')

  // 71: a rename updates the heading links to the page and drops the alias Breccia wrote
  // (the name can be a file name now). The linking file is an outside edit, as in step 69.
  const refs71 = join(pagesDir, 'Refs 71.md')
  writeFileSync(refs71, '- [[Q&A: seventy#Part|p]] and [[Q&A: seventy]]\n')
  await side.locator('[data-row="p:refs 71"]').waitFor({ timeout: 10_000 })
  await pick(side.locator('[data-row="p:q&a: seventy"]'), 'rename')
  await ask('Seventy')
  const confirm71 = await page.locator('[role="alertdialog"]').innerText()
  assert(confirm71.includes('Links in 1 page will be updated'), `71 rename confirm: ${confirm71}`)
  await ok.click()
  await expectFile('71 renamed page', '- x\n', join(pagesDir, 'Seventy.md'))
  await waitPath('71 old file gone', join(pagesDir, 'Q&A_ seventy.md'), false)
  await expectFile('71 heading link rewritten', '- [[Seventy#Part|p]] and [[Seventy]]\n', refs71)
  await page.locator('[data-testid="nav-journal"]').click() // steps 45-50 start from the journal
  console.log('PASS 71 a rename updates heading links and drops the alias Breccia wrote')

  // 79: a page that is only linked to shows in italics in the sidebar and in All pages; opening
  // it shows its references and writes nothing. The linking file is an outside edit, as in step 69.
  const topics79 = join(pagesDir, 'Topics 79.md')
  writeFileSync(topics79, '- about [[Topic Seventy Nine]]\n')
  const row79 = side.locator('[data-row="p:topic seventy nine"]')
  await row79.waitFor({ timeout: 10_000 })
  await waitFor('79 sidebar row is italic', () => row79.evaluate((el) => getComputedStyle(el).fontStyle), 'italic')
  assert(await row79.evaluate((el) => el.classList.contains('linked-only')), '79 sidebar row not marked')
  assert(!(await side.locator('[data-row="p:topics 79"]').evaluate((el) => el.classList.contains('linked-only'))), '79 the page with a file is marked')
  // Greyed out too: the theme's muted colour, unlike a page with a file.
  const muted = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--muted)'
    document.body.append(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
  const colorOf = (loc) => loc.evaluate((el) => getComputedStyle(el).color)
  await waitFor('79 sidebar row is grey', () => colorOf(row79), muted)
  assert((await colorOf(side.locator('[data-row="p:topics 79"]'))) !== muted, '79 the page with a file is grey')
  const before79 = notesFiles()
  await page.locator('[data-testid="nav-all-pages"]').click()
  // The table draws only the rows in view, so filter down to this one.
  await page.locator('[data-testid="pages-filter"]').fill('Seventy Nine')
  const prow79 = page.locator('[data-testid="page-row"][data-key="topic seventy nine"] button.name')
  await prow79.waitFor({ timeout: 10_000 })
  await waitFor('79 All pages row is italic', () => prow79.evaluate((el) => getComputedStyle(el).fontStyle), 'italic')
  await waitFor('79 All pages row is grey', () => colorOf(prow79), muted)
  await prow79.click()
  await waitFor('79 opens the page', () => title.innerText(), 'Topic Seventy Nine')
  await waitFor('79 refs', async () => {
    const t = await page.locator('[data-testid="linked-refs"]').innerText().catch(() => '')
    return t.includes('Linked references · 1') && t.includes('Topics 79')
  }, true)
  assert(!readdirSync(pagesDir).includes('Topic Seventy Nine.md'), '79 a file was written for the linked-only page')
  assert(JSON.stringify(notesFiles()) === JSON.stringify(before79), '79 opening wrote a notes file')
  // The link goes, and so does the row.
  writeFileSync(topics79, '- about nothing\n')
  await row79.waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="nav-journal"]').click() // steps 45-50 start from the journal
  console.log('PASS 79 a page only linked to shows in italics, opens its references and writes nothing')

  // 80: the Tags section lists a tag with its count, in italics while it has no page; a click opens its
  // references; Rename rewrites the tag in the notes and writes no page file. An outside edit, as in step 69.
  const tagged80 = join(pagesDir, 'Tagged 80.md')
  writeFileSync(tagged80, '- one #lbl80\n- two #lbl80 #lbl80\n')
  const tag80 = side.locator('[data-row="t:lbl80"]')
  await tag80.waitFor({ timeout: 10_000 })
  assert(await side.locator('[data-testid="tags-group"]').isVisible(), '80 no Tags heading')
  await waitFor('80 tag count', () => tag80.locator('.tag-count').innerText(), '2')
  await waitFor('80 tag is italic', () => tag80.evaluate((el) => getComputedStyle(el).fontStyle), 'italic')
  await waitFor('80 tag is grey', () => colorOf(tag80.locator('.tag-name')), muted)
  assert((await side.locator('[data-row="p:lbl80"]').count()) === 0, '80 a tag-only name is listed under Pages')
  const before80 = notesFiles()
  await tag80.click()
  await waitFor('80 opens the tag', () => title.innerText(), 'lbl80')
  await waitFor('80 refs', async () => {
    const t = await page.locator('[data-testid="linked-refs"]').innerText().catch(() => '')
    return t.includes('Linked references · 2') && t.includes('Tagged 80')
  }, true)
  assert(JSON.stringify(notesFiles()) === JSON.stringify(before80), '80 opening a tag wrote a notes file')
  await pick(tag80, 'rename')
  await ask('label80')
  const confirm80 = await page.locator('[role="alertdialog"]').innerText()
  assert(confirm80.includes('Links in 1 page will be updated'), `80 rename confirm: ${confirm80}`)
  await ok.click()
  await expectFile('80 tag renamed', '- one #label80\n- two #label80 #label80\n', tagged80)
  await side.locator('[data-row="t:label80"]').waitFor({ timeout: 10_000 })
  assert(!readdirSync(pagesDir).some((f) => f.toLowerCase().startsWith('label80') || f.toLowerCase().startsWith('lbl80')), '80 a tag page file was written')
  await page.locator('[data-testid="nav-journal"]').click() // steps 45-50 start from the journal
  console.log('PASS 80 the Tags section counts, opens and renames a tag without writing a page')

  // Page colors (steps 112 to 123): each starts and ends at the journal. The pages are outside edits, as in step 69.
  const swatch = page.locator('[data-testid="page-color"]')
  const picker = page.locator('[data-testid="page-color-picker"]')
  const option = (c) => picker.locator(`[data-testid="page-color-option"][data-color="${c}"]`)
  const focusedTestId = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
  /** The computed background of a probe whose background is `value`, e.g. `var(--pc-red-wash)` (as step 79). */
  const bgProbe = (value) =>
    page.evaluate((v) => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = v
      document.body.append(probe)
      const c = getComputedStyle(probe).backgroundColor
      probe.remove()
      return c
    }, value)
  const bgOf = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  /** The wash of each row (`-` for none), and the indexes of the rows with a class, as one text each. */
  const washesOf = (rows) => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-wash') ?? '-').join(' '))
  const rowsWith = (rows, cls) => rows.evaluateAll((els, c) => els.flatMap((e, i) => (e.classList.contains(c) ? [i] : [])).join(), cls)
  /** Scrolls the feed until the day is drawn, then brings it into view with `text` shown. */
  const showDay = async (key, text) => {
    const day = page.locator(`[data-day="${key}"]`)
    await feed.waitFor()
    await page.locator('.main').evaluate((el) => (el.scrollTop = 0))
    await waitFor(`${key} drawn`, async () => {
      if ((await day.count()) > 0) return true
      await page.locator('.main').evaluate((el) => (el.scrollTop += el.clientHeight / 2))
      return false
    }, true)
    await day.scrollIntoViewIfNeeded()
    await day.getByText(text).first().waitFor({ timeout: 10_000 })
    return day
  }
  /** A click on a row away from its links: the right end of its text. */
  const clickRow = async (row, modifiers = []) => {
    const box = await row.locator('.content').boundingBox()
    await row.locator('.content').click({ position: { x: box.width - 4, y: box.height / 2 }, modifiers })
  }
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  // 112: the swatch beside the title picks a color; the file gets only the color line; undo and redo on the swatch
  const hue112 = join(pagesDir, 'Hue 112.md')
  writeFileSync(hue112, '- about hue\n\t- detail\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  const hueRow = side.locator('[data-row="p:hue 112"]')
  await hueRow.waitFor({ timeout: 10_000 })
  await hueRow.click()
  await waitFor('112 opens Hue 112', () => title.innerText(), 'Hue 112')
  await page.locator('.block .content', { hasText: 'detail' }).waitFor()
  assert((await swatch.getAttribute('data-color')) === '', '112 the swatch has a color before a pick')
  await swatch.click()
  await picker.waitFor()
  assert((await page.getByRole('dialog', { name: 'Page color', exact: true }).count()) === 1, '112 the picker is not a dialog named "Page color"')
  assert((await picker.locator('[data-testid="page-color-option"]').count()) === 25, '112 the picker has not 25 colors')
  assert((await picker.locator('[data-testid="page-color-none"]').count()) === 1, '112 the picker has no "No color"')
  assert((await picker.locator('[data-testid="page-color-none"][data-current]').count()) === 1, '112 "No color" is not current')
  await option('red').click()
  await picker.waitFor({ state: 'detached' })
  await expectFile('112 a pick writes the color line', 'color:: red\n- about hue\n\t- detail\n', hue112)
  await waitFor('112 swatch red', () => swatch.getAttribute('data-color'), 'red')
  assert(!(await page.locator('.main').innerText()).includes('color::'), '112 the page shows the color line')
  await waitFor('112 focus back on the swatch', focusedTestId, 'page-color')
  await kb.press('Control+z')
  await expectFile('112 undo takes the pick back', '- about hue\n\t- detail\n', hue112)
  await waitFor('112 swatch empty after undo', () => swatch.getAttribute('data-color'), '')
  await kb.press('Control+Shift+z')
  await expectFile('112 redo puts it back', 'color:: red\n- about hue\n\t- detail\n', hue112)
  await waitFor('112 swatch red after redo', () => swatch.getAttribute('data-color'), 'red')
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 112 the swatch picks a page color, writes only its line, and undo and redo work')

  // 113: journal blocks take their topic's wash; same-topic neighbours merge into one blob, a new topic starts its own
  // after a gap; a typed link joins the blob; a fold leaves only the shown rows in the blob. Day 6 holds the fold.
  writeFileSync(join(pagesDir, 'Tone 113.md'), 'color:: blue\n- t\n')
  writeFileSync(join(pagesDir, 'Crimson 113.md'), 'color:: red\n- c\n')
  await side.locator('[data-row="p:tone 113"]').waitFor({ timeout: 10_000 })
  await side.locator('[data-row="p:crimson 113"]').waitFor({ timeout: 10_000 })
  const day113 = join(folder, 'journals', `${dayKey(5)}.md`)
  const journal113 = `- [[Hue 112]] first\n\t- [[Tone 113]] child\n- [[${older}]] then [[Hue 112]]\n- [[Crimson 113]] other page\n- [[Tone 113]] blue\n- plain words\n`
  writeFileSync(day113, journal113)
  writeFileSync(join(folder, 'journals', `${dayKey(6)}.md`), '- [[Crimson 113]] folded\n\t- under\n- plain\n')
  const day5 = await showDay(dayKey(5), 'plain words')
  const rows5 = day5.locator('.block[data-block-id]')
  await waitFor('113 washes', () => washesOf(rows5), 'red red red red blue -')
  assert((await rowsWith(rows5, 'wash-top')) === '0,3,4', `113 wash-top on ${await rowsWith(rows5, 'wash-top')}`)
  assert((await rowsWith(rows5, 'wash-bottom')) === '2,3,4', `113 wash-bottom on ${await rowsWith(rows5, 'wash-bottom')}`)
  assert((await rowsWith(rows5, 'wash-gap')) === '3,4', `113 wash-gap on ${await rowsWith(rows5, 'wash-gap')}`)
  const redWash = await bgProbe('var(--pc-red-wash)')
  assert((await bgOf(rows5.nth(0))) === redWash, `113 row 0 background ${await bgOf(rows5.nth(0))}, not ${redWash}`)
  assert((await bgOf(rows5.nth(5))) === 'rgba(0, 0, 0, 0)', `113 row 5 background ${await bgOf(rows5.nth(5))}`)
  // A fold: the blob covers only the shown rows and keeps both rounded ends.
  const day6 = await showDay(dayKey(6), 'under')
  const rows6 = day6.locator('.block[data-block-id]')
  await waitFor('113 day 6 washes', () => washesOf(rows6), 'red red -')
  assert((await rowsWith(rows6, 'wash-top')) === '0' && (await rowsWith(rows6, 'wash-bottom')) === '1', '113 day 6 blob ends')
  await rows6.nth(0).hover() // the fold arrow shows on hover
  await rows6.nth(0).locator('button.arrow').click()
  await waitFor('113 folded washes', () => washesOf(rows6), 'red -')
  assert((await rowsWith(rows6, 'wash-top')) === '0' && (await rowsWith(rows6, 'wash-bottom')) === '0', '113 the folded row lost a rounded end')
  await rows6.nth(0).locator('button.arrow').click()
  await waitFor('113 unfolded washes', () => washesOf(rows6), 'red red -')
  // Typing a link joins the blob above.
  await showDay(dayKey(5), 'plain words')
  await rows5.nth(5).locator('.content').click()
  await page.locator('.cm-content').waitFor()
  await kb.press('End')
  await kb.type(' [[Tone 113]]')
  await waitFor('113 typed row washed', async () => (await rows5.nth(5).getAttribute('data-wash')) === 'blue' && (await rowsWith(rows5, 'wash-bottom')) === '2,3,5', true)
  assert(!(await rowsWith(rows5, 'wash-gap')).split(',').includes('5'), '113 the typed row starts a new blob')
  await expectFile('113 typed link', journal113.replace('- plain words\n', '- plain words [[Tone 113]]\n'), day113)
  await kb.press('Escape')
  await page.locator('.cm-content').waitFor({ state: 'detached' })
  await day5.locator('[data-testid="day-title"]').click()
  const dayRows = page.locator('.main .block[data-block-id]')
  await waitFor('113 the day page shows the washes', () => washesOf(dayRows), 'red red red red blue blue')
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 113 journal blocks show their topic\'s wash, merge and follow typing')

  // 114: "No color" removes the line; the journal's washes for the page go
  await hueRow.click()
  await waitFor('114 opens Hue 112', () => title.innerText(), 'Hue 112')
  // A block selection stays while the swatch takes the focus and opens the picker by keyboard, and Esc in the picker
  // closes only the picker: the next Esc clears the selection.
  const hueRows = page.locator('.main .block[data-block-id]')
  await clickRow(hueRows.nth(0))
  await page.locator('.cm-content').waitFor()
  await clickRow(hueRows.nth(1), ['Shift'])
  await waitFor('114 two blocks selected', () => page.locator('.block.selected').count(), 2)
  await swatch.focus()
  await kb.press('Enter')
  await picker.waitFor()
  assert((await page.locator('.block.selected').count()) === 2, '114 opening the picker cleared the selection')
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  assert((await page.locator('.block.selected').count()) === 2, '114 Esc in the picker cleared the selection')
  await kb.press('Escape')
  await waitFor('114 selection cleared', () => page.locator('.block.selected').count(), 0)
  await swatch.click()
  await picker.waitFor()
  assert((await picker.locator('[data-testid="page-color-option"][data-current]').getAttribute('data-color')) === 'red', '114 red is not current')
  await picker.locator('[data-testid="page-color-none"]').click()
  await expectFile('114 no color removes the line', '- about hue\n\t- detail\n', hue112)
  await page.locator('[data-testid="nav-journal"]').click()
  await showDay(dayKey(5), 'plain words')
  await waitFor('114 washes', () => washesOf(rows5), '- - - red blue blue')
  console.log('PASS 114 removing a color clears the washes in the journal')

  // 115: the picker by keyboard on a tag-only page; Esc writes nothing; a pick writes the page's file
  writeFileSync(join(pagesDir, 'Tagged 115.md'), '- one #hue115\n')
  const tag115 = side.locator('[data-row="t:hue115"]')
  await tag115.waitFor({ timeout: 10_000 })
  await tag115.click()
  await waitFor('115 opens the tag', () => title.innerText(), 'hue115')
  await swatch.focus()
  const before115 = notesFiles()
  await kb.press('Enter')
  await picker.waitFor()
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await waitFor('115 focus back on the swatch', focusedTestId, 'page-color')
  assert(JSON.stringify(notesFiles()) === JSON.stringify(before115), '115 Esc wrote a notes file')
  await kb.press('Enter')
  await picker.waitFor()
  // The focus starts on "No color" (index 25): up four rows to 5, right three to 8.
  await waitFor('115 focus on "No color"', focusedTestId, 'page-color-none')
  for (let i = 0; i < 4; i++) await kb.press('ArrowUp')
  for (let i = 0; i < 3; i++) await kb.press('ArrowRight')
  assert((await page.evaluate(() => document.activeElement?.getAttribute('data-color'))) === 'green', '115 the keys did not reach green')
  await kb.press('Enter')
  await expectFile('115 a tag-only page gets its file', 'color:: green\n', join(pagesDir, 'hue115.md'))
  await waitFor('115 swatch green', () => swatch.getAttribute('data-color'), 'green')
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 115 the picker works by keyboard and a tag-only page gets a file with its color')

  // 116: a right-click on a journal link colors its page; a link to a page that cannot take a color gets no menu;
  // the journal file and the shown view stay as they are
  const tone116 = join(pagesDir, 'Tone 113.md')
  const day5b = await showDay(dayKey(5), 'plain words')
  const rows116 = day5b.locator('.block[data-block-id]')
  await waitFor('116 one blue blob', async () => `${await washesOf(rows116)} ${await rowsWith(rows116, 'wash-top')}`, '- - - red blue blue 3,4')
  const journal116 = readAt(day113)
  const url116 = page.url()
  await rows116.nth(2).locator('a.link').first().click({ button: 'right' })
  await frames()
  assert((await page.locator('[data-testid="link-color"]').count()) === 0, '116 a day link got the color menu')
  // A selection over a wash shows the selection colour.
  await clickRow(rows116.nth(4))
  await page.locator('.cm-content').waitFor()
  await clickRow(rows116.nth(5), ['Shift'])
  await waitFor('116 two blocks selected', () => day5b.locator('.block.selected').count(), 2)
  assert((await bgOf(rows116.nth(5))) === (await bgProbe('var(--hover)')), '116 the selection does not show over the wash')
  await kb.press('Escape')
  await waitFor('116 selection cleared', () => day5b.locator('.block.selected').count(), 0)
  const toneLink = rows116.nth(4).locator('a.link', { hasText: 'Tone 113' })
  await toneLink.click({ button: 'right' })
  const linkColorMenu = page.locator('[data-testid="link-color-menu"]')
  await linkColorMenu.waitFor()
  const items116 = await linkColorMenu.locator('[role="menuitem"]').allInnerTexts()
  assert(items116.length === 1 && (await page.locator('[data-testid="link-color"]').count()) === 1, `116 menu items: ${items116}`)
  assert((await page.locator('[data-testid="link-color"]').innerText()).trim() === 'Color…', '116 the entry is not "Color…"')
  await page.locator('[data-testid="link-color"]').click()
  await picker.waitFor()
  assert((await page.getByRole('dialog', { name: 'Color of Tone 113', exact: true }).count()) === 1, '116 the picker is not a dialog named "Color of Tone 113"')
  assert((await picker.locator('[data-testid="page-color-option"][data-current]').getAttribute('data-color')) === 'blue', '116 blue is not marked')
  await option('green').click()
  await expectFile('116 a pick from a link writes the page', 'color:: green\n- t\n', tone116)
  await waitFor('116 green blob', async () => `${await washesOf(rows116)} ${await rowsWith(rows116, 'wash-top')} ${await rowsWith(rows116, 'wash-bottom')}`, '- - - red green green 3,4 3,5')
  assert(readAt(day113) === journal116, '116 the journal file changed')
  assert(page.url() === url116, `116 the webview navigated to ${page.url()}`)
  assert(await feed.isVisible(), '116 the journal is no longer shown')
  console.log('PASS 116 a right-click on a link colors its page from the journal')

  // 117: a custom hue. Hover previews a color, the keys only move the preview, Enter saves; a drag saves once on release
  // and undo takes it back in one step; Esc after arrow presses writes nothing.
  const hue117 = join(pagesDir, 'Hue 117.md')
  writeFileSync(hue117, '- custom\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  const row117 = side.locator('[data-row="p:hue 117"]')
  await row117.waitFor({ timeout: 10_000 })
  await row117.click()
  await waitFor('117 opens Hue 117', () => title.innerText(), 'Hue 117')
  const previewBox = page.locator('[data-testid="page-color-preview"]')
  const previewWash = page.locator('[data-testid="page-color-preview-wash"]')
  const slider = page.locator('[data-testid="page-color-hue"]')
  await swatch.click()
  await picker.waitFor()
  assert((await previewBox.getAttribute('data-preview')) === '', '117 the preview shows a color before a hover')
  await option('red').hover()
  await waitFor('117 hover previews red', () => previewBox.getAttribute('data-preview'), 'red')
  const redWash117 = await bgProbe('var(--pc-red-wash)')
  await waitFor('117 preview wash is red', () => bgOf(previewWash), redWash117)
  await page.mouse.move(2, 2)
  await waitFor('117 preview clears off the picker', () => previewBox.getAttribute('data-preview'), '')
  // Esc after arrow presses closes without saving.
  await waitFor('117 focus on "No color"', focusedTestId, 'page-color-none')
  await kb.press('ArrowDown')
  await waitFor('117 ArrowDown reaches the slider', focusedTestId, 'page-color-hue')
  await waitFor('117 preview follows the slider after a hover', () => previewBox.getAttribute('data-preview'), 'hue 200')
  await kb.press('ArrowRight')
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await expectFile('117 Esc after arrow presses writes nothing', '- custom\n', hue117)
  assert((await swatch.getAttribute('data-color')) === '', '117 the swatch took a color from Esc')
  // Keys only move the preview; Tab moves to the grid without saving; Enter on the slider saves.
  await waitFor('117 focus back on the swatch', focusedTestId, 'page-color')
  await swatch.click()
  await picker.waitFor()
  await waitFor('117 focus on "No color" again', focusedTestId, 'page-color-none')
  await kb.press('ArrowDown')
  await waitFor('117 slider focused', focusedTestId, 'page-color-hue')
  await waitFor('117 preview hue 200', () => previewBox.getAttribute('data-preview'), 'hue 200')
  await kb.press('Home')
  for (let i = 0; i < 21; i++) await kb.press('PageUp')
  for (let i = 0; i < 2; i++) await kb.press('ArrowRight')
  await waitFor('117 slider value', () => slider.getAttribute('aria-valuenow'), '212')
  await waitFor('117 preview hue 212', () => previewBox.getAttribute('data-preview'), 'hue 212')
  assert((await slider.getAttribute('aria-valuetext')) === 'Hue 212', '117 aria-valuetext')
  await frames()
  assert(readAt(hue117) === '- custom\n', '117 the keys saved before Enter')
  await kb.press('Tab')
  await waitFor('117 Tab leaves the slider', async () => (await focusedTestId()) !== 'page-color-hue', true)
  await expectFile('117 Tab saves nothing', '- custom\n', hue117)
  await kb.press('Shift+Tab')
  await waitFor('117 Shift+Tab back on the slider', focusedTestId, 'page-color-hue')
  assert((await slider.getAttribute('aria-valuenow')) === '212', '117 the hue changed on Tab')
  await kb.press('Enter')
  await picker.waitFor({ state: 'detached' })
  await expectFile('117 Enter on the slider saves the hue', 'color:: hue 212\n- custom\n', hue117)
  await waitFor('117 swatch hue 212', () => swatch.getAttribute('data-color'), 'hue 212')
  // A drag saves once, on release; the picker stays open.
  await waitFor('117 focus back on the swatch after Enter', focusedTestId, 'page-color')
  await swatch.click()
  await picker.waitFor()
  await waitFor('117 saved hue marked on the slider', async () => (await slider.getAttribute('data-current')) !== null, true)
  assert((await slider.getAttribute('aria-valuenow')) === '212', '117 slider not at 212')
  assert((await picker.locator('[data-testid="page-color-option"][data-current]').count()) === 0, '117 a cell is marked as well')
  const preview212 = await bgOf(previewWash)
  const sbox = await slider.boundingBox()
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sbox.x - 20, sbox.y + sbox.height / 2, { steps: 8 })
  await waitFor('117 drag left previews hue 0', () => previewBox.getAttribute('data-preview'), 'hue 0')
  assert(readAt(hue117) === 'color:: hue 212\n- custom\n', '117 the drag saved before the release')
  await page.mouse.move(sbox.x + sbox.width + 20, sbox.y + sbox.height / 2, { steps: 8 })
  await waitFor('117 drag right previews hue 359', () => previewBox.getAttribute('data-preview'), 'hue 359')
  assert(readAt(hue117) === 'color:: hue 212\n- custom\n', '117 the drag saved before the release')
  await page.mouse.up()
  await expectFile('117 one drag saves once', 'color:: hue 359\n- custom\n', hue117)
  assert(await picker.isVisible(), '117 the picker closed on release')
  assert((await slider.getAttribute('data-current')) !== null, '117 the slider lost data-current after the drag')
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await waitFor('117 focus back on the swatch after Esc', focusedTestId, 'page-color')
  await kb.press('Control+z')
  await expectFile('117 undo takes back the whole drag', 'color:: hue 212\n- custom\n', hue117)
  await waitFor('117 swatch hue 212 after undo', () => swatch.getAttribute('data-color'), 'hue 212')
  // One undo step per drag is the proof of one write: an intermediate save would need a second undo to reach hue 212.
  await kb.press('Control+z')
  await expectFile('117 the second undo goes back to before the hue', '- custom\n', hue117)
  await kb.press('Control+Shift+z')
  await expectFile('117 redo returns to hue 212', 'color:: hue 212\n- custom\n', hue117)
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 117 a custom hue is picked by keyboard and by dragging, previewed, saved on release, and undone in one step')

  // 118: the custom wash in the journal follows the theme; a named color from the link replaces the hue
  const day118 = join(folder, 'journals', `${dayKey(7)}.md`)
  writeFileSync(day118, '- [[Hue 117]] custom wash\n\t- child\n- plain\n')
  const day7 = await showDay(dayKey(7), 'custom wash')
  const rows7 = day7.locator('.block[data-block-id]')
  await waitFor('118 washes', () => washesOf(rows7), 'hue 212 hue 212 -')
  assert((await rowsWith(rows7, 'wash-top')) === '0', `118 wash-top on ${await rowsWith(rows7, 'wash-top')}`)
  assert((await rowsWith(rows7, 'wash-bottom')) === '1', `118 wash-bottom on ${await rowsWith(rows7, 'wash-bottom')}`)
  const wash118 = await bgOf(rows7.nth(0))
  assert(wash118 === preview212, `118 row 0 background ${wash118}, the picker showed ${preview212}`)
  await page.evaluate(() => (document.documentElement.dataset.theme = 'teal'))
  await waitFor(
    '118 the wash follows the theme',
    async () => {
      const now = await bgOf(rows7.nth(0))
      return now !== wash118 && now !== 'rgba(0, 0, 0, 0)'
    },
    true,
  )
  await page.evaluate(() => delete document.documentElement.dataset.theme)
  await waitFor('118 the wash comes back', () => bgOf(rows7.nth(0)), wash118)
  await rows7.nth(0).locator('a.link', { hasText: 'Hue 117' }).click({ button: 'right' })
  await page.locator('[data-testid="link-color-menu"]').waitFor()
  await page.locator('[data-testid="link-color"]').click()
  await picker.waitFor()
  await waitFor('118 the saved hue is marked', async () => (await slider.getAttribute('data-current')) !== null, true)
  assert((await slider.getAttribute('aria-valuenow')) === '212', '118 slider not at 212')
  await option('violet').click()
  await expectFile('118 a name replaces the hue', 'color:: violet\n- custom\n', hue117)
  await waitFor('118 violet washes', () => washesOf(rows7), 'violet violet -')
  console.log('PASS 118 a custom hue washes journal blocks, follows the theme, and a named color replaces it')

  // 119: vividness. The slider is greyed out until a custom hue applies; keys and drags only preview; Enter or release
  // saves once; a hue change keeps the vividness; a name replaces both. The "limited" note depends on the theme.
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  const vivid119 = join(pagesDir, 'Vivid 119.md')
  writeFileSync(vivid119, '- vivid\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  const row119 = side.locator('[data-row="p:vivid 119"]')
  await row119.waitFor({ timeout: 10_000 })
  await row119.click()
  await waitFor('119 opens Vivid 119', () => title.innerText(), 'Vivid 119')
  const vslider = page.locator('[data-testid="page-color-vivid"]')
  const limited = page.locator('[data-testid="page-color-limited"]')
  const disabled = async () => (await vslider.getAttribute('aria-disabled')) === 'true'
  await swatch.click()
  await picker.waitFor()
  assert(await vslider.isVisible(), '119 the vividness slider is not shown')
  assert(await disabled(), '119 the vividness slider is enabled before a custom hue')
  assert((await vslider.getAttribute('aria-valuenow')) === '100', '119 vividness not 100')
  await waitFor('119 focus on "No color"', focusedTestId, 'page-color-none')
  await kb.press('ArrowDown')
  await waitFor('119 hue slider focused', focusedTestId, 'page-color-hue')
  await waitFor('119 the hue slider enables vividness', async () => !(await disabled()), true)
  await kb.press('Home')
  for (let i = 0; i < 21; i++) await kb.press('PageUp')
  for (let i = 0; i < 2; i++) await kb.press('ArrowRight')
  await waitFor('119 hue 212', () => slider.getAttribute('aria-valuenow'), '212')
  await kb.press('Tab')
  await waitFor('119 Tab reaches vividness', focusedTestId, 'page-color-vivid')
  await kb.press('End')
  await waitFor('119 vividness 200', () => vslider.getAttribute('aria-valuenow'), '200')
  await waitFor('119 preview hue 212 vivid 200', () => previewBox.getAttribute('data-preview'), 'hue 212 vivid 200')
  await limited.waitFor({ state: 'visible' })
  assert((await vslider.getAttribute('aria-valuetext')).endsWith('softened for readability'), `119 aria-valuetext ${await vslider.getAttribute('aria-valuetext')}`)
  await kb.press('Home')
  await waitFor('119 vividness 50', () => vslider.getAttribute('aria-valuenow'), '50')
  await waitFor('119 no note at 50', () => limited.count(), 0)
  await kb.press('PageUp')
  await kb.press('PageUp')
  await waitFor('119 vividness 100', () => vslider.getAttribute('aria-valuenow'), '100')
  await waitFor('119 no note at 100', () => limited.count(), 0)
  await frames()
  assert(readAt(vivid119) === '- vivid\n', '119 the keys saved before Enter')
  await kb.press('End')
  await waitFor('119 vividness 200 again', () => vslider.getAttribute('aria-valuenow'), '200')
  await kb.press('Enter')
  await picker.waitFor({ state: 'detached' })
  await expectFile('119 Enter on the vividness saves hue and vividness', 'color:: hue 212 vivid 200\n- vivid\n', vivid119)
  await waitFor('119 swatch hue 212 vivid 200', () => swatch.getAttribute('data-color'), 'hue 212 vivid 200')
  // A drag on the vividness slider saves once, on release; the picker stays open.
  await waitFor('119 focus back on the swatch', focusedTestId, 'page-color')
  await swatch.click()
  await picker.waitFor()
  await waitFor('119 vividness enabled at once', async () => !(await disabled()), true)
  assert((await vslider.getAttribute('aria-valuenow')) === '200', '119 vividness not 200 on reopening')
  const vbox = await vslider.boundingBox()
  await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2)
  await page.mouse.down()
  await page.mouse.move(vbox.x - 20, vbox.y + vbox.height / 2, { steps: 8 })
  await waitFor('119 drag left previews vivid 50', () => previewBox.getAttribute('data-preview'), 'hue 212 vivid 50')
  assert(readAt(vivid119) === 'color:: hue 212 vivid 200\n- vivid\n', '119 the drag saved before the release')
  await page.mouse.up()
  await expectFile('119 one vividness drag saves once', 'color:: hue 212 vivid 50\n- vivid\n', vivid119)
  assert(await picker.isVisible(), '119 the picker closed on release')
  // A hue drag keeps the vividness.
  const hbox = await slider.boundingBox()
  await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2)
  await page.mouse.down()
  await page.mouse.move(hbox.x + hbox.width + 20, hbox.y + hbox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expectFile('119 a hue drag keeps the vividness', 'color:: hue 359 vivid 50\n- vivid\n', vivid119)
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await waitFor('119 focus back on the swatch after Esc', focusedTestId, 'page-color')
  await kb.press('Control+z')
  await expectFile('119 undo takes back the hue drag', 'color:: hue 212 vivid 50\n- vivid\n', vivid119)
  await kb.press('Control+z')
  await expectFile('119 undo takes back the vividness drag', 'color:: hue 212 vivid 200\n- vivid\n', vivid119)
  await kb.press('Control+z')
  await expectFile('119 undo takes back the color', '- vivid\n', vivid119)
  await kb.press('Control+Shift+z')
  await expectFile('119 redo puts the color back', 'color:: hue 212 vivid 200\n- vivid\n', vivid119)
  // A name replaces hue and vividness.
  await swatch.click()
  await picker.waitFor()
  await option('violet').click()
  await expectFile('119 a name replaces hue and vividness', 'color:: violet\n- vivid\n', vivid119)
  // Reopened on a named color: greyed out until the hue slider is reached, then at 100; Shift+Tab keeps it enabled.
  await waitFor('119 focus back on the swatch after the pick', focusedTestId, 'page-color')
  await swatch.click()
  await picker.waitFor()
  assert(await disabled(), '119 the vividness slider is enabled on a named color')
  await kb.press('Tab')
  await waitFor('119 Tab focuses the hue slider', focusedTestId, 'page-color-hue')
  await waitFor('119 vividness enabled by the hue slider', async () => !(await disabled()), true)
  assert((await vslider.getAttribute('aria-valuenow')) === '100', '119 vividness not 100 on a named color')
  await kb.press('Shift+Tab')
  await waitFor('119 Shift+Tab back on the grid', async () => (await focusedTestId()) !== 'page-color-hue', true)
  assert(!(await disabled()), '119 the vividness slider was greyed out again')
  // Tab twice to the vividness slider, ArrowRight and Esc write nothing.
  await kb.press('Tab')
  await kb.press('Tab')
  await waitFor('119 vividness slider focused', focusedTestId, 'page-color-vivid')
  await kb.press('ArrowRight')
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await expectFile('119 Esc writes nothing', 'color:: violet\n- vivid\n', vivid119)
  console.log('PASS 119 vividness is picked by keyboard and by dragging, is greyed out unless a custom hue applies, keeps with a hue change, and undoes in one step')

  // 120: a hand-written vividness washes the journal like the picker shows it, and the Teal theme limits it
  writeFileSync(vivid119, 'color:: HUE 212 VIVID 0150\n- vivid\n')
  const day120 = join(folder, 'journals', `${dayKey(8)}.md`)
  writeFileSync(day120, '- [[Vivid 119]] strong\n- plain\n')
  await page.locator('[data-testid="nav-journal"]').click()
  const day8 = await showDay(dayKey(8), 'strong')
  const rows8 = day8.locator('.block[data-block-id]')
  await waitFor('120 washes', () => washesOf(rows8), 'hue 212 vivid 150 -')
  const wash120 = await bgOf(rows8.nth(0))
  await rows8.nth(0).locator('a.link', { hasText: 'Vivid 119' }).click({ button: 'right' })
  await page.locator('[data-testid="link-color-menu"]').waitFor()
  await page.locator('[data-testid="link-color"]').click()
  await picker.waitFor()
  assert((await vslider.getAttribute('aria-valuenow')) === '150', `120 vividness ${await vslider.getAttribute('aria-valuenow')}, not 150`)
  await waitFor('120 the hue is marked', async () => (await slider.getAttribute('data-current')) !== null, true)
  // The picker opens at the right-click point, so the pointer may rest on a grid cell, and the preview then shows
  // that hovered cell. Move the pointer off the picker, then wait for the preview to show the page's own color.
  await page.mouse.move(1, 1)
  await waitFor('120 the preview matches the journal wash', () => bgOf(previewWash), wash120)
  assert((await limited.count()) === 0, '120 a note is shown in Light at 150')
  await page.evaluate(() => (document.documentElement.dataset.theme = 'teal'))
  await limited.waitFor({ state: 'visible' })
  await waitFor('120 the journal wash follows the theme', async () => (await bgOf(rows8.nth(0))) !== wash120, true)
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await expectFile('120 a hand-written vividness is kept as written', 'color:: HUE 212 VIVID 0150\n- vivid\n', vivid119)
  await page.evaluate(() => delete document.documentElement.dataset.theme)
  console.log('PASS 120 a hand-written vividness washes the journal, matches the preview, and is limited in Teal')

  // 121: the preview shows only a color under the pointer (a gap in the grid keeps the last cell); the slider thumbs
  // stay inside tracks as wide as the grid; a drag keeps its preview over the preview box; the sliders' value text
  // says when they stand on the page's color; the swatch's picker keeps its own start focus.
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  const hue121 = join(pagesDir, 'Hue 121.md')
  writeFileSync(hue121, '- hue\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  const row121 = side.locator('[data-row="p:hue 121"]')
  await row121.waitFor({ timeout: 10_000 })
  await row121.click()
  await waitFor('121 opens Hue 121', () => title.innerText(), 'Hue 121')
  await swatch.click()
  await picker.waitFor()
  await waitFor('121 focus on "No color"', focusedTestId, 'page-color-none')
  const center = (b) => [b.x + b.width / 2, b.y + b.height / 2]
  await option('red').hover()
  await waitFor('121 hover previews red', () => previewBox.getAttribute('data-preview'), 'red')
  // The gap between red and coral keeps red, so the preview does not blink from cell to cell.
  const red121 = await option('red').boundingBox()
  const coral121 = await option('coral').boundingBox()
  await page.mouse.move((red121.x + red121.width + coral121.x) / 2, red121.y + red121.height / 2)
  await frames()
  assert((await previewBox.getAttribute('data-preview')) === 'red', `121 the gap between cells previews ${await previewBox.getAttribute('data-preview')}`)
  // Off the colors (the preview box), the preview shows the focused choice: "No color".
  await page.mouse.move(...center(await previewBox.boundingBox()))
  await waitFor('121 the preview box previews the focused choice', () => previewBox.getAttribute('data-preview'), '')
  // The greyed vividness slider is not a choice. One move from red, so the pointer never crosses the hue slider.
  await option('red').hover()
  await waitFor('121 hover previews red again', () => previewBox.getAttribute('data-preview'), 'red')
  assert((await vslider.getAttribute('aria-disabled')) === 'true', '121 the vividness slider is enabled')
  await page.mouse.move(...center(await vslider.boundingBox()))
  await waitFor('121 the greyed vividness slider previews the focused choice', () => previewBox.getAttribute('data-preview'), '')
  // Hovering the hue slider is enough to enable Vividness.
  await slider.hover()
  await waitFor('121 hovering the hue slider enables vividness', () => vslider.getAttribute('aria-disabled'), null)
  // The tracks are as wide as the grid's cells, from crimson's left edge to amber's right edge.
  const crimson121 = await option('crimson').boundingBox()
  const amber121 = await option('amber').boundingBox()
  const gridW = amber121.x + amber121.width - crimson121.x
  const hbox121 = await slider.boundingBox()
  const vbox121 = await vslider.boundingBox()
  assert(Math.abs(hbox121.width - gridW) <= 0.5, `121 the hue track is ${hbox121.width} px wide, the grid ${gridW} px`)
  assert(Math.abs(vbox121.width - gridW) <= 0.5, `121 the vividness track is ${vbox121.width} px wide, the grid ${gridW} px`)
  assert(Math.abs(hbox121.x - crimson121.x) <= 0.5, `121 the hue track starts at ${hbox121.x}, the grid at ${crimson121.x}`)
  // The thumb stays inside its track at both ends.
  const thumb121 = slider.locator('.pc-hue-thumb')
  await kb.press('ArrowDown')
  await waitFor('121 ArrowDown reaches the hue slider', focusedTestId, 'page-color-hue')
  await kb.press('Home')
  await waitFor('121 hue 0', () => slider.getAttribute('aria-valuenow'), '0')
  const home121 = await thumb121.boundingBox()
  assert(home121.x >= hbox121.x - 0.5, `121 the thumb at hue 0 starts at ${home121.x}, before the track at ${hbox121.x}`)
  await kb.press('End')
  await waitFor('121 hue 359', () => slider.getAttribute('aria-valuenow'), '359')
  const end121 = await thumb121.boundingBox()
  const trackEnd = hbox121.x + hbox121.width
  assert(end121.x + end121.width <= trackEnd + 0.5, `121 the thumb at hue 359 ends at ${end121.x + end121.width}, past the track at ${trackEnd}`)
  // A drag that crosses the preview box keeps previewing the slider; a release at the track's 4 px point saves hue 0.
  await page.mouse.move(...center(hbox121))
  await page.mouse.down()
  await page.mouse.move(...center(await previewBox.boundingBox()), { steps: 6 })
  await frames()
  const dragged121 = await previewBox.getAttribute('data-preview')
  assert(dragged121.startsWith('hue '), `121 a drag over the preview box previews ${JSON.stringify(dragged121)}`)
  await page.mouse.move(hbox121.x + 4, hbox121.y + hbox121.height / 2, { steps: 6 })
  await waitFor('121 the drag previews hue 0', () => previewBox.getAttribute('data-preview'), 'hue 0')
  await page.mouse.up()
  await expectFile('121 a drag saves hue 0', 'color:: hue 0\n- hue\n', hue121)
  // The value text says when a slider stands on the page's color.
  await waitFor('121 the hue slider holds the page color', () => slider.getAttribute('aria-valuetext'), 'Hue 0, page color')
  await waitFor('121 focus on the hue slider after the drag', focusedTestId, 'page-color-hue')
  await kb.press('ArrowRight')
  await waitFor('121 the moved hue is not the page color', () => slider.getAttribute('aria-valuetext'), 'Hue 1')
  await kb.press('Tab')
  await waitFor('121 Tab reaches vividness', focusedTestId, 'page-color-vivid')
  assert((await vslider.getAttribute('aria-valuetext')) === 'Vividness 100', `121 vividness value text ${await vslider.getAttribute('aria-valuetext')}`)
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  // On opening, the focus starts on the saved hue and stays there.
  await waitFor('121 focus back on the swatch', focusedTestId, 'page-color')
  await swatch.click()
  await picker.waitFor()
  await waitFor('121 the reopened hue slider holds the page color', () => slider.getAttribute('aria-valuetext'), 'Hue 0, page color')
  await frames()
  await frames()
  assert((await focusedTestId()) === 'page-color-hue', `121 the focus moved to ${await focusedTestId()} on opening`)
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await expectFile('121 Esc writes nothing', 'color:: hue 0\n- hue\n', hue121)
  await page.evaluate(() => delete document.documentElement.dataset.theme)
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 121 the preview follows only the colors under the pointer, the thumbs stay in their tracks, and the sliders say when they hold the page color')

  // 122: a pick from a link on a day page gives the focus back to that link (the second of two to the same page), as
  // Esc in the menu does; an open picker follows its link when the day changes on disk; a right-click beside selected
  // text opens no menu, one on the selected text keeps the browser's; a link that goes while its picker is open leaves
  // the picker where it is, and Esc then writes nothing and throws nothing.
  const errors122 = []
  const onError122 = (e) => errors122.push(String(e))
  page.on('pageerror', onError122)
  const tone122 = join(pagesDir, 'Tone 122.md')
  writeFileSync(tone122, 'color:: blue\n- t\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  await side.locator('[data-row="p:tone 122"]').waitFor({ timeout: 10_000 })
  const day122 = join(folder, 'journals', `${dayKey(9)}.md`)
  const journal122 = '- first [[Tone 122]]\n- twice [[Tone 122]] and [[Tone 122]]\n- plain words\n'
  writeFileSync(day122, journal122)
  const day9 = await showDay(dayKey(9), 'plain words')
  await day9.locator('[data-testid="day-title"]').click()
  const rows122 = page.locator('.main .block[data-block-id]')
  await waitFor('122 the day page shows the washes', () => washesOf(rows122), 'blue blue -')
  /** The index of the focused element among the row's page links (-1: none of them). */
  const focusedLinkIn = (row) => row.evaluate((el) => [...el.querySelectorAll('a.link')].indexOf(document.activeElement))
  const colorFrom = async (link) => {
    await link.click({ button: 'right' })
    await page.locator('[data-testid="link-color"]').click()
    await picker.waitFor()
  }
  // A pick on a day page writes the page, and the focus goes back to the link it came from.
  await colorFrom(rows122.nth(1).locator('a.link').nth(1))
  await option('green').click()
  await expectFile('122 a pick on a day page writes the page', 'color:: green\n- t\n', tone122)
  await waitFor('122 green washes', () => washesOf(rows122), 'green green -')
  await waitFor('122 the focus is back on the second link', () => focusedLinkIn(rows122.nth(1)), 1)
  // Esc in the menu gives the focus back to the link too.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await rows122.nth(1).locator('a.link').nth(1).click({ button: 'right' })
  await linkColorMenu.waitFor()
  await kb.press('Escape')
  await linkColorMenu.waitFor({ state: 'detached' })
  await waitFor('122 Esc in the menu gives the focus back to the link', () => focusedLinkIn(rows122.nth(1)), 1)
  // Two blocks written above the link while its picker is open: the picker moves with the link.
  await colorFrom(rows122.nth(1).locator('a.link').nth(1))
  writeFileSync(day122, `- new one\n- new two\n${journal122}`)
  await waitFor('122 five rows', () => rows122.count(), 5)
  const pickerAtLink = async () => {
    const l = await rows122.nth(3).locator('a.link').nth(1).boundingBox()
    const p = await picker.boundingBox()
    const ok = Math.abs(p.y - (l.y + l.height + 4)) <= 2 && Math.abs(p.x - l.x) <= 2
    return ok || `picker at ${p.x},${p.y}, link at ${l.x},${l.y} (height ${l.height})`
  }
  await waitFor('122 the picker follows its link', pickerAtLink, true)
  // Another program changes the text before the links: the block keeps its id, but its links are drawn anew further
  // right; the picker goes to the new second link.
  const journalWith = (twice) => `- new one\n- new two\n- first [[Tone 122]]\n- ${twice} [[Tone 122]] and [[Tone 122]]\n- plain words\n`
  writeFileSync(day122, journalWith('twice moved right'))
  await rows122.nth(3).getByText('twice moved right').waitFor({ timeout: 10_000 })
  await waitFor('122 the picker follows its link drawn anew', pickerAtLink, true)
  await option('teal').click()
  await expectFile('122 a pick after a re-send writes the page', 'color:: teal\n- t\n', tone122)
  await waitFor('122 teal washes', () => washesOf(rows122), '- - teal teal -')
  await waitFor('122 the focus is back on the second link after the re-send', () => focusedLinkIn(rows122.nth(3)), 1)
  // The block's text changes again after the pick: the link drawn anew takes the focus.
  writeFileSync(day122, journalWith('twice moved again'))
  await rows122.nth(3).getByText('twice moved again').waitFor({ timeout: 10_000 })
  await waitFor('122 the link drawn anew takes the focus', () => focusedLinkIn(rows122.nth(3)), 1)
  // The text of the row "first …" selected: a right-click in the row's top padding, beside the text, opens no menu
  // (its default is prevented); one on the selected word keeps the browser's menu. The events are synthetic, so no
  // real browser menu opens.
  const rightClickInSelection = (where) =>
    rows122.nth(2).evaluate((row, where) => {
      const content = row.querySelector('.content')
      const range = document.createRange()
      range.selectNodeContents(content)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      let x, y
      if (where === 'padding') {
        const r = content.getBoundingClientRect()
        x = r.left + 4
        y = row.getBoundingClientRect().top + 2
      } else {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()
        while (text && !text.data.includes('first')) text = walker.nextNode()
        const word = document.createRange()
        word.setStart(text, text.data.indexOf('first'))
        word.setEnd(text, text.data.indexOf('first') + 5)
        const b = word.getBoundingClientRect()
        x = (b.left + b.right) / 2
        y = (b.top + b.bottom) / 2
      }
      const el = document.elementFromPoint(x, y)
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })
      const kept = el.dispatchEvent(ev)
      return { onRow: el === row, inContent: !!el.closest('.content'), kept }
    }, where)
  const beside122 = await rightClickInSelection('padding')
  assert(beside122.onRow, `122 the padding point is not on the row: ${JSON.stringify(beside122)}`)
  assert(!beside122.kept, '122 a right-click beside the selected text keeps the browser menu')
  const onWord122 = await rightClickInSelection('word')
  assert(onWord122.inContent, `122 the word point is not in the text: ${JSON.stringify(onWord122)}`)
  assert(onWord122.kept, '122 a right-click on the selected text has no browser menu')
  await frames()
  assert((await page.locator('[data-testid="link-color-menu"]').count()) === 0, '122 a right-click on selected text opened the link menu')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  // The link's block goes while its picker is open: the picker stays where it is; Esc writes nothing.
  await colorFrom(rows122.nth(2).locator('a.link').first())
  const open122 = await picker.boundingBox()
  writeFileSync(day122, '- new one\n- new two\n- twice moved again [[Tone 122]] and [[Tone 122]]\n- plain words\n')
  await waitFor('122 four rows', () => rows122.count(), 4)
  await frames()
  assert((await picker.count()) === 1, '122 the picker closed when its link went')
  const left122 = await picker.boundingBox()
  assert(Math.abs(left122.x - open122.x) <= 2 && Math.abs(left122.y - open122.y) <= 2, `122 the picker moved from ${open122.x},${open122.y} to ${left122.x},${left122.y}`)
  await kb.press('Escape')
  await picker.waitFor({ state: 'detached' })
  await frames()
  assert(!(await page.evaluate(() => !!document.activeElement?.closest('a.link'))), '122 the focus is on a link after its link went')
  assert(readAt(tone122) === 'color:: teal\n- t\n', `122 Esc wrote the page: ${JSON.stringify(readAt(tone122))}`)
  // The links leave their block's text while the picker is open: the picker stays, and a pick still colors the page.
  await colorFrom(rows122.nth(2).locator('a.link').first())
  writeFileSync(day122, '- new one\n- new two\n- twice without links\n- plain words\n')
  await rows122.nth(2).getByText('twice without links').waitFor({ timeout: 10_000 })
  await frames()
  assert((await picker.count()) === 1, '122 the picker closed when its links left the text')
  await option('red').click()
  await expectFile('122 a pick after its link went still writes the page', 'color:: red\n- t\n', tone122)
  page.off('pageerror', onError122)
  assert(errors122.length === 0, `122 page errors: ${errors122.join(' | ')}`)
  await page.locator('[data-testid="nav-journal"]').click()
  console.log('PASS 122 a pick from a link on a day page, the focus back on the link, the picker following its link, and no menu beside a selection')

  // 123: a jump highlight and a block selection on a row with a wash keep the band's rounded ends; the highlight fades
  // back to the band's color, not to nothing.
  const tone123 = join(pagesDir, 'Tone 123.md')
  writeFileSync(tone123, 'color:: blue\n- t\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  await side.locator('[data-row="p:tone 123"]').waitFor({ timeout: 10_000 })
  const day123 = join(folder, 'journals', `${dayKey(11)}.md`)
  const journal123 = '- [[Tone 123]] flashword123\n- [[Tone 123]] second\n- plain\n'
  writeFileSync(day123, journal123)
  await showDay(dayKey(11), 'plain')
  await openSearch()
  await searchInput.fill('flashword123')
  await waitFor('123 one hit', () => rows('hit').count(), 1)
  for (let i = 0; i < 3 && (await selectedRow().getAttribute('data-kind')) !== 'hit'; i++) await kb.press('ArrowDown')
  assert((await selectedRow().getAttribute('data-kind')) === 'hit', '123 the hit is not the selected search row')
  await kb.press('Enter')
  const flash123 = page.locator('.block.flash', { hasText: 'flashword123' })
  await flash123.waitFor({ timeout: 5000 })
  const flashed = await flash123.evaluate(async (el) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--wash)'
    el.append(probe)
    const wash = getComputedStyle(probe).backgroundColor
    probe.remove()
    const anim = el.getAnimations()[0]
    if (!anim) return { gone: true }
    anim.pause()
    anim.currentTime = 1499
    const end = getComputedStyle(el).backgroundColor
    const radius = getComputedStyle(el).borderTopLeftRadius
    anim.finish()
    // Both colors on white, in 8-bit sRGB: the animation blends in another color space than the wash is written in.
    const ctx = document.createElement('canvas').getContext('2d')
    const onWhite = (c) => {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    return { wash, end, radius, washOnWhite: onWhite(wash), endOnWhite: onWhite(end) }
  })
  assert(!flashed.gone, '123 the highlight ended before it was read')
  assert(flashed.radius === '8px', `123 the highlighted row has a top corner of ${flashed.radius}, not the band's 8px`)
  assert(
    flashed.endOnWhite.every((v, k) => Math.abs(v - flashed.washOnWhite[k]) <= 3),
    `123 the highlight ends on ${flashed.end} (${flashed.endOnWhite} on white), not the band's ${flashed.wash} (${flashed.washOnWhite})`,
  )
  await page.locator('.block.flash').waitFor({ state: 'detached', timeout: 5000 })
  const rows123 = page.locator('.main .block[data-block-id]')
  await waitFor('123 the day page shows the band', () => washesOf(rows123), 'blue blue -')
  const radii = (row) =>
    row.evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].join(' ')
    })
  await clickRow(rows123.nth(0))
  await page.locator('.cm-content').waitFor()
  await clickRow(rows123.nth(1), ['Shift'])
  await waitFor('123 two blocks selected', () => page.locator('.main .block.selected').count(), 2)
  const hover123 = await bgProbe('var(--hover)')
  assert((await radii(rows123.nth(0))) === '8px 8px 4px 4px', `123 the top selected row has corners ${await radii(rows123.nth(0))}`)
  assert((await radii(rows123.nth(1))) === '4px 4px 8px 8px', `123 the bottom selected row has corners ${await radii(rows123.nth(1))}`)
  assert((await bgOf(rows123.nth(0))) === hover123 && (await bgOf(rows123.nth(1))) === hover123, '123 a selected row does not show the selection color')
  await kb.press('Escape')
  await waitFor('123 selection cleared', () => page.locator('.main .block.selected').count(), 0)
  assert(readAt(day123) === journal123, '123 the journal file changed')
  await page.locator('[data-testid="nav-journal"]').click()
  console.log("PASS 123 the jump highlight and a selection keep a colored row's band corners, and the highlight fades back to the band")

  // 124: the arrow and the "..." menu on a hovered board card have a background of their own in every theme,
  // and the hover and open states still differ from the resting one.
  await page.locator('[data-testid="nav-board"][data-board="0"]').click()
  const card124 = cardTitled('Write release notes')
  await card124.waitFor()
  const bg124 = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  for (const theme of ['light', 'violet', 'teal', 'graphite', 'parchment', 'vampire', 'fjord', 'ember']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await page.mouse.move(1, 1)
    await card124.hover()
    await waitFor(`124 the buttons are visible in ${theme}`, () => card124.locator('.jump').isVisible(), true)
    const cardBg = await bg124(card124)
    const jump = await bg124(card124.locator('.jump'))
    const menu = await bg124(card124.locator('.card-menu'))
    assert(jump !== cardBg, `124 ${theme}: the arrow has the card's background ${jump}`)
    assert(menu !== cardBg, `124 ${theme}: the dots have the card's background ${menu}`)
    await card124.locator('.jump').hover()
    const hj = await bg124(card124.locator('.jump'))
    assert(hj !== jump && hj !== cardBg, `124 ${theme}: the arrow looks the same when hovered (${hj})`)
    await card124.locator('.card-menu').hover()
    const hm = await bg124(card124.locator('.card-menu'))
    assert(hm !== menu, `124 ${theme}: the dots look the same when hovered (${hm})`)
  }
  // Open state: the menu is open with the pointer elsewhere
  await card124.locator('[data-testid="card-menu"]').click()
  const open124 = page.locator('.card .card-menu[data-state="open"]')
  await open124.waitFor()
  await page.mouse.move(1, 1)
  const openBg = await bg124(open124)
  assert(openBg !== (await bg124(card124.locator('.jump'))), `124 an open menu button looks like the resting arrow (${openBg})`)
  await kb.press('Escape')
  await open124.waitFor({ state: 'detached' })
  await page.evaluate(() => delete document.documentElement.dataset.theme)
  console.log('PASS 124 the buttons on a hovered card have their own background in every theme, and hover and open still show')

  // 125: the theme button in the status bar, just left of the ? button, lists System and the ten themes with the
  // current one checked; a choice applies at once, is stored like the Settings one, and matches Settings both ways.
  // A block being edited stays edited (focus and text) through a pick, Esc and the arrow keys.
  const theme125 = page.locator('[data-testid="status-item"][data-id="theme"]')
  const menu125 = page.locator('[data-testid="theme-menu"]')
  const choices125 = menu125.locator('[role="menuitemradio"]')
  const attr125 = () => page.evaluate(() => document.documentElement.dataset.theme ?? '')
  const checked125 = () => menu125.locator('[role="menuitemradio"][aria-checked="true"]').evaluateAll((es) => es.map((e) => e.dataset.themeChoice))
  const focused125 = () => page.evaluate(() => (document.activeElement?.closest('.cm-editor') ? 'editor' : (document.activeElement?.getAttribute('data-testid') ?? 'other')))
  const before125 = settingsJson().theme ?? null
  assert(before125 === null, `125 the stored theme before the step: ${before125}`)
  const rightIds125 = await page.locator('.status-side.right [data-testid="status-item"]').evaluateAll((es) => es.map((e) => e.dataset.id))
  assert(rightIds125.slice(-2).join() === 'theme,help', `125 the right side of the status bar: ${rightIds125}`)
  assert((await theme125.getAttribute('aria-label')) === 'Theme' && (await theme125.getAttribute('title')) === 'Theme: System. Scroll to switch.', '125 the button is not named Theme')
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  await waitFor('125 editing', focused125, 'editor')
  const text125 = await page.locator('.cm-content').innerText()
  // Open by a click: eleven choices in order, System checked
  await theme125.click()
  await menu125.waitFor()
  await waitFor('125 eleven choices', () => choices125.allInnerTexts().then((t) => t.map((s) => s.trim())), ['System', 'Light', 'Taupe', 'Parchment', 'Dark', 'Graphite', 'Violet', 'Teal', 'Vampire', 'Fjord', 'Ember'])
  await waitFor('125 System is checked', checked125, ['system'])
  // Esc closes the menu, changes nothing, and the focus goes back to the edited block
  await kb.press('Escape')
  await menu125.waitFor({ state: 'detached' })
  await waitFor('125 focus back in the editor after Esc', focused125, 'editor')
  assert((await attr125()) === '', '125 Esc changed the theme')
  // A click on Teal applies it, stores it, closes the menu, and the block is still edited with its text
  await theme125.click()
  await menu125.waitFor()
  await choices125.filter({ hasText: 'Teal' }).click()
  await menu125.waitFor({ state: 'detached' })
  await waitFor('125 teal applied', attr125, 'teal')
  await waitFor('125 teal stored', () => settingsJson().theme ?? null, 'teal')
  await waitFor('125 focus back in the editor after a pick', focused125, 'editor')
  assert((await page.locator('.cm-editor').count()) === 1, '125 the block is no longer edited')
  assert((await page.locator('.cm-content').innerText()) === text125, '125 the edited text changed')
  // The arrows move in the menu and Enter picks: from Teal (checked) the next highlighted choice
  await theme125.click()
  await menu125.waitFor()
  await waitFor('125 Teal is checked', checked125, ['teal'])
  await kb.press('ArrowDown')
  await kb.press('ArrowDown')
  const lit125 = () => menu125.locator('[role="menuitemradio"][data-highlighted]').evaluateAll((es) => es.map((e) => e.dataset.themeChoice))
  const litA125 = (await lit125())[0]
  await kb.press('ArrowDown')
  const litB125 = (await lit125())[0]
  assert(litA125 && litB125 && litA125 !== litB125, `125 the arrows do not move in the menu: ${litA125} ${litB125}`)
  await kb.press('Enter')
  await menu125.waitFor({ state: 'detached' })
  await waitFor('125 Enter applies the highlighted theme', attr125, litB125 === 'system' ? '' : litB125)
  await waitFor('125 focus back after Enter', focused125, 'editor')
  assert((await page.locator('.cm-content').innerText()) === text125, '125 the edited text changed after Enter')
  // Violet from the status bar shows as selected in Settings > Appearance; Graphite from Settings is checked in the menu
  await theme125.click()
  await menu125.waitFor()
  await choices125.filter({ hasText: 'Violet' }).click()
  await waitFor('125 violet applied', attr125, 'violet')
  await waitFor('125 violet stored', () => settingsJson().theme ?? null, 'violet')
  await menu125.waitFor({ state: 'detached' })
  await page.keyboard.press('Control+Comma')
  await screen.waitFor()
  const selected125 = () => screen.locator('[data-testid="theme-option"][aria-checked="true"]').evaluateAll((es) => es.map((e) => e.dataset.themeChoice))
  await waitFor('125 Settings shows violet', selected125, ['violet'])
  await page.locator('[data-testid="theme-option"][data-theme-choice="graphite"]').click()
  await waitFor('125 graphite applied', attr125, 'graphite')
  await theme125.click()
  await menu125.waitFor()
  await waitFor('125 the menu follows Settings', checked125, ['graphite'])
  // System from the status bar removes the theme attribute and the stored theme
  await choices125.filter({ hasText: 'System' }).click()
  await menu125.waitFor({ state: 'detached' })
  await waitFor('125 system applied', attr125, '')
  await waitFor('125 system stored', () => settingsJson().theme ?? null, null)
  await waitFor('125 Settings shows System', selected125, ['system'])
  await page.locator('[data-testid="nav-journal"]').click()
  await screen.waitFor({ state: 'detached' })
  console.log('PASS 125 the status bar theme button lists the themes, applies and stores a choice, matches Settings, and keeps the edited block')

  // 126: the log file is under the run's config dir; Settings ends with Troubleshooting and its "Open log folder"
  const logDir126 = join(configDir, 'logs')
  const log126 = () => readAt(join(logDir126, 'breccia.log'))
  assert(log126().includes(`Breccia ${readVersions(root).cargo} started`), `126 the log file does not start with the version: ${JSON.stringify(log126().slice(0, 200))}`)
  const folder126 = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('log_folder'))
  assert(folder126 === logDir126, `126 log_folder answered ${JSON.stringify(folder126)}, not ${logDir126}`)
  await page.keyboard.press('Control+Comma')
  await screen.waitFor()
  const lastSection126 = () => screen.locator('section').evaluateAll((es) => es.at(-1)?.dataset.section ?? '')
  await waitFor('126 Troubleshooting is the last section', lastSection126, 'troubleshooting')
  const trouble126 = screen.locator('section[data-section="troubleshooting"]')
  assert((await trouble126.locator('h2').innerText()) === 'Troubleshooting', '126 the section heading')
  const open126 = trouble126.locator('[data-testid="open-log-folder"]')
  await open126.waitFor()
  assert((await open126.innerText()) === 'Open log folder', `126 the button text: ${await open126.innerText()}`)
  await waitFor('126 the button title is the folder', () => open126.getAttribute('title'), logDir126)
  // Not clicked: that would open Explorer on the machine running e2e (as the source link in step 64).
  for (const text of ['yesterday note', 'older note', 'DONE ship']) {
    assert(!log126().includes(text), `126 the log file holds note text: ${text}`)
  }
  await page.locator('[data-testid="nav-journal"]').click()
  await screen.waitFor({ state: 'detached' })
  console.log("PASS 126 the log file is in the app's data folder, and Settings offers to open its folder")

  // 127: after an internal error the notes reload from disk and one notice says so; text typed just before it is
  // saved, the search box that met it is gone, typing saves again, and the log names the panic but no note text.
  // BRECCIA_TEST_PANIC makes the first search for `zz-panic-127` panic inside the core.
  const RELOADED127 = 'Breccia hit an internal error and reloaded your notes from disk. Everything saved is safe; undo starts afresh.'
  const notices127 = page.locator('[data-testid="notice"]')
  // Nothing may be unsaved, or the core keeps the session instead of reloading it: the journal as step 55 left it.
  assert(join(folder, journalRel) === journal, `127 step 55 renamed in ${journalRel}, not in today's journal`)
  await waitFor('127 the journal as step 55 left it', () => readAt(journal), after55[journalRel])
  await waitFor('127 nothing unsaved', () => page.locator('[data-testid="status-item"][data-id="save"]').innerText(), 'All changes saved')
  // Notices earlier steps left are dismissed, so the count below is the recovery's alone.
  const left127 = await notices127.allInnerTexts()
  if (left127.length) console.log(`127 dismissed earlier notices: ${JSON.stringify(left127)}`)
  while ((await notices127.count()) > 0) await notices127.first().locator('button.close').click()
  const before127 = readAt(journal)
  /** The journal with `extra` typed at the end of today's first block. */
  const typedIn127 = (extra) => before127.replace(/^[^\n]*/, (line) => line + extra)
  // A sidebar row marked now is drawn anew once the reload has shown the folder's tree again (its last step).
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  await side.locator('[data-row="p:anna"]').evaluate((el) => (el.dataset.e2eBefore = '1'))
  const firstRow127 = () => page.locator(`[data-testid="day"][data-day="${today}"] .block[data-block-id]`).first()
  await clickRow(firstRow127())
  await page.locator('.cm-content').waitFor()
  await kb.type(' typed before the error')
  // The old journal must go before the reload shows the new one (the new session reuses block ids): noted the moment
  // no day is in the page any more.
  await page.evaluate(() => {
    window.__e2eFeedGone127 = false
    new MutationObserver((_, o) => {
      if (document.querySelector('[data-testid="day"]')) return
      window.__e2eFeedGone127 = true
      o.disconnect()
    }).observe(document.body, { childList: true, subtree: true })
  })
  // At once: opening the search box sends the typed text first, so the core has it before the error.
  await openSearch()
  await searchInput.fill('zz-panic-127')
  const recovery127 = notices127.filter({ hasText: 'Breccia hit an internal error' })
  await recovery127.first().waitFor({ timeout: 10_000 })
  const said127 = await recovery127.first().innerText()
  assert(said127.includes(RELOADED127), `127 the notes were not reloaded (was a page still unsaved?): ${JSON.stringify(said127)}`)
  await dialog.waitFor({ state: 'detached', timeout: 10_000 })
  await side.locator('[data-row="p:anna"]:not([data-e2e-before])').waitFor({ timeout: 10_000 })
  await page.locator(`[data-testid="day"][data-day="${today}"]`).waitFor()
  assert(await page.evaluate(() => window.__e2eFeedGone127), '127 the old journal stayed shown and clickable during the reload')
  await waitFor('127 the text typed before the error is on disk', () => readAt(journal), typedIn127(' typed before the error'))
  await clickRow(firstRow127())
  await page.locator('.cm-content').waitFor()
  await kb.type(' after recovery')
  await expectFile('127 typing saves after the recovery', typedIn127(' typed before the error after recovery'), journal)
  const texts127 = await notices127.allInnerTexts()
  assert(texts127.length === 1, `127 not exactly one notice: ${JSON.stringify(texts127)}`)
  await waitFor('127 the log names the panic and the recovery', () => ['panic at', 'recovered (reopened)'].map((t) => log126().includes(t)), [true, true])
  for (const text of ['zz-panic-127', 'typed before the error', 'after recovery']) {
    assert(!log126().includes(text), `127 the log file holds ${text}`)
  }
  await recovery127.first().locator('button.close').click()
  await waitFor('127 the notice dismissed', () => notices127.count(), 0)
  await kb.press('Escape')
  console.log('PASS 127 after an internal error the notes reload, one notice says so, and typing saves again')

  // 128: no line shows between the rows of a wash band (#75). For each theme and zoom, one capture of the window at
  // device scale; for the inner boundaries of a named and a custom band, the largest per-channel difference between
  // the middle of a row and every pixel down to the middle of the next, in a strip 4 CSS px wide at 3 CSS px from the
  // band's left edge. The background is flat, so a clean band gives 0. Zooms in SEAM_ZOOMS are asserted; the others
  // are measured and printed.
  const SEAM_ZOOMS = [100, 110, 125]
  const SEAM_TOLERANCE = 2
  const THEMES128 = ['light', 'taupe', 'parchment', 'dark', 'graphite', 'violet', 'teal', 'vampire', 'fjord', 'ember']
  writeFileSync(join(pagesDir, 'Seam blue 128.md'), 'color:: blue\n- b\n')
  writeFileSync(join(pagesDir, 'Seam hue 128.md'), 'color:: hue 212\n- h\n')
  const key128 = dayKey(12) // set-up wrote it; no other step reads it
  writeFileSync(
    join(folder, 'journals', `${key128}.md`),
    '- [[Seam blue 128]] one\n\t- two\n- [[Seam blue 128]] three\n- [[Seam blue 128]] four\n- plain\n' +
      '- [[Seam hue 128]] five\n\t- six\n- [[Seam hue 128]] seven\n- [[Seam hue 128]] eight\n',
  )
  const day128 = await showDay(key128, 'eight') // step 127 left the journal shown
  const rows128 = day128.locator('.block[data-block-id]')
  await waitFor('128 washes', () => washesOf(rows128), 'blue blue blue blue - hue 212 hue 212 hue 212 hue 212')
  const dpr128 = () => page.evaluate(() => window.devicePixelRatio)
  await page.mouse.move(1, 1) // a hovered row shows its fold arrow
  // The theme list is the status bar menu's, without System.
  await theme125.click()
  await menu125.waitFor()
  const choices128 = await choices125.evaluateAll((es) => es.map((e) => e.dataset.themeChoice).filter((c) => c !== 'system'))
  assert(JSON.stringify(choices128) === JSON.stringify(THEMES128), `128 the theme menu lists ${choices128}`)
  await kb.press('Escape')
  await menu125.waitFor({ state: 'detached' })
  const themeBefore128 = (await attr125()) || 'system'
  const zoomItem128 = page.locator('[data-testid="status-item"][data-id="zoom"]')
  assert((await zoomItem128.count()) === 0, '128 the zoom is not 100 % at the start')
  const base128 = await dpr128()
  const pickTheme128 = async (t) => {
    await theme125.click()
    await menu125.waitFor()
    await menu125.locator(`[role="menuitemradio"][data-theme-choice="${t}"]`).click()
    await menu125.waitFor({ state: 'detached' })
    await waitFor(`128 theme ${t}`, attr125, t === 'system' ? '' : t)
    await page.mouse.move(1, 1) // the longer menu now ends over the rows: a hovered row shows its fold arrow
  }
  /** Waits until the device scale is the zoom's, then brings the bands into view again. */
  const settleZoom128 = async (zoom) => {
    await waitFor(`128 scale ${zoom}`, async () => Math.abs((await dpr128()) - (base128 * zoom) / 100) < 0.01, true)
    // The feed draws its days anew for the new size, so a row can be replaced while it is scrolled to: try again.
    const inView = async () => {
      try {
        if ((await rows128.count()) === 0) await showDay(key128, 'eight')
        await rows128.last().scrollIntoViewIfNeeded({ timeout: 2000 })
        await rows128.first().scrollIntoViewIfNeeded({ timeout: 2000 })
        await frames()
        return await rows128.evaluateAll(
          (els) => els.length === 9 && els.every((e) => e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight),
        )
      } catch {
        return false
      }
    }
    await waitFor(`128 the bands in view at ${zoom} %`, inView, true, 20_000)
  }
  // The capture is CDP's own: under Breccia's zoom, page.screenshot counts in zoomed DIPs and resamples the image
  // (1000 px for a 1100 px window at 110 %, measured), which could blur a 1 px line away.
  const cdp128 = await page.context().newCDPSession(page)
  /** One capture of the window: its pixels, and device px per CSS px from its width (asserted to be the device scale). */
  const capture128 = async () => {
    const png = decodePng(Buffer.from((await cdp128.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    const view = await page.evaluate(() => ({ inner: window.innerWidth, dpr: window.devicePixelRatio }))
    const factor = png.width / view.inner
    assert(Math.abs(factor - view.dpr) < 0.01, `128 the capture is ${png.width} px for ${view.inner} CSS px, at scale ${view.dpr}`)
    return { png, factor, dpr: view.dpr }
  }
  /**
   * Each row's box in CSS px, the pixel its wash should show (its background painted over the first opaque one behind
   * it), and that background's pixel.
   */
  const band128 = (from, to) =>
    rows128.evaluateAll(
      (els, [a, b]) => {
        const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        const paint = (...colors) => {
          cx.clearRect(0, 0, 1, 1)
          for (const c of colors) {
            cx.fillStyle = c
            cx.fillRect(0, 0, 1, 1)
          }
          return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        const behind = (el) => {
          for (let e = el.parentElement; e; e = e.parentElement) {
            const c = getComputedStyle(e).backgroundColor
            if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
          }
          return 'white'
        }
        return els.slice(a, b).map((el) => {
          const r = el.getBoundingClientRect()
          const bg = behind(el)
          return { left: r.left, top: r.top, height: r.height, wash: paint(bg, getComputedStyle(el).backgroundColor), bg: paint(bg) }
        })
      },
      [from, to],
    )
  const diff128 = (p, q) => Math.max(...p.map((v, k) => Math.abs(v - q[k])))
  /**
   * The seam below row `i` of `band`: the largest per-channel difference from the middle of row `i` down to the middle
   * of row `i + 1`, with the brightness change of that pixel (positive: lighter than the wash) and its distance in
   * device px below row `i + 1`'s top edge.
   */
  const seamAt = (shot, band, i, what) => {
    const { png, factor } = shot
    const [a, b] = [band[i], band[i + 1]]
    const px = (x, y) => [...png.rgba.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)]
    const x0 = Math.round((a.left + 3) * factor)
    const x1 = Math.round((a.left + 7) * factor)
    const y0 = Math.round((a.top + a.height / 2) * factor)
    const y1 = Math.round((b.top + b.height / 2) * factor)
    const ref = px(x0, y0)
    // The reference is the wash, not the page or a wrong place, so a 0 below means "no seam".
    assert(diff128(ref, a.wash) <= 3, `128 ${what}: the pixel in row ${i} is ${ref}, not the wash ${a.wash}`)
    assert(diff128(ref, a.bg) > 3, `128 ${what}: the pixel in row ${i} is the page background ${a.bg}`)
    let worst = { value: 0, light: 0, at: 0 }
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const p = px(x, y)
        const value = diff128(p, ref)
        if (value > worst.value) {
          worst = { value, light: p[0] + p[1] + p[2] - (ref[0] + ref[1] + ref[2]), at: y - Math.round(b.top * factor) }
        }
      }
    }
    return worst
  }
  const results128 = []
  const tone128 = (w) => (w.value === 0 ? 'flat' : `${w.light > 0 ? 'lighter' : w.light < 0 ? 'darker' : 'same brightness'} at ${w.at} px`)
  for (const theme of THEMES128) {
    await pickTheme128(theme)
    for (const [z, zoom] of [100, 110, 125].entries()) {
      if (z > 0) {
        await kb.press('Control+Equal')
        await waitFor(`128 item ${zoom}`, () => zoomItem128.innerText(), `${zoom} %`)
      }
      await settleZoom128(zoom)
      // The rows are measured before and after the capture; they must not have moved in between.
      let shot = null
      let bands = null
      await waitFor(`128 a still capture at ${theme} ${zoom} %`, async () => {
        const before = [await band128(0, 4), await band128(5, 9)]
        shot = await capture128()
        bands = [await band128(0, 4), await band128(5, 9)]
        return JSON.stringify(before) === JSON.stringify(bands)
      }, true)
      const worst = {}
      for (const [kind, from] of [['named', 0], ['custom', 5]]) {
        const band = bands[from === 0 ? 0 : 1]
        worst[kind] = { value: -1 }
        for (let i = 0; i < 3; i++) {
          const what = `${theme} ${zoom} % ${kind}`
          const w = seamAt(shot, band, i, what)
          results128.push({ theme, zoom, kind, i, ...w })
          if (w.value > worst[kind].value) worst[kind] = w
        }
      }
      console.log(
        `128 ${theme} ${zoom} % (scale ${shot.dpr}): named ${worst.named.value} (${tone128(worst.named)}), custom ${worst.custom.value} (${tone128(worst.custom)})`,
      )
    }
    await kb.press('Control+Digit0')
    await zoomItem128.waitFor({ state: 'detached' })
    await settleZoom128(100)
  }
  await pickTheme128(themeBefore128)
  await cdp128.detach()
  const seams128 = results128.filter((r) => SEAM_ZOOMS.includes(r.zoom) && r.value > SEAM_TOLERANCE)
  assert(seams128.length === 0, `128 seams: ${seams128.map((r) => `${r.theme} ${r.zoom} % ${r.kind} below row ${r.i}: ${r.value}`).join('; ')}`)
  console.log('PASS 128 no seam between the rows of a wash band at ' + SEAM_ZOOMS.join(', ') + ' %, named and custom, in every theme')

  // 129: the slash menu's date entries (#77). `/date` lists Today, Yesterday and Date…, each with the calendar; Yesterday
  // and Today insert links to their days. The menu takes the window's clock, not BRECCIA_TODAY, so the expected days
  // come from this process's clock (the same machine and time zone), read before the first key and after the check.
  const localKey129 = (k) => {
    const x = new Date()
    const y = new Date(x.getFullYear(), x.getMonth(), x.getDate() + k)
    return `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
  }
  const before129 = readAt(journal)
  assert(/^- [^\n]*after recovery\n/.test(before129), `129 today's first block is not as step 127 left it: ${JSON.stringify(before129)}`)
  const day129 = await showDay(today, 'after recovery')
  await clickRow(day129.locator('.block[data-block-id]').first())
  await page.locator('.cm-content').waitFor()
  const slash129 = page.locator('[data-testid="slash-menu"]')
  const items129 = slash129.locator('.slash-item')
  const selected129 = () => slash129.locator('.slash-item.selected').innerText()
  await kb.press('Control+End')
  const days129 = [[localKey129(-1), localKey129(0)]]
  await kb.type(' /date')
  await waitFor('129 /date lists the date entries', () => items129.allInnerTexts(), ['Today', 'Yesterday', 'Date…'])
  const svgs129 = await items129.evaluateAll((els) => els.map((e) => e.querySelectorAll('svg').length))
  assert(JSON.stringify(svgs129) === '[1,1,1]', `129 the date entries' pictures: ${svgs129}`)
  for (let i = 0; i < 6; i++) await kb.press('Backspace')
  await slash129.waitFor({ state: 'detached' })
  await waitFor('129 the query is gone', () => readAt(journal), before129)
  await kb.type(' /yes')
  await waitFor('129 Yesterday highlighted', selected129, 'Yesterday')
  await kb.press('Enter')
  await slash129.waitFor({ state: 'detached' })
  // `/tod` would list TODO first: `/toda` lists Today alone.
  await kb.type(' /toda')
  await waitFor('129 Today highlighted', selected129, 'Today')
  await kb.press('Enter')
  await slash129.waitFor({ state: 'detached' })
  days129.push([localKey129(-1), localKey129(0)])
  // Across a midnight each entry may have taken either day: every pairing is accepted, and the one on disk is checked.
  const want129 = [...new Set(days129.flatMap(([y]) => days129.map(([, t]) => before129.replace(/^[^\n]*/, (l) => `${l} [[${y}]] [[${t}]]`))))]
  await waitFor('129 the links are on disk', () => want129.includes(readAt(journal)), true)
  const got129 = want129.find((w) => w === readAt(journal))
  await expectFile('129 Yesterday and Today insert their days', got129, journal)
  await kb.press('Escape')
  console.log('PASS 129 the slash menu offers Today, Yesterday and Date… with a calendar, and inserts the days')

  // 130: Ctrl Shift K deletes the edited block with its children (#78), not one line of its text (CodeMirror's own
  // binding); the caret goes to the end of the block above; Ctrl Z brings everything back. A page's only block is
  // emptied instead and stays edited. F1 and Settings → Keyboard list the key.
  const file130 = join(pagesDir, 'Delete 130.md')
  const solo130 = join(pagesDir, 'Solo 130.md')
  const text130 = '- one\n- two\n\t- child\n- three\n'
  writeFileSync(file130, text130)
  writeFileSync(solo130, '- solo\n\t- kid\n')
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  // The rendered block whose text is exactly `t`.
  const content130 = async (t) => {
    const all = page.locator('.block[data-block-id] .content')
    await waitFor(`130 the block ${t} is shown`, async () => {
      const texts = await all.allTextContents()
      return texts.some((x) => x.trim() === t) || texts
    }, true)
    return all.nth((await all.allTextContents()).findIndex((x) => x.trim() === t))
  }
  const unlocked130 = page.locator('.cm-content[contenteditable="true"]')
  // The edited line and whether the caret (the DOM selection's focus) is at its end.
  const caret130 = () =>
    page.evaluate(() => {
      const s = getSelection()
      const line = s?.focusNode && (s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement)?.closest('.cm-line')
      if (!line) return null
      const r = document.createRange()
      r.setStart(line, 0)
      r.setEnd(s.focusNode, s.focusOffset)
      return [line.textContent, r.toString().length === line.textContent.length]
    })
  await side.locator('[data-row="p:delete 130"]').waitFor({ timeout: 10_000 })
  await side.locator('[data-row="p:delete 130"]').click()
  await title.filter({ hasText: 'Delete 130' }).waitFor()
  await (await content130('two')).click()
  await unlocked130.waitFor()
  await kb.press('Control+Shift+K')
  await expectFile('130 the block goes with its child', '- one\n- three\n', file130)
  await unlocked130.waitFor()
  await waitFor('130 the caret is at the end of the block above', caret130, ['one', true])
  await kb.press('Control+z')
  await expectFile('130 undo brings it back', text130, file130)
  await kb.press('Escape')
  await page.locator('.cm-content').waitFor({ state: 'detached' })
  await side.locator('[data-row="p:solo 130"]').waitFor({ timeout: 10_000 })
  await side.locator('[data-row="p:solo 130"]').click()
  await title.filter({ hasText: 'Solo 130' }).waitFor()
  await (await content130('solo')).click()
  await unlocked130.waitFor()
  await kb.press('Control+Shift+K')
  await expectFile('130 the only block is emptied', '-\n', solo130)
  await unlocked130.waitFor()
  await waitFor('130 the emptied block is still edited', caret130, ['', true])
  await kb.press('Control+z')
  await expectFile('130 undo brings the only block back', '- solo\n\t- kid\n', solo130)
  await kb.press('Escape')
  await page.locator('.cm-content').waitFor({ state: 'detached' })
  await kb.press('F1')
  await page.locator('[data-testid="shortcuts-filter"]').fill('delete')
  const keys130 = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.shortcuts-group[data-group="Editing"] dd')]
        .filter((dd) => dd.textContent === 'Delete the block with its sub-blocks')
        .map((dd) => [...(dd.previousElementSibling?.querySelectorAll('kbd') ?? [])].map((k) => k.textContent).join(' ')),
    )
  await waitFor('130 F1 lists the key under Editing', keys130, ['Ctrl Shift K'])
  await kb.press('Escape')
  await kb.press('Escape')
  await page.locator('[data-testid="shortcuts"]').waitFor({ state: 'detached' })
  const settings130 = page.locator('[data-testid="settings"]')
  await kb.press('Control+Comma')
  await settings130.waitFor()
  const keyboard130 = settings130.locator('section[data-section="keyboard"] tr', { hasText: 'Delete the block with its sub-blocks' })
  await waitFor('130 Settings → Keyboard lists the key', () => keyboard130.locator('kbd').allInnerTexts(), ['Ctrl Shift K'])
  await page.locator('[data-testid="nav-journal"]').click()
  await settings130.waitFor({ state: 'detached' })
  console.log('PASS 130 Ctrl Shift K deletes the block with its children, the caret moves up, and Ctrl Z brings it back')

  // 131: deleting every selected block of a page (Delete) keeps one empty block with the caret in it; Ctrl Z brings all back
  const file131 = join(pagesDir, 'Keep 131.md')
  const text131 = '- one\n\t- kid\n- two\n- three\n'
  writeFileSync(file131, text131)
  await side.locator('[data-row="p:keep 131"]').waitFor({ timeout: 10_000 })
  await side.locator('[data-row="p:keep 131"]').click()
  await title.filter({ hasText: 'Keep 131' }).waitFor()
  await (await content130('one')).click()
  await unlocked130.waitFor()
  await (await content130('three')).click({ modifiers: ['Shift'] })
  await waitFor('131 all blocks selected', () => page.locator('.main .block.selected').count(), 4)
  await kb.press('Delete')
  await expectFile('131 one empty block is kept', '-\n', file131)
  await unlocked130.waitFor()
  await waitFor('131 the kept block is edited, caret in it', caret130, ['', true])
  await kb.press('Control+z')
  await expectFile('131 one undo brings every block back', text131, file131)
  await kb.press('Escape')
  await page.locator('.cm-content').waitFor({ state: 'detached' })
  console.log('PASS 131 deleting every selected block keeps one empty block to write in')

  // 132: the wheel over the theme button steps through the menu's order (down = next), wraps both ways, stores the
  // choice, keeps the edited block; Ctrl + wheel there zooms instead; nothing happens while the menu is open.
  const stored132 = () => settingsJson().theme ?? null
  const wheel132 = async (dy) => {
    await theme125.hover()
    await page.mouse.wheel(0, dy)
  }
  assert((await attr125()) === '' && stored132() === null, '132 the theme is not System at the start')
  await page.locator('[data-testid="nav-journal"]').click()
  await page.locator('.block .content', { hasText: 'from outside' }).last().click()
  await waitFor('132 editing', focused125, 'editor')
  const text132 = await page.locator('.cm-content').innerText()
  // 1. One notch down: Light, stored; the block is still edited; the tooltip names it
  await wheel132(100)
  await waitFor('132 light applied', attr125, 'light')
  await waitFor('132 light stored', stored132, 'light')
  await waitFor('132 still editing', focused125, 'editor')
  assert((await page.locator('.cm-editor').count()) === 1, '132 the block is no longer edited')
  assert((await page.locator('.cm-content').innerText()) === text132, '132 the edited text changed')
  await waitFor('132 tooltip', () => theme125.getAttribute('title'), 'Theme: Light. Scroll to switch.')
  // 2. Down through the rest, then wrap to System
  for (const t of ['taupe', 'parchment', 'dark', 'graphite', 'violet', 'teal', 'vampire', 'fjord', 'ember']) {
    await wheel132(100)
    await waitFor(`132 ${t} applied`, attr125, t)
  }
  await wheel132(100)
  await waitFor('132 wrapped to System', attr125, '')
  await waitFor('132 System stored', stored132, null)
  // 3. Up from System wraps to Ember
  await wheel132(-100)
  await waitFor('132 ember applied', attr125, 'ember')
  await waitFor('132 ember stored', stored132, 'ember')
  // 4. A trackpad: four small deltas make one step
  await theme125.hover()
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -25)
  await frames()
  assert((await attr125()) === 'ember', `132 a part notch switched the theme: ${await attr125()}`)
  await page.mouse.wheel(0, -25)
  await waitFor('132 fjord after four small deltas', attr125, 'fjord')
  // 5. A fast spin: the stored theme ends as the one shown
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100)
  await waitFor('132 spin applied', attr125, 'parchment')
  await waitFor('132 spin stored', stored132, 'parchment')
  // 6. Ctrl + wheel over the button zooms the window and leaves the theme
  const zoomItem132 = page.locator('[data-testid="status-item"][data-id="zoom"]')
  await theme125.hover()
  await kb.down('Control')
  await page.mouse.wheel(0, -100)
  await kb.up('Control')
  await waitFor('132 zoomed', () => zoomItem132.innerText(), '110 %')
  assert((await attr125()) === 'parchment', `132 Ctrl + wheel switched the theme: ${await attr125()}`)
  await zoomItem132.click()
  await zoomItem132.waitFor({ state: 'detached' })
  // 7. While the menu is open the wheel over the button (by the mouse, and sent to it directly) changes nothing
  await theme125.click()
  await menu125.waitFor()
  await page.mouse.wheel(0, 100)
  await theme125.evaluate((b) => b.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true })))
  await frames()
  assert((await attr125()) === 'parchment', `132 the wheel switched the theme with the menu open: ${await attr125()}`)
  assert(await menu125.isVisible(), '132 the wheel closed the menu')
  await kb.press('Escape')
  await menu125.waitFor({ state: 'detached' })
  assert((await attr125()) === 'parchment' && stored132() === 'parchment', '132 the theme changed with the menu open')
  // 8. Settings shows the wheel's choice; back to System
  await page.keyboard.press('Control+Comma')
  await screen.waitFor()
  await waitFor('132 Settings shows parchment', selected125, ['parchment'])
  await page.locator('[data-testid="nav-journal"]').click()
  await screen.waitFor({ state: 'detached' })
  await theme125.click()
  await menu125.waitFor()
  await choices125.filter({ hasText: 'System' }).click()
  await menu125.waitFor({ state: 'detached' })
  await waitFor('132 system applied', attr125, '')
  await waitFor('132 system stored', stored132, null)
  console.log('PASS 132 the wheel over the theme button steps through the themes in the menu\'s order, wraps, and stores the choice')

  // 133: a page file saved with an upper-case .MD extension while Breccia runs gets the warning `open` gives. The
  // stem is this step's own (on a case-insensitive file system `X.MD` is `X.md`), and the notice names the path with
  // the system's separator, so only the file name is matched. The file goes at the end, before Git set-up (45).
  const upper133 = join(folder, 'pages', 'Upper case 133.MD')
  writeFileSync(upper133, '- upper\n')
  const notice133 = page
    .locator('[data-testid="notice"]')
    .filter({ hasText: 'extension must be lower-case .md, not loaded:' })
    .filter({ hasText: 'Upper case 133.MD' })
  await notice133.waitFor({ timeout: 10_000 })
  assert((await notice133.count()) === 1, `133 one notice for the file, not ${await notice133.count()}`)
  await notice133.locator('button.close').click()
  await notice133.waitFor({ state: 'detached' })
  unlinkSync(upper133)
  console.log('PASS 133 a page file saved as .MD while Breccia runs is reported at once')

  // 45: a folder that is not in Git offers set-up; one click and OK make the repository and the first commit
  await waitFor('45 offer', gitText, 'Not in Git · Set up…')
  assert(!existsSync(join(folder, '.git')), 'repository before set-up')
  await gitItem.click()
  await page.locator('[data-testid="dialog-ok"]').click()
  await waitFor('45 saved', gitText, 'Saved to Git just now')
  assert(
    readAt(join(folder, '.gitignore')) ===
      "# Breccia's temporary files while saving\n.*.breccia-tmp\n# System files\n.DS_Store\nThumbs.db\ndesktop.ini\n",
    '.gitignore bytes',
  )
  assert(
    readAt(join(folder, '.gitattributes')) === '# Breccia saves every file with LF line endings\n* text=auto eol=lf\n',
    '.gitattributes bytes',
  )
  assert(git(folder, 'rev-list', '--count', 'HEAD') === '1', 'one commit')
  assert(git(folder, 'status', '--porcelain') === '', 'everything committed')
  const tracked = git(folder, 'ls-files').split('\n')
  assert(['breccia/config.toml', 'pages/Anna.md', `journals/${yesterday}.md`].every((f) => tracked.includes(f)), 'files not committed')
  console.log('PASS 45 set-up makes the repository with .gitignore, .gitattributes and a first commit')

  // 46: a click commits text typed a moment before, with the generated message
  if ((await side.count()) === 0) await page.getByLabel('Toggle sidebar').click()
  await side.locator('[data-row="p:anna"]').click()
  await title.filter({ hasText: 'Anna' }).waitFor()
  await page.locator('.block .content', { hasText: 'hello' }).click()
  await kb.press('End')
  await kb.type(' from e2e')
  await gitItem.click() // without waiting for the save: the click sends the typed text first
  await waitFor('46 commit', () => git(folder, 'rev-list', '--count', 'HEAD'), '2')
  assert(subject() === 'update Anna', `message: ${subject()}`)
  assert(git(folder, 'show', 'HEAD:pages/Anna.md') + '\n' === '- hello from e2e\n', 'commit holds the typed text')
  assert(readAt(join(pagesDir, 'Anna.md')) === '- hello from e2e\n', 'Anna.md bytes')
  console.log('PASS 46 a click commits just-typed text with the generated message')

  // 47: with a remote, a click pushes and sets the upstream
  const remote = join(gitHome, 'remote.git')
  git(gitHome, 'init', '--bare', '-b', 'main', remote)
  git(folder, 'remote', 'add', 'origin', remote)
  await gitItem.click()
  await waitFor('47 synced', gitText, 'Synced just now')
  assert(git(remote, 'rev-parse', 'main') === git(folder, 'rev-parse', 'HEAD'), 'remote not at HEAD')
  assert(git(folder, 'rev-parse', '--abbrev-ref', '@{u}') === 'origin/main', 'no upstream')
  console.log('PASS 47 a click pushes to the remote and sets the upstream')

  // 48: a change pushed from another clone is pulled; the shown page follows; bytes on disk match
  const other = join(gitHome, 'other')
  git(gitHome, 'clone', '-q', remote, other)
  writeFileSync(join(other, 'pages', 'Anna.md'), '- hello from e2e\n- from the other machine\n')
  git(other, 'commit', '-q', '-am', 'other machine')
  git(other, 'push', '-q')
  await gitItem.click()
  await waitText('48 pulled', join(pagesDir, 'Anna.md'), 'from the other machine')
  assert(readAt(join(pagesDir, 'Anna.md')) === '- hello from e2e\n- from the other machine\n', 'Anna.md bytes after pull')
  await page.locator('.block .content', { hasText: 'from the other machine' }).waitFor()
  await waitFor('48 head', () => git(folder, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'main'))
  assert(git(folder, 'rev-list', '--merges', 'HEAD') === '', 'a merge commit instead of a rebase')
  console.log('PASS 48 a pull brings in the other clone and the shown page follows')

  // 82: the Git history lists the folder's commits newest first with the messages Breccia wrote; a commit made
  // while it is open shows at the top; a second click on the button goes back; opening a page leaves it
  const count82 = () => git(folder, 'rev-list', '--count', 'HEAD')
  const before82 = Number(count82())
  await page.locator('.block .content', { hasText: 'from the other machine' }).click()
  await kb.press('End')
  await kb.type(' 82')
  await gitItem.click()
  await waitFor('82 first commit', count82, String(before82 + 1))
  await waitFor('82 pushed', () => git(remote, 'rev-parse', 'main'), git(folder, 'rev-parse', 'HEAD'))
  assert(subject() === 'update Anna', `82 message: ${subject()}`)
  const historyButton = page.locator('[data-testid="status-item"][data-id="gitLog"]')
  const logRows = page.locator('[data-testid="log-row"]')
  const shownSubjects = () => logRows.evaluateAll((rows) => rows.map((r) => r.querySelector('.subject')?.textContent ?? ''))
  const gitSubjects = () => git(folder, 'log', '--format=%s', '--', '.').split('\n')
  assert((await historyButton.getAttribute('title')) === 'Git history', '82 button tooltip')
  await historyButton.click()
  await page.locator('[data-testid="git-log"]').waitFor()
  await waitFor('82 rows', shownSubjects, gitSubjects())
  const rows82 = await shownSubjects()
  assert(rows82.length === before82 + 1, `82 row count: ${rows82.length}`)
  assert(rows82[0] === 'update Anna' && rows82[1] === 'other machine', `82 rows: ${JSON.stringify(rows82)}`)
  assert((await logRows.first().getAttribute('data-hash')) === git(folder, 'rev-parse', 'HEAD'), '82 first row is not HEAD')
  assert((await page.locator('[data-testid="log-unpushed"]').count()) === 0, '82 a pushed commit is marked not pushed')
  assert((await historyButton.getAttribute('aria-pressed')) === 'true', '82 button not pressed while open')
  // A page written by another program, committed by a click on the Git item while the history is open.
  writeFileSync(join(pagesDir, 'History82.md'), '- logged\n')
  await gitItem.click()
  await waitFor('82 second commit', count82, String(before82 + 2))
  assert(subject() === 'add History82', `82 second message: ${subject()}`)
  await waitFor('82 new row on top', shownSubjects, gitSubjects())
  assert((await logRows.first().getAttribute('data-hash')) === git(folder, 'rev-parse', 'HEAD'), '82 new commit is not on top')
  // A second click goes back to the page shown before; the history opens again from there.
  await historyButton.click()
  await page.locator('[data-testid="git-log"]').waitFor({ state: 'detached' })
  await title.filter({ hasText: 'Anna' }).waitFor()
  await historyButton.click()
  await page.locator('[data-testid="git-log"]').waitFor()
  // Opening a page leaves it.
  await side.getByText('Release', { exact: true }).click()
  await title.filter({ hasText: 'Release' }).waitFor()
  await page.locator('[data-testid="git-log"]').waitFor({ state: 'detached' })
  assert((await historyButton.getAttribute('aria-pressed')) === 'false', '82 button still pressed')
  await waitFor('82 pushed again', () => git(remote, 'rev-parse', 'main'), git(folder, 'rev-parse', 'HEAD'))
  console.log('PASS 82 the Git history lists the commits, follows a new one, and leaves for a page')

  // 49: a conflict is undone at once: Breccia's text stays, nothing is half-applied, the item turns red
  const releaseFile49 = join(pagesDir, 'Release.md')
  const base = readAt(releaseFile49)
  assert(base.startsWith('- DONE ship\n'), `Release.md: ${JSON.stringify(base)}`)
  git(other, 'pull', '-q')
  writeFileSync(join(other, 'pages', 'Release.md'), base.replace('- DONE ship\n', '- DONE ship v2\n'))
  git(other, 'commit', '-q', '-am', 'v2')
  git(other, 'push', '-q')
  const remoteHead = git(remote, 'rev-parse', 'main')
  await side.getByText('Release', { exact: true }).click()
  await title.filter({ hasText: 'Release' }).waitFor()
  await page.locator('.block .content', { hasText: 'ship' }).click()
  // F36a: the click lands at the element's centre, maybe on the done:: line; the caret goes to the first line deliberately.
  await kb.press('Control+Home')
  await kb.press('End')
  await kb.type(' now')
  await gitItem.click()
  await page.locator('[data-testid="status-item"][data-id="git"].warning').waitFor({ timeout: 15_000 })
  assert((await gitText()) === 'Git sync stopped: conflict', `text: ${await gitText()}`)
  const mine = base.replace('- DONE ship\n', '- DONE ship now\n')
  assert(readAt(releaseFile49) === mine, "Release.md is not Breccia's version")
  assert(git(folder, 'show', 'HEAD:pages/Release.md') + '\n' === mine, 'local commit lacks the text')
  assert(!existsSync(join(folder, '.git', 'rebase-merge')) && !existsSync(join(folder, '.git', 'rebase-apply')), 'rebase left in progress')
  assert(git(remote, 'rev-parse', 'main') === remoteHead, 'remote changed')
  const status49 = git(folder, 'status', '--porcelain')
  assert(status49 === '', `working tree not clean after the abort: ${status49}`)
  await gitItem.click() // shows the explanation and tries again
  await page.locator('.notice', { hasText: 'pages/Release.md' }).waitFor()
  console.log('PASS 49 a conflict is undone, the text stays, and the item turns red with an explanation')

  // 50: closing commits text typed a moment before (syncing is stopped, so nothing is pushed)
  await page.locator('.block .content', { hasText: 'ship now' }).click()
  await kb.press('Control+Home') // F36a, as in step 49
  await kb.press('End')
  await kb.type(' bye')
  const before = git(folder, 'rev-list', '--count', 'HEAD')
  closing = true
  const gone = new Promise((r) => app.once('exit', r))
  // The close button (WM_CLOSE) only hides the window to the tray; the typed text is saved, the app runs on
  spawnSync('taskkill', ['/PID', String(app.pid)], { stdio: 'ignore' })
  await page.waitForFunction(
    async () => !(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })),
    null,
    { timeout: 15_000 },
  )
  assert(app.exitCode === null && app.signalCode === null, 'the close button quit the app instead of hiding it')
  await waitFor('50 text saved on hide', () => readAt(releaseFile49).includes('ship now bye'), true)
  // "Exit" in the tray menu is the real close; the menu itself cannot be clicked here, so its event is sent
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tray:exit' }))
  // The close prompt ("Close anyway?") keeps the window open: fail with its text, not after a timeout.
  const prompt = page
    .locator('[data-testid="dialog-ok"]')
    .waitFor({ timeout: 30_000 })
    .then(
      async () => {
        throw new Error(`FAIL 50 close prompt: ${await page.locator('[role="dialog"], [role="alertdialog"]').innerText()}`)
      },
      () => new Promise(() => {}),
    )
  let limit50
  try {
    await Promise.race([
      gone,
      prompt,
      new Promise((_, reject) => {
        limit50 = setTimeout(() => reject(new Error('FAIL 50 app did not exit within 30 s')), 30_000)
      }),
    ])
  } finally {
    clearTimeout(limit50)
  }
  assert(Number(git(folder, 'rev-list', '--count', 'HEAD')) === Number(before) + 1, 'no commit at close')
  const final = base.replace('- DONE ship\n', '- DONE ship now bye\n')
  assert(git(folder, 'show', 'HEAD:pages/Release.md') + '\n' === final, 'close commit lacks the text')
  assert(readAt(releaseFile49) === final, 'Release.md bytes at close')
  assert(git(remote, 'rev-parse', 'main') === remoteHead, 'pushed while stopped')
  console.log('PASS 50 closing commits the last typed text')

  await browser.close().catch(() => {})
} catch (e) {
  failed = true
  console.error(e.message ?? e)
  try {
    const log = logPath && readFileSync(logPath, 'utf8')
    if (log) console.error(`--- app output ---
${log}`)
  } catch {}
} finally {
  if (process.env.BRECCIA_TRACE && logPath) {
    try {
      console.log(`--- trace ---
${summarize(readFileSync(logPath, 'utf8'))}`)
    } catch {}
  }
  cleanup()
}
process.exit(failed ? 1 : 0)
