import { expect, test, vi } from 'vitest'
import { clampWidth, loadLayout } from './sidebarLayout'

test('widths are clamped to 180-480; none is 250', () => {
  expect([clampWidth(null), clampWidth(100), clampWidth(300), clampWidth(900), clampWidth(NaN)]).toEqual([
    250, 180, 300, 480, 250,
  ])
})

test('a saved layout that cannot be read is the default layout', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(loadLayout(() => Promise.reject(new Error('no settings')))).resolves.toEqual({
    width: 250,
    hidden: false,
    theme: 'system',
    boardColumn: null,
    zoom: 100,
  })
  expect(console.error).toHaveBeenCalled()
  vi.restoreAllMocks()
  await expect(loadLayout(async () => ({ sidebarWidth: 900, sidebarHidden: true }))).resolves.toEqual({
    width: 480,
    hidden: true,
    theme: 'system',
    boardColumn: null,
    zoom: 100,
  })
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, boardColumnWidth: 300 })),
  ).resolves.toMatchObject({ boardColumn: 300 })
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, boardColumnWidth: 9999 })),
  ).resolves.toMatchObject({ boardColumn: 520 })
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, theme: 'graphite' })),
  ).resolves.toMatchObject({ theme: 'graphite' })
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, theme: 'x' })),
  ).resolves.toMatchObject({ theme: 'system' })
})

test('the saved zoom is read; a bad one is 100', async () => {
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, zoomPercent: 125 })),
  ).resolves.toMatchObject({ zoom: 125 })
  await expect(
    loadLayout(async () => ({ sidebarWidth: 250, sidebarHidden: false, zoomPercent: 333 })),
  ).resolves.toMatchObject({ zoom: 100 })
})
