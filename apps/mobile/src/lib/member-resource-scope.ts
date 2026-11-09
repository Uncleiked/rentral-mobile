export type ResourceLease = Readonly<{ actorId: string; path: string }>
export type ScopedMemberResult<T> = { actorId: string; path: string; data: T | null; error: string | null }
export function currentMemberResult<T>(result: ScopedMemberResult<T> | null, actorId: string, path: string): ScopedMemberResult<T> | null {
  return result?.actorId === actorId && result.path === path ? result : null
}
/** Focus leases prevent old-account responses and callbacks from touching a newer request. */
export function createMemberResourceScope() {
  let current: ResourceLease | null = null
  return {
    activate(actorId: string, path: string): ResourceLease { current = Object.freeze({ actorId, path }); return current },
    capture(actorId: string, path: string): ResourceLease | null { return current?.actorId === actorId && current.path === path ? current : null },
    accepts(lease: ResourceLease): boolean { return current === lease },
    release(lease: ResourceLease): void { if (current === lease) current = null },
  }
}
