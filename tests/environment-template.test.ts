import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'

it('keeps shareable staging examples free of credentials', () => {
  const values = parse(readFileSync('.env.staging.example'))
  for (const [name, value] of Object.entries(values)) {
    if (name.endsWith('ENABLED') || name === 'NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN') continue
    if (name === 'NEXT_PUBLIC_APP_URL') {
      const publicUrl = new URL(value)
      expect(['https:', 'http:'].includes(publicUrl.protocol) && !publicUrl.username && !publicUrl.password, 'App origin must be a public URL without credentials').toBe(true)
    } else if (name === 'NEXT_PUBLIC_SUPABASE_URL') {
      const publicUrl = new URL(value)
      expect(publicUrl.protocol === 'https:' && publicUrl.hostname.endsWith('.supabase.co') && !publicUrl.username && !publicUrl.password, 'Supabase origin must be a public project URL without credentials').toBe(true)
    } else {
      // Assert a boolean so a failure can never print the credential itself.
      expect(value.length === 0, `${name} belongs in ignored .env.staging`).toBe(true)
    }
  }
})
