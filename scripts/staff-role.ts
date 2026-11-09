import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { MongoClient, type Document } from 'mongodb'
import { mongoDatabaseName, mongoUrl, localMongoUrl } from '../lib/database/config.ts'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID } from '../lib/database/metadata.ts'
import { staffRole } from '../lib/auth/roles-policy.ts'

config({ path: '.env.local', quiet: true }); config({ quiet: true })
const args = process.argv.slice(2)
const option = (name: string): string | undefined => args[args.indexOf(name) + 1]
const userId = args.includes('--user-id') ? option('--user-id') : undefined
const role = args.includes('--role') ? option('--role') : undefined
const reason = args.includes('--reason') ? option('--reason')?.trim() : undefined
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
  !(role === 'member' || staffRole(role)) || !reason || reason.length < 15 || reason.length > 2000) {
  console.error('Usage: npm run staff:role -- --user-id UUID --role admin|moderator|finance|analyst|member --reason "Meaningful operator reason" [--allow-remote]')
  process.exit(1)
}
const uri = (args.includes('--allow-remote') ? mongoUrl : localMongoUrl)(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
try {
  await client.connect()
  const database = client.db(mongoDatabaseName(uri))
  const marker = await database.collection<{ _id: string; schemaVersion: number }>(MONGO_SETUP_COLLECTION).findOne({ _id: MONGO_SETUP_ID })
  if (marker?.schemaVersion !== MONGO_SCHEMA_VERSION) throw new Error('Setup required')
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      const users = database.collection<{ _id: string; staff_role?: string | null; revision: number }>('User')
      const target = await users.findOneAndUpdate({ _id: userId }, { $inc: { revision: 1 } }, { session, returnDocument: 'before' })
      if (!target) throw new Error('Member not found')
      const nextRole = staffRole(role)
      if (target.staff_role === nextRole) return
      await users.updateOne({ _id: userId }, { $set: { staff_role: nextRole, updatedAt: new Date() } }, { session })
      // Deliberate database-operator bootstrap, never falsely attributed to a member.
      await database.collection<Document & { _id: string }>('AdminAudit').insertOne({ _id: randomUUID(), actor_id: null, operator_id: 'local-database-operator',
        action: 'bootstrap_staff_role', target_type: 'user', target_id: userId, reason,
        metadata: { source: 'local_database_operator', previousRole: target.staff_role ?? null, role: nextRole }, createdAt: new Date() }, { session })
    }, { maxCommitTimeMS: 10000 })
  } finally { await session.endSession() }
  console.log('Staff role saved and audited. Current database access applies to the next request.')
} catch (error) {
  console.error('[staff/role] Could not change role:', error instanceof Error ? error.name : 'UnknownError')
  process.exitCode = 1
} finally { await client.close() }
