import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { CHANGELOG, gitSandbox, writeFixture } from './fixtures.mjs'
import {
  actionsUrl,
  cliffWarning,
  CLIFF_MISSING,
  failureLines,
  hasSection,
  insertSection,
  newSection,
  NO_TAG,
  releaseNotes,
  releaseProblems,
  restoreFiles,
} from './release.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, 'release.mjs')
const REAL_ROOT = join(here, '..', '..')

const facts = (over = {}) => ({
  version: '0.2.0',
  latestTag: 'v0.1.0',
  branch: 'main',
  dirty: false,
  head: 'a1',
  originMain: 'a1',
  tagHere: false,
  tagOnOrigin: false,
  changelog: CHANGELOG,
  versionProblems: [],
  current: '0.1.0',
  ...over,
})

const SECTION = '## [0.2.0] - 2026-11-01\n\n### Features\n\n- A thing users see\n\n'

describe('releaseProblems', () => {
  it('all_checks_pass', () => {
    expect(releaseProblems(facts())).toEqual([])
  })

  it('each_failed_check_has_its_message', () => {
    const one = (over) => releaseProblems(facts(over))
    // (the fixture changelog already has a 0.1.0 section, so use an empty one here)
    expect(one({ version: '0.0.9', changelog: '' })).toEqual([
      '0.0.9 is not newer than the latest tag v0.1.0',
      '0.0.9 is lower than the current version 0.1.0 in Cargo.toml',
    ])
    expect(one({ version: '0.1.0', changelog: '' })).toEqual(['0.1.0 is not newer than the latest tag v0.1.0'])
    expect(one({ version: '0.2.0', latestTag: 'v0.2.0-rc.1' })).toEqual([])
    expect(one({ version: '0.2.0-rc.1', latestTag: 'v0.2.0' })).toEqual([
      '0.2.0-rc.1 is not newer than the latest tag v0.2.0',
    ])
    expect(one({ latestTag: null })).toEqual([])
    expect(one({ branch: 'dev' })).toEqual(['on branch dev, not main'])
    expect(one({ dirty: true })).toEqual(['uncommitted or untracked files: commit, stash or remove them first'])
    expect(one({ originMain: 'b2' })).toEqual(['main is not the same as origin/main: pull or push first'])
    expect(one({ tagHere: true })).toEqual(['tag v0.2.0 already exists here'])
    expect(one({ tagOnOrigin: true })).toEqual(['tag v0.2.0 already exists on origin'])
    expect(one({ changelog: CHANGELOG.replace('0.1.0', '0.2.0') })).toEqual([
      'CHANGELOG.md already has a section for 0.2.0',
    ])
    expect(one({ versionProblems: ['x differs', 'y differs'] })).toEqual(['x differs', 'y differs'])
  })

  it('a_version_below_cargo_toml_is_refused', () => {
    const one = (over) => releaseProblems(facts({ latestTag: null, ...over }))
    expect(one({ version: '0.1.5', current: '0.2.0' })).toEqual([
      '0.1.5 is lower than the current version 0.2.0 in Cargo.toml',
    ])
    expect(one({ version: '0.1.5', current: '0.1.5' })).toEqual([])
    expect(one({ version: '0.1.5', current: null })).toEqual([])
  })

  it('failed_checks_are_all_reported_in_order', () => {
    expect(releaseProblems(facts({ branch: 'dev', dirty: true, tagHere: true, versionProblems: ['v'] }))).toEqual([
      'on branch dev, not main',
      'uncommitted or untracked files: commit, stash or remove them first',
      'tag v0.2.0 already exists here',
      'v',
    ])
  })

  it('a_bad_version_skips_the_dependent_checks', () => {
    expect(releaseProblems(facts({ version: '2.0' }))).toEqual(['not a version: "2.0" (use X.Y.Z or X.Y.Z-pre)'])
  })
})

describe('constants and helpers', () => {
  it('has the fixed messages', () => {
    expect(NO_TAG).toBe('no v* tag yet: give the version, for example just release 1.0.0')
    expect(CLIFF_MISSING).toBe(
      'git-cliff is not installed: winget install git-cliff, or cargo install git-cliff --version 2.14.2 --locked',
    )
  })

  it('cliffWarning_only_for_another_version', () => {
    expect(cliffWarning('git-cliff 2.14.2')).toBeNull()
    expect(cliffWarning('git-cliff 2.14.2\n')).toBeNull()
    expect(cliffWarning('git-cliff 2.9.0\n')).toBe('warning: git-cliff 2.9.0 found, 2.14.2 expected')
  })

  it('cliffWarning_for_unreadable_output', () => {
    expect(cliffWarning('2.14.2')).toBe('warning: could not read the git-cliff version from "2.14.2"')
  })

  it('failureLines_adds_the_spawn_error', () => {
    expect(failureLines('git fetch origin failed.', { ok: false, err: 'spawn git EACCES' })).toEqual([
      'git fetch origin failed.',
      'spawn git EACCES',
    ])
    expect(failureLines('git fetch origin failed.', { ok: false, err: '' })).toEqual(['git fetch origin failed.'])
    expect(failureLines('x', { ok: false, err: ' \n' })).toEqual(['x'])
  })

  it('hasSection_matches_whole_versions', () => {
    const text = '# Changelog\n\n## [0.1.0] - 2026-10-31\n\ntext\n'
    expect(hasSection(text, '0.1.0')).toBe(true)
    expect(hasSection('## [0.1.0]\n', '0.1.0')).toBe(true)
    expect(hasSection(text, '0.1')).toBe(false)
    expect(hasSection(text, '0.1.0-rc.1')).toBe(false)
    expect(hasSection(text, '0.1.00')).toBe(false)
    expect(hasSection(text, '0x1x0')).toBe(false)
  })

  it('actionsUrl_for_github_remotes', () => {
    const want = 'https://github.com/EightBitBoy/breccia/actions'
    expect(actionsUrl('git@github.com:EightBitBoy/breccia.git')).toBe(want)
    expect(actionsUrl('https://github.com/EightBitBoy/breccia')).toBe(want)
    expect(actionsUrl('https://github.com/EightBitBoy/breccia.git')).toBe(want)
    expect(actionsUrl('C:/tmp/origin.git')).toBeNull()
  })
})

describe('changelog sections', () => {
  it('insertSection_keeps_every_other_byte', () => {
    const out = insertSection(CHANGELOG, SECTION)
    const i = CHANGELOG.indexOf('## [0.1.0]')
    expect(out).toBe(CHANGELOG.slice(0, i) + SECTION + CHANGELOG.slice(i))
    // No `## ` line: the section goes at the end after one blank line.
    expect(insertSection('# Changelog\n', SECTION)).toBe('# Changelog\n\n' + SECTION)
    expect(insertSection('# Changelog\n\n', SECTION)).toBe('# Changelog\n\n' + SECTION)
    expect(insertSection('# Changelog', SECTION)).toBe('# Changelog\n\n' + SECTION)
  })

  it('insertSection_on_the_real_changelog_puts_the_new_section_first', () => {
    // Before the first release the real file is only the header (ending in a blank line).
    const real = readFileSync(join(REAL_ROOT, 'CHANGELOG.md'), 'utf8')
    const i = real.search(/^## /m)
    const want = i >= 0 ? real.slice(0, i) + SECTION + real.slice(i) : real + SECTION
    if (i < 0) expect(real.endsWith('\n\n')).toBe(true)
    expect(insertSection(real, SECTION)).toBe(want)
  })

  it('an_empty_section_says_no_user_visible_changes', () => {
    expect(newSection('## [0.2.0] - 2026-11-01\n\n')).toBe('## [0.2.0] - 2026-11-01\n\nNo user-visible changes.\n\n')
    expect(newSection('## [0.2.0] - 2026-11-01\n')).toBe('## [0.2.0] - 2026-11-01\n\nNo user-visible changes.\n\n')
    expect(newSection('## [0.2.0] - 2026-11-01\r\n\r\n')).toBe(
      '## [0.2.0] - 2026-11-01\n\nNo user-visible changes.\n\n',
    )
    const full = '## [0.2.0] - 2026-11-01\n\n### Fixes\n\n- Broken thing\n\n'
    expect(newSection(full)).toBe(full)
    expect(newSection(full.replaceAll('\n', '\r\n'))).toBe(full)
  })

  it('an_empty_first_section_says_first_public_release', () => {
    expect(newSection('## [1.0.0] - 2026-11-06\n\n', { first: true })).toBe(
      '## [1.0.0] - 2026-11-06\n\nFirst public release.\n\n',
    )
    expect(newSection('## [1.0.0] - 2026-11-06\n\n', { first: false })).toBe(
      '## [1.0.0] - 2026-11-06\n\nNo user-visible changes.\n\n',
    )
    const full = '## [1.0.0] - 2026-11-06\n\n### Fixes\n\n- Broken thing\n\n'
    expect(newSection(full, { first: true })).toBe(full)
  })

  it('notes_keep_a_prose_section', () => {
    const prose = CHANGELOG.split('\n')[6]
    expect(prose.startsWith('The first release')).toBe(true)
    expect(releaseNotes(CHANGELOG, 'v0.1.0')).toBe(prose + '\n')
  })

  it('notes_stop_at_the_next_section', () => {
    const text = insertSection(CHANGELOG, SECTION)
    expect(releaseNotes(text, '0.2.0')).toBe('### Features\n\n- A thing users see\n')
    expect(releaseNotes(text, 'v0.2.0')).toBe('### Features\n\n- A thing users see\n')
    expect(releaseNotes(text, '0.3.0')).toBeNull()
    expect(releaseNotes(text, '0.2')).toBeNull()
    const empty = insertSection(CHANGELOG, '## [0.2.0] - 2026-11-01\n\n')
    expect(releaseNotes(empty, '0.2.0')).toBe('No user-visible changes.\n')
    expect(releaseNotes('## [0.2.0] - x', '0.2.0')).toBe('No user-visible changes.\n')
  })
})

describe('undo file part', () => {
  const setup = () => {
    const d = mkdtempSync(join(tmpdir(), 'breccia-undo-'))
    const a = join(d, 'a.txt')
    const changelog = join(d, 'CHANGELOG.md')
    writeFileSync(a, 'changed')
    writeFileSync(changelog, 'edited')
    return { d, a, changelog, kept: [[a, Buffer.from('old')], [changelog, Buffer.from('C0')]] }
  }

  it('undo_keeps_an_edited_changelog_it_cannot_copy', () => {
    const { d, a, changelog, kept } = setup()
    try {
      const out = restoreFiles(kept, changelog, 'W', () => {
        throw new Error('disk full')
      })
      expect(readFileSync(a, 'utf8')).toBe('old')
      expect(readFileSync(changelog, 'utf8')).toBe('edited')
      const text = out.join('\n')
      expect(text).toContain('could not be copied')
      expect(text).toContain('disk full')
      expect(text).toContain('left as you edited it')
      // The hint works from any folder: it names the repository.
      expect(text).toContain(`git -C "${d}" checkout -- CHANGELOG.md`)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

it('undo_says_which_file_it_could_not_put_back_and_restores_the_others', () => {
    const { d, a, changelog } = setup()
    // A path whose folder does not exist: writing it fails.
    const stuck = join(d, 'no-such-folder', 'b.txt')
    try {
      const out = restoreFiles([[stuck, Buffer.from('b')], [a, Buffer.from('old')]], changelog, null)
      expect(readFileSync(a, 'utf8')).toBe('old')
      expect(out.join('\n')).toContain(`Could not put back ${stuck}`)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('undo_leaves_a_changelog_it_cannot_read_as_it_is', () => {
    const d = mkdtempSync(join(tmpdir(), 'breccia-undo-'))
    const a = join(d, 'a.txt')
    writeFileSync(a, 'changed')
    // The changelog path is a folder: reading it fails, so the undo must not touch it.
    const changelog = join(d, 'CHANGELOG.md')
    mkdirSync(changelog)
    try {
      const out = restoreFiles([[a, Buffer.from('old')], [changelog, Buffer.from('C0')]], changelog, 'W')
      expect(readFileSync(a, 'utf8')).toBe('old')
      expect(existsSync(changelog)).toBe(true)
      const text = out.join('\n')
      expect(text).toContain('CHANGELOG.md could not be read')
      expect(text).toContain('left as it is')
      expect(out).toHaveLength(1)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })


  it('undo_saves_a_copy_then_restores', () => {
    const { d, a, changelog, kept } = setup()
    const copy = join(d, 'copy.md')
    try {
      const out = restoreFiles(kept, changelog, 'W', (bytes) => {
        writeFileSync(copy, bytes)
        return copy
      })
      expect(readFileSync(a, 'utf8')).toBe('old')
      expect(readFileSync(changelog, 'utf8')).toBe('C0')
      expect(readFileSync(copy, 'utf8')).toBe('edited')
      expect(out).toEqual([`Your edited CHANGELOG.md is saved at ${copy}`])
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})

describe('source guard', () => {
  it('release_script_has_no_shell', () => {
    const src = readFileSync(SCRIPT, 'utf8')
    expect(src).not.toMatch(/\bshell\s*:\s*true/)
    expect(src).not.toMatch(/(?<![.\w])exec(Sync)?\s*\(/)
    expect(src).not.toMatch(/\bexecSync\b/)
  })
})

describe('git sandbox', () => {
  it('ignores_the_callers_git_variables_and_removes_its_folder', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'breccia-elsewhere-'))
    const saved = { ...process.env }
    Object.assign(process.env, {
      GIT_DIR: join(elsewhere, 'not-this.git'),
      GIT_WORK_TREE: elsewhere,
      GIT_INDEX_FILE: join(elsewhere, 'index'),
    })
    let box
    try {
      box = gitSandbox()
    } finally {
      for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
    try {
      expect(Object.keys(box.env).filter((k) => /^GIT_(DIR|WORK_TREE|INDEX_FILE)$/i.test(k))).toEqual([])
      expect(box.env.GIT_TERMINAL_PROMPT).toBe('0')
      expect(box.env.GIT_CONFIG_NOSYSTEM).toBe('1')
      const dir = join(box.root, 'r')
      mkdirSync(dir)
      box.git(dir, 'init', '-q', '-b', 'main')
      expect(realpathSync.native(box.git(dir, 'rev-parse', '--absolute-git-dir').trim())).toBe(
        realpathSync.native(join(dir, '.git')),
      )
      expect(existsSync(join(elsewhere, 'not-this.git'))).toBe(false)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
      box.remove()
    }
    expect(existsSync(box.root)).toBe(false)
  })
})

// The CLI, run in a temp repo (never the real one). Every git call names its directory.
const { root: tmpRoot, env, git, remove } = gitSandbox()
afterAll(remove)
const node = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' })

function makeRepo(name) {
  const dir = join(tmpRoot, name)
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  writeFixture(dir)
  copyFileSync(join(REAL_ROOT, 'cliff.toml'), join(dir, 'cliff.toml'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'chore: start')
  return dir
}

describe('notes command', () => {
  it('prints_the_notes_without_an_extra_newline', () => {
    const dir = makeRepo('notes')
    for (const arg of ['v0.1.0', '0.1.0']) {
      const r = node(join(dir, 'app'), 'notes', arg)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toBe(releaseNotes(CHANGELOG, '0.1.0'))
    }
  })

  it('fails_for_a_missing_section', () => {
    const dir = makeRepo('notes-missing')
    const r = node(dir, 'notes', '9.9.9')
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr.trim()).toBe('CHANGELOG.md has no section for 9.9.9: the release needs one')
  })
})

describe('preview command', () => {
  it('lists_user_visible_commits_even_when_started_from_app', () => {
    const dir = makeRepo('preview')
    git(dir, 'tag', 'v0.1.0')
    const commit = (file, msg) => {
      writeFileSync(join(dir, file), file)
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', msg)
    }
    commit('a.txt', 'feat: a visible thing')
    commit('app/b.txt', 'fix: a fixed thing')
    commit('c.txt', 'chore: hidden')
    for (const cwd of [dir, join(dir, 'app')]) {
      const r = node(cwd, 'preview')
      expect(r.status, r.stderr).toBe(0)
      const rows = r.stdout.split(/\r?\n/)
      const heading = rows.findIndex((l) => l.startsWith('## '))
      expect(heading).toBeGreaterThanOrEqual(0)
      expect(heading).toBeLessThan(rows.findIndex((l) => l.includes('- A visible thing')))
      expect(r.stdout).toContain('- A visible thing')
      expect(r.stdout).toContain('- A fixed thing')
      expect(r.stdout).not.toContain('Hidden')
    }
  })
})
