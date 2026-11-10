import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, '..', '..', '.github', 'workflows', name), 'utf8')
const yml = read('ci.yml')
const releaseYml = read('release.yml')
const lines = yml.split('\n')

// Every `run:` value: the rest of a one-line `run: x`, or the indented block under `run: |`.
function runScripts() {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    if (/^[|>][+-]?$/.test(m[2])) {
      const indent = m[1].length + (lines[i].includes('- run:') ? 2 : 0)
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]
        if (l.trim() !== '' && l.search(/\S/) <= indent) break
        body.push(l)
      }
      out.push({ line: i + 1, text: body.join('\n') })
    } else {
      out.push({ line: i + 1, text: m[2] })
    }
  }
  return out
}

// The steps of the `build` job: the text between `  build:` and the next top-level job (or the end).
function buildSteps(text) {
  const all = text.split('\n')
  const from = all.indexOf('  build:')
  expect(from).toBeGreaterThan(0)
  let to = all.length
  for (let i = from + 1; i < all.length; i++) {
    if (/^  \S/.test(all[i])) {
      to = i
      break
    }
  }
  return all.slice(from, to).join('\n').split(/^      - /m).slice(1)
}

describe('ci workflow', () => {
  it('every_action_is_pinned_by_sha', () => {
    const uses = lines.filter((l) => /^\s*(- )?uses:/.test(l))
    expect(uses.length).toBeGreaterThan(0)
    for (const l of uses) {
      expect(l).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/)
    }
  })

  it('runs_on_every_branch_push_and_pull_request', () => {
    expect(yml).toMatch(/^on:\n  push:\n    branches:\n      - '\*\*'\n  pull_request:\n/m)
  })

  it('reads_only', () => {
    expect(yml).toMatch(/^permissions:\n  contents: read\n/m)
    expect(yml).not.toContain(': write')
  })

  it('cancels_a_superseded_run', () => {
    expect(yml).toMatch(/^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\n/m)
  })

  it('runs_the_release_build_steps_up_to_lint', () => {
    const release = buildSteps(releaseYml)
    const lintAt = release.findIndex((s) => s.includes('name: Lint\n'))
    expect(lintAt).toBeGreaterThan(0)
    const versionAt = release.findIndex((s) => s.includes('name: Check the version'))
    expect(versionAt).toBeGreaterThan(-1)
    const expected = release.slice(0, lintAt + 1)
    expected[versionAt] =
      'name: Check the version\n' +
      '        run: |\n' +
      '          node app/scripts/version.mjs check\n' +
      '          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n'
    const ci = buildSteps(yml)
    expect(ci).toEqual(expected)
    for (const s of ci) expect(s).not.toContain('just bundle')
  })

  it('no_expressions_inside_run_scripts', () => {
    const scripts = runScripts()
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) {
      expect(s.text, `run at line ${s.line}`).not.toContain('${{')
    }
  })

  it('same_runner_and_limits', () => {
    expect(yml).toContain('runs-on: windows-latest')
    expect(yml).toContain('timeout-minutes: 60')
    expect(yml).toContain('shell: pwsh')
    expect(yml).toContain('CARGO_TERM_COLOR: always')
  })
})
