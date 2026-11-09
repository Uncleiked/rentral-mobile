import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { mongoUrl } from './lib/database/config.ts'

// Match Next.js locally; explicit process variables keep precedence.
const environmentFile = process.env.RENTRAL_ENV_FILE
config({ path: environmentFile || '.env.local', quiet: true })
if (!environmentFile) config({ quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  engine: 'classic',
  datasource: { url: mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL) },
})
