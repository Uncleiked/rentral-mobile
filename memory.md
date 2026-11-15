# Memory - Admin/social delivery and persistent uploads

Latest steering: mandatory chosen usernames are implemented in email/API/native signup
and Google continuation; focused108tests/types/lint pass, existing accounts kept.
Follow is user-confirmed working. Admin scalaraccess nowpasses400msRTT browser and
real atomic receipt-failure rollback. Final gallery performance/scalar write work
is active in runtime_follow_diagnosis; no claim of complete verification yet.


Follow is now fixed and user-confirmed on the actual localhost account after refresh
(2026-11-15). The cause was Prisma's User relation update emulation during a
revision-only lock; a fixed transaction-bound raw scalar command preserves
readiness, BSON Long increments, timestamps and exact active-account locking.
Actual browser Follow also passes simulated400ms database RTT. AuthForm POST +
hydration guard fixes a real pre-hydration credential GET fallback.
Latest unit run2317passed/127guarded; all127Mongo checks ran and passed separately
in owned loopback fixtures. Genuine maximum-gallery/social/admin browser flow
passed20checkpoints. Delayed gallery submission still reproduces P2028 in its
old User permission CAS; runtime_follow_diagnosis is fixing it. Delayed admin
case, final checks/build/docs still pending. See context/runtime-verification.md.
Git403 was the KingDavidsHub/Uncleiked HTTPS account mismatch; instructions given.
Local main now matches origin/main after the user's push; agent did not push.

Updated: 2026-11-15 Africa/Lagos. Active repository:
C:/Users/Mudian Consult/Documents/RentralMobile. Use npm.cmd/Node24,
Next16.4.5, Prisma6.19.3 Mongo/JWT; Documents/rentral is the retired context.
Preserve private settings and hosted data. No commit/push/deploy or hosted setup
was performed by this agent; all requested source/progress is saved on disk.

## Completed

Nov13 named web request implemented: gallery approval includes publication without
manual review, admin reason/owner-ack save guidance, categorized search and filter
handoff, contextual admin/marketplace logos, People/username search, follows and
connections, public likes/private bookmark saves, direct Requests/Sent/Primary
with mutual follow or recipient acceptance, typing privacy and notifications.
Legacy listing inquiries remain Primary; new direct social UI is web/API.
Native existing listing-chat contracts remain compatible; gallery copy corrected.

Persistent same-database Mongo GridFS heads/chunks/files, immutable path/claims/
tombstones, signed range reads, bounded browser/native upload parts and exact
uncertain-upload recovery implemented. Vercel defaults to Mongo storage; local
defaults filesystem. No missing-file fallback or silent old-file migration.
New social/media readiness versions and reviewed indexes/validators/backup support
are saved. listing_publish receipt validator also corrected.

Root AdminGlobalSearch found/fixed stale query leaking into a selected host scope;
roles without searchable categories no longer receive an empty search control.
Mutual block readback uses minimal actor-owned state, never a blocked profile.
Normal members see friendly community-not-ready text instead of terminal commands.

## Final evidence

Full Vitest:2,286PASS/121guardedSKIP,181passing files. All121unique Mongo cases
also ran separately and passed in owned loopback fixtures: core55/admin18/social6/
financial18/auth20/backup2/avatar2. The later corrected admin/social reruns replace
earlier results; do not add overlapping runs. Evidence:
test-results/mongodb-portable-acceptance.json; nov15-complete-unit.log.

Global ESLintPASS, native TypeScriptPASS, normal productionbuildPASS
(Next16.4.5,115generated pages). nov15-final-build.log and
nov15-complete-lint.log. Responsive social/notifications, globalsearch and
permission/gallery browser workflowsPASS at320/390/768/1440.
Ignored output/playwright has audits/screenshots; repeatable scripts are saved.

Docker was unavailable, so official portable Mongo8.0.37 was SHA256-verified and
used only inside ignored test-results. scripts/test-mongodb-portable.mjs now
offers owned loopback acceptance without Docker; no service/firewall install.
All test Mongo/Prisma processes stopped and owned data removed.

## Runtime and last user issue

User's Nov15 People screenshot shows DATABASE_SETUP_REQUIRED. I explained this
is the missing additive socialVersion setup, not Google credentials. Owner command:
npm.cmd run db:setup -- --allow-remote from RentralMobile, using selected Atlas
.env.local; then restart npm.cmd run dev and refresh. This is not a reset.
It was NOT executed against hosted data here. New Vercel deployment also needed
before the deployed website can show saved changes. Old ephemeral uploads that
never persisted need original-file reselection after readback.

Prisma DLL was held by dev/test workers. Waited for fixtures, verified/stopped
only this repository's Next dev parent/child, generated normally and built.
No fake cache/no-engine generation/generated code edit. Dev restored hidden at
port3000 (launcher38180; always reverify processes next session). Final HTTP:
home200; admin/marketplace307 to sign-in; unauth People/adminAPIs401.

## Next session

Read context/social-admin-release.md, current git status and newest user steering.
If asked to activate hosted features, review/authorize the selected Atlas setup
and deployment; don't assume local code completion already changed production.
Keep provider/device/merchant acceptance separate from source/test completion.
No named web feature remains unfinished in this increment.

