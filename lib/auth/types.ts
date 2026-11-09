export type AuthUser = {
  id: string; email: string; is_anonymous: false
  app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>
}
export type AuthSession = {
  access_token: string; refresh_token: string; token_type: 'bearer'
  expires_in: number; expires_at: number; user: AuthUser
}
export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}
