import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const yml = readFileSync(join(here, '..', '..', '.github', 'workflows', 'pages.yml'), 'utf8')
const lines = yml.split('\n')

describe('pages workflow', () => {
  it('every_action_is_pinned_by_sha', () => {
    const uses = lines.filter((l) => /^\s*(- )?uses:/.test(l))
    expect(uses.length).toBeGreaterThan(0)
    for (const l of uses) {
      expect(l).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/)
    }
  })

  it('runs_on_main_for_site_paths_and_by_hand', () => {
    expect(yml).toMatch(/^ {2}workflow_dispatch:/m)
    expect(yml).toMatch(/branches:\s*\n\s+- main\b/)
    for (const p of [
      'site/**',
      'docs/images/**',
      'app/src-tauri/icons/**',
      'app/scripts/site.mjs',
      '.github/workflows/pages.yml',
    ]) {
      expect(yml).toContain(`- '${p}'`)
    }
  })

  it('uploads_the_site_folder', () => {
    expect(yml).toMatch(/upload-pages-artifact@[\s\S]*?\n\s+path: site\s*\n/)
  })

  it('checks_the_site_before_upload', () => {
    const check = lines.findIndex((l) => l.includes('node app/scripts/site.mjs check'))
    const upload = lines.findIndex((l) => l.includes('actions/upload-pages-artifact@'))
    expect(check).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(check)
  })

  it('deploy_has_only_the_pages_permissions', () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n/m)
    const deployAt = lines.findIndex((l) => /^ {2}deploy:/.test(l))
    expect(deployAt).toBeGreaterThan(-1)
    for (const perm of ['pages: write', 'id-token: write']) {
      const hits = lines.map((l, i) => (l.includes(perm) ? i : -1)).filter((i) => i >= 0)
      expect(hits.length).toBe(1)
      expect(hits[0]).toBeGreaterThan(deployAt)
    }
  })

  it('deploys_to_github_pages', () => {
    expect(yml).toContain('name: github-pages')
    expect(yml).toContain('actions/deploy-pages@')
    expect(yml).toMatch(/group: pages\n\s+cancel-in-progress: false/)
  })
})
