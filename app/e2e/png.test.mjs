import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pngSize, snapshotFiles, writeShots } from './png.mjs'

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
