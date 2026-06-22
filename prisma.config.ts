import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  datasource: {
    // We pass the direct connection URL here so the CLI can push schema changes
    url: env('DIRECT_URL'), 
  },
})