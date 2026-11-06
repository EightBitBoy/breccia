// `just dev` and `just dev-debug`: the app in dev mode, kept apart from an installed Breccia. Each run gets
//   - a fresh copy of docs/demo/ as its notes folder (BRECCIA_FOLDER),
//   - fresh settings, window state and search cache in a temp config dir (BRECCIA_CONFIG_DIR),
//   - its own WebView2 profile (WEBVIEW2_USER_DATA_FOLDER),
//   - its own identifier (`<identifier>.dev`) and the window title "Breccia (dev)",
// so it never reads or writes the installed app's notes folder or settings. Nothing a run does is kept: the temp
// folder is deleted when the app exits.
//   node app/scripts/dev.mjs [--debug]   (--debug: DevTools on port 9222)
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEBUG_PORT = 9222

/** The `tauri dev --config` patch: its own identifier and window titles (a merge patch replaces arrays whole). */
export function devConfig(conf) {
  return {
    identifier: `${conf.identifier}.dev`,
    app: { windows: conf.app.windows.map((w) => ({ ...w, title: `${w.title} (dev)` })) },
  }
}

/** The run's environment: `base` with the notes folder, config dir and WebView2 profile under `dir`. */
export function devEnv(base, dir, debug) {
  const env = {
    ...base,
    BRECCIA_FOLDER: join(dir, 'notes'),
    BRECCIA_CONFIG_DIR: join(dir, 'config'),
    WEBVIEW2_USER_DATA_FOLDER: join(dir, 'config', 'webview'),
  }
  if (debug) env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${DEBUG_PORT}`
  return env
}

/** Makes the run's temp folder: the demo copy, the empty config dir and the config patch file. */
export function prepareRun(root) {
  const dir = mkdtempSync(join(tmpdir(), 'breccia-dev-'))
  cpSync(join(root, 'docs', 'demo'), join(dir, 'notes'), { recursive: true })
  mkdirSync(join(dir, 'config'))
  const conf = JSON.parse(readFileSync(join(root, 'app', 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const configFile = join(dir, 'tauri.dev.json')
  writeFileSync(configFile, JSON.stringify(devConfig(conf), null, 2) + '\n')
  // WebView2 can hold its profile for a moment after the app exits, so the delete is retried.
  const remove = () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  return { dir, configFile, remove }
}

function main(args) {
  const debug = args.includes('--debug')
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const run = prepareRun(root)
  console.log(`Breccia (dev): notes and settings in ${run.dir} (deleted when the app exits)`)
  const cli = join(root, 'app', 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const r = spawnSync(process.execPath, [cli, 'dev', '--config', run.configFile], {
    cwd: join(root, 'app'),
    env: devEnv(process.env, run.dir, debug),
    stdio: 'inherit',
  })
  try {
    run.remove()
  } catch (e) {
    console.error(`could not delete ${run.dir}: ${e.message}`)
  }
  if (r.error) {
    console.error(r.error.message)
    return 1
  }
  return r.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
