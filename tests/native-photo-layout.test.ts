import { describe, expect, it } from 'vitest'
import { nativePhotoAspectRatio } from '../apps/mobile/src/lib/photo-layout'
describe('decoded native photo frames', () => {
  it.each([[1200,600,2],[600,1200,0.5],[900,900,1],[1920,1080,16/9]])('preserves the original usable aspect ratio %s by %s', (width,height,expected) => expect(nativePhotoAspectRatio(width,height)).toBe(expected))
  it.each([[0,1],[-5,20],[1,0],[NaN,1],[Infinity,2],['800',600],[null,600],[1,Number.MIN_VALUE]])('rejects invalid dimensions %s by %s without breaking layout', (width,height) => expect(nativePhotoAspectRatio(width,height)).toBe(4/3))
  it('bounds extreme source aspect ratios while retaining contain rendering', () => {
    expect(nativePhotoAspectRatio(100000,1)).toBe(4)
    expect(nativePhotoAspectRatio(1,100000)).toBe(0.25)
  })
})
