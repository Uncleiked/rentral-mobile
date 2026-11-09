import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChunkedSessionStorage } from '../apps/mobile/src/lib/session-storage-core'

const KEY = 'test-auth-session'

function fixture() {
  const values = new Map<string, string>()
  let generation = 0
  const store = {
    getItem: vi.fn(async (key: string): Promise<string | null> => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string): Promise<void> => { values.set(key, value) }),
    removeItem: vi.fn(async (key: string): Promise<void> => { values.delete(key) }),
  }
  return { values, store, storage: createChunkedSessionStorage(store, () => `generation${++generation}`) }
}

beforeEach(() => vi.restoreAllMocks())

describe('native session persistence', () => {
  it('restores a large session exactly, including Unicode spanning chunk boundaries', async () => {
    const { storage, values } = fixture()
    const session = JSON.stringify({ access_token: 'token'.repeat(800), refresh_token: 'refresh'.repeat(80), user: { name: `${'a'.repeat(249)}😀Ẹkáàbọ̀ ${'🎈'.repeat(500)}` } })
    await storage.setItem(KEY, session)
    expect(await storage.getItem(KEY)).toBe(session)
    expect(JSON.parse((await storage.getItem(KEY))!)).toEqual(JSON.parse(session))
    expect(values.size).toBeGreaterThan(2)
    for (const value of values.values()) expect(Buffer.byteLength(value, 'utf8')).toBeLessThan(2048)
  })

  it('keeps every encoded value below 2KB for worst-case escaped UTF-16 input', async () => {
    const { storage, values } = fixture()
    const value = `${'\u0000'.repeat(500)}${'\ud800'.repeat(500)}${'a'.repeat(249)}😀end`
    await storage.setItem(KEY, value)
    expect(await storage.getItem(KEY)).toBe(value)
    for (const stored of values.values()) expect(Buffer.byteLength(stored, 'utf8')).toBeLessThan(2048)
  })

  it('preserves the previous session when a chunk write is interrupted', async () => {
    const { storage, store, values } = fixture()
    await storage.setItem(KEY, 'previous-session')
    const previousManifest = values.get(KEY)
    store.setItem.mockImplementation(async (key, value) => {
      if (key === `${KEY}.generation2.1`) throw new Error('keychain write failed')
      values.set(key, value)
    })
    await expect(storage.setItem(KEY, 'new-session'.repeat(100))).rejects.toThrow('keychain write failed')
    expect(values.get(KEY)).toBe(previousManifest)
    expect(await storage.getItem(KEY)).toBe('previous-session')
    expect(Array.from(values.keys()).some(key => key.includes('generation2'))).toBe(false)
  })

  it('preserves the previous session when the manifest commit fails', async () => {
    const { storage, store, values } = fixture()
    await storage.setItem(KEY, 'previous-session')
    store.setItem.mockImplementation(async (key, value) => {
      if (key === KEY) throw new Error('manifest commit failed')
      values.set(key, value)
    })
    await expect(storage.setItem(KEY, 'new-session')).rejects.toThrow('manifest commit failed')
    expect(await storage.getItem(KEY)).toBe('previous-session')
  })

  it('does not report a committed save as failed when obsolete chunk cleanup fails', async () => {
    const { storage, store } = fixture()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await storage.setItem(KEY, 'previous-session')
    store.removeItem.mockRejectedValue(new Error('cleanup unavailable'))
    await expect(storage.setItem(KEY, 'new-session')).resolves.toBeUndefined()
    expect(await storage.getItem(KEY)).toBe('new-session')
    expect(warning).toHaveBeenCalledTimes(1)
  })

  it('retains the original write error even when failed-save cleanup also fails', async () => {
    const { storage, store } = fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await storage.setItem(KEY, 'previous-session')
    store.setItem.mockRejectedValue(new Error('original write failure'))
    store.removeItem.mockRejectedValue(new Error('cleanup failure'))
    await expect(storage.setItem(KEY, 'new-session')).rejects.toThrow('original write failure')
    expect(await storage.getItem(KEY)).toBe('previous-session')
  })

  it('removes the manifest and all live chunks at logout', async () => {
    const { storage, values } = fixture()
    await storage.setItem(KEY, 'session'.repeat(500))
    await storage.removeItem(KEY)
    expect(await storage.getItem(KEY)).toBeNull()
    expect(values.size).toBe(0)
  })

  it('surfaces a logout failure if the session pointer could not be removed', async () => {
    const { storage, store } = fixture()
    await storage.setItem(KEY, 'session')
    store.removeItem.mockRejectedValue(new Error('device locked'))
    await expect(storage.removeItem(KEY)).rejects.toThrow('device locked')
    expect(await storage.getItem(KEY)).toBe('session')
  })

  it.each(['generation:0', 'generation:999', 'generation:1:extra', '../invalid:1', 'generation:-1', 'generation:1.0'])('rejects malformed manifest %s', async manifest => {
    const { storage, values, store } = fixture()
    values.set(KEY, manifest)
    expect(await storage.getItem(KEY)).toBeNull()
    expect(store.getItem).toHaveBeenCalledTimes(1)
  })

  it.each([null, 'not-json', '42', '{}', 'null'])('does not restore a partial or non-string session chunk %s', async chunk => {
    const { storage, values } = fixture()
    values.set(KEY, 'generation:2')
    values.set(`${KEY}.generation.0`, JSON.stringify('first'))
    if (chunk !== null) values.set(`${KEY}.generation.1`, chunk)
    expect(await storage.getItem(KEY)).toBeNull()
  })

  it('rejects oversized sessions before changing the existing saved session', async () => {
    const { storage } = fixture()
    await storage.setItem(KEY, 'previous-session')
    await expect(storage.setItem(KEY, 'a'.repeat(64001))).rejects.toThrow('too large')
    expect(await storage.getItem(KEY)).toBe('previous-session')
  })
})
