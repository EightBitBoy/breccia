import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const yml = readFileSync(join(here, '..', '..', '.github', 'workflows', 'release.yml'), 'utf8')
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

describe('release workflow', () => {
  it('every_action_is_pinned_by_sha', () => {
    const uses = lines.filter((l) => /^\s*(- )?uses:/.test(l))
    expect(uses.length).toBeGreaterThan(0)
    for (const l of uses) {
      expect(l).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/)
    }
  })

  it('only_the_release_job_can_write', () => {
    const writes = lines.map((l, i) => (/contents: write/.test(l) ? i : -1)).filter((i) => i >= 0)
    expect(writes.length).toBe(1)
    const releaseAt = lines.indexOf('  release:')
    expect(releaseAt).toBeGreaterThan(0)
    expect(writes[0]).toBeGreaterThan(releaseAt)
    expect(yml).toMatch(/^permissions:\n  contents: read\n/m)
  })

  it('release_workflow_checks_the_tag_first', () => {
    const buildAt = lines.indexOf('  build:')
    const releaseAt = lines.indexOf('  release:')
    const build = lines.slice(buildAt, releaseAt).join('\n')
    const check = build.indexOf('version.mjs check')
    expect(check).toBeGreaterThan(0)
    expect(build.indexOf('rustup')).toBeGreaterThan(check)
    expect(build.indexOf('just test')).toBeGreaterThan(check)
    expect(yml).toContain('--tag')
  })

  it('release_workflow_pins_the_toolchain', () => {
    expect(yml).toContain('rustup default 1.90.0')
    expect(yml).toContain('just@1.58.0')
    expect(yml).toContain('node-version: 24')
  })

  it('release_workflow_marks_prereleases', () => {
    for (const flag of ['--verify-tag', '--prerelease']) {
      expect(yml).toContain(flag)
    }
  })

  it('release_is_published_at_once', () => {
    // A green run publishes the release; there is no draft to approve.
    expect(yml).not.toContain('--draft')
  })

  it('only_version_tags_start_a_run', () => {
    expect(yml).toContain("- 'v[0-9]+.[0-9]+.[0-9]+*'")
  })

  it('no_expressions_inside_run_scripts', () => {
    const scripts = runScripts()
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) {
      expect(s.text, `run at line ${s.line}`).not.toContain('${{')
    }
  })

  it('a_manual_run_can_never_create_a_release', () => {
    const releaseAt = lines.indexOf('  release:')
    expect(releaseAt).toBeGreaterThan(0)
    const release = lines.slice(releaseAt)
    expect(release).toContain('    needs: [build, notes]')
    expect(release).toContain("    if: github.event_name == 'push' && github.ref_type == 'tag'")
  })

  const buildSteps = () => {
    const buildAt = lines.indexOf('  build:')
    const releaseAt = lines.indexOf('  release:')
    const text = lines.slice(buildAt, releaseAt).join('\n')
    return text.split(/^      - /m).slice(1)
  }

  it('release_workflow_checks_the_tag_first_step', () => {
    const first = buildSteps().find((s) => /^\s*run:/m.test(s))
    expect(first).toContain('name: Check the version (and the tag, on a tag run)')
    expect(first).toContain('--tag')
  })

  // The key/value pairs of a step's `with:` block.
  const withPairs = (step) => {
    const at = step.search(/^\s+with:\s*$/m)
    const pairs = {}
    if (at < 0) return pairs
    const rest = step.slice(at).split('\n').slice(1)
    const indent = rest[0].search(/\S/)
    for (const l of rest) {
      if (l.trim() === '' || l.search(/\S/) !== indent) break
      const m = /^\s+([\w-]+):\s*(.*?)\s*$/.exec(l)
      if (m) pairs[m[1]] = m[2]
    }
    return pairs
  }

  it('checkout does not keep credentials', () => {
    const checkout = buildSteps().find((s) => s.startsWith('uses: actions/checkout@'))
    expect(withPairs(checkout)['persist-credentials']).toBe('false')
    // Able to fail: the same step with the value flipped, or the key moved, is judged correctly.
    expect(withPairs(checkout.replace('persist-credentials: false', 'persist-credentials: true'))['persist-credentials']).toBe('true')
    const reordered = checkout.replace(/(\s+)(persist-credentials: false)/, '$1fetch-depth: 0$1$2')
    expect(withPairs(reordered)).toEqual({ 'fetch-depth': '0', 'persist-credentials': 'false' })
  })

  it('the rustup step stops on a failed install', () => {
    const step = buildSteps().find((s) => s.includes('name: Install Rust 1.90.0'))
    const install = step.indexOf('rustup toolchain install')
    expect(install).toBeGreaterThan(0)
    const rest = step.slice(install)
    expect(rest.indexOf('$LASTEXITCODE')).toBeGreaterThan(0)
    expect(rest.indexOf('$LASTEXITCODE')).toBeLessThan(rest.indexOf('rustup default'))
  })

  const job = (from, to) => {
    const a = lines.indexOf(from)
    expect(a).toBeGreaterThan(0)
    const b = to ? lines.indexOf(to) : lines.length
    return lines.slice(a, b).join('\n')
  }

  it('release_notes_come_from_git_cliff', () => {
    expect(yml).not.toContain('--generate-notes')
    const release = job('  release:')
    expect(release).toContain('--notes-file notes/release-notes.md')
    expect(release).toContain('    needs: [build, notes]')
    expect(release).toMatch(
      /uses: actions\/download-artifact@[^\n]*\n\s+with:\n\s+name: release-notes\n\s+path: notes\n/,
    )
  })

  it('the_notes_job_pins_git_cliff', () => {
    const notes = job('  notes:', '  release:')
    expect(notes).toContain('runs-on: ubuntu-latest')
    expect(notes).not.toMatch(/^\s+permissions:/m)
    expect(notes).toMatch(
      /uses: taiki-e\/install-action@3a3daafd3b7f23b8f65d9f5ba2db203fb59b79e2 # v2\.90\.2\n\s+with:\n\s+tool: git-cliff@2\.14\.2\n/,
    )
    expect(notes).toMatch(
      /uses: actions\/checkout@[^\n]*\n\s+with:\n\s+fetch-depth: 0\n\s+persist-credentials: false\n/,
    )
  })

  const notesScript = () => runScripts().find((s) => s.text.includes('release.mjs notes')).text
  const branches = () => notesScript().split(/^\s*else\s*$/m)

  it('release_notes_come_from_the_tagged_changelog', () => {
    const notes = job('  notes:', '  release:')
    expect(notes).toContain("IS_TAG: ${{ github.ref_type == 'tag' }}")
    expect(notes).toContain('TAG: ${{ github.ref_name }}')
    const [tagBranch] = branches()
    expect(tagBranch).toMatch(/if \[\[ "\$IS_TAG" == "true" \]\]; then/)
    expect(tagBranch).toContain('node app/scripts/release.mjs notes "$TAG" > release-notes.tmp')
    expect(tagBranch).not.toContain('git-cliff')
    expect(tagBranch).not.toContain('sed')
  })

  it('a_failing_notes_step_leaves_no_notes_file', () => {
    const [tagBranch] = branches()
    expect(tagBranch).toContain(
      'node app/scripts/release.mjs notes "$TAG" > release-notes.tmp && mv release-notes.tmp release-notes.md',
    )
    expect(tagBranch).not.toMatch(/>\s*release-notes\.md/)
  })

  it('the_notes_job_has_node', () => {
    const notes = job('  notes:', '  release:')
    const node = notes.indexOf(
      'uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0\n        with:\n          node-version: 24\n',
    )
    expect(node).toBeGreaterThan(-1)
    expect(node).toBeLessThan(notes.indexOf('release.mjs notes'))
  })

  it('release_notes_never_empty', () => {
    const [tagBranch, otherBranch] = branches()
    expect(otherBranch).toContain('git-cliff --unreleased --strip all -o release-notes.md')
    expect(otherBranch).toContain('No user-visible changes.')
    expect(otherBranch).toContain("grep -q '^- ' release-notes.md")
    expect(tagBranch).not.toContain('No user-visible changes.')
    expect(tagBranch).not.toContain('grep -q')
  })

  it('the_preview_is_made_only_off_a_tag', () => {
    const [tagBranch, otherBranch] = branches()
    expect(tagBranch).not.toContain('--prepend')
    expect(tagBranch).not.toContain('changelog-preview.md')
    const copy = otherBranch.indexOf('cp CHANGELOG.md changelog-preview.md')
    expect(copy).toBeGreaterThan(-1)
    expect(otherBranch.indexOf('git-cliff --unreleased --prepend changelog-preview.md')).toBeGreaterThan(copy)
  })

  it('the_build_job_installs_git_cliff', () => {
    const steps = buildSteps()
    const at = steps.findIndex((s) => s.includes('tool: just@1.58.0,git-cliff@2.14.2'))
    expect(at).toBeGreaterThan(-1)
    expect(steps[at]).toContain('uses: taiki-e/install-action@')
    expect(at).toBeLessThan(steps.findIndex((s) => s.includes('name: Test')))
  })

  it('a_generated_section_ends_with_a_blank_line', () => {
    const cliff = readFileSync(join(here, '..', '..', 'cliff.toml'), 'utf8')
    expect(cliff).toMatch(/^trim = false$/m)
    expect(cliff).toContain('{% endfor %}\n{% endfor %}\n"""\nfooter')
  })

  it('notes_are_previewed_on_a_manual_run', () => {
    const notes = job('  notes:', '  release:')
    expect(notes).not.toMatch(/^\s+if:/m)
    expect(notes).toMatch(/uses: actions\/upload-artifact@[^\n]*\n\s+with:\n\s+name: release-notes\n/)
  })
})
