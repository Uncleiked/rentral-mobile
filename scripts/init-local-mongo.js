/* global rs, db, sleep */
// Run only inside the local development Compose service with mongosh --file.
try {
  const status = rs.status()
  if (status.set !== 'rs0') throw new Error('The existing database belongs to another replica set.')
} catch (error) {
  if (error.codeName !== 'NotYetInitialized') throw error
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })
}
let ready = false
for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) { ready = true; break }
  sleep(1000)
}
if (!ready) throw new Error('The local MongoDB primary did not become ready. Inspect the development container logs.')
