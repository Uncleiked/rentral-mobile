# Encrypted backups and isolated restore verification

The implemented operator tools are `scripts/backup.ts` and `scripts/verify-backup.mjs`. They are separate from the authenticated member JSON export. The latter intentionally omits credentials and other people’s private data; an operator backup contains sensitive complete database/storage records and must stay encrypted and access-controlled.

## Configuration

Set a dedicated server-only `BACKUP_ENCRYPTION_KEY` containing exactly32 random bytes encoded as unpadded base64url (43characters). Keep the key in a password manager or similarly controlled recovery store, separate from the backup files. Do not reuse the JWT, authentication-email, bank-fingerprint or provider keys. Do not put it in Expo/public variables, source control or command-line arguments. Losing it makes existing archives unrecoverable. No key was generated, saved or printed during implementation.

Capture uses the existing private `MONGODB_URL` (and missing-database-name normalization), plus the exact `RENTRAL_STORAGE_DIR` or the existing `storage` default. Only the selected database is read. No URI, hostname, password, provider payload, token or file content is printed. Output must be a new file outside private storage; existing recovery sets are never overwritten.

## Capture

First drain and pause **every** app, worker, CLI and filesystem writer. This is a manual operator prerequisite, not an automatic maintenance switch or a claim that the tool can stop other processes. Keep the database and file tree unchanged for the entire capture. The tool uses a MongoDB snapshot transaction for document reads and checks file/directory identity, size and modification state; it aborts if observed files change. Snapshot transaction limits still apply to large databases. Use the tier’s supported managed backup architecture if an export exceeds those operational limits.

With `BACKUP_ENCRYPTION_KEY` stored privately and all writers paused:

```powershell
npm run backup:capture -- --output .\test-results\rentral-recovery.rentral --acknowledge-quiesced-writes --allow-remote
```

`--allow-remote` is an explicit read-only opt-in for the configured Atlas source; omit it for a local MongoDB source. It does not activate a provider, alter the database or create a snapshot subscription. `--acknowledge-quiesced-writes` is required before connecting. The complete private storage tree includes binary objects, sidecars and hashed `.deleted` tombstones. Symlinks, hard-linked files and unsupported collection layouts fail closed.

The version1 archive streams bounded Mongo Extended JSON documents, index/validator definitions and 64KiB file chunks through gzip and AES-256-GCM. BSON Int64 values keep their type and exact value; money does not pass through floating-point promotion. The format has authenticated headers, complete-manifest counters and SHA256 file/content digests. Verification first copies ciphertext into a private owned directory, makes the copy read-only and holds one descriptor through authentication, manifest validation and restore. It never reopens the caller’s path between those passes. Ciphertext authentication completes before decompression or interpretation. The encrypted temporary copy is removed afterward; no intermediate plaintext archive is written. Limits are500 collections,100,000 files and32MiB per record; larger sources need a reviewed backup design rather than silent truncation.

## Verify without touching the configured database

Docker must be running with the approved `mongo:8.0` image available:

```powershell
npm run backup:verify -- --archive .\test-results\rentral-recovery.rentral
```

The wrapper creates a uniquely labeled container on a random127.0.0.1 port, starts a replica set, creates a fresh `rentral_restore_<owner>` target and a private owned directory under `test-results`, and invokes the verifier with process-only target configuration. It then deletes only the exact label/name-verified container and `.owner`-verified temporary directory. It preserves the original encrypted archive, selected application database and unrelated containers/volumes.

The direct advanced command is `node --experimental-strip-types scripts/backup.ts verify-restore --archive PATH --owner <32lowercasehex> --restore-root <workspace>/test-results/rentral-restore-<owner>`, with a matching private `RENTRAL_RESTORE_URL` pointing to a fresh loopback database. That direct mode leaves the isolated result quarantined for inspection. It refuses the configured application database name even through a URI alias, non-loopback targets, existing target collections, existing restore directories, symlinked paths and paths inside current private storage.

The verifier authenticates and validates the entire archive before target writes, restores indexes and validators, verifies exact journal balance and original file/MIME/metadata/tombstone rules, and checks available storage claims plus legacy listing/avatar/media references. Restored password hashes and staff roles are cleared; sessions and reset/email-change capabilities are revoked. Encrypted authentication/push ciphertext is purged; pending push deliveries are skipped; developer mailbox code files are not restored. Listings and matching visibility are suspended, analytics collection is opted out, paid entitlements are revoked and sponsorship is paused until review. Unsubmitted/live payment attempts and reserving financial instructions become uncertain for recovery reconciliation; original monetary values, references, attempted markers and immutable journals remain intact. Source records remain unchanged.

A successful result remains `verified_quarantined`: its runtime schema marker is deliberately0, so application queries fail closed, and normal database setup refuses a restore marker before making changes. It is **not** an approved production restore. No automated cutover, working login or ordinary self-service recovery is promised for this target. A separate verified account-recovery and staff-bootstrap procedure must be approved first. Reconcile provider references, staff-role changes and privacy withdrawals/closures that occurred after the snapshot, establish fresh authentication/device consent, and review ownership and balances before separately approving any cutover. Never replay a financial POST because an older backup forgot its attempted marker. No restore or provider activation against configured Atlas was performed.

## Verification evidence and retention

`npm run test:mongo -- --backup-only` provisions its own owned fixture, exercises encrypted capture and isolated restore with genuine binary objects, tombstones, exact BSON types, financial journals and revoked authentication/push capabilities, and cleans its own data/container. The normal Mongo test sequence includes these checks after the core/financial/auth suites. Unit checks cover tampering, truncation, wrong keys, path traversal, device names, aliases, symlinks, unchanged existing artifacts, CLI preflight and streaming records.

The tools never delete old backups, source records, financial history or evidence by age. Select retention, off-machine storage, legal/dispute holds, secure Windows directory ACLs, recovery objectives and a restore-rehearsal schedule explicitly. File mode requests alone are not a Windows ACL guarantee. [Backup/retention planning and official MongoDB references](backup-retention.md).
