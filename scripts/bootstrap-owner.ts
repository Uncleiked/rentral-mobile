import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { MongoClient, type Document } from 'mongodb'
import { mongoDatabaseName, mongoUrl, localMongoUrl } from '../lib/database/config.ts'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID, OWNER_ADMIN_VERSION } from '../lib/database/metadata.ts'

config({ path: '.env.local', quiet: true }); config({ quiet: true })
const args = process.argv.slice(2)
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const email = option('--email')?.trim().toLowerCase(), reason = option('--reason')?.trim()
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !reason || reason.length < 30 || reason.length > 2000 || args.some((value, index) => value.startsWith('--') && !['--email', '--reason', '--allow-remote', '--apply-owner'].includes(value) || ['--email', '--reason'].includes(value) && (!args[index + 1] || args[index + 1].startsWith('--')))) {
  console.error('Usage: npm run owner:bootstrap -- --email EXISTING_ACCOUNT_EMAIL --reason "Detailed operator authorization reason" [--allow-remote] [--apply-owner]')
  process.exit(1)
}
const uri = (args.includes('--allow-remote') ? mongoUrl : localMongoUrl)(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 })
type OwnerAccount = { _id: string; email: string; staff_role?: string | null; closed_at?: Date | null; suspended_at?: Date | null; password_hash?: string | null; revision: number }
try {
  await client.connect()
  const database = client.db(mongoDatabaseName(uri)), users = database.collection<OwnerAccount>('User')
  const setup = database.collection<{ _id: string; schemaVersion: number; ownerAdminVersion?: number; ownerBootstrapRevision?: number }>(MONGO_SETUP_COLLECTION)
  const marker = await setup.findOne({ _id: MONGO_SETUP_ID })
  if (marker?.schemaVersion !== MONGO_SCHEMA_VERSION || marker.ownerAdminVersion !== OWNER_ADMIN_VERSION) throw new Error('Setup required')
  const target = await users.findOne({ email })
  if (!target || target.closed_at || target.suspended_at || !target.password_hash) throw new Error('Existing active password account required')
  const owners = await users.find({ staff_role: 'owner' }).limit(2).toArray()
  if (owners.length > 1 || owners.length === 1 && owners[0]._id !== target._id) throw new Error('Ownership already assigned; use an authenticated owner transfer')
  if (!args.includes('--apply-owner')) {
    console.log(JSON.stringify({ dryRun: true, accountMatched: true, active: true, alreadyOwner: target.staff_role === 'owner', existingOwners: owners.length, ready: true }))
  } else if (target.staff_role === 'owner') console.log('The selected account already owns this platform. No role changed.')
  else {
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        const locked = await setup.findOneAndUpdate({ _id: MONGO_SETUP_ID, ownerAdminVersion: OWNER_ADMIN_VERSION }, { $inc: { ownerBootstrapRevision: 1 } }, { session, returnDocument: 'after' })
        if (!locked) throw new Error('Owner setup changed')
        const current = await users.findOneAndUpdate({ _id: target._id, email, $and: [{ $or: [{ closed_at: null }, { closed_at: { $exists: false } }] }, { $or: [{ suspended_at: null }, { suspended_at: { $exists: false } }] }] }, { $inc: { revision: 1 } }, { session, returnDocument: 'before' })
        if (!current || !current.password_hash) throw new Error('Account changed')
        const existing = await users.find({ staff_role: 'owner' }, { session }).limit(2).toArray()
        if (existing.length) throw new Error('Ownership already assigned; use explicit owner transfer')
        await users.updateOne({ _id: current._id }, { $set: { staff_role: 'owner', updatedAt: new Date() } }, { session })
        await database.collection<Document & { _id: string }>('AdminAudit').insertOne({ _id: randomUUID(), actor_id: null, operator_id: 'local-database-operator', action: 'bootstrap_platform_owner', target_type: 'user', target_id: current._id, reason,
          metadata: { source: 'explicit_database_operator_bootstrap', previousRole: current.staff_role ?? null, role: 'owner', moneyMoved: false }, createdAt: new Date() }, { session })
      }, { maxCommitTimeMS: 10000 })
    } finally { await session.endSession() }
    console.log('Platform ownership saved for the selected existing account and audited. Sign in normally; current database authority applies immediately.')
  }
} catch (error) {
  console.error('[owner/bootstrap] Could not prepare ownership:', error instanceof Error ? error.name : 'UnknownError')
  process.exitCode = 1
} finally { await client.close() }
