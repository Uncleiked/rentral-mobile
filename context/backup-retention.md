# Backup, restoration and retention proposal

This is an operator plan, not an active backup service or an asserted recovery guarantee. No backup of configured Atlas/user assets, paid subscription, snapshot schedule, restore, deletion or encryption-key change was performed during implementation.

Implemented encrypted capture and owned restore verification are documented in [backup operations](backup-operations.md). Their fixture acceptance does not mean a scheduled backup or configured Atlas recovery set exists.

## Recovery unit

Back up MongoDB and the complete configured `RENTRAL_STORAGE_DIR` together. Preserve stored binaries, `.deleted` tombstones and StorageObject metadata; skipping hidden tombstones can resurrect a deleted path after restore. Keep encrypted secret/key recovery material separately with restricted access. Authentication delivery ciphertext needs its corresponding current/previous encryption keys only until the job expires; bank HMAC keys must not be casually rotated because existing recipient fingerprints depend on them. Never include secrets in source control, manifests, command logs or screenshots.

For the current local filesystem architecture, a documented short maintenance window that drains and pauses app/worker writes is the simplest consistent snapshot boundary. Copying MongoDB and files independently while uploads/deletions continue can create dangling or resurrected references. Do not claim point-in-time recovery for the combination without proving that consistency boundary.

MongoDB recommends either capturing the replica-set oplog or stopping writes for a consistent tools-based backup, and verifying backups through restoration. `mongodump --oplog` has deployment/scope restrictions: it is not a generic flag to append to any single-database Atlas dump. Prefer the cluster’s supported backup mechanism; otherwise review available permissions and a quiesced BSON backup plan. [MongoDB backup/restore guidance](https://www.mongodb.com/docs/v8.0/tutorial/backup-and-restore-tools/), [mongodump restrictions](https://www.mongodb.com/docs/database-tools/mongodump/).

Atlas backup capabilities depend on the actual tier and account availability. Current official documentation describes optional Free-tier daily backups with only four retained snapshots as a private preview rolling out gradually; do not assume a free cluster is already protected or enable a billed option without the operator’s choice. Review the cluster Backup page and select the required recovery objective explicitly. [Atlas Free cluster backup availability](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/), [Atlas backup options](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).

## Proposed operating targets

For review: daily encrypted database-and-file recovery sets, an off-machine copy, 7 daily and 4 weekly recovery sets, and a restore rehearsal at least monthly and before financial activation. These are proposed operating targets, not configured behavior or statutory retention periods. Choose a shorter recovery-point objective before accepting real money; daily snapshots alone can lose a day of newly recorded obligations. Retain audit manifests containing UTC snapshot time, application/schema version, counts and file digests, without personal contents or credentials. Restrict access and periodically verify decryption and integrity.

## Restore acceptance

Restore first into a new isolated owned database and private storage directory. Disable payment/settlement, provider mutations, commercial activation, email and lifecycle workers. Never restore directly over the configured user database as a rehearsal.

Validate indexes/collection validators/readiness markers; balance and uniqueness of immutable collection/settlement journals; reservation totals; storage claims against bytes/MIME/digests and tombstones; and privacy/closure state. Do not use `db push`, bypass validators, or silently rewrite journal history to make an old snapshot pass. A restored snapshot can predate closure, consent withdrawal, password changes or session revocation: preserve an independently controlled recovery/withdrawal record and review reapplication before exposing accounts. Revoke restored sessions/challenges and rotate signing material as part of an explicitly approved recovery procedure.

Provider transactions made after the snapshot may already exist. Reconcile exact references read-only with the matching test/live environment before reopening money movement. Quarantine unknown submissions; never repeat an old POST merely because its local attempted marker is absent from an older backup. Entitlements and sponsorship exposure also remain off until their source collections/refund status are verified. Record measured recovery time and data loss; only then publish a recovery guarantee.

## Retention boundary

Keep existing analytics withdrawal/90-day pruning, authentication ciphertext expiry and safe abandoned-upload cleanup. Account closure is soft and retains necessary contractual/financial/evidence history. Do not add broad User/ledger/booking/dispute TTLs. A final retention schedule, dispute/legal holds, backup expiry handling for withdrawal/closure records, and emergency recovery authority require operator policy approval before automated destructive cleanup.
