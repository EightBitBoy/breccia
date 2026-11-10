import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodePng, pngSize, snapshotFiles, writeShots } from './png.mjs'

function header(width, height) {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

describe('pngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(header(1280, 800))).toEqual({ width: 1280, height: 800 })
  })
  it('throws on a buffer that is not a PNG', () => {
    expect(() => pngSize(Buffer.from('GIF89a' + 'x'.repeat(30)))).toThrow()
  })
})

/** A PNG chunk; the CRC is left 0, as the decoder does not check it. */
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

/** Paeth predictor (PNG spec 9.4), to filter the rows the test encodes. */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * A PNG of `rows` (arrays of bytes, `channels` per pixel), row `y` filtered with `filters[y]`, the image data split
 * over two IDAT chunks. `ihdr` overrides IHDR fields.
 */
function makePng(width, rows, channels, filters, ihdr = {}) {
  const { depth = 8, colorType = channels === 4 ? 6 : 2, interlace = 0 } = ihdr
  const stride = width * channels
  const raw = []
  rows.forEach((row, y) => {
    const prev = y > 0 ? rows[y - 1] : new Array(stride).fill(0)
    const f = filters[y]
    raw.push(f)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]
      raw.push((row[i] - pred) & 0xff)
    }
  })
  const z = deflateSync(Buffer.from(raw))
  const h = Buffer.alloc(13)
  h.writeUInt32BE(width, 0)
  h.writeUInt32BE(rows.length, 4)
  h.writeUInt8(depth, 8)
  h.writeUInt8(colorType, 9)
  h.writeUInt8(interlace, 12)
  const cut = Math.floor(z.length / 2)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', h),
    chunk('IDAT', z.subarray(0, cut)),
    chunk('IDAT', z.subarray(cut)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

describe('decodePng', () => {
  it('decodePng reads an RGBA image with each row filter', () => {
    // Two pixels wide, five rows, one per filter 0 to 4; values chosen so each predictor matters.
    const rows = [
      [10, 200, 30, 255, 250, 5, 60, 128],
      [20, 190, 40, 250, 7, 9, 255, 0],
      [200, 100, 50, 25, 12, 34, 56, 78],
      [1, 2, 3, 4, 254, 253, 252, 251],
      [90, 80, 70, 60, 100, 0, 200, 50],
    ]
    const png = decodePng(makePng(2, rows, 4, [0, 1, 2, 3, 4]))
    expect(png.width).toBe(2)
    expect(png.height).toBe(5)
    expect([...png.rgba]).toEqual(rows.flat())
  })
  it('decodePng reads RGB as opaque', () => {
    const rows = [
      [1, 2, 3, 4, 5, 6],
      [250, 251, 252, 7, 8, 9],
    ]
    const png = decodePng(makePng(2, rows, 3, [1, 4]))
    expect([...png.rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 250, 251, 252, 255, 7, 8, 9, 255])
  })
  it('decodePng refuses an interlaced or 16-bit image', () => {
    const rows = [[1, 2, 3, 4]]
    expect(() => decodePng(makePng(1, rows, 4, [0], { interlace: 1 }))).toThrow('unsupported PNG')
    expect(() => decodePng(makePng(1, rows, 4, [0], { depth: 16 }))).toThrow('unsupported PNG')
  })
})

describe('snapshotFiles', () => {
  it('lists files recursively with their bytes, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'breccia-png-test-'))
    try {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'sub', 'b.md'), 'bee')
      writeFileSync(join(dir, 'a.md'), 'ay')
      const snap = snapshotFiles(dir)
      expect([...snap.keys()]).toEqual(['a.md', 'sub/b.md'])
      expect(snap.get('sub/b.md').toString()).toBe('bee')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('writeShots', () => {
  it('writes nothing when one image has the wrong size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'breccia-png-test-'))
    try {
      const shots = new Map([
        ['a.png', header(1280, 800)],
        ['b.png', header(1, 1)],
      ])
      expect(() => writeShots(dir, shots, 1280, 800)).toThrow('FAIL b.png is 1x1, expected 1280x800')
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('writes every image when all fit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'breccia-png-test-'))
    try {
      const shots = new Map([
        ['a.png', header(1280, 800)],
        ['b.png', header(1280, 800)],
      ])
      const paths = writeShots(dir, shots, 1280, 800)
      expect(paths).toEqual([join(dir, 'a.png'), join(dir, 'b.png')])
      expect(readdirSync(dir).sort()).toEqual(['a.png', 'b.png'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
