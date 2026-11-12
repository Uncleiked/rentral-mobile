# Memory - Admin publishing, review inventory and owner drafts

Updated: 2026-11-12 Africa/Lagos. Active repository:
C:/Users/Mudian Consult/Documents/RentralMobile (not default rentral).

## Current delivery

Completed user's admin workflow extension while preserving dark UI: server-wide
listing search by username/@handle/email/title/address/ID, filters,25-row cursor
pagination, member-to-listings navigation, scoped1,000-row CSV with truncation,
private immutable60-second media previews and explicit publication checklists.
Admin grant commands independently control gallery uploads, future free posting
and trusted direct publishing. Existing roles unchanged; owner self-change requires
explicit detailed override, other admins cannot self-grant. Revisions, current role
checks, audits and exact original-command receipts reused.

All admitted users can save partial private drafts after category selection.
Top Save draft/Save and exit, clear dirty/server-save/recovery status and owner
Drafts/Submitted/Live/Needs attention/Archived inventory added. Correct custom
listing titles, gallery photos/resume/archive behavior. Browserfoundandfixed a
house draft dirty bug caused by boat-onlyhasCaptain local default surviving until
secure category recovery. Submission keeps same row, returnsactualstatus and is
visible underSubmitted when no longerDraft.

## Critical decisions

Direct publishing skips human document approval only. It retains current active
account/approvedorganization, exact immutable authoritydocument/media/captureaddress
(or galleryexemption), video processing readiness and actual exact successful fee
payment or explicitwaiver. No fake payment/DocumentReview. New publishing proof
binds owner+grant+documentdigest; publicdetailpolicylabel truthful. Trustedintent
awaitingpayment/video stayssaved outsidehumanreviewqueue; allsubmitted/membersearch
findsit. Owner Finishpublishing has revision+receiptreadback/retry, no automatic
providerhook. Freeposting stamped only on future validatedsubmissions; removing
permission preserves recordedwaivers. Revokingdirect demotes nonarchivedactiveand
pendingdirect inventory, preserves suspended/archive enforcement. Negative human
moderation switchesmanualmode. Account suspension clearsall3grants.

Optional Usergrant and Listingpublication fields added to Prisma/schema validators;
legacy missing fields grantnothing. No new dependency or hosted migration/setup/
index applied. npm11+Node24, Prisma6.19.3 Mongo connector, email/password JWT plus
optionalGoogle remainauthoritative. Private env unchanged; never printsecrets.

## Verification

Final npm.cmd run buildPASS (Next16.4.5,TypeScript,110staticpages).
Full Vitest2,078PASS,113SKIP across6opt-inintegrationfiles;161filesPASS.
Full npm.cmd run lint and typecheckPASS. git diff --checkPASS.
Admin22workflows at4viewports verified:87/88initialrun,1tabletfixtureHMRinterruption
passedtargetedrerunplusfinalscreenshots8/8. Owner8workflows at4viewports32/32PASS,
includingall4partialdraftstages, gallerysavedstateanddirectlostresponse/reloadreadback.
Syntheticbrowserharnessneverloads.env/databases/providers;32ownercaseshadnopageerrors,
provideroutboundcallsorhorizontaloverflow. SixnewguardedownedMongoacceptancecases
savedbutnotrun: Dockerdaemonunavailable. Hosted/provider/native-deviceacceptance
isnotclaimed. No deployment, commit, push, hosteddatamutationorcredentialschange.

## Local runtime and repeatable checks

A normalbuildinitiallyneededPrismaregenerationandWindowslockeditsDLL. Identified
onlytheexactRentraMobiledevengineholder(PID15988,parent35136)andstoppedthatverified
tree. Generatedpinnedclientnormally, completedbuildandrestorednpm.cmdrundevelopment
onlocalhost:3000 (toolsession93414). Finalbuildreusedverifiedcacheandpassedwithout
anotherrestart. Do not fake cache snapshots or upgradePrisma to evade locks.

npm.cmd run test:admin-ui
npm.cmd exec -- playwright test --config playwright.owner-ui.config.mjs
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
WithworkingDocker: npm.cmd run test:mongo -- --admin-only usesownedreplicasetfixture;
neverpointfixtureat.env.localorhostedDBandneverrundb:setupasatest.

## Saved documentation and next steps

context/admin-publishing-workflow.md is the operations/implementation guide;
context/admin-workflow-review.md holds honestacceptanceevidenceandlimits.
context/ui-registry.md, progress-tracker.md andbuild-plan.md updated.
Allsourceandnewtestfilesaresavedlocally; usermustcommit/deploythemtoupdateVercel.
Beforedeploymentacceptance, runownedMongo suitewhenDockerisavailable. No other
implementationworkremainsfortheacceptedrequest. Existinggallerypermissionalone
doesnotretroactivelygrantfree/direct; adminusesMembers->permissiondecision->switch,
reasonandRecorddecision.
