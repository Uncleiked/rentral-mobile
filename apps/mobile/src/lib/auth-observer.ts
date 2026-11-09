import type { AuthSession } from './auth-types'

type AuthSource = {
  subscribe: (listener: (session: AuthSession | null) => void) => () => void
  getSession: () => Promise<AuthSession | null>
}

export function observeAuth(source: AuthSource, onSession: (session: AuthSession | null) => void, onError: (reason: unknown) => void) {
  let active = true
  let notification = 0
  const unsubscribe = source.subscribe(session => {
    if (!active) return
    notification++
    onSession(session)
  })
  return {
    async refresh(): Promise<void> {
      if (!active) return
      const started = notification
      // Session commits, including the initial restore, own all state updates.
      // Neither an old result nor its error may overwrite a newer notification.
      try { await source.getSession() }
      catch (reason) { if (active && started === notification) onError(reason) }
    },
    dispose(): void { active = false; unsubscribe() },
  }
}
