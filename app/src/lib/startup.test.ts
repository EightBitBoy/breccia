import { describe, expect, it } from 'vitest'
import { allowedWhileOpening, awaitStartupOpen, openingText, startupSequence, type StartupEnv } from './startup'
import type { Notice } from './types'

/** A fake shell: `opening` answers when `answer` is called, and `emit` sends `folder:opened`. */
function fakeShell() {
  const log: string[] = []
  let listener: (() => void) | null = null
  let answer!: (path: string | null) => void
  const asked = new Promise<string | null>((r) => (answer = r))
  return {
    log,
    answer: (path: string | null) => answer(path),
    emit: () => listener?.(),
    subscribed: () => listener !== null,
    env: {
      opening: () => {
        log.push(listener ? 'ask (subscribed)' : 'ask (not subscribed)')
        return asked
      },
      onOpened: (cb: () => void) => {
        listener = cb
        return () => {
          log.push('unsubscribe')
          listener = null
        }
      },
    },
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('awaitStartupOpen', () => {
  it('resolves at once when nothing opens', async () => {
    const shell = fakeShell()
    const shown: string[] = []
    const done = awaitStartupOpen(shell.env, (p) => shown.push(p))
    shell.answer(null)
    await done
    expect(shown).toEqual([])
    expect(shell.log[0]).toBe('ask (subscribed)')
  })

  it('shows the folder and waits for the event', async () => {
    const shell = fakeShell()
    const shown: string[] = []
    let resolved = false
    const done = awaitStartupOpen(shell.env, (p) => shown.push(p)).then(() => (resolved = true))
    shell.answer('C:\\notes\\Work')
    await flush()
    expect(shown).toEqual(['C:\\notes\\Work'])
    expect(resolved).toBe(false)
    shell.emit()
    await done
    expect(resolved).toBe(true)
  })

  it('an event before the answer still resolves', async () => {
    const shell = fakeShell()
    const shown: string[] = []
    const done = awaitStartupOpen(shell.env, (p) => shown.push(p))
    shell.emit()
    shell.answer('C:\\notes\\Work') // the answer was taken before the open ended
    await done
    await flush()
    // Already open: the opening view is not shown after the fact.
    expect(shown).toEqual([])
    expect(shell.log).toEqual(['ask (subscribed)', 'unsubscribe'])
  })

  it('unsubscribes after resolving', async () => {
    const shell = fakeShell()
    const done = awaitStartupOpen(shell.env, () => {})
    shell.answer('C:\\notes\\Work')
    await flush()
    shell.emit()
    await done
    expect(shell.subscribed()).toBe(false)
    expect(shell.log).toContain('unsubscribe')
  })
})

function fakeStartup(folderOpen: boolean, notices: Notice[]) {
  const shell = fakeShell()
  const steps: string[] = []
  const env: StartupEnv = {
    ...shell.env,
    show: (p) => steps.push(`show ${p}`),
    folderStatus: async () => {
      steps.push('folder.status')
      return folderOpen
    },
    gitStatus: async () => void steps.push('git.status'),
    openFolder: async () => void steps.push('openFolder'),
    notices: async () => {
      steps.push('notices')
      return notices
    },
    notify: (n) => steps.push(`notify ${n.message}`),
  }
  return { shell, steps, env }
}

describe('startupSequence', () => {
  it('opens the folder once the shell has opened it', async () => {
    const { shell, steps, env } = fakeStartup(true, [])
    const done = startupSequence(env)
    shell.answer('C:\\notes\\Work')
    await flush()
    expect(steps).toEqual(['show C:\\notes\\Work'])
    shell.emit()
    expect(await done).toBe('folder')
    expect(steps).toEqual(['show C:\\notes\\Work', 'folder.status', 'git.status', 'openFolder', 'notices'])
  })

  it('failed open shows the notices', async () => {
    const refused: Notice = { kind: 'refused', message: 'The folder C:\\notes\\Gone no longer exists.' }
    const { shell, steps, env } = fakeStartup(false, [refused])
    const done = startupSequence(env)
    shell.answer('C:\\notes\\Gone')
    await flush()
    shell.emit()
    expect(await done).toBe('welcome')
    expect(steps).toEqual([
      'show C:\\notes\\Gone',
      'folder.status',
      'git.status',
      'notices',
      `notify ${refused.message}`,
    ])
  })

  it('asks nothing of the core before the open ends', async () => {
    const { shell, steps, env } = fakeStartup(true, [])
    const done = startupSequence(env)
    shell.answer('C:\\notes\\Work')
    await flush()
    await flush()
    expect(steps).not.toContain('folder.status')
    shell.emit()
    await done
    expect(steps).toContain('folder.status')
  })
})

describe('openingText', () => {
  it('names the folder, not its whole path', () => {
    expect(openingText('C:\\notes\\Work')).toBe('Opening Work…')
    expect(openingText('/home/a/notes/')).toBe('Opening notes…')
    expect(openingText('D:\\')).toBe('Opening D:\\…')
  })
})

describe('allowedWhileOpening', () => {
  it('lets only the help, the theme and the zoom work while "Opening…" shows', () => {
    for (const id of ['help', 'theme', 'zoom']) expect(allowedWhileOpening(id), id).toBe(true)
    for (const id of ['git', 'gitLog', 'dailies', 'index', 'unknown']) expect(allowedWhileOpening(id), id).toBe(false)
  })
})
