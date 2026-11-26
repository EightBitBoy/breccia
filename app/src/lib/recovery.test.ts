import { expect, test } from 'vitest'
import { AGAIN, NEEDS_RESTART, NOT_ANSWERING, RELOAD_WAIT_MS, Recovery } from './recovery'
import { UNANSWERED } from './notices'
import type { Command, Notice, RecoveredEvent } from './types'

const RELOADED = 'Breccia hit an internal error and reloaded your notes from disk. Everything saved is safe; undo starts afresh.'
const KEPT =
  "Breccia hit an internal error. Some changes are not saved yet, so your notes were not reloaded. Copy what you need from the 'could not be saved' notices, then restart Breccia."
const CLOSED = 'Breccia hit an internal error and closed the notes folder. Open it again with Open folder… or from Recent folders.'
const STALE = 'request is for generation 3, the session is at 4'

const reopened: RecoveredEvent = { reopened: true, notice: { kind: 'refused', message: RELOADED } }
const kept: RecoveredEvent = { reopened: false, notice: { kind: 'refused', message: KEPT } }
const typed: Command = { type: 'block.setText', id: 4, text: 'my words' }

/**
 * A fake env with a clock and timers the test moves; `flush` and `reload` finish when the test says so (`finish`), or
 * fail (`fail`), or never (the test does neither).
 */
function setup() {
  const s = {
    clock: 1_000_000,
    notices: [] as Notice[],
    calls: [] as string[],
    finish: [] as (() => void)[],
    fail: [] as ((e: Error) => void)[],
    /** The timers started and not yet run or cleared, by id, with the clock time they are due at. */
    timers: new Map<number, { f: () => void; due: number }>(),
    /** The sent `block.setText` texts with no answer yet. */
    unanswered: [] as { id: number; text: string }[],
  }
  let nextTimer = 1
  const step = (name: string) => () => {
    s.calls.push(name)
    return new Promise<void>((resolve, reject) => {
      s.finish.push(resolve)
      s.fail.push(reject)
    })
  }
  const recovery = new Recovery({
    notify: (n) => void s.notices.push(n),
    leave: () => void s.calls.push('leave'),
    clear: () => void s.calls.push('clear'),
    flush: step('flush'),
    reload: step('reload'),
    now: () => s.clock,
    unanswered: () => s.unanswered,
    setTimeout: (f, ms) => {
      const id = nextTimer++
      s.timers.set(id, { f, due: s.clock + ms })
      return id
    },
    clearTimeout: (id) => void s.timers.delete(id as number),
  })
  /** Lets every started step finish, until none is left. */
  const settle = async () => {
    for (let i = 0; i < 10; i++) {
      s.finish.splice(0).forEach((f) => f())
      s.fail.splice(0)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  /** One step of the queue: the promises started so far settle their callbacks. */
  const tick = () => new Promise((r) => setTimeout(r, 0))
  /** `ms` pass: the timers due by then run. */
  const pass = async (ms: number) => {
    s.clock += ms
    for (const [id, t] of [...s.timers]) {
      if (t.due > s.clock) continue
      s.timers.delete(id)
      t.f()
    }
    await tick()
    await tick()
  }
  return { s, recovery, settle, tick, pass }
}

test('shows_the_notice_and_reloads_once', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.notices).toEqual([reopened.notice])
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
})

test('a_second_error_during_the_reload_asks_for_a_restart_when_it_ends', async () => {
  const { s, recovery, settle } = setup()
  const first = recovery.recovered(reopened)
  s.finish.splice(0).forEach((f) => f()) // the flush ends; the reload runs
  await new Promise((r) => setTimeout(r, 0))
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  const second = recovery.recovered(reopened) // the reload itself met an internal error
  expect(s.notices).toEqual([reopened.notice]) // not yet: the reload still runs
  await settle()
  await Promise.all([first, second])
  // One reload, and the last word is the restart, not "reloaded".
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  expect(s.notices).toEqual([reopened.notice, { kind: 'refused', message: AGAIN }])
})

test('a_kept_session_during_the_reload_shows_its_notice', async () => {
  const { s, recovery, settle } = setup()
  const first = recovery.recovered(reopened)
  void recovery.recovered(kept)
  expect(s.notices).toEqual([reopened.notice, kept.notice])
  await Promise.all([first, settle()])
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
})

test('the_old_view_is_left_and_cleared_before_anything_waits', () => {
  // Typed text goes first (leave), then no block of the old session can be clicked or edited (clear), both at once.
  const { s, recovery } = setup()
  void recovery.recovered(reopened)
  expect(s.calls).toEqual(['leave', 'clear', 'flush'])
})

test('flush_comes_before_reload', async () => {
  const { s, recovery } = setup()
  void recovery.recovered(reopened)
  expect(s.calls).toEqual(['leave', 'clear', 'flush'])
  s.finish.splice(0).forEach((f) => f())
  await new Promise((r) => setTimeout(r, 0))
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
})

test('a_kept_session_leaves_the_view_alone', async () => {
  const { s, recovery } = setup()
  await recovery.recovered(kept)
  expect(s.calls).toEqual([])
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
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  expect(s.notices).toEqual([reopened.notice, { kind: 'refused', message: AGAIN }])
  expect(AGAIN).toBe('Breccia hit an internal error again. Please restart Breccia.')
  // After a minute it reloads again.
  s.clock += 61_000
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload', 'leave', 'clear', 'flush', 'reload'])
})

/** Whether a refusal with `code` of `cmd` stays unshown. */
const quiet = (r: Recovery, code: string | null, cmd: Command | null) => r.message(code, cmd, 'raw') === null

test('message_hides_recovered_always', () => {
  const { recovery } = setup()
  expect(quiet(recovery, 'recovered', null)).toBe(true)
  expect(quiet(recovery, 'recovered', { type: 'search.query', text: 'x' })).toBe(true)
  expect(recovery.message('unknownPage', null, 'No such page')).toBe('No such page')
  expect(recovery.message(null, null, 'raw')).toBe('raw')
})

test('message_hides_stale_only_around_a_reload', async () => {
  const { s, recovery, tick } = setup()
  expect(quiet(recovery, 'stale', null)).toBe(false)
  void recovery.recovered(reopened)
  expect(quiet(recovery, 'stale', null)).toBe(true) // while it flushes
  s.finish.splice(0).forEach((f) => f())
  await tick()
  expect(quiet(recovery, 'stale', { type: 'page.get', key: 'p' })).toBe(true) // while it reloads
  s.finish.splice(0).forEach((f) => f())
  await tick()
  s.clock += 2_000
  expect(quiet(recovery, 'stale', null)).toBe(true) // just after it ended
  s.clock += 1
  expect(quiet(recovery, 'stale', null)).toBe(false)
})

test('an_event_with_no_failed_command_still_reloads', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  expect(s.notices).toEqual([reopened.notice])
})

test('message_hides_the_recovery_texts_while_the_notice_is_shown', async () => {
  const { s, recovery, settle } = setup()
  expect(recovery.message(null, null, RELOADED)).toBe(RELOADED) // no recovery yet
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(recovery.message(null, null, RELOADED)).toBeNull() // a command that met it says the same
  expect(recovery.message(null, null, AGAIN)).toBeNull()
  expect(recovery.message(null, null, 'No such page')).toBe('No such page')
  s.clock += 60_000
  expect(recovery.message(null, null, RELOADED)).toBe(RELOADED)
})

test('message_hides_a_stale_answer_only_around_a_reload', async () => {
  const { s, recovery, tick } = setup()
  expect(recovery.message(null, null, STALE)).toBe(STALE)
  void recovery.recovered(reopened)
  expect(recovery.message(null, null, STALE)).toBeNull()
  for (let i = 0; i < 2; i++) {
    s.finish.splice(0).forEach((f) => f())
    await tick()
  }
  s.clock += 2_001
  expect(recovery.message(null, null, STALE)).toBe(STALE)
})

test('a_failed_flush_still_reloads', async () => {
  const { s, recovery, tick, settle } = setup()
  const run = recovery.recovered(reopened)
  s.fail.splice(0).forEach((f) => f(new Error('boom')))
  s.finish.splice(0)
  await tick()
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  await Promise.all([run, settle()])
  expect(s.notices).toEqual([reopened.notice])
})

test('a_flush_that_does_not_answer_in_10_s_reloads_anyway_and_keeps_the_text_to_copy', async () => {
  const { s, recovery, pass, settle } = setup()
  s.unanswered = [
    { id: 4, text: 'my words' },
    { id: 7, text: 'more words' },
  ]
  const run = recovery.recovered(reopened)
  expect(RELOAD_WAIT_MS).toBe(10_000)
  s.finish.splice(0) // the flush never answers
  await pass(RELOAD_WAIT_MS - 1)
  expect(s.calls).toEqual(['leave', 'clear', 'flush']) // still waiting
  expect(s.notices).toEqual([reopened.notice])
  await pass(1)
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  const copy = (block: number, mine: string): Notice => ({ kind: 'conflict', page: '', block, mine, theirs: null, message: UNANSWERED })
  expect(s.notices).toEqual([reopened.notice, copy(4, 'my words'), copy(7, 'more words')])
  expect(UNANSWERED).toBe('Breccia did not answer, so this text may not have been saved. Copy it from here:')
  await Promise.all([run, settle()])
  expect(s.timers.size).toBe(0) // the reload answered: its timer is gone
})

test('a_flush_that_answers_in_time_starts_no_copy_notice', async () => {
  const { s, recovery, settle, pass } = setup()
  s.unanswered = [{ id: 4, text: 'my words' }]
  await Promise.all([recovery.recovered(reopened), settle()])
  await pass(RELOAD_WAIT_MS)
  expect(s.notices).toEqual([reopened.notice])
  expect(s.timers.size).toBe(0)
})

test('a_reload_that_is_refused_shows_NOT_ANSWERING', async () => {
  const { s, recovery, tick } = setup()
  const run = recovery.recovered(reopened)
  s.finish.splice(0).forEach((f) => f()) // the flush answers
  s.fail.splice(0)
  await tick()
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
  s.fail.splice(0).forEach((f) => f(new Error('refused')))
  await run // it ends; the notice says what to do
  expect(s.notices).toEqual([reopened.notice, { kind: 'refused', message: NOT_ANSWERING }])
  expect(NOT_ANSWERING).toBe('Breccia is not answering. Please restart Breccia.')
  s.clock += 2_001
  expect(quiet(recovery, 'stale', null)).toBe(false)
})

test('a_reload_that_does_not_answer_shows_NOT_ANSWERING_after_10_s', async () => {
  const { s, recovery, tick, pass } = setup()
  const run = recovery.recovered(reopened)
  s.finish.splice(0).forEach((f) => f())
  s.fail.splice(0)
  await tick()
  s.finish.splice(0) // the reload never answers
  await pass(RELOAD_WAIT_MS - 1)
  await pass(1)
  await run
  expect(s.notices).toEqual([reopened.notice, { kind: 'refused', message: NOT_ANSWERING }])
})

test('a_flush_and_a_reload_that_both_hang_end_in_the_restart_notice_after_20_s', async () => {
  const { s, recovery, pass } = setup()
  s.unanswered = [{ id: 4, text: 'my words' }]
  const run = recovery.recovered(reopened)
  s.finish.splice(0)
  await pass(RELOAD_WAIT_MS)
  s.finish.splice(0)
  await pass(RELOAD_WAIT_MS)
  await run
  expect(s.notices.map((n) => n.message)).toEqual([RELOADED, UNANSWERED, NOT_ANSWERING])
})

test('after_the_again_notice_a_stale_refusal_says_NEEDS_RESTART', async () => {
  const { s, recovery, settle } = setup()
  await Promise.all([recovery.recovered(reopened), settle()])
  s.clock += 30_000
  expect(recovery.message('stale', null, STALE)).toBe(STALE) // a reload that helped: the raw text, as before
  await recovery.recovered(reopened)
  expect(s.notices.at(-1)).toEqual({ kind: 'refused', message: AGAIN })
  expect(recovery.message('stale', { type: 'page.show', key: 'p' }, STALE)).toBe(NEEDS_RESTART)
  expect(recovery.message(null, null, STALE)).toBe(NEEDS_RESTART) // the same refusal, as a notice's text
  expect(recovery.message('unknownPage', null, 'No such page')).toBe('No such page')
  expect(NEEDS_RESTART).toBe('Not done: Breccia needs a restart after an internal error.')
})

test('after_NOT_ANSWERING_a_stale_refusal_says_NEEDS_RESTART', async () => {
  const { s, recovery, tick } = setup()
  const run = recovery.recovered(reopened)
  s.finish.splice(0).forEach((f) => f())
  s.fail.splice(0)
  await tick()
  s.fail.splice(0).forEach((f) => f(new Error('refused')))
  await run
  s.clock += 2_001
  expect(recovery.message('stale', null, STALE)).toBe(NEEDS_RESTART)
})

test('typed_text_keeps_its_notice_in_every_case', async () => {
  const { s, recovery, tick, settle } = setup()
  const each = () => {
    for (const code of ['recovered', 'stale', 'unknownBlock', null]) {
      expect(recovery.message(code, typed, STALE)).toBe(STALE)
      expect(recovery.message(code, typed, RELOADED)).toBe(RELOADED)
    }
  }
  each() // before any error
  const run = recovery.recovered(reopened)
  each() // while it flushes
  s.finish.splice(0).forEach((f) => f())
  await tick()
  each() // while it reloads
  await Promise.all([run, settle()])
  each() // just after it
  s.clock += 30_000
  await recovery.recovered(reopened)
  each() // after the again notice
})

test('within_a_minute_a_reopened_session_after_a_kept_one_shows_its_notice_the_same_notice_twice_stays_quiet', async () => {
  const { s, recovery, settle } = setup()
  await recovery.recovered(kept)
  s.clock += 10_000
  await recovery.recovered(kept)
  expect(s.notices).toEqual([kept.notice]) // the same words again: quiet
  s.clock += 10_000
  await Promise.all([recovery.recovered(reopened), settle()])
  expect(s.notices).toEqual([kept.notice, reopened.notice]) // something else happened: shown
  expect(s.calls).toEqual(['leave', 'clear', 'flush', 'reload'])
})

test('within_a_minute_a_closed_folder_after_a_kept_session_shows_its_notice', async () => {
  const { s, recovery, settle } = setup()
  await recovery.recovered(kept)
  s.clock += 10_000
  const closed: RecoveredEvent = { reopened: true, notice: { kind: 'refused', message: CLOSED } }
  await Promise.all([recovery.recovered(closed), settle()])
  expect(s.notices).toEqual([kept.notice, closed.notice])
})
