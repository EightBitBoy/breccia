// Hands the keyboard back. Windows makes the newly started app window the
// foreground window, so keys typed in another window during the run (in the
// terminal, a chat) land in the app's editor and garble the bytes a step checks.
// The steps drive the app over the DevTools port and do not need OS focus.
import { spawn } from 'node:child_process'

const SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$saved = [Fg]::GetForegroundWindow()
[Console]::Out.WriteLine("ready"); [Console]::Out.Flush()
$app = [uint32][Console]::In.ReadLine()
if ($saved -eq [IntPtr]::Zero) { "no foreground window to hand back"; exit }
$p = [uint32]0
[void][Fg]::GetWindowThreadProcessId([Fg]::GetForegroundWindow(), [ref]$p)
if ($p -ne $app) { "app is not in the foreground"; exit }
if ([Fg]::SetForegroundWindow($saved)) { "handed back" } else { "could not hand back" }
`

/**
 * Remembers the foreground window now; resolves once it has, so start the app
 * after it. `handBack(pid)`, called once the app's window shows, gives the
 * foreground back to that window if app `pid` holds it.
 */
export async function keepForeground() {
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
  const ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  let out = ''
  const ready = new Promise((resolve, reject) => {
    ps.on('error', reject)
    ps.stdout.on('data', (b) => {
      out += b
      if (out.includes('ready')) resolve()
    })
  })
  const done = new Promise((resolve) => ps.on('exit', () => resolve(out.replace(/^[\s\S]*?ready\s*/, '').trim())))
  await ready
  return {
    /** Resolves to what the helper did. */
    handBack(pid) {
      ps.stdin.end(`${pid}\n`)
      return done
    },
    stop() {
      ps.kill()
    },
  }
}
