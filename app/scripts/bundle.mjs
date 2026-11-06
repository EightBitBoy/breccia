// The main bundle check: the graph's libraries stay out of the main bundle (they load the first time the graph opens),
// and the main bundle stays under a generous ceiling that only a real mistake reaches. Run by `bundle.test.mjs` after
// `npm run build` (as `just test` does).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** At most this many bytes for `dist/assets/index-*.js` (it was about 908 KB when the limit was set). */
export const MAIN_CEILING = 1_200_000

/** Strings found only in sigma, graphology and ForceAtlas2 code; none may be in the main bundle. */
export const GRAPH_MARKERS = ['WebGL', 'Sigma:', 'graphology', 'forceatlas2', 'barnesHut']

/** The main bundle in `assets`, or null when there is no build. */
export function mainBundle(assets) {
  let names
  try {
    names = readdirSync(assets)
  } catch {
    return null
  }
  const main = names.filter((n) => /^index-.*\.js$/.test(n))
  if (main.length !== 1) return null
  return join(assets, main[0])
}

/** What is wrong with the main bundle at `file`: an empty list when it is fine. */
export function bundleProblems(file, ceiling = MAIN_CEILING) {
  const problems = []
  const size = statSync(file).size
  if (size > ceiling) problems.push(`main bundle is ${size} bytes, over the ceiling of ${ceiling}`)
  const text = readFileSync(file, 'utf8')
  for (const m of GRAPH_MARKERS) {
    if (text.includes(m)) problems.push(`main bundle holds graph code ("${m}"); load it lazily, like NetworkView`)
  }
  return problems
}
