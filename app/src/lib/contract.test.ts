// Contract between the Rust side (core and shell) and the hand-kept TypeScript types.
// The Rust sources are read as text; each case compares the names on the wire.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import commandRs from '../../../crates/core/src/session/command.rs?raw'
import viewRs from '../../../crates/core/src/session/view.rs?raw'
import typesTs from './types.ts?raw'
import apiTs from '../api.ts?raw'
import recoveryTs from './recovery.ts?raw'
import rangeRs from '../../../crates/core/src/config/range.rs?raw'
import { RESET_KEY } from './dailies'
import { REPLACED } from './settingsForm'

// Every shell source, joined: the event names live wherever the shell keeps them.
const shellDir = new URL('../../src-tauri/src/', import.meta.url)
const shellFile = (name: string) => readFileSync(new URL(name, shellDir), 'utf8')
const shellRs = readdirSync(shellDir)
  .filter((f) => f.endsWith('.rs'))
  .sort()
  .map(shellFile)
  .join('\n')
const sessionRs = readFileSync(new URL('../../../crates/core/src/session/mod.rs', import.meta.url), 'utf8')

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
  // The core's commands, and the four Git commands the shell parses itself.
  for (const l of [...block(commandRs, 'pub enum Command {'), ...block(shellRs, 'pub(crate) enum ShellCommand {')]) {
    const m = /^\s+#\[serde\(rename = "([^"]+)"\)\]/.exec(l)
    if (m) rust.add(m[1])
  }
  const ts = new Set<string>()
  for (const m of tsSection(typesTs, 'export type Command =').matchAll(/type: '([^']+)'/g)) ts.add(m[1])
  sameSet(rust, ts)
})

test('event_names_match', () => {
  const rust = new Set<string>()
  for (const m of shellRs.matchAll(/^(?:pub(?:\([a-z]+\))? )?const [A-Z_]+: &str = "([^"]+)";/gm)) rust.add(m[1])
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

/** The string constant `name` of recovery.ts. */
function recoveryConst(name: string): string {
  const m = new RegExp(`^const ${name} = '([^']+)'`, 'm').exec(recoveryTs)
  if (!m) throw new Error(`not found in recovery.ts: ${name}`)
  return m[1]
}

test('the recovered error code matches', () => {
  const rust = /commands::error\("([^"]+)", message\)/.exec(shellFile('recovery.rs'))
  expect(rust, 'the recovered answer in recovery.rs').not.toBeNull()
  const ts = /code === '([^']+)'\) return true/.exec(recoveryTs)
  expect(ts, 'the recovered code in recovery.ts').not.toBeNull()
  expect(rust![1]).toBe('recovered')
  expect(ts![1]).toBe(rust![1])
})

test('the stale refusal text starts as the window expects', () => {
  const m = /"(request is for generation) \{\}/.exec(sessionRs)
  expect(m, 'the stale text in session/mod.rs').not.toBeNull()
  expect(recoveryConst('STALE_TEXT')).toBe(m![1])
})

test('the recovery notices start as the window expects', () => {
  const guard = shellFile('guard.rs')
  const body = guard.slice(0, guard.indexOf('#[cfg(test)]'))
  const notices = [...body.matchAll(/^\s+"(Breccia hit [^"]*)"$/gm)].map((m) => m[1])
  expect(notices.length, 'the three recovery notices').toBe(3)
  const start = recoveryConst('RECOVERY_TEXT')
  expect(notices.filter((n) => !n.startsWith(start))).toEqual([])
})

test('recovered_event_fields_match', () => {
  const rust = new Set<string>()
  for (const l of block(shellFile('recovery.rs'), 'pub(crate) struct RecoveredEvent {')) {
    const m = /^ {4}(\w+):/.exec(l)
    if (m) rust.add(camel(m[1]))
  }
  const ts = new Set<string>()
  for (const l of block(typesTs, 'export interface RecoveredEvent {')) {
    const m = /^ {2}(\w+)\??:/.exec(l)
    if (m) ts.add(m[1])
  }
  sameSet(rust, ts)
})

test('the reset key in ConfigView.replaced is the one the core names', () => {
  expect(rangeRs).toContain(`label: "${RESET_KEY}",`)
})

test('the number keys in ConfigView.replaced are the bounded keys the core names', () => {
  const rows = new Set<string>()
  for (const m of rangeRs.matchAll(/bounded_key!\(\s*"(\w+)",\s*"(\w+)",/g)) rows.add(`[${m[1]}] ${m[2]}`)
  sameSet(rows, new Set(Object.values(REPLACED)))
})
