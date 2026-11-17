// Summarises the `trace ...` lines the app prints to stderr under BRECCIA_TRACE.
const GIT_STATE = /^trace git state=(\S+)$/
const LINE = /^trace (\S+) (\S+) wait=([\d.]+)ms run=([\d.]+)ms$/

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

export function summarize(log) {
  const rows = new Map()
  const states = new Map()
  let unparsed = 0
  for (const line of log.split(/\r?\n/)) {
    const g = GIT_STATE.exec(line.trim())
    if (g) {
      states.set(g[1], (states.get(g[1]) ?? 0) + 1)
      continue
    }
    const m = LINE.exec(line.trim())
    if (!m) {
      if (line.trim().startsWith('trace ')) unparsed += 1
      continue
    }
    const [, kind, name, wait, run] = m
    // watch and index lines carry a count (paths=3, pages=50), not a name.
    const key = kind === 'watch' || kind === 'index' ? kind : `${kind} ${name}`
    const row = rows.get(key) ?? { wait: [], run: [] }
    row.wait.push(Number(wait))
    row.run.push(Number(run))
    rows.set(key, row)
  }
  const f = (n) => n.toFixed(1)
  const lines = [['kind name', 'count', 'wait p50', 'wait p95', 'run p50', 'run p95']]
  for (const [key, row] of [...rows].sort((a, b) => a[0].localeCompare(b[0]))) {
    const w = [...row.wait].sort((a, b) => a - b)
    const r = [...row.run].sort((a, b) => a - b)
    lines.push([
      key,
      String(w.length),
      f(percentile(w, 0.5)),
      f(percentile(w, 0.95)),
      f(percentile(r, 0.5)),
      f(percentile(r, 0.95)),
    ])
  }
  const widths = lines[0].map((_, i) => Math.max(...lines.map((l) => l[i].length)))
  const out = lines.map((l) =>
    l.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  '),
  )
  if (states.size > 0) {
    const list = [...states].map(([name, n]) => `${name} ${n}`).join(', ')
    out.push(`git states: ${list}`)
  }
  if (unparsed > 0) out.push(`unparsed trace lines: ${unparsed}`)
  return out.join('\n')
}
