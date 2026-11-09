import { once } from 'node:events'
import prisma from '../../lib/db.ts'
import { localMongoDatabaseName } from '../../lib/database/config.ts'
import { assertStorageClaimsReady, closeMongoReadiness } from '../../lib/database/readiness.ts'
import { withTransaction } from '../../lib/database/transactions.ts'
import { claimStorageObjects, prepareListingStorage, removeStoredObjects } from '../../lib/storage-claims/service.ts'

const owner = process.env.RENTRAL_TEST_MONGO_OWNER
const uri = process.env.RENTRAL_TEST_MONGO_URI
const [mode, userId, path, listingId] = process.argv.slice(2)
try {
  if (!owner || !/^[a-f0-9]{32}$/.test(owner) || !uri || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri ||
    localMongoDatabaseName(uri) !== `rentral_test_${owner}` || !['attach', 'remove'].includes(mode)) throw new Error('OWNED_FIXTURE_REQUIRED')
  await assertStorageClaimsReady()
  const prepared = mode === 'attach' ? await prepareListingStorage(userId, { videoPath: path }) : null
  process.stdout.write('READY\n')
  await once(process.stdin, 'data')
  if (mode === 'attach') await withTransaction(async tx => {
    await claimStorageObjects(tx, userId, prepared)
    await tx.listing.create({ data: { id: listingId, lister_id: userId, category: 'car', listing_status: 'draft', video_path: path } })
  })
  else await removeStoredObjects(userId, 'listings-media', [path])
  process.stdout.write('RESULT:{"success":true}\n')
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  process.stdout.write(`RESULT:${JSON.stringify({ success: false, ...(typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? { code } : { code: 'WORKER_FAILURE' }) })}\n`)
} finally {
  await prisma.$disconnect()
  await closeMongoReadiness()
  process.stdin.destroy()
}
