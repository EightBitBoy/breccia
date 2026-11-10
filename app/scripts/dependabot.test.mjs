import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const yml = readFileSync(join(here, '..', '..', '.github', 'dependabot.yml'), 'utf8')

// Splits the `updates:` list into one text block per `- package-ecosystem:` entry.
const entries = yml
  .split(/^ {2}- (?=package-ecosystem:)/m)
  .slice(1)
  .map((block) => {
    const get = (key) => new RegExp(String.raw`^\s*(?:- )?${key}:[ \t]*"?([^"\n]+?)"?[ \t]*$`, 'm').exec(block)?.[1]
    return { block, ecosystem: get('package-ecosystem'), directory: get('directory') }
  })
const entry = (name) => entries.find((e) => e.ecosystem === name)

// Every group of an entry: its name, its patterns and its update-types, in file order.
function groups(block) {
  const part = block.split(/^ {4}groups:\s*$/m)[1] ?? ''
  const body = part.split(/^ {4}\S/m)[0]
  return body
    .split(/^ {6}(?=\S[^\n]*:\s*$)/m)
    .slice(1)
    .map((g) => ({
      name: g.split('\n')[0].replace(':', '').trim(),
      patterns: [...g.matchAll(/^\s+-\s+"([^"]+)"\s*$/gm)].map((m) => m[1]),
      types: /update-types:\s*\[([^\]]*)\]/.exec(g)?.[1].split(',').map((s) => s.trim().replace(/"/g, '')),
    }))
}

describe('dependabot.yml', () => {
  it('is version 2 with exactly three entries', () => {
    expect(yml).toMatch(/^version: 2$/m)
    expect(entries.map((e) => [e.ecosystem, e.directory])).toEqual([
      ['github-actions', '/'],
      ['cargo', '/'],
      ['npm', '/app'],
    ])
  })

  it('runs monthly in every entry', () => {
    for (const e of entries) expect(e.block, e.ecosystem).toMatch(/^\s+interval: "?monthly"?\s*$/m)
  })

  it('groups only minor and patch updates, in every group of every entry', () => {
    for (const e of entries) {
      const gs = groups(e.block)
      expect(gs.length, e.ecosystem).toBeGreaterThan(0)
      for (const g of gs) expect(g.types, `${e.ecosystem}/${g.name}`).toEqual(['minor', 'patch'])
    }
  })

  it('puts the Tauri group first in cargo and npm', () => {
    expect(groups(entry('cargo').block)[0].patterns).toEqual(['tauri*'])
    expect(groups(entry('npm').block)[0].patterns).toEqual(['@tauri-apps/*'])
  })

  it('uses commit prefixes that cliff.toml skips', () => {
    expect(entry('github-actions').block).toMatch(/prefix: "ci"/)
    expect(entry('cargo').block).toMatch(/prefix: "chore\(deps\)"/)
    expect(entry('npm').block).toMatch(/prefix: "chore\(deps\)"/)
  })
})
