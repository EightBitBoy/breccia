// Writes of config.toml from Settings and the board dialog.
import type { Command, GitSettings } from './types'

export interface WriteEnv {
  /** `ConfigView.version` of the settings shown now. */
  version(): number
  /** The editor leaves its block. */
  leave(): void
  /** Typed text is sent first (§2). */
  flush(): Promise<void>
  /** Sends the write; true when the core accepted it. */
  send(cmd: Command): Promise<boolean>
}

/**
 * Sends a write made from the settings shown when it was decided: `version` is captured before the flush (or earlier,
 * by the caller: when a dialog opened or a question was asked), so a hand edit or pull that arrives meanwhile makes
 * the core refuse the write (`configChanged`) instead of the old values landing on the new file (§2).
 */
export async function writeConfig(
  env: WriteEnv,
  build: (version: number) => Command,
  version: number = env.version(),
): Promise<boolean> {
  env.leave()
  await env.flush()
  return env.send(build(version))
}

/**
 * Runs config writes one at a time: each starts once the previous answer is applied, so it is made from, and carries
 * the version of, the settings that answer left. Two quick changes in a row (minutes then the Git switch, ↑ ↑ on a
 * board) are then never refused as "changed on disk".
 */
export class WriteQueue {
  private last: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.last.then(task, task)
    this.last = next.catch(() => {})
    return next
  }
}

/** `config.setGit` with `patch` over the Git settings shown when it is sent: only what the user changed changes. */
export function gitCommand(shown: GitSettings, patch: Partial<GitSettings>, version: number): Command {
  const g = { ...shown, ...patch }
  return {
    type: 'config.setGit',
    enabled: g.enabled,
    commitDelayMinutes: g.commitDelayMinutes,
    pullIntervalMinutes: g.pullIntervalMinutes,
    version,
  }
}

/**
 * The version a board dialog's save carries: the current one when no hand edit or pull came since the dialog opened
 * (`foreignSince <= openedAt`), so the user's own Settings changes meanwhile never refuse it; else the version it
 * opened on, so the core refuses it and the hand edit is not overwritten.
 */
export function dialogVersion(openedAt: number, current: number, foreignSince: number): number {
  return foreignSince <= openedAt ? current : openedAt
}

/**
 * The foreign version after a write that carried `sent` was refused as `configChanged`, with `current` shown. Sent at
 * `current`, the refusal means the core read a changed file again (no `config:changed` follows), so every version
 * after `current` counts as foreign. Sent at an older version (a board dialog's intended refusal), the core read
 * nothing new, and nothing changes.
 */
export function foreignAfterRefusal(foreignSince: number, current: number, sent: number | undefined): number {
  return sent === current ? Math.max(foreignSince, current + 1) : foreignSince
}
