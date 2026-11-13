import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CARGO, CHANGELOG, LOCK, PKG, PKG_LOCK, TAURI, writeFixture } from './fixtures.mjs'
import {
  bumpVersion,
  checkVersions,
  compareVersions,
  defaultVersion,
  isVersion,
  latestTag,
  parseTag,
  readVersions,
} from './version.mjs'

function makeRepo(over = {}) {
  const root = mkdtempSync(join(tmpdir(), 'breccia-version-'))
  writeFixture(root)
  for (const [p, c] of Object.entries(over)) writeFileSync(join(root, p), c)
  return root
}
const read = (root, p) => readFileSync(join(root, p), 'utf8')
const crlf = (s) => s.replace(/\n/g, '\r\n')

describe('parseTag', () => {
  it('accepts v + semver', () => {
    expect(parseTag('v0.1.0')).toEqual({ version: '0.1.0', prerelease: false })
    expect(parseTag('v0.2.0-rc.1')).toEqual({ version: '0.2.0-rc.1', prerelease: true })
  })
  it('rejects everything else', () => {
    for (const t of ['0.1.0', 'v0.1', 'v01.0.0', 'v0.1.0+build', 'release-0.1.0', 'v0.1.0 ', '']) {
      expect(parseTag(t), t).toBeNull()
    }
  })
})

describe('version ordering', () => {
  it('isVersion_accepts_semver_only', () => {
    expect(isVersion('1.2.3')).toBe(true)
    expect(isVersion('1.2.3-rc.1')).toBe(true)
    expect(isVersion('v1.2.3')).toBe(false)
    expect(isVersion('1.2')).toBe(false)
  })
  it('compareVersions_follows_semver', () => {
    const order = [
      '0.1.0', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.0-rc.10', '0.2.0', '0.9.0', '0.10.0',
      '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2',
      '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0',
    ]
    for (let i = 0; i + 1 < order.length; i++) {
      expect(compareVersions(order[i], order[i + 1]), order[i]).toBe(-1)
      expect(compareVersions(order[i + 1], order[i]), order[i]).toBe(1)
    }
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
  it('latestTag_picks_the_highest_release_tag', () => {
    expect(latestTag(['v0.1.0', 'v0.10.0', 'v0.9.0', 'release-1', 'v0.2'])).toBe('v0.10.0')
    expect(latestTag(['v0.2.0-rc.1', 'v0.1.0'])).toBe('v0.2.0-rc.1')
    expect(latestTag([])).toBeNull()
    expect(latestTag(['x'])).toBeNull()
  })
  it('defaultVersion_is_the_next_minor', () => {
    expect(defaultVersion('v0.1.0')).toBe('0.2.0')
    expect(defaultVersion('v1.4.2')).toBe('1.5.0')
    expect(defaultVersion('v0.2.0-rc.1')).toBe('0.2.0')
    expect(defaultVersion('v1.0.0-beta.2')).toBe('1.0.0')
  })
})

describe('readVersions', () => {
  it('reads each value', () => {
    expect(readVersions(makeRepo())).toEqual({
      cargo: '0.1.0',
      cargoLock: ['0.1.0', '0.1.0'],
      tauriConf: null,
      packageJson: '0.1.0',
      packageLock: ['0.1.0', '0.1.0'],
    })
  })
  it('reads tauriConf when present', () => {
    const root = makeRepo({ 'app/src-tauri/tauri.conf.json': '{\n  "version": "0.3.0"\n}\n' })
    expect(readVersions(root).tauriConf).toBe('0.3.0')
  })
  it('reads a CRLF Cargo.lock', () => {
    const root = makeRepo({ 'Cargo.lock': crlf(LOCK) })
    expect(readVersions(root).cargoLock).toEqual(['0.1.0', '0.1.0'])
  })
})

describe('checkVersions', () => {
  it('passes when all agree', () => {
    const found = readVersions(makeRepo())
    expect(checkVersions(found)).toEqual([])
    expect(checkVersions(found, 'v0.1.0')).toEqual([])
  })
  it('flags a tag that differs', () => {
    const p = checkVersions(readVersions(makeRepo()), 'v0.2.0')
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('v0.2.0')
    expect(p[0]).toContain('0.1.0')
  })
  it('flags a tag that is not a version tag', () => {
    expect(checkVersions(readVersions(makeRepo()), 'nightly')).toHaveLength(1)
  })
  it('flags package.json at another version', () => {
    const root = makeRepo({ 'app/package.json': PKG.replace('0.1.0', '0.0.0') })
    const p = checkVersions(readVersions(root))
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('app/package.json')
  })
  it('flags a stale Cargo.lock', () => {
    const stale = LOCK.replace('name = "breccia-core"\nversion = "0.1.0"', 'name = "breccia-core"\nversion = "0.0.9"')
    const p = checkVersions(readVersions(makeRepo({ 'Cargo.lock': stale })))
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Cargo.lock')
  })
  it('flags a stale package-lock.json', () => {
    const stale = PKG_LOCK.replace('"version": "0.1.0",\n  "lockfileVersion"', '"version": "0.0.0",\n  "lockfileVersion"')
    const p = checkVersions(readVersions(makeRepo({ 'app/package-lock.json': stale })))
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('app/package-lock.json')
  })
  it('flags a version key in tauri.conf.json', () => {
    const root = makeRepo({ 'app/src-tauri/tauri.conf.json': '{\n  "version": "0.1.0"\n}\n' })
    const p = checkVersions(readVersions(root))
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('remove version from app/src-tauri/tauri.conf.json')
  })
  it('flags a missing or non-semver Cargo.toml version', () => {
    const bad = makeRepo({ 'Cargo.toml': CARGO.replace('version = "0.1.0"', 'version = "1.0"') })
    expect(checkVersions(readVersions(bad)).some((p) => p.includes('Cargo.toml'))).toBe(true)
    const none = makeRepo({ 'Cargo.toml': '[workspace]\n' })
    expect(checkVersions(readVersions(none)).some((p) => p.includes('Cargo.toml'))).toBe(true)
  })
  it('does not pass vacuously when Cargo.lock has no workspace packages', () => {
    const root = makeRepo({ 'Cargo.lock': '[[package]]\nname = "other"\nversion = "0.1.0"\n' })
    expect(checkVersions(readVersions(root)).some((x) => x.includes('Cargo.lock'))).toBe(true)
  })
  it('does not pass vacuously when package-lock.json has no versions', () => {
    const root = makeRepo({ 'app/package-lock.json': '{\n  "name": "x"\n}\n' })
    expect(checkVersions(readVersions(root)).some((x) => x.includes('app/package-lock.json'))).toBe(true)
  })
})

describe('bumpVersion', () => {
  it('bumpVersion_changes_only_the_version_strings', () => {
    const root = makeRepo()
    const changed = bumpVersion(root, '0.2.0-rc.1')
    expect(changed).toHaveLength(4)
    expect(read(root, 'Cargo.toml')).toBe(
      CARGO.replace('edition = "2024"\nversion = "0.1.0"', 'edition = "2024"\nversion = "0.2.0-rc.1"'),
    )
    expect(read(root, 'Cargo.lock')).toBe(
      LOCK.replace('name = "breccia"\nversion = "0.1.0"', 'name = "breccia"\nversion = "0.2.0-rc.1"').replace(
        'name = "breccia-core"\nversion = "0.1.0"',
        'name = "breccia-core"\nversion = "0.2.0-rc.1"',
      ),
    )
    expect(read(root, 'app/src-tauri/tauri.conf.json')).toBe(TAURI)
    expect(read(root, 'app/package.json')).toBe(PKG.replace('"version": "0.1.0"', '"version": "0.2.0-rc.1"'))
    expect(read(root, 'app/package-lock.json')).toBe(
      PKG_LOCK.replace('"version": "0.1.0",\n  "lockfileVersion"', '"version": "0.2.0-rc.1",\n  "lockfileVersion"').replace(
        'name": "breccia-app",\n      "version": "0.1.0"',
        'name": "breccia-app",\n      "version": "0.2.0-rc.1"',
      ),
    )
    for (const p of ['Cargo.toml', 'Cargo.lock', 'app/package.json', 'app/package-lock.json']) {
      expect(read(root, p)).not.toContain('\r')
    }
    expect(checkVersions(readVersions(root), 'v0.2.0-rc.1')).toEqual([])
  })
  it('keeps CRLF files as they are', () => {
    const root = makeRepo({ 'Cargo.lock': crlf(LOCK) })
    bumpVersion(root, '0.2.0')
    expect(read(root, 'Cargo.lock')).toBe(
      crlf(LOCK)
        .replace('name = "breccia"\r\nversion = "0.1.0"', 'name = "breccia"\r\nversion = "0.2.0"')
        .replace('name = "breccia-core"\r\nversion = "0.1.0"', 'name = "breccia-core"\r\nversion = "0.2.0"'),
    )
  })
  it('refuses a non-semver version', () => {
    expect(() => bumpVersion(makeRepo(), '1.0')).toThrow()
  })
})

describe('release script hardening', () => {
  it('a_write_that_fails_halfway_is_put_back_too', () => {
    const root = makeRepo()
    // The last file takes half its bytes and then the disk is full, once.
    let full = false
    const write = (path, text) => {
      if (!full && path.endsWith('package-lock.json')) {
        full = true
        writeFileSync(path, String(text).slice(0, 10))
        throw Object.assign(new Error('no space left'), { code: 'ENOSPC' })
      }
      writeFileSync(path, text)
    }
    expect(() => bumpVersion(root, '0.3.0', write)).toThrow('could not write app/package-lock.json')
    expect(read(root, 'Cargo.toml')).toBe(CARGO)
    expect(read(root, 'app/package.json')).toBe(PKG)
    expect(read(root, 'app/package-lock.json')).toBe(PKG_LOCK)
  })
  it('bumpVersion writes nothing when a later file fails', () => {
    const root = makeRepo({ 'app/package-lock.json': '{\n  "name": "x"\n}\n' })
    expect(() => bumpVersion(root, '0.2.0')).toThrow()
    expect(read(root, 'Cargo.toml')).toBe(CARGO)
    expect(read(root, 'Cargo.lock')).toBe(LOCK)
    expect(read(root, 'app/package.json')).toBe(PKG)
  })
  it('checkVersions with no Cargo version and a tag', () => {
    const root = makeRepo({ 'Cargo.toml': '[workspace]\n' })
    const p = checkVersions(readVersions(root), 'v0.1.0')
    expect(p.some((x) => x.includes('no version'))).toBe(true)
    expect(p.some((x) => x.includes('null'))).toBe(false)
  })
  it('the package-lock root version is found whatever the key order', () => {
    const lock = `{
  "name": "breccia-app",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "dependencies": {
        "dep": "^1.0.0"
      },
      "version": "0.1.0",
      "name": "breccia-app"
    },
    "node_modules/dep": {
      "version": "0.1.0"
    }
  }
}
`
    const root = makeRepo({ 'app/package-lock.json': lock })
    expect(readVersions(root).packageLock).toEqual(['0.1.0', '0.1.0'])
    bumpVersion(root, '0.2.0')
    const want = lock
      .replace('"version": "0.1.0",\n  "lockfileVersion"', '"version": "0.2.0",\n  "lockfileVersion"')
      .replace('},\n      "version": "0.1.0",\n      "name"', '},\n      "version": "0.2.0",\n      "name"')
    expect(read(root, 'app/package-lock.json')).toBe(want)
  })
  it('a CRLF Cargo.toml is read and bumped with its CRLFs', () => {
    const root = makeRepo({ 'Cargo.toml': crlf(CARGO) })
    expect(readVersions(root).cargo).toBe('0.1.0')
    bumpVersion(root, '0.2.0')
    expect(read(root, 'Cargo.toml')).toBe(crlf(CARGO).replace('version = "0.1.0"', 'version = "0.2.0"'))
  })
})

describe('release script hardening', () => {
  it('a_failed_write_puts_back_the_files_already_written', () => {
    const root = makeRepo()
    const lock = join(root, 'app/package-lock.json')
    chmodSync(lock, 0o444)
    try {
      expect(() => bumpVersion(root, '0.3.0')).toThrow(/could not write app\/package-lock\.json .*put back/)
    } finally {
      chmodSync(lock, 0o644)
    }
    expect(read(root, 'Cargo.toml')).toBe(CARGO)
    expect(read(root, 'Cargo.lock')).toBe(LOCK)
    expect(read(root, 'app/package.json')).toBe(PKG)
    expect(read(root, 'app/package-lock.json')).toBe(PKG_LOCK)
  })
  it('only_the_top_level_version_of_package_json_changes', () => {
    const pkg = `{
  "name": "breccia-app",
  "config": { "version": "0.1.0" },
  "version": "0.1.0"
}
`
    const root = makeRepo({ 'app/package.json': pkg })
    bumpVersion(root, '0.3.0')
    expect(read(root, 'app/package.json')).toBe(pkg.replace('"version": "0.1.0"\n}', '"version": "0.3.0"\n}'))
  })
  it('strings_holding_braces_or_quotes_do_not_confuse_the_lock_root', () => {
    const descs = [
      '"description": "a } { \\"version\\": \\"9.9.9\\""',
      '"description": "say \\"} then {\\" and \\\\"',
    ]
    for (const desc of descs) {
      const lock = PKG_LOCK.replace(
        '"name": "breccia-app",\n      "version": "0.1.0",',
        `"name": "breccia-app",\n      ${desc},\n      "version": "0.1.0",`,
      )
      expect(lock).toContain(desc)
      expect(() => JSON.parse(lock)).not.toThrow()
      const root = makeRepo({ 'app/package-lock.json': lock })
      bumpVersion(root, '0.3.0')
      const want = lock
        .replace('"version": "0.1.0",\n  "lockfileVersion"', '"version": "0.3.0",\n  "lockfileVersion"')
        .replace(`${desc},\n      "version": "0.1.0"`, `${desc},\n      "version": "0.3.0"`)
      expect(read(root, 'app/package-lock.json')).toBe(want)
    }
  })
  it('writeFixture_changes_only_the_app_version', () => {
    const root = mkdtempSync(join(tmpdir(), 'breccia-version-'))
    writeFixture(root, '0.3.0')
    expect(read(root, 'app/package-lock.json')).toContain('"node_modules/dep": {\n      "version": "0.1.0"')
    const lock = read(root, 'Cargo.lock')
    expect(lock).toContain('name = "aho-corasick"\nversion = "0.1.0"')
    expect(lock).toContain('name = "zzz"\nversion = "0.1.0"')
    expect(lock).toContain('name = "breccia"\nversion = "0.3.0"')
    expect(read(root, 'app/package.json')).toContain('"version": "0.3.0"')
    expect(readVersions(root).cargo).toBe('0.3.0')
  })
})

describe('tauri.conf.json', () => {
  it('tauri_conf_bundles_nsis_per_user', () => {
    const conf = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
    )
    expect(conf).not.toHaveProperty('version')
    expect(conf.bundle).toEqual({
      active: true,
      targets: ['nsis'],
      publisher: 'Stefan Härtel',
      icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.ico'],
      windows: {
        webviewInstallMode: { type: 'downloadBootstrapper' },
        nsis: { installMode: 'currentUser' },
      },
    })
  })
})

describe('fixtures', () => {
  it('the CHANGELOG fixture starts with the cliff.toml header', () => {
    const cliff = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cliff.toml'), 'utf8')
    const header = /^header = """\n([\s\S]*?)"""/m.exec(cliff)[1]
    expect(CHANGELOG.startsWith(header)).toBe(true)
  })
  it('the CHANGELOG fixture has the header of CHANGELOG.md', () => {
    const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md'), 'utf8')
    const head = CHANGELOG.slice(0, CHANGELOG.indexOf('## [0.1.0]'))
    expect(real.startsWith(head)).toBe(true)
  })
})
