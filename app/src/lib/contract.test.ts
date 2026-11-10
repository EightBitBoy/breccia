// Contract between the Rust side (core and shell) and the hand-kept TypeScript types.
// The Rust sources are read as text; each case compares the names on the wire.
import { expect, test } from 'vitest'
import commandRs from '../../../crates/core/src/session/command.rs?raw'
import viewRs from '../../../crates/core/src/session/view.rs?raw'
import libRs from '../../src-tauri/src/lib.rs?raw'
import typesTs from './types.ts?raw'
import apiTs from '../api.ts?raw'

const lines = (s: string) => s.replace(/\r\n/g, '\n').split('\n')

/** The lines between `start` and the first line that is exactly `}`. */
function block(src: string, start: string): string[] {
  const all = lines(src)
  const i = all.findIndex((l) => l.startsWith(start))
  if (i < 0) throw new Error(`not found: ${start}`)
  const end = all.indexOf('}', i + 1)
  if (end < 0) throw new Error(`no closing brace after: ${start}`)
  return all.slice(i + 1, end)
}

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)

function sameSet(rust: Set<string>, ts: Set<string>) {
  expect(rust.size, 'the Rust side must not be empty').toBeGreaterThan(0)
  const onlyRust = [...rust].filter((x) => !ts.has(x)).sort()
  const onlyTs = [...ts].filter((x) => !rust.has(x)).sort()
  expect({ onlyRust, onlyTs }).toEqual({ onlyRust: [], onlyTs: [] })
}

/** The part of a TypeScript source from `start` up to the next line that begins with `export`. */
function tsSection(src: string, start: string): string {
  const all = lines(src)
  const i = all.findIndex((l) => l.startsWith(start))
  if (i < 0) throw new Error(`not found: ${start}`)
  let end = all.length
  for (let j = i + 1; j < all.length; j++) {
    if (all[j].startsWith('export')) {
      end = j
      break
    }
  }
  return all.slice(i, end).join('\n')
}

test('command_names_match', () => {
  const rust = new Set<string>()
  for (const l of block(commandRs, 'pub enum Command {')) {
    const m = /^\s+#\[serde\(rename = "([^"]+)"\)\]/.exec(l)
    if (m) rust.add(m[1])
  }
  const ts = new Set<string>()
  for (const m of tsSection(typesTs, 'export type Command =').matchAll(/type: '([^']+)'/g)) ts.add(m[1])
  sameSet(rust, ts)
})

test('event_names_match', () => {
  const rust = new Set<string>()
  for (const m of libRs.matchAll(/^const [A-Z_]+: &str = "([^"]+)";/gm)) rust.add(m[1])
  const ts = new Set<string>()
  for (const m of apiTs.matchAll(/^export const [A-Z_]+ = '([^']+)'/gm)) {
    if (/^[a-z]+:[a-z]+$/.test(m[1])) ts.add(m[1])
  }
  const rustEvents = new Set([...rust].filter((x) => /^[a-z]+:[a-z]+$/.test(x)))
  sameSet(rustEvents, ts)
})

test('output_fields_match', () => {
  const rust = new Set<string>()
  for (const l of block(viewRs, 'pub struct Output {')) {
    const m = /^ {4}pub (\w+):/.exec(l)
    if (m) rust.add(camel(m[1]))
  }
  const ts = new Set<string>()
  for (const l of block(typesTs, 'export interface Output {')) {
    const m = /^ {2}(\w+)\??:/.exec(l)
    if (m) ts.add(m[1])
  }
  sameSet(rust, ts)
})

test('notice_kinds_match', () => {
  const rust = new Set<string>()
  for (const l of block(viewRs, 'pub enum Notice {')) {
    if (/^\s*(\/\/\/|#\[)/.test(l)) continue
    const m = /^ {4}([A-Z]\w*)/.exec(l)
    if (m) rust.add(lowerFirst(m[1]))
  }
  const ts = new Set<string>()
  for (const m of tsSection(typesTs, 'export type Notice =').matchAll(/kind: '([^']+)'/g)) ts.add(m[1])
  sameSet(rust, ts)
})
