import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function rustFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return rustFiles(path)
    return name.endsWith('.rs') ? [path] : []
  })
}

// The text before the file's test module: the first `#[cfg(test)]` that is followed by a `mod`
// line (a `#[cfg(test)]` on a method does not end the code).
export function productionText(text) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (/^#\[cfg\(test\)\]/.test(lines[i]) && /^(pub )?mod /.test(lines[i + 1] ?? '')) {
      return lines.slice(0, i).join('\n')
    }
  }
  return text
}

describe('logging', () => {
  it('cuts a file at its test module, not at a #[cfg(test)] on a method', () => {
    const text = ['fn a() {}', '    #[cfg(test)]', 'fn b() { eprintln!("x") }', '#[cfg(test)]', 'mod tests {', '}'].join('\n')
    expect(productionText(text)).toContain('eprintln!("x")')
    expect(productionText(text)).not.toContain('mod tests')
    const top = ['#[cfg(test)]', 'fn helper() {}', 'fn c() { eprintln!("y") }'].join('\n')
    expect(productionText(top)).toContain('eprintln!("y")')
  })

  it('has no eprintln! in the core or the shell (they use the log facade)', () => {
    const found = []
    for (const dir of ['crates/core/src', 'app/src-tauri/src']) {
      for (const file of rustFiles(join(root, dir))) {
        productionText(readFileSync(file, 'utf8'))
          .split('\n')
          .forEach((line, i) => {
            if (line.includes('eprintln!')) found.push(`${relative(root, file)}:${i + 1}`)
          })
      }
    }
    expect(found).toEqual([])
  })
})
