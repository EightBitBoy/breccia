import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tauriDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri')
const conf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'))
const iconFiles = conf.bundle.icon

// sha256 of every file `tauri init` generated (Tauri's default logo), recorded before Breccia got its own icons.
const TAURI_DEFAULT = new Set([
  '1f3689f6374b0553996fdc99743799216703835070145d7f0e6ec11e6280139e', // 128x128.png
  '69194785eef4323955af73b0c03362ac0804db056c2424f9715076cabc0ed103', // 128x128@2x.png
  'd151f11e325f7502de0c739a2e51697aa569fd4701ae6e11fae1a3b4c7d5f157', // 32x32.png
  'fd8658ff0e2c177ce0779d11fea1574e9d7d82a52a3a9197038f37b07fe24475', // Square107x107Logo.png
  'c348fcf2d2f2f9714a41925184926f77f440676987d233ae1daf4fd94fda245f', // Square142x142Logo.png
  'd46dc2bc568f911b9cb978de68b4a7e3ad458fbac15196597849c43c40f4b65a', // Square150x150Logo.png
  '80d93a5257c89ea57023c30500c889b4df062430ffb0b4fed4ca4785d13e29ac', // Square284x284Logo.png
  'c3ce70e22ec2ed3ea2d0362a767d087e6cadb93ec71e80010649f892520175f4', // Square30x30Logo.png
  '624dd93ddb1f0d69f2a4aa7af0b0646ae3ae6347cbb42dab56ef88dba7f38d07', // Square310x310Logo.png
  'f9eca6f00dba41cfecfedbc9a6f88014b4ee0f9dbf016e202c7ede09c60107ef', // Square44x44Logo.png
  '66a6b51da8962a9472c9d29b1b08e3309561521bf7fbaac52b9f680df13ff487', // Square71x71Logo.png
  'fe8da53273722bb6fd66e98bf6810e8a7db22aeff27c6c1a096d57ba556b9ef4', // Square89x89Logo.png
  '5412fce324344999aad82f6b69abcaa6c8792eac7b79a4b321aaaeacd0525eaf', // StoreLogo.png
  '3dc10493b7de48a61de58f768f8a5708d3a44a068c148cedf0502b9b9b71ba5d', // icon.icns
  'e38ca88e1d5490f3dcbc3c3fa525f7fcb7b80fff3cb2f3a4eb1b2d018c0915c1', // icon.ico
  'b5d93c8ec365c08b11bd006e46a46e227c681d30bb295af3d017573bfc752a83', // icon.png
])
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

// Sizes of the images in an ICO file: header (reserved, type 1, count), then 16-byte entries (0 means 256).
function icoSizes(buf) {
  expect(buf.readUInt16LE(0)).toBe(0)
  expect(buf.readUInt16LE(2)).toBe(1)
  const count = buf.readUInt16LE(4)
  const sizes = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    sizes.push(buf[at] === 0 ? 256 : buf[at])
  }
  return sizes
}

describe('app icons', () => {
  it('lists icon files that exist', () => {
    expect(iconFiles.length).toBeGreaterThan(0)
    for (const f of iconFiles) expect(existsSync(join(tauriDir, f)), f).toBe(true)
  })

  it("are not Tauri's default icons", () => {
    for (const f of iconFiles) expect(TAURI_DEFAULT.has(sha(join(tauriDir, f))), f).toBe(false)
    expect(TAURI_DEFAULT.has(sha(join(tauriDir, 'icons', 'icon.icns')))).toBe(false)
    expect(TAURI_DEFAULT.has(sha(join(tauriDir, 'icons', 'icon.png')))).toBe(false)
  })

  it('has the source SVG beside the generated files', () => {
    expect(existsSync(join(tauriDir, 'icons', 'icon.svg'))).toBe(true)
  })

  it('icon.ico holds the sizes Windows needs', () => {
    const sizes = icoSizes(readFileSync(join(tauriDir, 'icons', 'icon.ico')))
    for (const s of [16, 24, 32, 48, 64, 256]) expect(sizes, `${s} px`).toContain(s)
  })

  it('the ICO reader can fail on a short list', () => {
    const buf = Buffer.alloc(6 + 16)
    buf.writeUInt16LE(1, 2)
    buf.writeUInt16LE(1, 4)
    buf[6] = 16
    expect(icoSizes(buf)).toEqual([16])
  })
})
