import { createClient } from '@supabase/supabase-js'

/**
 * Admin client utilizing the service role key.
 * IMPORTANT: This must NEVER be used in the client or exported to the frontend.
 * It is meant solely for secure backend route handlers and edge functions
 * where bypassing RLS or updating auth.users is required.
 */
export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
