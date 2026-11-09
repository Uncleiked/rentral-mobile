import type { AuthSession } from './auth-types'
type Effect = (session: AuthSession) => Promise<void>
const effects = new Set<Effect>()
export function beforeSignOut(effect: Effect): () => void { effects.add(effect); return () => { effects.delete(effect) } }
/** Optional device cleanup can neither veto logout nor retain JWTs indefinitely. */
export async function runBeforeSignOut(session: AuthSession): Promise<void> {
  if (!effects.size) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.allSettled([...effects].map(effect => Promise.resolve().then(() => effect(session)))),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 5000) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}
