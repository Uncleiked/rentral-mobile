import { createLocalStorage, defaultStorageDirectory } from './core'
import { requireOwnedStoragePath, StorageError } from './policy'
import { storageOrigin } from './urls'

export async function verifiedAvatarReference(input: string, userId: string): Promise<string> {
  if (input.length > 1500 || input.startsWith('//') || input.includes('\\') || input.includes('..') || /%(?:2e|2f|5c|00)/i.test(input)) throw new StorageError(400, 'INVALID_AVATAR', 'Choose a photo uploaded to your own account.')
  const origin = storageOrigin()
  const url = new URL(input, origin)
  const prefix = '/api/v1/files/profile-avatars/'
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) throw new StorageError(400, 'INVALID_AVATAR', 'Choose a photo uploaded to your own account.')
  const path = url.pathname.slice(prefix.length)
  requireOwnedStoragePath('profile-avatars', path, userId)
  // info verifies the stored metadata, size, safe extension and real file magic.
  const info = await createLocalStorage(defaultStorageDirectory()).info('profile-avatars', path)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(info.contentType) || info.size > 2 * 1024 * 1024) throw new StorageError(415, 'INVALID_AVATAR', 'Choose a JPEG, PNG or WEBP image under 2MB.')
  return url.pathname
}
