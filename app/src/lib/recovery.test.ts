import { expect, test } from 'vitest'
import { AGAIN, Recovery } from './recovery'
import type { Notice, RecoveredEvent } from './types'

const RELOADED = 'Breccia hit an internal error and reloaded your notes from disk. Everything saved is safe; undo starts afresh.'
const KEPT =
  "Breccia hit an internal error. Some changes are not saved yet, so your notes were not reloaded. Copy what you need from the 'could not be saved' notices, then restart Breccia."
const STALE = 'request is for generation 3, the session is at 4'

const reopened: RecoveredEvent = { reopened: true, notice: { kind: 'refused', message: RELOADED } }
const kept: RecoveredEvent = { reopened: false, notice: { kind: 'refused', message: KEPT } }

/** A fake env with a clock the test moves; `flush` and `reload` finish when the test says so. */
function setup() {
  const s = {
    clock: 1_000_000,
    notices: [] as Notice[],
    calls: [] as string[],
    finish: [] as (() => void)[],
  }
  const step = (name: string) => () => {
    s.calls.push(name)
    return new Promise<void>((resolve) => s.finish.push(resolve))
  }
  const recovery = new Recovery({
    notify: (n) => void s.notices.push(n),
    flush: step('flush'),
    reload: step('reload'),
    now: () => s.clock,
  })
  /** Lets every started step finish, until none is left. */
  const settle = async () => {
    for (let i = 0; i < 10; i++) {
      s.finish.splice(0).forEach((f) => f())
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { s, recovery, settle }
}

test('shows_the_notice_and_reloads_once', async () => {
  const { s, recovery, settle } = setup()
  const first = recovery.recovered(reopened)
  const second = recovery.recovered(reopened) // while the first reload runs: it joins
  await settle()
  await Promise.all([first, second])
  expect(s.notices).toEqual([reopened.notice])
  expect(s.calls).toEqual(['flush', 'reload'])
})

test('flush_comes_before_reload', async () => {
  const { s, recovery } = setup()
  void recovery.recovered(reopened)
  expect(s.calls).toEqual(['flush'])
  s.finish.splice(0).forEach((f) => f())
  await new Promise((r) => setTimeout(r, 0))
  expect(s.calls).toEqual(['flush', 'reload'])
})

test('kept_shows_the_notice_and_does_not_reload', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(kept), settle()])
  expect(s.notices).toEqual([kept.notice])
  expect(s.calls).toEqual([])
})

test('a_second_recovery_within_a_minute_adds_no_notice', async () => {
  const { s, recovery } = setup()
  await recovery.recovered(kept)
  s.clock += 59_000
  await recovery.recovered(kept)
  expect(s.notices).toEqual([kept.notice])
  s.clock += 61_000
  await recovery.recovered(kept)
  expect(s.notices).toEqual([kept.notice, kept.notice])
})

test('a_second_reload_within_a_minute_asks_for_a_restart_instead', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(reopened), settle()])
  s.clock += 30_000
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.calls).toEqual(['flush', 'reload'])
  expect(s.notices).toEqual([reopened.notice, { kind: 'refused', message: AGAIN }])
  expect(AGAIN).toBe('Breccia hit an internal error again. Please restart Breccia.')
  // After a minute it reloads again.
  s.clock += 61_000
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.calls).toEqual(['flush', 'reload', 'flush', 'reload'])
})

test('quiet_hides_recovered_always', () => {
  const { recovery } = setup()
  expect(recovery.quiet('recovered', null)).toBe(true)
  expect(recovery.quiet('recovered', { type: 'search.query', text: 'x' })).toBe(true)
  expect(recovery.quiet('unknownPage', null)).toBe(false)
  expect(recovery.quiet(null, null)).toBe(false)
})

test('quiet_hides_stale_only_around_a_reload', async () => {
  const { s, recovery } = setup()
  expect(recovery.quiet('stale', null)).toBe(false)
  void recovery.recovered(reopened)
  expect(recovery.quiet('stale', null)).toBe(true) // while it flushes
  s.finish.splice(0).forEach((f) => f())
  await new Promise((r) => setTimeout(r, 0))
  expect(recovery.quiet('stale', { type: 'page.get', key: 'p' })).toBe(true) // while it reloads
  s.finish.splice(0).forEach((f) => f())
  await new Promise((r) => setTimeout(r, 0))
  s.clock += 2_000
  expect(recovery.quiet('stale', null)).toBe(true) // just after it ended
  s.clock += 1
  expect(recovery.quiet('stale', null)).toBe(false)
})

test('quiet_never_hides_typed_text', () => {
  const { recovery } = setup()
  void recovery.recovered(reopened)
  const typed = { type: 'block.setText' as const, id: 4, text: 'my words' }
  expect(recovery.quiet('stale', typed)).toBe(false)
  expect(recovery.quiet('recovered', typed)).toBe(false)
})

test('an_event_with_no_failed_command_still_reloads', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.calls).toEqual(['flush', 'reload'])
  expect(s.notices).toEqual([reopened.notice])
})

test('quiet_message_hides_the_recovery_texts_while_the_notice_is_shown', async () => {
  const { s, recovery, settle } = setup()
  expect(recovery.quietMessage(RELOADED)).toBe(false) // no recovery yet
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(recovery.quietMessage(RELOADED)).toBe(true) // a command that met it says the same
  expect(recovery.quietMessage(AGAIN)).toBe(true)
  expect(recovery.quietMessage('No such page')).toBe(false)
  s.clock += 60_000
  expect(recovery.quietMessage(RELOADED)).toBe(false)
})

test('quiet_message_hides_a_stale_answer_only_around_a_reload', async () => {
  const { s, recovery } = setup()
  expect(recovery.quietMessage(STALE)).toBe(false)
  void recovery.recovered(reopened)
  expect(recovery.quietMessage(STALE)).toBe(true)
  for (let i = 0; i < 2; i++) {
    s.finish.splice(0).forEach((f) => f())
    await new Promise((r) => setTimeout(r, 0))
  }
  s.clock += 2_001
  expect(recovery.quietMessage(STALE)).toBe(false)
})

test('a_failed_reload_ends_the_reload_and_rejects', async () => {
  const s = { clock: 0 }
  const recovery = new Recovery({
    notify: () => {},
    flush: () => Promise.resolve(),
    reload: () => Promise.reject(new Error('boom')),
    now: () => s.clock,
  })
  await expect(recovery.recovered(reopened)).rejects.toThrow('boom')
  s.clock += 2_001
  expect(recovery.quiet('stale', null)).toBe(false)
})
