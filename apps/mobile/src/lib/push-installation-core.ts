import { z } from 'zod'
const recordSchema = z.object({ version: z.literal(1), installationId: z.uuid(), installationSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
export type PushInstallation = z.infer<typeof recordSchema>
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> }
const KEY = 'rentral.push.installation'
export function pushSecret(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error('Secure push registration requires thirty-two random bytes.')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let bits = 0, value = 0, output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 6) { bits -= 6; output += alphabet[(value >>> bits) & 63] }
  }
  if (bits) output += alphabet[(value << (6 - bits)) & 63]
  return output
}
/** A separate encrypted installation proof survives JWT logout and account changes. */
export function createPushInstallationStore(storage: Storage, uuid: () => string, random: () => Promise<Uint8Array>) {
  let pending: Promise<PushInstallation> | null = null
  async function load(): Promise<PushInstallation | null> {
    const value = await storage.getItem(KEY)
    if (value === null) {
      if (await storage.getItem(`${KEY}.present`) !== null) throw new Error('The device’s private push proof is incomplete. Review your push registrations before resetting it.')
      return null
    }
    let json: unknown
    try { json = JSON.parse(value) } catch { throw new Error('The device’s private push proof could not be read. Review your push registrations before resetting it.') }
    const parsed = recordSchema.safeParse(json)
    if (!parsed.success) throw new Error('The device’s private push proof could not be confirmed.')
    return parsed.data
  }
  return {
    load,
    create(): Promise<PushInstallation> {
      if (!pending) pending = (async () => {
        const existing = await load()
        if (existing) return existing
        const value = recordSchema.parse({ version: 1, installationId: uuid(), installationSecret: pushSecret(await random()) })
        await storage.setItem(`${KEY}.present`, '1'); await storage.setItem(KEY, JSON.stringify(value))
        return value
      })().finally(() => { pending = null })
      return pending
    },
    async reset(): Promise<void> { if (pending) await pending; await storage.removeItem(KEY); await storage.removeItem(`${KEY}.present`) },
  }
}
