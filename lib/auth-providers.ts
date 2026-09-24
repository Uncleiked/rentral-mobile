export async function getAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return { google: false, apple: false }
    const settings: unknown = await response.json()
    const external = settings && typeof settings === 'object' && 'external' in settings ? settings.external : null
    return {
      google: !!external && typeof external === 'object' && 'google' in external && external.google === true,
      apple: !!external && typeof external === 'object' && 'apple' in external && external.apple === true,
    }
  } catch {
    // Email sign-in remains available when provider discovery is temporarily offline.
    return { google: false, apple: false }
  }
}
