import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from the IHDR chunk of a PNG; throws when the bytes are not a PNG. */
export function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG')
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * The pixels of a PNG as RGBA bytes, row by row. Reads what Chromium writes: 8-bit RGB or RGBA, not interlaced, any
 * of the five row filters, the image data over one or more IDAT chunks. Throws `unsupported PNG` on anything else.
 */
export function decodePng(buf) {
  const { width, height } = pngSize(buf)
  const depth = buf[24]
  const colorType = buf[25]
  const interlace = buf[28]
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`)
  }
  const channels = colorType === 6 ? 4 : 3
  const parts = []
  for (let at = 8; at + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    if (type === 'IDAT') parts.push(buf.subarray(at + 8, at + 8 + len))
    if (type === 'IEND') break
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error('unsupported PNG (short image data)')
  const px = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    const up = row - stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[row + i - channels] : 0
      const b = y > 0 ? px[up + i] : 0
      const c = y > 0 && i >= channels ? px[up + i - channels] : 0
      let pred
      if (filter === 0) pred = 0
      else if (filter === 1) pred = a
      else if (filter === 2) pred = b
      else if (filter === 3) pred = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else throw new Error(`unsupported PNG (row filter ${filter})`)
      px[row + i] = (raw[src + i] + pred) & 0xff
    }
  }
  if (channels === 4) return { width, height, rgba: px }
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0, q = 0; p < px.length; p += 3, q += 4) {
    rgba[q] = px[p]
    rgba[q + 1] = px[p + 1]
    rgba[q + 2] = px[p + 2]
    rgba[q + 3] = 255
  }
  return { width, height, rgba }
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
