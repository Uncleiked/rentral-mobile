type NativeStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}
type Manifest = { generation: string; count: number }

// JSON encoding 250 UTF-16 code units takes at most 1,502 UTF-8 bytes, including
// quotes. Escaped control characters and isolated surrogate halves stay below 2KB.
const CHUNK_SIZE = 250
const MAX_CHUNKS = 256

function readManifest(value: string | null): Manifest | null {
  if (!value) return null
  const parts = value.split(':')
  if (parts.length !== 2 || !/^[a-z0-9]{1,96}$/.test(parts[0]) || !/^[1-9]\d{0,2}$/.test(parts[1])) return null
  const count = Number(parts[1])
  return count <= MAX_CHUNKS ? { generation: parts[0], count } : null
}

function chunkKey(key: string, generation: string, index: number): string {
  return `${key}.${generation}.${index}`
}

export function createChunkedSessionStorage(store: NativeStorage, generationSource: () => string = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`) {
  async function removeChunks(key: string, manifest: Manifest | null): Promise<void> {
    if (!manifest) return
    const results = await Promise.allSettled(Array.from({ length: manifest.count }, (_, index) => store.removeItem(chunkKey(key, manifest.generation, index))))
    // The manifest is the commit point. Old/uncommitted chunk cleanup can fail
    // without invalidating a committed session or replacing the original error.
    if (results.some(result => result.status === 'rejected')) console.warn('[auth/storage] Some obsolete encrypted session chunks could not be removed.')
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const manifest = readManifest(await store.getItem(key))
      if (!manifest) return null
      const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) => store.getItem(chunkKey(key, manifest.generation, index))))
      const decoded: string[] = []
      for (const chunk of chunks) {
        if (chunk === null) return null
        try {
          const value: unknown = JSON.parse(chunk)
          if (typeof value !== 'string') return null
          decoded.push(value)
        } catch { return null }
      }
      return decoded.join('')
    },
    async setItem(key: string, value: string): Promise<void> {
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE))
      if (count > MAX_CHUNKS) throw new Error('This sign-in session is too large to save securely.')
      const previous = readManifest(await store.getItem(key))
      const generation = generationSource()
      if (!/^[a-z0-9]{1,96}$/.test(generation) || generation === previous?.generation) throw new Error('Could not create a secure session storage entry.')
      const next = { generation, count }
      try {
        for (let index = 0; index < count; index++) await store.setItem(chunkKey(key, generation, index), JSON.stringify(value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)))
        await store.setItem(key, `${generation}:${count}`)
      } catch (error) { await removeChunks(key, next); throw error }
      await removeChunks(key, previous)
    },
    async removeItem(key: string): Promise<void> {
      const manifest = readManifest(await store.getItem(key))
      // A failed pointer deletion must surface: the old session still exists.
      await store.removeItem(key)
      await removeChunks(key, manifest)
    },
  }
}
