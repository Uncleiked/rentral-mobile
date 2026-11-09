/** Local setup opts in after MongoDB indexes/validators are initialized; runtime readiness fails closed. */
export function platformEnabled(): boolean {
  return process.env.RENTRAL_PLATFORM_ENABLED === 'true'
}

export const PLATFORM_UNAVAILABLE = 'This feature is being prepared. Please check back soon.'

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }
