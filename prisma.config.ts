import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'
import { migrationConnection } from './lib/environment/postgres-config'

// Match Next.js locally while preserving values injected by the deployment host.
const environmentFile = process.env.RENTRAL_ENV_FILE
config({ path: environmentFile || '.env.local', quiet: true })
if (!environmentFile) config({ quiet: true })

export default defineConfig({
  datasource: {
    // We pass the direct connection URL here so the CLI can push schema changes
    url: migrationConnection(env('DIRECT_URL'), process.env.SUPABASE_DB_CA_CERT_PATH),
  },
})
