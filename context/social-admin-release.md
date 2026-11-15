# Admin, social features and durable uploads

Updated 15 November 2026. This increment is in the RentralMobile repository and
uses npm, Next.js, MongoDB/Prisma and the existing JWT/Google authentication.
It supersedes the older statement that gallery approval and publication review
are always separate.

## What changed

An active gallery-upload grant now permits the account to publish complete gallery
listings without manual publication review. The server still checks account
availability, the current grant revision, owned immutable media, required authority
documents, asset details and payment or a separate fee waiver. It records the
gallery grant as the reason for bypass; it does not invent a human document
approval, GPS match or verified payment. Recorded listings retain the separate
direct-publication grant.

New gallery submissions carry versioned publication evidence. Eligible older
pending gallery listings can use Finish publishing after the owner confirms their
current submission. A previous rejection/suspension cannot be silently undone.
Grant revocation hides affected inventory and invalidates the prior grant proof.
Saving an incomplete draft remains separate from submitting/publishing.

Admin Record decision now explains the exact remaining reason characters, changed
switch state and any owner acknowledgement. An ordinary reason needs 15 trimmed
characters; owner overrides need 30 and explicit acknowledgement. One selected
permission is saved at a time. Success is confirmed through an audit receipt;
an uncertain response offers original-decision readback instead of blind replay.

The administration search bar groups Listings, Members, Organizations and
Decisions. Each uses the existing permission-checked server search, with links
that carry the term into the full category filters. Member search uses username/
email prefixes or an exact account ID. Listing, organization and audit workspaces
retain their filters, paging and existing export boundaries. Private documents,
bank details and raw GPS are not added to search results.

The logo points to /admin inside administration, /marketplace inside the
marketplace, and / on the public homepage.

## Social behavior

People searches public usernames, optionally prefixed with @. Members can
follow/unfollow, inspect follower/following lists, like active listings and save
posts privately. Public social responses omit email, identity documents and bank
details. Blocking removes follows and prevents new social messages/engagement;
the actor can recover their own block status without exposing a blocked profile.

New direct member conversations use Primary, Requests and Sent. A recipient's
incoming non-mutual message goes into Requests. Mutual following or the recipient
choosing Move to Primary enables the conversation. The sender can send one
invitation while it is pending. Accepted conversations remain accepted after an
unfollow; blocking still stops contact. Existing listing-bound business inquiry
history stays in Primary and is not retroactively treated as a new invitation.

Typing/presence and read receipts are participant-scoped and suppressed for
unaccepted requests or blocked contact. Activity expires and the UI polls for
updates; this is not a new WebSocket service. Follow, like and message-request
events create notification records atomically with their actions. Replays do not
duplicate notifications, and rapid re-follow/re-like loops have a cooldown.
Private saves never notify a host.

The new social experience is implemented in the web marketplace and shared APIs.
Existing native listing messaging remains compatible. Native physical-device
acceptance is separate from source compilation and transport tests.

## Database preparation and the People setup error

The new API intentionally refuses social writes until the database has its
reviewed social indexes/validators and readiness marker. Login working does not
mean this later additive feature has been prepared. Do not reset the database,
edit the marker by hand, or use prisma db push.

From C:/Users/Mudian Consult/Documents/RentralMobile:

```powershell
npm.cmd run db:setup -- --allow-remote
```

This command loads the existing private .env.local. Use --allow-remote only for
the deliberately selected Atlas database. For a local loopback replica set,
npm.cmd run db:setup is sufficient. The setup adds social/media collections,
indexes and validators, installs the replacement Conversation uniqueness index
before removing the known legacy constraint, and fills missing Conversation
revision counters. It preserves user/listing/financial records. Readiness is
committed last; failures keep the unprepared feature disabled.

After successful setup, stop the existing development terminal with Ctrl+C, run
npm.cmd run dev, and refresh People. For production, also deploy the updated
application. Old Vercel deployments do not receive source changes automatically.
This increment has not applied that command to the hosted database or deployed.

## Durable uploads and serverless hosting

Storage can use MongoDB GridFS in the same configured database; no second
database or new storage API key is required. Vercel defaults to this driver.
Local development defaults to the existing filesystem. RENTRAL_STORAGE_DRIVER
may explicitly select mongodb or local; use mongodb locally when testing the
same persistent file store as production.

Database preparation creates MediaBlob, rentral_media.files and
rentral_media.chunks with reviewed validators/indexes. Runtime uploads do not
perform database schema/index setup. Existing ownership claims, immutable paths,
content-type/magic/size/digest checks, deletion tombstones and signed private
media access remain enforced.

Large browser/native files use confirmed sequential parts of 3,133,440 bytes.
Each request fits below the Vercel body limit. A lost acknowledgement stops the
attempt; readback and explicit same-file/same-path retry preserve the original
instruction. Final publication waits for the completed full-file digest and
available storage claim. Range streaming supports playback without buffering an
entire video.

Files that were never persisted, or disappeared from an earlier ephemeral
deployment, cannot be reconstructed from their filenames. After checking the
original upload, reselect the same original file for recovery. A checked failed
upload can be abandoned explicitly without deleting a server listing/history.
Selecting the Mongo driver does not silently migrate old filesystem originals.
Keep the prior originals/backups when changing storage drivers.

## Verification and limits

Repeatable checks include npm.cmd test, npm.cmd run lint, npm.cmd run typecheck,
npm.cmd run mobile:typecheck and npm.cmd run build. Browser scripts exercise
synthetic loopback records at 320, 390, 768 and 1440 pixels:

- scripts/admin-workspace-preview.mjs with scripts/verify-admin-search-ui.mjs
- scripts/social-workspace-preview.mjs with scripts/verify-social-ui.mjs
- scripts/publishing-permission-preview.mjs with
  scripts/publishing-permission-audit.js

Owned Mongo integration tests must use the uniquely marked loopback fixture,
never .env.local/Atlas. scripts/test-mongodb-portable.mjs provides a disposable
Windows alternative to the Docker runner. Current results and any remaining
acceptance boundaries are recorded in progress-tracker.md. Passing these checks
does not claim real merchant settlement, provider delivery, physical-device
camera/GPS acceptance, or that every conceivable social feature exists.

