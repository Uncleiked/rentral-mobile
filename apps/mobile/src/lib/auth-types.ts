export type AuthUser = { id: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>; is_anonymous: false }
export type AuthSession = { access_token: string; refresh_token: string; expires_at: number; expires_in: number; token_type: 'bearer'; user: AuthUser }
