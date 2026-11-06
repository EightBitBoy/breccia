// Keeps `target/` small. Cargo never deletes outdated build outputs, so test programs, symbol files and
// libraries pile up under new names. `clean-stale` deletes the old ones, `hint` prints one line when `target/` is big.
//   node app/scripts/clean-stale.mjs [clean] [--dry-run] [--days N]   (default 7 days)
//   node app/scripts/clean-stale.mjs hint
// Safe by construction: it only looks inside the folder it is given (which must be called `target`), only deletes build
// outputs of the kinds below inside a `deps` folder and session folders inside an `incremental` folder, never follows a
// symbolic link, and always keeps the newest file of each artifact (and the newest session of each crate), however old.
// What it removes, cargo rebuilds when needed.
import { lstatSync, readdirSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_DAYS = 7
/** `just test` hints at `just clean-stale` when `target/` is over this many bytes (15 GB, for example). */
export const SIZE_LIMIT = 15 * 1024 ** 3
const DAY = 86_400_000
const KINDS = new Set(['exe', 'pdb', 'rlib', 'rmeta', 'd', 'dll', 'lib', 'exp', 'ilk', 'o'])

function entries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Every real directory below `dir` (not through links), `dir` itself first. */
function* folders(dir) {
  yield dir
  for (const e of entries(dir)) {
    if (e.isDirectory() && !e.isSymbolicLink()) yield* folders(join(dir, e.name))
  }
}

/** Bytes and newest modification time (ms) of everything under `path`. */
function measure(path) {
  const st = lstatSync(path)
  if (!st.isDirectory()) return { bytes: st.size, newest: st.mtimeMs }
  let bytes = 0
  let newest = 0 // folders only count by the files in them (a folder's own time changes when a file is added or removed)
  for (const e of entries(path)) {
    if (e.isSymbolicLink()) continue
    const m = measure(join(path, e.name))
    bytes += m.bytes
    newest = Math.max(newest, m.newest)
  }
  return { bytes, newest }
}

/** Total size of the files under `dir` in bytes; 0 for a missing folder. */
export function targetSize(dir) {
  try {
    return measure(dir).bytes
  } catch {
    return 0
  }
}

/** The one-line hint, or null while the folder is under the limit. */
export function sizeHint(bytes, limit = SIZE_LIMIT) {
  if (bytes <= limit) return null
  return `target/ is ${(bytes / 1024 ** 3).toFixed(1)} GB (over ${(limit / 1024 ** 3).toFixed(0)} GB): run \`just clean-stale\` to delete old build outputs`
}

/** Old files of a `deps` folder: all but the newest of each artifact (name without its hash, and kind), if older than the cutoff. */
function staleDeps(deps, cutoff) {
  const groups = new Map()
  for (const e of entries(deps)) {
    if (!e.isFile() || e.isSymbolicLink()) continue
    const dot = e.name.lastIndexOf('.')
    if (dot < 0 || !KINDS.has(e.name.slice(dot + 1))) continue
    const stem = e.name.slice(0, dot)
    const m = /^(.*)-[0-9a-f]+$/.exec(stem)
    const key = `${m ? m[1] : stem}.${e.name.slice(dot + 1)}`
    const path = join(deps, e.name)
    const st = lstatSync(path)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ path, bytes: st.size, mtime: st.mtimeMs })
  }
  const out = []
  for (const files of groups.values()) {
    files.sort((a, b) => b.mtime - a.mtime)
    out.push(...files.slice(1).filter((f) => f.mtime < cutoff))
  }
  return out
}

/** Old session folders of an `incremental` folder: all but the newest of each crate, if older than the cutoff. */
function staleSessions(incremental, cutoff) {
  const out = []
  for (const crate of entries(incremental)) {
    if (!crate.isDirectory() || crate.isSymbolicLink()) continue
    const dir = join(incremental, crate.name)
    const sessions = entries(dir)
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => ({ path: join(dir, e.name), ...measure(join(dir, e.name)) }))
      .sort((a, b) => b.newest - a.newest)
    out.push(...sessions.slice(1).filter((s) => s.newest < cutoff).map((s) => ({ path: s.path, bytes: s.bytes })))
  }
  return out
}

/**
 * Deletes build outputs in `target` older than `days` days, keeping the newest of each artifact. With `dryRun` it only counts.
 * @returns {{removed: number, bytes: number}} the number of files and session folders removed, and the bytes freed.
 */
export function cleanStale(target, { now = Date.now(), days = DEFAULT_DAYS, dryRun = false } = {}) {
  const root = resolve(target)
  if (basename(root) !== 'target') throw new Error(`refusing to clean ${root}: the folder must be called target`)
  const cutoff = now - days * DAY
  const found = []
  for (const dir of folders(root)) {
    const name = basename(dir)
    if (name === 'deps') found.push(...staleDeps(dir, cutoff))
    else if (name === 'incremental') found.push(...staleSessions(dir, cutoff))
  }
  let removed = 0
  let bytes = 0
  for (const f of found) {
    if (!f.path.startsWith(root + sep)) continue // cannot happen; the last guard before a delete
    if (!dryRun) rmSync(f.path, { recursive: true, force: true })
    removed += 1
    bytes += f.bytes
  }
  return { removed, bytes }
}

function main(argv) {
  const target = fileURLToPath(new URL('../../target', import.meta.url))
  if (argv.includes('hint')) {
    const hint = sizeHint(targetSize(target))
    if (hint) console.log(hint)
    return
  }
  const dryRun = argv.includes('--dry-run')
  const i = argv.indexOf('--days')
  const days = i >= 0 ? Number(argv[i + 1]) : DEFAULT_DAYS
  if (!(days >= 0)) {
    console.error('--days needs a number')
    process.exit(1)
  }
  const { removed, bytes } = cleanStale(target, { days, dryRun })
  const gb = (bytes / 1024 ** 3).toFixed(2)
  console.log(`${dryRun ? 'Would remove' : 'Removed'} ${removed} old build outputs (${gb} GB) older than ${days} days from target/`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
