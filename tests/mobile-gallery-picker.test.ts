import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ pick: vi.fn(), manipulate: vi.fn(), render: vi.fn(), save: vi.fn(), releaseImage: vi.fn(), releaseContext: vi.fn(), size: 2048, exists: true }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: fixture.pick }))
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: fixture.manipulate }, SaveFormat: { JPEG: 'jpeg' } }))
vi.mock('expo-file-system', () => ({ File: class File { constructor(public uri: string) {} get size() { return fixture.size } get exists() { return fixture.exists } } }))
import { pickNativeGalleryPhotos, pickNativeGalleryVideo } from '../apps/mobile/src/lib/gallery-picker'
beforeEach(() => {
  vi.resetAllMocks(); fixture.size = 2048; fixture.exists = true
  fixture.manipulate.mockReturnValue({ renderAsync: fixture.render, release: fixture.releaseContext })
  fixture.render.mockResolvedValue({ saveAsync: fixture.save, release: fixture.releaseImage })
  fixture.save.mockResolvedValue({ uri: 'file:///prepared/gallery.jpg' })
})
it('re-encodes selected gallery images as bounded JPEGs and releases native image resources', async () => {
  fixture.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked/photo.heic' }, { uri: 'file:///picked/photo.webp' }] })
  expect(await pickNativeGalleryPhotos()).toEqual([{ uri: 'file:///prepared/gallery.jpg', kind: 'photo', mimeType: 'image/jpeg' }, { uri: 'file:///prepared/gallery.jpg', kind: 'photo', mimeType: 'image/jpeg' }])
  expect(fixture.pick).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, exif: false }))
  expect(fixture.manipulate).toHaveBeenCalledWith('file:///picked/photo.heic', { maxWidth: 2048, maxHeight: 2048 })
  expect(fixture.save).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.84 })
  expect(fixture.releaseImage).toHaveBeenCalledTimes(2); expect(fixture.releaseContext).toHaveBeenCalledTimes(2)
})
it('preserves the previous selection when the system picker is cancelled', async () => {
  fixture.pick.mockResolvedValue({ canceled: true })
  expect(await pickNativeGalleryPhotos()).toBeNull()
  expect(fixture.manipulate).not.toHaveBeenCalled()
})
it('rejects an oversized prepared image without leaving its decoder allocated', async () => {
  fixture.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked/photo.jpg' }] }); fixture.size = 10 * 1024 * 1024 + 1
  await expect(pickNativeGalleryPhotos()).rejects.toThrow('under 10MB')
  expect(fixture.releaseContext).toHaveBeenCalledTimes(1)
})
it('preserves original MOV format and rejects known video duration beyond the processing limit', async () => {
  fixture.pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///picked/tour.mov', duration: 120000 }] }).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///picked/tour.mov', duration: 120001 }] })
  expect(await pickNativeGalleryVideo()).toEqual([{ uri: 'file:///picked/tour.mov', kind: 'video', mimeType: 'video/quicktime' }])
  await expect(pickNativeGalleryVideo()).rejects.toThrow('up to 120 seconds')
  expect(fixture.manipulate).not.toHaveBeenCalled()
})
