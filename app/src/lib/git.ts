// Git's status bar item (§7.9, §7.13): the texts, the tone and what a click does.
import type { StatusItem } from './status'
import type { GitView } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How long ago `thenMs` was; a time in the future (a fast clock elsewhere) reads as now. */
export function ago(thenMs: number, nowMs: number): string {
  const s = (nowMs - thenMs) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = new Date(thenMs)
  return `on ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const RED_TEXTS: Record<string, string> = {
  conflict: 'Git sync stopped: conflict',
  identity: 'Git needs your name and email',
  busy: 'Git is busy: finish it with Git tools',
  locked: 'Git is locked: .git/index.lock',
  dirtyOutside: 'Git sync paused: changes outside the notes folder',
  detached: 'Git: not on a branch',
  noRemoteChoice: 'Git: choose a remote',
  commitRefused: 'Git refused the commit',
  sshKey: 'Git needs your SSH key',
  rebaseRefused: 'Git sync stopped: the pull could not start',
}

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} not pushed`

function textOf(v: GitView, nowMs: number): string {
  switch (v.state) {
    case 'noGit':
      return 'Git not found'
    case 'notRepo':
      return 'Not in Git · Set up…'
    case 'working':
      return v.remote ? 'Syncing with Git…' : 'Saving to Git…'
    case 'problem': {
      const p = v.problem
      if (p && !p.red && p.kind === 'unreachable') {
        return v.ahead > 0 ? `Can't reach the remote · ${changes(v.ahead)}` : "Can't reach the remote"
      }
      return (p && RED_TEXTS[p.kind]) || 'Git failed'
    }
    default:
      if (v.remote) {
        if (v.ahead > 0) return changes(v.ahead)
        return v.lastSync === null ? 'Synced' : `Synced ${ago(v.lastSync, nowMs)}`
      }
      return v.lastCommit === null ? 'Not yet saved to Git' : `Saved to Git ${ago(v.lastCommit, nowMs)}`
  }
}

/** The status bar item for Git; null when Git is off. */
export function gitItem(v: GitView, nowMs: number): StatusItem | null {
  if (v.state === 'off') return null
  const tip = [v.top, v.state === 'problem' && v.problem ? v.problem.message : null].filter((s): s is string => !!s)
  const red = v.state === 'problem' && v.problem?.red === true
  return {
    id: 'git',
    side: 'right',
    order: 10,
    text: textOf(v, nowMs),
    progress: null,
    tone: red ? 'warning' : 'normal',
    action: true,
    tip: tip.length === 2 ? `${tip[0]}\n\n${tip[1]}` : tip[0],
  }
}

/** What clicking the item does. */
export function gitClick(v: GitView): 'sync' | 'init' | 'explain' | 'none' {
  if (v.state === 'off') return 'none'
  if (v.state === 'notRepo') return 'init'
  if (v.state === 'noGit' || (v.state === 'problem' && v.problem?.red === true)) return 'explain'
  return 'sync'
}
