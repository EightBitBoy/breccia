// `just release`: checks, changelog sections and release notes. Programs are started with
// spawnSync and an argument list (never through a shell). Every git and git-cliff call runs in the
// repo root, because git-cliff silently limits itself to the current directory otherwise.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
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

export const NO_TAG = 'no v* tag yet: give the version, for example just release 1.0.0'
export const CLIFF_MISSING =
  'git-cliff is not installed: winget install git-cliff, or cargo install git-cliff --version 2.14.2 --locked'
const CLIFF_VERSION = '2.14.2'
const NO_CHANGES = 'No user-visible changes.'
const FIRST_RELEASE = 'First public release.'

// The problems that stop a release, in the order they are reported; empty when it can go ahead.
export function releaseProblems(f) {
  const out = []
  const { version } = f
  if (!isVersion(version)) {
    out.push(`not a version: "${version}" (use X.Y.Z or X.Y.Z-pre)`)
  } else if (f.latestTag !== null && parseTag(f.latestTag) && compareVersions(version, f.latestTag.slice(1)) <= 0) {
    out.push(`${version} is not newer than the latest tag ${f.latestTag}`)
  }
  if (isVersion(version) && isVersion(f.current) && compareVersions(version, f.current) < 0) {
    out.push(`${version} is lower than the current version ${f.current} in Cargo.toml`)
  }
  if (f.branch !== 'main') out.push(`on branch ${f.branch}, not main`)
  if (f.dirty) out.push('uncommitted or untracked files: commit, stash or remove them first')
  if (f.head !== f.originMain) out.push('main is not the same as origin/main: pull or push first')
  if (isVersion(version)) {
    if (f.tagHere) out.push(`tag v${version} already exists here`)
    if (f.tagOnOrigin) out.push(`tag v${version} already exists on origin`)
    if (hasSection(f.changelog, version)) out.push(`CHANGELOG.md already has a section for ${version}`)
  }
  return [...out, ...f.versionProblems]
}

export function cliffWarning(versionOutput) {
  const raw = versionOutput.trim()
  if (!raw.startsWith('git-cliff ')) return `warning: could not read the git-cliff version from "${raw}"`
  const found = raw.replace(/^git-cliff /, '')
  return found === CLIFF_VERSION ? null : `warning: git-cliff ${found} found, ${CLIFF_VERSION} expected`
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const headingRe = (version) => new RegExp(`^## \\[${escapeRe(version)}\\](?: .*)?$`)
const lines = (text) => text.split(/\r?\n/)

export function hasSection(changelog, version) {
  const re = headingRe(version)
  return lines(changelog).some((l) => re.test(l))
}

// git-cliff's text for the new section; a heading with nothing under it gets a one-line body
// (`first`: no `v*` tag exists yet, so this is the first release).
export function newSection(cliffOutput, { first = false } = {}) {
  const text = cliffOutput.replace(/\r\n/g, '\n')
  const nl = text.indexOf('\n')
  const heading = nl < 0 ? text : text.slice(0, nl)
  if (text.slice(heading.length).trim() === '') return `${heading}\n\n${first ? FIRST_RELEASE : NO_CHANGES}\n\n`
  return text
}

// Put the section before the first `## ` line, or at the end when there is none.
export function insertSection(changelog, section) {
  const m = /^## /m.exec(changelog)
  if (m) return changelog.slice(0, m.index) + section + changelog.slice(m.index)
  const gap = changelog === '' || changelog.endsWith('\n\n') ? '' : changelog.endsWith('\n') ? '\n' : '\n\n'
  return changelog + gap + section
}

// The text under the version's heading up to the next `## ` line; null when there is no section.
export function releaseNotes(changelog, versionOrTag) {
  const version = versionOrTag.replace(/^v/, '')
  const re = headingRe(version)
  const all = lines(changelog)
  const start = all.findIndex((l) => re.test(l))
  if (start < 0) return null
  let end = all.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end < 0) end = all.length
  const body = all.slice(start + 1, end)
  while (body.length && body[0].trim() === '') body.shift()
  while (body.length && body[body.length - 1].trim() === '') body.pop()
  return body.length ? body.join('\n') + '\n' : `${NO_CHANGES}\n`
}

export function actionsUrl(remoteUrl) {
  const m = /^(?:git@github\.com:|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(remoteUrl.trim())
  return m ? `https://github.com/${m[1]}/${m[2]}/actions` : null
}

// Run a program with an argument list. ok is false on a non-zero exit or when it cannot start
// (not installed); `missing` tells those two apart.
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.error) return { ok: false, missing: r.error.code === 'ENOENT', out: '', err: r.error.message }
  return { ok: r.status === 0, missing: false, out: r.stdout ?? '', err: r.stderr ?? '' }
}

// The label, then why the program failed when it said so (a spawn error, for example).
export function failureLines(label, r) {
  const why = (r.err ?? '').trim()
  return why ? [label, why] : [label]
}

function saveChangelogCopy(bytes) {
  const copy = join(mkdtempSync(join(tmpdir(), 'breccia-release-')), 'CHANGELOG.md')
  writeFileSync(copy, bytes)
  return copy
}

// The undo's file part: put the kept bytes back, one file at a time. A CHANGELOG.md that differs
// from what the script wrote holds the owner's edits (spec anti-goal §2): it is copied first, and
// when the copy fails it is left as edited. Returns the lines to print.
export function restoreFiles(kept, changelogPath, written, saveCopy = saveChangelogCopy) {
  const lines = []
  let keepChangelog = false
  try {
    if (written !== null && existsSync(changelogPath)) {
      const now = readFileSync(changelogPath)
      if (!now.equals(Buffer.from(written, 'utf8'))) {
        try {
          lines.push(`Your edited CHANGELOG.md is saved at ${saveCopy(now)}`)
        } catch (e) {
          keepChangelog = true
          lines.push(
            `Your edited CHANGELOG.md could not be copied (${e.message}), so it was left as you edited it.`,
            'git checkout -- CHANGELOG.md restores the committed one.',
          )
        }
      }
    }
  } catch (e) {
    keepChangelog = true
    lines.push(`CHANGELOG.md could not be read (${e.message}), so it was left as it is.`)
  }
  for (const [p, bytes] of kept) {
    if (keepChangelog && p === changelogPath) continue
    try {
      if (bytes === null) rmSync(p, { force: true })
      else if (!existsSync(p) || !readFileSync(p).equals(bytes)) writeFileSync(p, bytes)
    } catch (e) {
      lines.push(`Could not put back ${p}: ${e.message}`)
    }
  }
  return lines
}

function repoRoot() {
  const r = run('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() })
  return r.ok ? resolve(r.out.trim()) : null
}

const AGAIN = 'Type Enter to release or n to stop: '

// The answer to the pause: true for Enter, y or yes; false for n or no, at end of input, or when
// readline closes (Ctrl+C at a terminal). Anything else asks again, so a typo never undoes.
// stdin is let go afterwards: an open pipe would otherwise keep the process waiting.
function confirm(question) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let answer = null
    rl.on('line', (line) => {
      if (answer !== null) return
      const a = line.trim().toLowerCase()
      if (['', 'y', 'yes', 'n', 'no'].includes(a)) {
        answer = !a.startsWith('n')
        rl.close()
      } else {
        rl.setPrompt(AGAIN)
        rl.prompt()
      }
    })
    rl.on('close', () => {
      if (answer === null) process.stdout.write('\n')
      process.stdin.destroy()
      done(answer === true)
    })
    rl.setPrompt(question)
    rl.prompt()
  })
}

// The files a release may write; their bytes are kept so that a stop can put them back.
const KEPT_FILES = ['CHANGELOG.md', 'Cargo.toml', 'Cargo.lock', 'app/package.json', 'app/package-lock.json']
const USAGE = 'usage: release.mjs [X.Y.Z] [--yes] | notes X.Y.Z | preview'

// `release.mjs [X.Y.Z] [--yes]`: checks, version bump, CHANGELOG section, pause, commit, tag, push.
async function cut(root, args) {
  const yes = args.includes('--yes')
  const positional = args.filter((a) => a !== '--yes')
  if (positional.length > 1 || positional.some((a) => a.startsWith('-'))) {
    console.error(USAGE)
    return 2
  }
  const git = (...a) => run('git', a, { cwd: root })
  const cliff = (...a) => run('git-cliff', a, { cwd: root })

  // 1. git-cliff is there.
  const cv = cliff('--version')
  if (cv.missing) {
    console.error(CLIFF_MISSING)
    return 1
  }
  if (!cv.ok) {
    console.error(cv.err.trim() || 'git-cliff --version failed')
    return 1
  }
  const warning = cliffWarning(cv.out)
  if (warning) console.error(warning)

  // 2. Origin's state. git uses the terminal itself here, so an SSH prompt shows and can be answered.
  const fetched = run('git', ['fetch', '--quiet', '--tags', 'origin'], { cwd: root, stdio: 'inherit' })
  if (!fetched.ok) {
    for (const l of failureLines('git fetch origin failed.', fetched)) console.error(l)
    return 1
  }

  // 3. The version.
  const tags = git('tag', '--list', 'v*')
  if (!tags.ok) {
    console.error(tags.err.trim())
    return 1
  }
  const latest = latestTag(tags.out.split(/\r?\n/).filter(Boolean))
  let version = positional[0]
  if (version === undefined) {
    if (latest === null) {
      console.error(NO_TAG)
      return 1
    }
    version = defaultVersion(latest)
  }
  console.log(`Release ${version} (${latest === null ? 'no tag yet' : `latest tag ${latest}`})`)

  // 4. The checks, all reported together.
  const text = (r) => (r.ok ? r.out.trim() : null)
  const changelogPath = join(root, 'CHANGELOG.md')
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : ''
  let tagOnOrigin = false
  if (isVersion(version)) {
    const remote = git('ls-remote', '--tags', 'origin', `refs/tags/v${version}`)
    if (!remote.ok) {
      console.error('git ls-remote origin failed:')
      console.error(remote.err.trim())
      return 1
    }
    tagOnOrigin = remote.out.trim() !== ''
  }
  const versions = readVersions(root)
  const problems = releaseProblems({
    version,
    latestTag: latest,
    branch: text(git('branch', '--show-current')) || '(none: detached HEAD)',
    dirty: text(git('status', '--porcelain')) !== '',
    head: text(git('rev-parse', 'HEAD')),
    originMain: text(git('rev-parse', '-q', '--verify', 'origin/main')) ?? 'missing',
    tagHere: isVersion(version) && git('rev-parse', '-q', '--verify', `refs/tags/v${version}`).ok,
    tagOnOrigin,
    changelog,
    versionProblems: checkVersions(versions),
    current: versions.cargo ?? null,
  })
  if (problems.length) {
    for (const p of problems) console.error(p)
    return 1
  }

  // 5. The version bump. From here on, every stop puts the kept bytes back and unstages those
  // files (the tree was clean, so their index entries were HEAD's).
  // Files first reset in the index, then restored by restoreFiles, which prints what it did not do.
  const kept = KEPT_FILES.map((f) => [join(root, f), existsSync(join(root, f)) ? readFileSync(join(root, f)) : null])
  let written = null
  const undo = () => {
    git('reset', '-q', '--', ...KEPT_FILES.filter((_, i) => kept[i][1] !== null))
    return restoreFiles(kept, changelogPath, written)
  }
  const stop = (...messages) => {
    const notes = undo()
    for (const m of [...messages, ...notes]) if (m) console.error(m)
    return 1
  }

  // Steps 5 to 9 up to the commit: any exception in them is a stop too.
  const commitRelease = async () => {
    let changed
    try {
      changed = bumpVersion(root, version)
    } catch (e) {
      return stop(e.message)
    }
    const afterBump = checkVersions(readVersions(root))
    if (afterBump.length) return stop(...afterBump)

    // 6. The CHANGELOG section.
    const generated = cliff('--unreleased', '--tag', `v${version}`, '--strip', 'all')
    if (!generated.ok) return stop('git-cliff failed:', generated.err.trim())
    const section = newSection(generated.out, { first: latest === null })
    written = insertSection(changelog, section)
    writeFileSync(changelogPath, written)
    process.stdout.write('\n' + section)

    // 7. The pause for hand edits.
    if (!yes) {
      const go = await confirm(
        `Release ${version}: edit CHANGELOG.md now if you like. Enter = commit, tag and push; n = undo and stop: `,
      )
      if (!go) {
        const notes = undo()
        console.log('Stopped; nothing was committed.')
        for (const m of notes) console.log(m)
        return 1
      }
    }

    // 8. The heading must have survived the edits.
    if (!hasSection(readFileSync(changelogPath, 'utf8'), version)) {
      return stop(`CHANGELOG.md lost its ## [${version}] heading; nothing was committed.`)
    }

    // 9. Commit only the files written here (a pathspec, so nothing else goes in).
    const files = ['CHANGELOG.md', ...changed]
    const committed = git('commit', '-q', '-m', `chore(release): ${version}`, '--', ...files)
    if (!committed.ok) return stop(committed.err.trim(), 'git commit failed; nothing was committed.')
    return 0
  }
  let stopped
  try {
    stopped = await commitRelease()
  } catch (e) {
    return stop(`${e.message}; the files were put back and nothing was committed.`)
  }
  if (stopped !== 0) return stopped

  // 9, continued. The annotated tag.
  const tag = `v${version}`
  const tagged = git('tag', '-a', tag, '-m', `Breccia ${version}`)
  if (!tagged.ok) {
    console.error(tagged.err.trim())
    console.error('The release commit is only here and has no tag.')
    console.error(`Retry: git tag -a ${tag} -m "Breccia ${version}", then git push --atomic origin main ${tag}`)
    console.error('Undo: git reset --keep HEAD~1')
    return 1
  }

  // 10. Push the branch and the tag together, or neither. git uses the terminal itself, so its
  // progress shows and an SSH prompt can be answered.
  const pushed = run('git', ['push', '--atomic', 'origin', 'main', tag], { cwd: root, stdio: 'inherit' })
  if (!pushed.ok) {
    for (const l of failureLines('git push failed.', pushed)) console.error(l)
    console.error(`The commit and tag are only here. Retry: git push --atomic origin main ${tag}`)
    console.error(`Or undo: git tag -d ${tag}, then git reset --keep HEAD~1`)
    return 1
  }

  // 11. Where to watch the build.
  console.log(`Pushed ${tag}.`)
  const remoteUrl = git('remote', 'get-url', 'origin')
  const actions = remoteUrl.ok ? actionsUrl(remoteUrl.out) : null
  console.log(actions ? `Watch the release: ${actions}` : 'Watch the Release run on GitHub Actions.')
  return 0
}

async function main(argv) {
  const [cmd, ...rest] = argv
  const root = repoRoot()
  if (root === null) {
    console.error('not inside a git repository')
    return 1
  }
  if (cmd === 'notes' && rest.length === 1) {
    const version = rest[0].replace(/^v/, '')
    const notes = releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version)
    if (notes === null) {
      console.error(`CHANGELOG.md has no section for ${version}: the release needs one`)
      return 1
    }
    process.stdout.write(notes)
    return 0
  }
  if (cmd === 'preview' && rest.length === 0) {
    const r = run('git-cliff', ['--unreleased', '--strip', 'all'], { cwd: root })
    if (r.missing) {
      console.error(CLIFF_MISSING)
      return 1
    }
    if (!r.ok) {
      console.error(r.err.trim() || 'git-cliff failed')
      return 1
    }
    process.stdout.write(r.out)
    return 0
  }
  if (cmd === 'notes' || cmd === 'preview') {
    console.error(USAGE)
    return 2
  }
  return cut(root, argv)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(e instanceof Error ? e.message : String(e))
      process.exitCode = 1
    },
  )
}
