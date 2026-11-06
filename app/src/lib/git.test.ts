import { describe, expect, it } from 'vitest'
import { ago, gitClick, gitItem } from './git'
import type { GitView } from './types'

const min = 60_000
const now = Date.UTC(2026, 9, 30, 12, 0)
const v = (o: Partial<GitView>): GitView => ({ state: 'ready', top: 'C:/notes', remote: null, ahead: 0, lastCommit: null, lastSync: null, head: 'abc', problem: null, ...o })

describe('ago', () => {
  it('counts minutes, hours, then names the day', () => {
    expect(ago(now - 30_000, now)).toBe('just now')
    expect(ago(now - 2 * min, now)).toBe('2 min ago')
    expect(ago(now - 3 * 60 * min, now)).toBe('3 h ago')
    expect(ago(Date.UTC(2026, 9, 3, 12, 0), now)).toBe('on 3 Oct') // local date: holds for UTC-12..UTC+11
    expect(ago(now + 5 * min, now)).toBe('just now') // a future time
  })
})

describe('gitItem', () => {
  it('says saved, synced or not pushed', () => {
    expect(gitItem(v({ lastCommit: now - 2 * min }), now)?.text).toBe('Saved to Git 2 min ago')
    expect(gitItem(v({}), now)?.text).toBe('Not yet saved to Git')
    expect(gitItem(v({ remote: 'origin', lastSync: now - 2 * min }), now)?.text).toBe('Synced 2 min ago')
    expect(gitItem(v({ remote: 'origin' }), now)?.text).toBe('Synced')
    expect(gitItem(v({ remote: 'origin', ahead: 3 }), now)?.text).toBe('3 changes not pushed')
    expect(gitItem(v({ remote: 'origin', ahead: 1 }), now)?.text).toBe('1 change not pushed')
  })
  it('says what is running', () => {
    expect(gitItem(v({ state: 'working', remote: 'origin' }), now)?.text).toBe('Syncing with Git…')
    expect(gitItem(v({ state: 'working' }), now)?.text).toBe('Saving to Git…')
  })
  it('is red only for what the user must fix', () => {
    const conflict = gitItem(v({ state: 'problem', problem: { kind: 'conflict', red: true, message: 'Your notes and the remote both changed pages/A.md.' } }), now)!
    expect([conflict.text, conflict.tone]).toEqual(['Git sync stopped: conflict', 'warning'])
    expect(conflict.tip).toContain('pages/A.md')
    expect(conflict.tip).toContain('C:/notes')
    const off = gitItem(v({ state: 'problem', remote: 'origin', ahead: 2, problem: { kind: 'unreachable', red: false, message: 'x' } }), now)!
    expect([off.text, off.tone]).toEqual(["Can't reach the remote · 2 changes not pushed", 'normal'])
    const other = gitItem(v({ state: 'problem', problem: { kind: 'weird', red: true, message: 'x' } }), now)!
    expect(other.text).toBe('Git failed')
    const locked = gitItem(v({ state: 'problem', problem: { kind: 'locked', red: true, message: 'delete .git/index.lock' } }), now)!
    expect([locked.text, locked.tone]).toEqual(['Git is locked: .git/index.lock', 'warning'])
    const ssh = gitItem(v({ state: 'problem', problem: { kind: 'sshKey', red: true, message: 'x' } }), now)!
    expect(ssh.text).toBe('Git needs your SSH key')
    expect(gitClick(v({ state: 'problem', problem: { kind: 'sshKey', red: true, message: 'x' } }))).toBe('explain')
    const refused = gitItem(v({ state: 'problem', problem: { kind: 'rebaseRefused', red: true, message: 'x' } }), now)!
    expect(refused.text).toBe('Git sync stopped: the pull could not start')
  })
  it('offers set-up, says when Git is missing, and hides when off', () => {
    expect(gitItem(v({ state: 'notRepo' }), now)?.text).toBe('Not in Git · Set up…')
    expect(gitItem(v({ state: 'noGit' }), now)?.text).toBe('Git not found')
    expect(gitItem(v({ state: 'off' }), now)).toBeNull()
    expect(gitItem(v({}), now)).toMatchObject({ id: 'git', side: 'right', order: 10, action: true, progress: null })
  })
})

describe('gitClick', () => {
  it('maps states to actions', () => {
    expect(gitClick(v({ state: 'notRepo' }))).toBe('init')
    expect(gitClick(v({ state: 'noGit' }))).toBe('explain')
    expect(gitClick(v({ state: 'off' }))).toBe('none')
    expect(gitClick(v({ state: 'problem', problem: { kind: 'identity', red: true, message: '' } }))).toBe('explain')
    expect(gitClick(v({ state: 'problem', problem: { kind: 'unreachable', red: false, message: '' } }))).toBe('sync')
    expect(gitClick(v({}))).toBe('sync')
  })
})
