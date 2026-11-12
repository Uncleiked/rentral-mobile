# Memory - Website UI consistency and responsiveness

Last updated: 2026-11-12 Africa/Lagos.

## Active project and constraints

Work in C:/Users/Mudian Consult/Documents/RentralMobile, not default rentral.
User explicitly selected npm (npm.cmd inPowerShell), MongoDB/Prisma6.19.3 and
JWT email/password plus optional Google web signin. Keep hosted DB data/env/
provider settings unchanged. Never print secrets, reset data or apply setup.
No deployment or remote settings change was requested/performed in this UI pass.

## What was built

User requested entire website UI consistency/responsiveness, showing unreadable
/onboarding/organization. Root cause: later shadcn lightroot background/foreground
overrode Rentral's darkbody colors; duplicate radius scale and fontself-reference
also caused drift. app/globals.css now maps generic aliases to canonical --rentral
palette, preserves original8/12/16/24/32px radii, adds commonfocus/media/form
bounds and >=16px mobile textentry. app/layout localfont defines --font-rentral,
consumed by --font-sans, and declaresdark. Sonner usesdark+semantic tokens and
drops the orphan useTheme hook.

New AccountPage and account-styles sharedpatterns cover signin/signup, recovery/
reset/emailconfirm/Googlecompletion andorganizationadmission. Orgfieldslabels,
documentgroups/responsivedetails andstatus/recoveryactions standardized.
Sharedshell/publicpage gutters, compactnavigation below1280, bottomsafearea
spacing and44px controltargets aligned. Feedmetadata/actions wrap, filterfields
stack onphones andcompact save/sharefeedback remainswithincard.

Broadwebworkspace presentationpass acrosslisting/booking/account/profile/
privacy/matching/messages/notifications/admin/finance/commerce/lease/cards/forms/
actions. No authactions/APIs/permission/businesspayloadchanges. Phone messages
nowhideinboxwhilelistingcomposer/threadselected. Profilemodalhasnamedrole,
focuscontainment/Escape/focusrestore/bodyscrolllock/boundedheight. Primaryprofile
button matches sharedcase/typography. Sharedformclasshelpers only changed in
lib/listing-form.ts, lib/matching/client.ts, lib/commerce/client.ts.

## Verification

Final npm.cmd run build PASS includingTypeScript,108staticpages.
Full Vitest:2002PASS,107SKIP (6opt-in/integrationfiles).
Web ESLint including finaladjustments PASS,0warnings.
ExistingadminsyntheticUI suite:38/40initialpass;2desktopload/reloadtimeouts
bothPASSseparatelywith120sfixtureallowance. All40distinctcasesverified.
Actual Next homepage12/12browsercasesPASS atdesktop/phone/320/tablet.
60presentationcases:12realcomponentviews at320/390/768/1024/1440 PASS
foroverflow,darkbodycontrast,mobilefontsize/browsererrors. Keyboardcompactmenu/
profilemodal focus,Escape and320pxfit PASS. FeedSaveerror/Sharecopiedfeedback
andopenedfilterpanel PASSat320px withsyntheticclipboard.
Screenshotsinoutput/playwright:organization390/1440,profiledialog320,
feedfilters320 andother390viewimages. Organization/profile screenshots inspected.
Actual native-share acceptance and native devices were not tested.

## Browser fixture details

New scripts/ui-consistency-preview.mjs is loopback4186, syntheticUI only: envDir
false, no.env, noDB/providerconfig, mockNextserveractions andAPI data. Empty
clientenv simulates browser-onlyconfiguration. The preview generates its repeatable responsive-audit.js. Generated artifacts
and .playwright-cli logs are ignored to prevent cache commits. Scriptparents inoutput/playwright/
fixtures; test-results gets removed by ordinary Playwright runs, so don't put
long-livedpreviewsource there. EachVitefixture hasuniquecacheDir, includingthe
existingadmin-workspace-preview script, avoidingHMR/dependencycachestate resets.

Cached PlaywrightCLIentry:
C:/Users/Mudian Consult/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js
Use own sessionrentral-ui, notclose-all. Output audit scripts are under
output/playwright. Dockerdaemon unavailable, so no DB-backedauthenticatedbrowser
fixture was run; userdatasetwas untouched. Preview/browserstoppedatcompletion;
leave user's Next3000/otherappservers alone.

## Saved state and next step

UI source andcontextbaseline/review/progress saved locally, uncommitted.
HEAD atstart6fcd412. ExistingdirtyGoogleDBsetupguide/progress/memory fromprevious
diagnosis preserved; no dependency/lockfile/env/db changes inUIwork.
context/ui-consistency-review.md documentscoverage/limits; ui-registry/rules/
tokensrecordcurrentbaselines. Commit/push/deploy required to updateVercel.
Usercanreviewcurrentchangeslocallyfirst. No further UI issue remains fromchecks.

## Prior login context

Production previously logged DATABASE_UNAVAILABLE whilelocalAtlasread-onlyping
andbasemarkers/Google/orgpreparationpassed. User Atlas screenshot showedonly
individualcomputerIPentries. Guidedpermanent0.0.0.0/0withtemporaryswitchOFF
afteruserexplicitlyrequestednonexpiringaccess; explainedwiderexposure/credentials/
TLS andpaidstatic-egressalternative. AgentdidnotchangeAtlas/Vercelsettings.
Laterusercouldvieworganizationonboarding; nofullGoogle-accountloginacceptance
wasperformedhere. Committed86049d9callbackoriginfix and6fcd412fixed-codereadiness
diagnostics remain intact. Don'trepeatDBsetup orremoveauth/storagegates.
