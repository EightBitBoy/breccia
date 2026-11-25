// The 5,000-page test folder of `just graph-scale` and `just perf-scale` (plan 18, R2): 2,000 pages in 50 folders
// and 3,000 journal days (yesterday back, so today's page stays empty), in 50 communities of 100 files, with 50,000
// distinct page pairs written as `- links [[...]]` blocks. A fixed pseudo-random sequence makes every run write the
// same bytes. The options add what the window measures need on top:
//   hub:      a page `Hub`, linked from 1,000 pages and journal days (every fifth file);
//   archive:  3,000 archived tasks, one on each journal day (`done::` links that day);
//   longPage: a page `Long page` of 5,000 rows;
//   git:      a Git repository on branch main with 3,000 commits holding every file in the folder (written with
//             `git fast-import`, so it takes seconds), its index matching the files. Files the caller wrote into the
//             folder beforehand (for example `breccia/config.toml`) are committed too.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

export const PAGES = 2000
export const DAYS = 3000
export const FILES = PAGES + DAYS
const COMMUNITIES = 50
export const PAIRS = 50_000
const HUBS = 20
export const COMMITS = 3000

const pad = (n) => String(n).padStart(2, '0')
/** The local day `k` days before today, as `YYYY-MM-DD`. */
export const dayKey = (k) => {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
export const today = () => dayKey(0)

// File i: pages first, then journal days (yesterday back, so today's page stays empty).
const spelling = (i) => (i < PAGES ? `Page ${i}` : dayKey(1 + (i - PAGES)))
const rel = (i) => (i < PAGES ? join('pages', `F${i % 50}`, `Page ${i}.md`) : join('journals', `${spelling(i)}.md`))
// Community c holds the files c, c + 50, c + 100, ...: 40 pages and 60 journal days each.
const community = (i) => i % COMMUNITIES
const member = (c, m) => c + COMMUNITIES * m

/** 50,000 distinct unordered pairs: 90% inside a community, the rest across; 20 hubs take about 20% of the cross pairs. */
function makePairs() {
  // A fixed pseudo-random sequence: every run measures the same folder.
  let seed = 20261031
  const rand = (n) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return (seed >>> 8) % n
  }
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

/** Every file under `dir` but `.git`, as `/`-separated paths relative to it, sorted. */
function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, base, out)
    else out.push(relative(base, p).split(sep).join('/'))
  }
  return out.sort()
}

const quote = (path) => `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** 3,000 commits, oldest first, one a day: the first adds every file but the last 2,999, each later one adds one. */
function writeGit(dir) {
  const run = (args, input) => {
    const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], {
      cwd: dir,
      input,
      encoding: input === undefined ? 'utf8' : undefined,
      maxBuffer: 1 << 28,
    })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  }
  run(['init', '-q', '-b', 'main'])
  const paths = walk(dir)
  const first = paths.length - (COMMITS - 1)
  if (first < 1) throw new Error(`${paths.length} files are too few for ${COMMITS} commits`)
  const chunks = []
  const start = Math.floor(Date.now() / 1000) - COMMITS * 86_400
  for (let k = 0; k < COMMITS; k++) {
    const add = k === 0 ? paths.slice(0, first) : [paths[first + k - 1]]
    const msg = Buffer.from(k === 0 ? 'add the notes\n' : `add ${add[0].replace(/^.*\//, '').replace(/\.md$/, '')}\n`)
    const who = `Breccia Scale <scale@example.invalid> ${start + k * 86_400} +0000`
    chunks.push(Buffer.from(`commit refs/heads/main\nauthor ${who}\ncommitter ${who}\ndata ${msg.length}\n`), msg)
    for (const p of add) {
      const bytes = readFileSync(join(dir, p))
      chunks.push(Buffer.from(`M 100644 inline ${quote(p)}\ndata ${bytes.length}\n`), bytes, Buffer.from('\n'))
    }
    chunks.push(Buffer.from('\n'))
  }
  chunks.push(Buffer.from('done\n'))
  run(['fast-import', '--quiet', '--done'], Buffer.concat(chunks))
  // The index from HEAD, so the folder is clean (fast-import writes no index or working tree).
  run(['reset', '-q'])
}

/**
 * Writes the folder into `dir` (which may already hold other files, such as `breccia/config.toml`).
 * Returns the notes files written and the links (`[[...]]`) in them.
 */
export function writeScaleFolder(dir, opts = {}) {
  const outgoing = Array.from({ length: FILES }, () => [])
  for (const [a, b] of makePairs()) outgoing[a].push(b)
  let files = 0
  let links = 0
  const write = (relPath, text) => {
    const path = join(dir, relPath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    files++
  }
  for (let i = 0; i < FILES; i++) {
    let text = `- ${spelling(i)}\n` + outgoing[i].map((t) => `- links [[${spelling(t)}]]\n`).join('')
    links += outgoing[i].length
    if (opts.hub && i % 5 === 0) {
      text += '- see [[Hub]]\n'
      links++
    }
    if (opts.archive && i >= PAGES) {
      const day = spelling(i)
      text += `- DONE archived task ${i - PAGES}\n  done:: [[${day}]] 09:00:00\n  archived:: ${day} 09:30:00\n`
      links++
    }
    write(rel(i), text)
  }
  if (opts.hub) write(join('pages', 'Hub.md'), '- the hub page\n')
  if (opts.longPage) write(join('pages', 'Long page.md'), Array.from({ length: 5000 }, (_, k) => `- row ${k}\n`).join(''))
  if (opts.git) writeGit(dir)
  return { files, links }
}
