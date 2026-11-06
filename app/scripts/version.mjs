// One app version, kept in Cargo.toml ([workspace.package]) and mirrored in the lock files and
// app/package.json. `check` verifies they agree (and match a release tag); `bump` rewrites them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?'
const SEMVER_RE = new RegExp(`^${SEMVER}$`)
const TAG_RE = new RegExp(`^v${SEMVER}$`)

const F = {
  cargo: 'Cargo.toml',
  lock: 'Cargo.lock',
  tauri: 'app/src-tauri/tauri.conf.json',
  pkg: 'app/package.json',
  pkgLock: 'app/package-lock.json',
}

export function parseTag(tag) {
  const m = TAG_RE.exec(tag)
  if (!m) return null
  return { version: tag.slice(1), prerelease: m[4] !== undefined }
}

export function isVersion(v) {
  return SEMVER_RE.test(v)
}

// Semantic Versioning 2.0 section 11 precedence; both arguments must be valid versions.
export function compareVersions(a, b) {
  const [ma, mb] = [SEMVER_RE.exec(a), SEMVER_RE.exec(b)]
  if (!ma || !mb) throw new Error(`cannot compare "${a}" and "${b}"`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d !== 0) return d < 0 ? -1 : 1
  }
  const [pa, pb] = [ma[4], mb[4]]
  if (pa === undefined || pb === undefined) return pa === pb ? 0 : pa === undefined ? 1 : -1
  const [ia, ib] = [pa.split('.'), pb.split('.')]
  for (let i = 0; i < Math.min(ia.length, ib.length); i++) {
    const [x, y] = [ia[i], ib[i]]
    if (x === y) continue
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)]
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return ia.length === ib.length ? 0 : ia.length < ib.length ? -1 : 1
}

// The highest tag that parseTag accepts; null when there is none.
export function latestTag(tags) {
  let best = null
  for (const tag of tags) {
    const p = parseTag(tag)
    if (p && (best === null || compareVersions(p.version, best.version) > 0)) best = { tag, version: p.version }
  }
  return best && best.tag
}

// The version `just release` offers: a pre-release's final version, otherwise the next minor.
export function defaultVersion(tag) {
  const p = parseTag(tag)
  if (!p) throw new Error(`"${tag}" is not a release tag`)
  const [major, minor, patch] = p.version.split('-')[0].split('.').map(Number)
  return p.prerelease ? `${major}.${minor}.${patch}` : `${major}.${minor + 1}.0`
}

const readText = (root, rel) => {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

// The text of the [workspace.package] table: from its header up to the next table header.
function workspacePackageTable(text) {
  const m = /^\[workspace\.package\][^\S\r\n]*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)
  return m ? { start: m.index + m[0].length - m[1].length, body: m[1] } : null
}

const CARGO_VERSION_RE = /^(version\s*=\s*")([^"]*)(")/m
const LOCK_RE = /(\[\[package\]\]\r?\nname = "(?:breccia|breccia-core)"\r?\nversion = ")([^"]*)(")/g

// Where the value of `key` starts inside the object that opens at text[open] ('{'), looking only at
// that object's own keys (nested objects and strings are skipped). -1 when it has no such key.
function ownKeyValue(text, open, key) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      if (--depth === 0) return -1
    } else if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      const colon = /^\s*:\s*/.exec(text.slice(j + 1))
      if (depth === 1 && colon && text.slice(i + 1, j) === key) return j + 1 + colon[0].length
      i = j
    }
  }
  return -1
}

// Replace the string value that starts at text[at] (a '"') with `next`; null when it is not a string.
function swapValueAt(text, at, next) {
  const m = at >= 0 && /^"[^"]*"/.exec(text.slice(at))
  return m ? text.slice(0, at) + `"${next}"` + text.slice(at + m[0].length) : null
}

// Replace the top-level "version" of a JSON file (package.json, package-lock.json), found by
// structure: a "version" inside a nested object or a string is left alone. null when it is not there.
function swapTopVersion(text, next) {
  const first = text.indexOf('{')
  return first < 0 ? null : swapValueAt(text, ownKeyValue(text, first, 'version'), next)
}

// Replace the root package's version in a package-lock.json: packages -> "" -> version, found by
// structure, so the key order inside the object does not matter. null when it is not there.
function swapLockRoot(text, next) {
  const first = text.indexOf('{')
  if (first < 0) return null
  let at = ownKeyValue(text, first, 'packages')
  if (at < 0 || text[at] !== '{') return null
  at = ownKeyValue(text, at, '')
  if (at < 0 || text[at] !== '{') return null
  return swapValueAt(text, ownKeyValue(text, at, 'version'), next)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function readVersions(root) {
  const out = { cargo: null, cargoLock: [], tauriConf: null, packageJson: null, packageLock: [] }

  const cargo = readText(root, F.cargo)
  if (cargo) {
    const table = workspacePackageTable(cargo)
    const m = table && CARGO_VERSION_RE.exec(table.body)
    if (m) out.cargo = m[2]
  }

  const lock = readText(root, F.lock)
  if (lock) out.cargoLock = [...lock.matchAll(LOCK_RE)].map((m) => m[2])

  const tauri = readText(root, F.tauri)
  const tauriJson = tauri && parseJson(tauri)
  if (tauriJson && typeof tauriJson.version === 'string') out.tauriConf = tauriJson.version

  const pkg = readText(root, F.pkg)
  const pkgJson = pkg && parseJson(pkg)
  if (pkgJson && typeof pkgJson.version === 'string') out.packageJson = pkgJson.version

  const pkgLock = readText(root, F.pkgLock)
  const lockJson = pkgLock && parseJson(pkgLock)
  if (lockJson) {
    if (typeof lockJson.version === 'string') out.packageLock.push(lockJson.version)
    const rootPkg = lockJson.packages && lockJson.packages['']
    if (rootPkg && typeof rootPkg.version === 'string') out.packageLock.push(rootPkg.version)
  }
  return out
}

export function checkVersions(found, tag) {
  const problems = []
  const cargo = found.cargo
  if (cargo === null || !SEMVER_RE.test(cargo)) {
    problems.push(
      cargo === null
        ? 'Cargo.toml has no version in [workspace.package]'
        : `Cargo.toml version "${cargo}" is not a semantic version (X.Y.Z or X.Y.Z-pre)`,
    )
  } else {
    const differs = (file, value) => {
      if (value !== cargo) problems.push(`${file} has version ${value}, but Cargo.toml has ${cargo}`)
    }
    if (found.cargoLock.length !== 2) {
      problems.push(
        `Cargo.lock lists ${found.cargoLock.length} workspace packages (breccia, breccia-core), expected 2; run cargo build to refresh it`,
      )
    }
    for (const v of found.cargoLock) differs('Cargo.lock', v)
    if (found.packageJson === null) problems.push('app/package.json has no version')
    else differs('app/package.json', found.packageJson)
    if (found.packageLock.length !== 2) {
      problems.push(
        `app/package-lock.json lists ${found.packageLock.length} app versions (top level and packages ""), expected 2`,
      )
    }
    for (const v of found.packageLock) differs('app/package-lock.json', v)
  }
  if (found.tauriConf !== null) {
    problems.push(
      `app/src-tauri/tauri.conf.json has version ${found.tauriConf}: remove version from app/src-tauri/tauri.conf.json; Tauri takes it from Cargo.toml`,
    )
  }
  if (tag !== undefined) {
    const parsed = parseTag(tag)
    if (!parsed) problems.push(`tag "${tag}" is not a release tag (v + X.Y.Z or X.Y.Z-pre)`)
    else if (cargo !== null && parsed.version !== cargo) {
      problems.push(`tag ${tag} says ${parsed.version}, but Cargo.toml has ${cargo}`)
    }
  }
  return problems
}

export function bumpVersion(root, next) {
  if (!SEMVER_RE.test(next)) throw new Error(`"${next}" is not a semantic version (X.Y.Z or X.Y.Z-pre)`)
  // Compute every file's new text first; write only when all of them worked.
  const pending = []
  const edit = (rel, fn) => {
    const text = readText(root, rel)
    if (text === null) throw new Error(`${rel} not found`)
    const out = fn(text)
    if (out === null) throw new Error(`no version found to change in ${rel}`)
    if (out !== text) pending.push([rel, out, text])
  }
  const swap = (re, text) => (re.test(text) ? text.replace(re, (_, a, _old, c) => a + next + c) : null)

  edit(F.cargo, (text) => {
    const table = workspacePackageTable(text)
    if (!table) return null
    const body = swap(CARGO_VERSION_RE, table.body)
    if (body === null) return null
    return text.slice(0, table.start) + body + text.slice(table.start + table.body.length)
  })
  edit(F.lock, (text) => {
    LOCK_RE.lastIndex = 0
    return swap(LOCK_RE, text)
  })
  edit(F.pkg, (text) => swapTopVersion(text, next))
  edit(F.pkgLock, (text) => {
    const top = swapTopVersion(text, next)
    return top === null ? null : swapLockRoot(top, next)
  })
  // Write them one by one; if one write fails, put the originals of the files already written back.
  const written = []
  for (const [rel, out, original] of pending) {
    try {
      writeFileSync(join(root, rel), out)
      written.push([rel, original])
    } catch (e) {
      const stuck = []
      for (const [r, text] of written) {
        try {
          writeFileSync(join(root, r), text)
        } catch {
          stuck.push(r)
        }
      }
      const reason = e.code ?? e.message
      throw new Error(
        stuck.length
          ? `could not write ${rel} (${reason}); and could not put back ${stuck.join(', ')}`
          : `could not write ${rel} (${reason}); the files already written were put back`,
      )
    }
  }
  return pending.map(([rel]) => rel)
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const [cmd, ...rest] = argv
  if (cmd === 'check') {
    const i = rest.indexOf('--tag')
    const tag = i >= 0 ? rest[i + 1] : undefined
    if (i >= 0 && tag === undefined) {
      console.error('--tag needs a value')
      return 1
    }
    const found = readVersions(root)
    const problems = checkVersions(found, tag)
    if (problems.length) {
      for (const p of problems) console.error(p)
      return 1
    }
    console.log(`version ${found.cargo}`)
    return 0
  }
  if (cmd === 'bump' && rest.length === 1) {
    try {
      for (const f of bumpVersion(root, rest[0])) console.log(`updated ${f}`)
      return 0
    } catch (e) {
      console.error(e.message)
      return 1
    }
  }
  console.error('usage: version.mjs check [--tag vX.Y.Z] | bump X.Y.Z')
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
