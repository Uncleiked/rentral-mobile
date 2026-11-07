import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { migrationConnection } from './lib/environment/postgres-config'

// Match Next.js locally while preserving values injected by the deployment host.
const environmentFile = process.env.RENTRAL_ENV_FILE
config({ path: environmentFile || '.env.local', quiet: true })
if (!environmentFile) config({ quiet: true })

// Client generation runs during builds without contacting a database. Only
// database commands require DIRECT_URL; do not require migration credentials in CI.
const directUrl = process.env.DIRECT_URL

export default defineConfig({
  datasource: directUrl ? {
    url: migrationConnection(directUrl, process.env.SUPABASE_DB_CA_CERT_PATH),
  } : undefined,
})
