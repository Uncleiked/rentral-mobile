import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function pngHeader(bytes: Buffer) {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), depth: bytes[24], colorType: bytes[25] }
}

describe('generated Rentral platform icon formats', () => {
  it('embeds an actual RGBA PNG in a consistent 32-bit ICO directory', () => {
    const ico = readFileSync(new URL('../app/favicon.ico', import.meta.url))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(1)
    expect(ico[6]).toBe(64); expect(ico[7]).toBe(64)
    expect(ico.readUInt16LE(10)).toBe(1)
    expect(ico.readUInt16LE(12)).toBe(32)
    const length = ico.readUInt32LE(14), offset = ico.readUInt32LE(18)
    expect(offset).toBe(22)
    expect(offset + length).toBe(ico.length)
    expect(pngHeader(ico.subarray(offset, offset + length))).toEqual({ width: 64, height: 64, depth: 8, colorType: 6 })
  })

  it('keeps the iOS app icon 1024px RGB without an alpha channel', () => {
    const bytes = readFileSync(new URL('../apps/mobile/assets/icon.png', import.meta.url))
    expect(pngHeader(bytes)).toEqual({ width: 1024, height: 1024, depth: 8, colorType: 2 })
  })

  it('retains transparency for the native splash mark and adaptive foreground', () => {
    const mark = readFileSync(new URL('../apps/mobile/assets/brand-mark.png', import.meta.url))
    const adaptive = readFileSync(new URL('../apps/mobile/assets/adaptive-icon.png', import.meta.url))
    expect(pngHeader(mark)).toEqual({ width: 512, height: 512, depth: 8, colorType: 6 })
    expect(pngHeader(adaptive)).toEqual({ width: 1024, height: 1024, depth: 8, colorType: 6 })
  })
})
