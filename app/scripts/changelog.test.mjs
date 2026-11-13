import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { gitSandbox } from './fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const cliff = read('cliff.toml')

describe('cliff.toml', () => {
  it('cliff_groups_user_visible_types', () => {
    const parsers = cliff.slice(cliff.indexOf('commit_parsers'))
    const at = (s) => {
      const i = parsers.indexOf(s)
      expect(i, s).toBeGreaterThan(-1)
      return i
    }
    const breaking = at('field = "breaking"')
    expect(breaking).toBeLessThan(at('message = "^feat", group = "<!-- 1 -->Features"'))
    at('message = "^fix", group = "<!-- 2 -->Fixes"')
    at('message = "^perf", group = "<!-- 3 -->Performance"')
    at('message = "^revert", group = "<!-- 4 -->Reverted"')
    const skips = parsers.split('\n').filter((l) => l.includes('skip = true'))
    expect(skips).toHaveLength(1)
    for (const t of ['chore', 'docs', 'test', 'ci', 'refactor', 'style', 'build']) {
      expect(skips[0]).toMatch(new RegExp(`[(|]${t}[|)]`))
    }
    expect(cliff).toMatch(/^filter_unconventional = true$/m)
    expect(cliff).toMatch(/^filter_commits = true$/m)
    expect(cliff).toMatch(/^protect_breaking_commits = true$/m)
  })

  it('cliff_tag_pattern', () => {
    const m = /^tag_pattern = "(.*)"$/m.exec(cliff)
    expect(m).not.toBeNull()
    const re = new RegExp('^' + m[1].replaceAll('\\\\', '\\') + '$')
    for (const ok of ['v0.1.0', 'v0.2.0', 'v1.2.3-rc.1']) expect(re.test(ok), ok).toBe(true)
    for (const no of ['0.1.0', 'v0.1', 'release-1']) expect(re.test(no), no).toBe(false)
  })

  it('cliff_puts_a_breaking_commit_first_under_its_own_group', () => {
    // The group exists in cliff.toml but no release has produced it yet: make a repository with one and run git-cliff.
    const sandbox = gitSandbox()
    try {
      const repo = join(sandbox.root, 'repo')
      mkdirSync(repo)
      sandbox.git(repo, 'init', '-q')
      writeFileSync(join(repo, 'cliff.toml'), cliff)
      sandbox.git(repo, 'add', '.')
      sandbox.git(repo, 'commit', '-q', '-m', 'chore: start')
      sandbox.git(repo, 'tag', 'v0.1.0')
      for (const [file, subject] of [
        ['a', 'feat: A new thing'],
        ['b', 'feat!: Old notes folders no longer open'],
        ['c', 'fix: A fix'],
      ]) {
        writeFileSync(join(repo, file), file)
        sandbox.git(repo, 'add', '.')
        sandbox.git(repo, 'commit', '-q', '-m', subject)
      }
      const r = spawnSync('git-cliff', ['--config', 'cliff.toml', '--unreleased', '--tag', 'v0.2.0'], {
        cwd: repo,
        env: sandbox.env,
        encoding: 'utf8',
      })
      expect(r.status, r.stderr).toBe(0)
      const out = r.stdout
      const at = (s) => out.indexOf(s)
      expect(at('### Breaking changes'), out).toBeGreaterThan(-1)
      // Breaking first, then Features, then Fixes; the breaking commit is listed once, under its own group.
      expect(at('### Breaking changes')).toBeLessThan(at('### Features'))
      expect(at('### Features')).toBeLessThan(at('### Fixes'))
      expect(out.split('Old notes folders no longer open')).toHaveLength(2)
      expect(out.slice(at('### Breaking changes'), at('### Features'))).toContain('Old notes folders no longer open')
    } finally {
      sandbox.remove()
    }
  })

  it('cliff_lines_hide_the_scope', () => {
    const body = /^body = """\n([\s\S]*?)"""/m.exec(cliff)[1]
    expect(body).not.toContain('commit.scope')
    expect(body).toContain('upper_first')
  })
})

describe('CHANGELOG.md', () => {
  it('changelog_starts_with_the_header', () => {
    const header = /^header = """\n([\s\S]*?)"""/m.exec(cliff)[1]
    const log = read('CHANGELOG.md')
    expect(log.startsWith(header)).toBe(true)
    expect(log).not.toContain('\r')
  })
})

describe('justfile', () => {
  // The lines of a recipe: its header line and the indented lines under it.
  const recipe = (header) => {
    const lines = read('justfile').split('\n')
    const i = lines.indexOf(header)
    expect(i, header).toBeGreaterThan(-1)
    const body = []
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) body.push(lines[j].trim())
    return body
  }

  it('just_changelog_previews', () => {
    expect(recipe('changelog:')).toEqual(['node app/scripts/release.mjs preview'])
    expect(read('justfile')).not.toContain('--prepend')
  })

  it('just_release_runs_the_script', () => {
    expect(recipe('release *args:')).toEqual(['node app/scripts/release.mjs {{args}}'])
  })
})

describe('docs', () => {
  it('releasing_doc_uses_just_release', () => {
    const doc = read('docs/releasing.md')
    for (const s of ['just release', 'git restore .', 'just e2e', 'winget install git-cliff']) {
      expect(doc, s).toContain(s)
    }
    for (const s of ['just changelog X.Y.Z', 'git tag vX.Y.Z', 'git commit -am']) {
      expect(doc, s).not.toContain(s)
    }
    const claude = read('CLAUDE.md')
    expect(claude).toContain('just release')
    expect(claude).not.toContain('just changelog X.Y.Z')
    expect(read('cliff.toml')).not.toContain('just changelog X.Y.Z')
  })
})
