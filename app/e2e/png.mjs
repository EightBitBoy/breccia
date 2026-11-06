import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from the IHDR chunk of a PNG; throws when the bytes are not a PNG. */
export function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG')
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** Every file under `dir`, recursively: relative path with `/` to its bytes, sorted by path. */
export function snapshotFiles(dir) {
  const found = []
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel ? `${rel}/${name}` : name
      if (statSync(join(dir, path)).isDirectory()) walk(path)
      else found.push(path)
    }
  }
  walk('')
  found.sort()
  return new Map(found.map((path) => [path, readFileSync(join(dir, path))]))
}

/** Checks every PNG's size first, then writes them all to `dir`. Writes nothing when one is off. Returns the paths. */
export function writeShots(dir, shots, width, height) {
  for (const [name, buf] of shots) {
    const size = pngSize(buf)
    if (size.width !== width || size.height !== height) {
      throw new Error(`FAIL ${name} is ${size.width}x${size.height}, expected ${width}x${height}`)
    }
  }
  mkdirSync(dir, { recursive: true })
  return [...shots].map(([name, buf]) => {
    const path = join(dir, name)
    writeFileSync(path, buf)
    return path
  })
}
