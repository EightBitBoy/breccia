// End-to-end tests of `release.mjs [X.Y.Z] [--yes]`: each test builds a temp work repo with a temp
// bare origin and runs the script there. Every git call names its directory (`git -C`, or `cwd` for
// the script), and git runs with its own config, so nothing here touches the real repo or its origin.
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkVersions, readVersions } from './version.mjs'
import { gitSandbox, writeFixture } from './fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, 'release.mjs')
const REAL_ROOT = join(here, '..', '..')
const T = 60_000
const FILES = ['CHANGELOG.md', 'Cargo.toml', 'Cargo.lock', 'app/src-tauri/tauri.conf.json', 'app/package.json', 'app/package-lock.json']
const COMMITTED = ['CHANGELOG.md', 'Cargo.lock', 'Cargo.toml', 'app/package-lock.json', 'app/package.json']
const PROMPT = 'Enter = commit'

beforeAll(() => {
  const r = spawnSync('git-cliff', ['--version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) throw new Error('install git-cliff 2.14.2 (winget install git-cliff) to run these tests')
})

// No GIT_* variable of the caller (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...) reaches git here.
const { root: tmpRoot, env, git, remove } = gitSandbox()
afterAll(remove)

const read = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : null)
const release = (cwd, args, input = '') =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8', input })

let n = 0
// A work repo at v0.1.0 plus a feat and a fix commit, pushed to a bare origin.
function setup() {
  const base = join(tmpRoot, `r${++n}`)
  const origin = join(base, 'origin.git')
  const work = join(base, 'work')
  mkdirSync(origin, { recursive: true })
  mkdirSync(work, { recursive: true })
  git(origin, 'init', '-q', '--bare', '-b', 'main')
  git(work, 'init', '-q', '-b', 'main')
  writeFixture(work)
  copyFileSync(join(REAL_ROOT, 'cliff.toml'), join(work, 'cliff.toml'))
  git(work, 'add', '-A')
  git(work, 'commit', '-q', '-m', 'chore: init')
  git(work, 'tag', '-a', 'v0.1.0', '-m', 'Breccia 0.1.0')
  const commit = (file, msg) => {
    writeFileSync(join(work, file), msg)
    git(work, 'add', '-A')
    git(work, 'commit', '-q', '-m', msg)
  }
  commit('a.txt', 'feat: a thing users see')
  commit('b.txt', 'fix: broken thing')
  git(work, 'remote', 'add', 'origin', origin)
  git(work, 'push', '-q', 'origin', 'main', 'v0.1.0')
  // A second clone, to change origin behind the work repo's back.
  const other = () => {
    const dir = join(base, 'other')
    git(base, 'clone', '-q', origin, dir)
    return dir
  }
  return { base, origin, work, other }
}

const originRefs = (origin) => git(origin, 'for-each-ref', '--format=%(refname) %(objectname)')

function snapshot({ work, origin }) {
  return {
    head: git(work, 'rev-parse', 'HEAD').trim(),
    tags: git(work, 'tag', '--list'),
    files: Object.fromEntries(FILES.map((f) => [f, read(work, f)])),
    status: git(work, 'status', '--porcelain'),
    origin: originRefs(origin),
  }
}

const committedFiles = (work) => git(work, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n')

// Run without --yes; at the prompt call `edit(work)`, then type `answer` (Enter by default).
function releaseWithPause(work, edit, answer = '\n') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: work, env })
    let stdout = ''
    let stderr = ''
    let asked = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      stdout += d
      if (!asked && stdout.includes(PROMPT)) {
        asked = true
        edit(work)
        child.stdin.write(answer)
      }
    })
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

const SECTION_RE = /^## \[0\.2\.0\] - \d{4}-\d{2}-\d{2}\n\n### Features\n\n- A thing users see\n\n### Fixes\n\n- Broken thing\n\n$/

describe('release flow', () => {
  it(
    'release_without_a_version_cuts_the_next_minor',
    () => {
      const r0 = setup()
      const { work, origin } = r0
      const before = read(work, 'CHANGELOG.md')
      const r = release(work, ['--yes'])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('Release 0.2.0 (latest tag v0.1.0)')
      expect(r.stdout).toContain('Pushed v0.2.0.')
      const head = git(work, 'rev-parse', 'HEAD').trim()
      expect(git(work, 'log', '-1', '--format=%s').trim()).toBe('chore(release): 0.2.0')
      expect(git(work, 'cat-file', '-t', 'v0.2.0').trim()).toBe('tag')
      expect(git(work, 'tag', '-l', '--format=%(contents:subject)', 'v0.2.0').trim()).toBe('Breccia 0.2.0')
      expect(git(work, 'rev-parse', 'v0.2.0^{commit}').trim()).toBe(head)
      expect(committedFiles(work)).toEqual(COMMITTED)
      expect(git(origin, 'rev-parse', 'main').trim()).toBe(head)
      expect(git(origin, 'rev-parse', 'refs/tags/v0.2.0').trim()).toBe(git(work, 'rev-parse', 'refs/tags/v0.2.0').trim())
      expect(readVersions(work).cargo).toBe('0.2.0')
      expect(checkVersions(readVersions(work))).toEqual([])
      const after = read(work, 'CHANGELOG.md')
      const i = before.indexOf('## [0.1.0]')
      expect(after.slice(0, i)).toBe(before.slice(0, i))
      expect(after.endsWith(before.slice(i))).toBe(true)
      const section = after.slice(i, after.length - (before.length - i))
      expect(section).toMatch(SECTION_RE)
      expect(after).toBe(before.slice(0, i) + section + before.slice(i))
      expect(git(work, 'status', '--porcelain')).toBe('')
    },
    T,
  )

  it(
    'release_with_a_version_uses_it',
    () => {
      const { work, origin } = setup()
      const r = release(work, ['1.0.0', '--yes'])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('Release 1.0.0 (latest tag v0.1.0)')
      expect(git(origin, 'tag', '--list').split('\n')).toContain('v1.0.0')
      expect(readVersions(work).cargo).toBe('1.0.0')
      expect(checkVersions(readVersions(work))).toEqual([])
    },
    T,
  )

  it(
    'started_from_app_lists_the_same_changes',
    () => {
      const { work } = setup()
      const before = read(work, 'CHANGELOG.md')
      const r = release(join(work, 'app'), ['--yes'])
      expect(r.status, r.stderr).toBe(0)
      const i = before.indexOf('## [0.1.0]')
      const after = read(work, 'CHANGELOG.md')
      expect(after.slice(i, after.length - (before.length - i))).toMatch(SECTION_RE)
    },
    T,
  )

  describe('failed_checks_change_nothing', () => {
    const refused = (prepare, args, message, extraTags = []) => {
      const repo = setup()
      prepare(repo)
      const before = snapshot(repo)
      const r = release(repo.work, args)
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain(message)
      const want = { ...before, tags: before.tags + extraTags.map((t) => t + '\n').join('') }
      expect(snapshot(repo)).toEqual(want)
      return r
    }

    it('a_dirty_tree', () => {
      refused(
        ({ work }) => writeFileSync(join(work, 'CHANGELOG.md'), read(work, 'CHANGELOG.md') + 'x\n'),
        ['--yes'],
        'uncommitted or untracked files',
      )
    }, T)

    it('origin_has_a_newer_main', () => {
      refused(
        ({ other }) => {
          const o = other()
          writeFileSync(join(o, 'c.txt'), 'c')
          git(o, 'add', '-A')
          git(o, 'commit', '-q', '-m', 'feat: elsewhere')
          git(o, 'push', '-q', 'origin', 'main')
        },
        ['--yes'],
        'main is not the same as origin/main',
      )
    }, T)

    it('an_older_version', () => {
      refused(() => {}, ['0.0.9', '--yes'], '0.0.9 is not newer than the latest tag v0.1.0')
    }, T)

    it('a_tag_only_on_origin', () => {
      // The fetch brings v0.3.0 into the local tag list; nothing else changes.
      const r = refused(
        ({ other }) => {
          const o = other()
          git(o, 'tag', '-a', 'v0.3.0', '-m', 'Breccia 0.3.0')
          git(o, 'push', '-q', 'origin', 'v0.3.0')
        },
        ['0.3.0', '--yes'],
        'tag v0.3.0 already exists',
        ['v0.3.0'],
      )
      expect(r.stderr).toContain('tag v0.3.0 already exists here')
      expect(r.stderr).toContain('tag v0.3.0 already exists on origin')
    }, T)

    it('another_branch', () => {
      refused(({ work }) => git(work, 'checkout', '-q', '-b', 'dev'), ['--yes'], 'on branch dev, not main')
    }, T)
  })

  it(
    'answering_n_undoes_everything',
    () => {
      const repo = setup()
      const before = snapshot(repo)
      const r = release(repo.work, [], 'n\n')
      expect(r.status, r.stderr).toBe(1)
      expect(r.stdout).toContain('Stopped; nothing was committed.')
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )

  it(
    'end_of_input_undoes_everything',
    () => {
      const repo = setup()
      const before = snapshot(repo)
      const r = release(repo.work, [], '')
      expect(r.status, r.stderr).toBe(1)
      expect(r.stdout).toContain('Stopped; nothing was committed.')
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )

  it(
    'a_hand_edit_in_the_pause_is_committed',
    async () => {
      const { work } = setup()
      const r = await releaseWithPause(work, (dir) => {
        const p = join(dir, 'CHANGELOG.md')
        writeFileSync(p, readFileSync(p, 'utf8').replace('- Broken thing\n', '- Broken thing\n- Hand-written line\n'))
        writeFileSync(join(dir, 'scratch.txt'), 'scratch')
      })
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(git(work, 'show', 'HEAD:CHANGELOG.md')).toContain('- Broken thing\n- Hand-written line\n')
      expect(git(work, 'status', '--porcelain')).toBe('?? scratch.txt\n')
      expect(committedFiles(work)).toEqual(COMMITTED)
    },
    T,
  )

  it(
    'a_deleted_heading_stops_the_release',
    async () => {
      const repo = setup()
      const before = snapshot(repo)
      const r = await releaseWithPause(repo.work, (dir) => {
        const p = join(dir, 'CHANGELOG.md')
        writeFileSync(p, readFileSync(p, 'utf8').replace('## [0.2.0]', '## [0.2.x]'))
      })
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stdout + r.stderr).toContain('CHANGELOG.md lost its ## [0.2.0] heading; nothing was committed.')
      const m = /Your edited CHANGELOG\.md is saved at (.+)$/m.exec(r.stderr)
      expect(m, r.stderr).not.toBeNull()
      expect(readFileSync(m[1].trim(), 'utf8')).toContain('## [0.2.x]')
      rmSync(dirname(m[1].trim()), { recursive: true, force: true })
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )

  it(
    'a_refused_push_leaves_origin_untouched',
    () => {
      const { work, origin } = setup()
      writeFileSync(join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
      const originBefore = originRefs(origin)
      const head = git(work, 'rev-parse', 'HEAD').trim()
      const r = release(work, ['--yes'])
      expect(r.status).toBe(1)
      expect(r.stdout + r.stderr).toContain('git push --atomic origin main v0.2.0')
      expect(r.stdout + r.stderr).toContain('git tag -d v0.2.0, then git reset --keep HEAD~1')
      expect(originRefs(origin)).toBe(originBefore)
      expect(git(work, 'rev-parse', 'HEAD~1').trim()).toBe(head)
      expect(git(work, 'log', '-1', '--format=%s').trim()).toBe('chore(release): 0.2.0')
      expect(git(work, 'cat-file', '-t', 'v0.2.0').trim()).toBe('tag')
      expect(git(work, 'status', '--porcelain')).toBe('')
    },
    T,
  )

  it(
    'a_failed_tag_names_the_retry_and_the_undo',
    async () => {
      const { work, origin } = setup()
      const originBefore = originRefs(origin)
      // A tag v0.2.0/x makes the tag v0.2.0 impossible (a ref cannot be a file and a folder).
      const r = await releaseWithPause(work, (dir) => git(dir, 'tag', 'v0.2.0/x'))
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain('Retry: git tag -a v0.2.0 -m "Breccia 0.2.0", then git push --atomic origin main v0.2.0')
      expect(r.stderr).toContain('Undo: git reset --keep HEAD~1')
      expect(git(work, 'log', '-1', '--format=%s').trim()).toBe('chore(release): 0.2.0')
      expect(originRefs(origin)).toBe(originBefore)
    },
    T,
  )

  it(
    'a_deleted_changelog_in_the_pause_is_put_back',
    async () => {
      const repo = setup()
      const before = snapshot(repo)
      const r = await releaseWithPause(repo.work, (dir) => rmSync(join(dir, 'CHANGELOG.md')))
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain('CHANGELOG.md')
      expect(r.stderr).toContain('nothing was committed.')
      expect(r.stderr).not.toMatch(/^\s+at /m)
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )

  it(
    'a_typo_at_the_pause_asks_again',
    async () => {
      const { work } = setup()
      const r = await releaseWithPause(
        work,
        (dir) => {
          const p = join(dir, 'CHANGELOG.md')
          writeFileSync(p, readFileSync(p, 'utf8').replace('- Broken thing\n', '- Broken thing\n- Kept line\n'))
        },
        'j\n\n',
      )
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stdout).toContain('Type Enter to release or n to stop')
      expect(git(work, 'show', 'HEAD:CHANGELOG.md')).toContain('- Broken thing\n- Kept line\n')
    },
    T,
  )

  it(
    'an_edited_changelog_is_saved_when_the_release_stops',
    async () => {
      const repo = setup()
      const before = snapshot(repo)
      let edited = null
      const r = await releaseWithPause(
        repo.work,
        (dir) => {
          const p = join(dir, 'CHANGELOG.md')
          edited = readFileSync(p, 'utf8').replace('- Broken thing\n', '- Broken thing\n- My own words\n')
          writeFileSync(p, edited)
        },
        'n\n',
      )
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stdout).toContain('Stopped; nothing was committed.')
      const m = /Your edited CHANGELOG\.md is saved at (.+)$/m.exec(r.stdout + r.stderr)
      expect(m, r.stdout + r.stderr).not.toBeNull()
      const copy = m[1].trim()
      expect(readFileSync(copy, 'utf8')).toBe(edited)
      rmSync(dirname(copy), { recursive: true, force: true })
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )

  it(
    'a_successful_push_shows_what_git_says',
    () => {
      const { work, origin } = setup()
      writeFileSync(join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho hello-from-origin >&2\nexit 0\n', {
        mode: 0o755,
      })
      const r = release(work, ['--yes'])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stderr).toContain('hello-from-origin')
    },
    T,
  )

  it(
    'answering_n_also_unstages',
    async () => {
      const repo = setup()
      const before = snapshot(repo)
      const r = await releaseWithPause(repo.work, (dir) => git(dir, 'add', 'CHANGELOG.md', 'Cargo.toml'), 'n\n')
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stdout).toContain('Stopped; nothing was committed.')
      expect(snapshot(repo)).toEqual(before)
    },
    T,
  )
})
