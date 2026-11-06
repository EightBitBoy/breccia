import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { devConfig, devEnv, prepareRun } from './dev.mjs'

const CONF = {
  identifier: 'dev.breccia.app',
  app: { windows: [{ label: 'main', title: 'Breccia', width: 1100 }], security: { csp: 'x' } },
}

describe('dev runs', () => {
  it('a_dev_run_has_its_own_identifier_and_window_title', () => {
    expect(devConfig(CONF)).toEqual({
      identifier: 'dev.breccia.app.dev',
      app: { windows: [{ label: 'main', title: 'Breccia (dev)', width: 1100 }] },
    })
  })

  it('a_dev_run_uses_its_own_folder_config_and_webview_profile', () => {
    const env = devEnv({ PATH: 'p', BRECCIA_FOLDER: 'C:\\real' }, 'T', false)
    expect(env).toEqual({
      PATH: 'p',
      BRECCIA_FOLDER: join('T', 'notes'),
      BRECCIA_CONFIG_DIR: join('T', 'config'),
      WEBVIEW2_USER_DATA_FOLDER: join('T', 'config', 'webview'),
    })
  })

  it('dev_debug_adds_the_devtools_port', () => {
    expect(devEnv({}, 'T', true).WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS).toBe('--remote-debugging-port=9222')
  })

  it('a_run_starts_from_a_fresh_copy_of_the_demo', () => {
    const root = join(import.meta.dirname, '..', '..')
    const run = prepareRun(root)
    try {
      const demo = join(root, 'docs', 'demo', 'breccia', 'config.toml')
      expect(readFileSync(join(run.dir, 'notes', 'breccia', 'config.toml'), 'utf8')).toBe(readFileSync(demo, 'utf8'))
      expect(existsSync(join(run.dir, 'config'))).toBe(true)
      const patch = JSON.parse(readFileSync(run.configFile, 'utf8'))
      expect(patch.identifier).toBe('dev.breccia.app.dev')
    } finally {
      run.remove()
    }
    expect(existsSync(run.dir)).toBe(false)
  })
})
