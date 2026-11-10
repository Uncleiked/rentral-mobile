import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import { mongoDatabaseName, mongoUrl, localMongoUrl } from '../lib/database/config.ts'
import { ensureMongoIndexes } from '../lib/database/indexes.ts'

config({ path: '.env.local', quiet: true })
config({ quiet: true })
const allowRemote = process.argv.includes('--allow-remote')
const uri = (allowRemote ? mongoUrl : localMongoUrl)(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
// Match runtime's bounded cold Atlas discovery allowance; observed DNS/TLS
// startup on this development network can exceed three seconds.
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 })
try {
  await client.connect()
  const hello = await client.db('admin').command({ hello: 1 })
  if (!hello.setName) throw new Error('Local MongoDB must run as a replica set (for example rs0) to support Rentral transactions.')
  const result = await ensureMongoIndexes(client.db(mongoDatabaseName(uri)))
  console.log(`MongoDB ready: ${result.collections} collections and ${result.indexes} indexes checked.`)
} catch (error) {
  console.error('[mongodb/setup] Setup failed:', error instanceof Error && error.message === 'RESTORE_QUARANTINED_SETUP_REFUSED'
    ? 'Restore verification databases stay quarantined. Choose the application database; recovery cutover requires a separate review.'
    : error instanceof Error ? error.name : 'UnknownError')
  process.exitCode = 1
} finally { await client.close() }
