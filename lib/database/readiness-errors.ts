export const MONGO_READINESS_MESSAGES = {
  DATABASE_SETUP_REQUIRED: 'MongoDB is not prepared. Run npm run db:setup for the chosen database before using Rentral.',
  DATABASE_UNAVAILABLE: 'MongoDB is unavailable. Check the configured connection and try again.',
} as const

export type MongoReadinessCode = keyof typeof MONGO_READINESS_MESSAGES

/** Module reloads can change custom-class identity. Accept only this narrow
 * error shape, and always supply our constant message rather than its payload. */
export function mongoReadinessFailure(error: unknown): { status: 503; code: MongoReadinessCode; message: string } | null {
  if (!(error instanceof Error)) return null
  try {
    if (error.name !== 'MongoReadinessError' || !('status' in error) || error.status !== 503 || !('code' in error)) return null
    const code = error.code
    if (code !== 'DATABASE_SETUP_REQUIRED' && code !== 'DATABASE_UNAVAILABLE') return null
    return { status: 503, code, message: MONGO_READINESS_MESSAGES[code] }
  } catch { return null }
}
