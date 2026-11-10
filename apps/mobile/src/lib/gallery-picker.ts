import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { MAX_NATIVE_DOCUMENT_BYTES, MAX_NATIVE_VIDEO_BYTES } from './native-listing'

export type NativeGalleryChoice = { uri: string; kind: 'photo' | 'video'; mimeType: 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/quicktime' | 'video/webm' }
export async function pickNativeGalleryPhotos(): Promise<NativeGalleryChoice[] | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, allowsEditing: false, exif: false, quality: 1 })
  if (picked.canceled) return null
  if (!picked.assets.length || picked.assets.length > 10) throw new Error('Choose between one and ten photos.')
  const photos: NativeGalleryChoice[] = []
  for (const asset of picked.assets) {
    const context = ImageManipulator.manipulate(asset.uri, { maxWidth: 2048, maxHeight: 2048 })
    let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined
    try {
      image = await context.renderAsync()
      const rendered = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.84 })
      const file = new File(rendered.uri)
      if (!file.exists || file.size <= 0 || file.size > MAX_NATIVE_DOCUMENT_BYTES) throw new Error('Each gallery photo must be a valid image under 10MB.')
      photos.push({ uri: rendered.uri, kind: 'photo', mimeType: 'image/jpeg' })
    } finally { image?.release(); context.release() }
  }
  return photos
}
export async function pickNativeGalleryVideo(): Promise<NativeGalleryChoice[] | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false, allowsMultipleSelection: false, exif: false, videoMaxDuration: 120 })
  if (picked.canceled) return null
  const asset = picked.assets[0], file = new File(asset.uri)
  const mimeType = /\.mov(?:$|\?)/i.test(asset.uri) ? 'video/quicktime' : /\.mp4(?:$|\?)/i.test(asset.uri) ? 'video/mp4' : /\.webm(?:$|\?)/i.test(asset.uri) ? 'video/webm' : null
  if (!mimeType || !file.exists || file.size <= 0 || file.size > MAX_NATIVE_VIDEO_BYTES || (typeof asset.duration === 'number' && (!Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > 120000))) throw new Error('Choose an original MP4, MOV or WebM video up to 120 seconds and no larger than 200MB.')
  return [{ uri: asset.uri, kind: 'video', mimeType }]
}
