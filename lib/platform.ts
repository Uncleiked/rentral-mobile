/** Enable only after the platform migration has passed staging acceptance. */
export function platformEnabled(): boolean {
  return process.env.RENTRAL_PLATFORM_ENABLED === 'true'
}

export const PLATFORM_UNAVAILABLE = 'This feature is being prepared. Please check back soon.'

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }
