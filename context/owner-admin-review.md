# Owner administration, gallery media and upload recovery review

Reviewed 2026-11-10 against the [approved blueprint](owner-admin-media-blueprint.md)
and current MongoDB/JWT/npm architecture. The prior capture/branding delivery is
`cb42fd1`; evidence below describes this newer increment. The delivery revision
is recorded in Git history and verified in the final handback.

## Layer 1 — Plan alignment

Implemented: web `/admin`, native Admin, current database roles and deliberate
owner bootstrap, protected ownership transfer, manual document approval, audited
publication-fee waivers, revocable gallery permissions, photo-only listings,
truthful gallery rendering and manual inspection review. The optional AI document
screening path is retired. Existing financial review boundaries remain.

Ordinary users retain recording-time GPS and the 100-metre address requirement.
Gallery access requires an explicit current grant rather than personal KYC.
Grant revocation hides affected public inventory and blocks further use; regrant
requires a legitimate resave/edit and fresh review. Files, bookings, evidence and
financial history remain preserved. Gallery media never acquires fabricated GPS.

## Layer 2 — System integrity

Shared server services own authorization and decisions. Owner identity is
persisted on the immutable account ID; email text, client metadata and navigation
links never grant a role. Ordinary role, suspension and closure actions cannot
remove the owner. Ownership transfer is a separate audited operation.

Gallery upload/save/submit/edit/publish use current permission and revision
checks. User-row writes serialize revocation with attachment/publication. Exact
owned available objects, digests, formats and bounds supply server-built media
proofs. Normalized gallery references protect every attached photo from deletion;
backup verification includes secondary images and their durable claims. Photo-only
media skips Mux; optional video keeps its processing requirement.

Document decisions bind to exact current files. Fee waivers retain their own
reasoned state and create no payment or ledger entries. Owner-self listing review
requires an explicit override; participant financial and manual-inspection
independence remains mandatory. Unknown decisions/uploads/saves preserve the
original actor/nonce/body and require readback before an explicit exact retry.

Browser gallery uploads persist the intended path and actor-scoped form before
sending bytes. After an unknown upload or reload, owned-file readback may recover
the existing path without another upload or listing save. A retry requires a
deliberate reselection with the same full-content fingerprint and the original
path. Explicitly abandoning reviewed recovery retains the other form/files and
does not delete server history.

Avatar storage failures now retain trusted database setup/connectivity diagnoses.
Address responses use bounded reasons and explicit opt-in for older strict clients;
no provider payload or coordinates enter the new diagnostic field. UI patterns
reuse the existing semantic tokens and recovery surfaces.

## Layer 3 — Verification and acceptance

| Check | Observed result |
| --- | --- |
| Profile upload regressions | 62 unit checks passed; final current-source owned avatar fixtures passed 2/2. |
| Backend address/gallery/storage/public/backup group | 214 checks in 17 files passed; this focused run overlaps the aggregate. |
| Owned owner/admin integration | 10/10 passed in 29.73s with real JWT/bootstrap/storage/claims/receipts/document/waiver/gallery/manual/transfer behavior; only Next adapters mocked and limiter clock isolated. |
| Current source TypeScript/global lint | Passed. |
| Native focused regressions | 114 checks, TypeScript and scoped lint passed. |
| Native intercepted preview | 4 journeys / 24 API calls / 0 errors or outbound requests at 320/390/768 widths; not a device run. |
| Native production exports | Android: 2,104 modules / about 5.9 MB / 38.2s; iOS: 2,125 modules / about 5.9 MB / 22.2s. Both passed. |
| Browser raw-upload recovery regressions | 30 unit checks and scoped lint passed; the production browser suite includes the third recovery journey. |
| Existing owned Mongo suite | All 95 passed in one serial sequence: core 55, financial 18, auth/closure/export 20, backup 2. The publication fixture uses an actual uploaded PDF and human approval. |
| Actual backup wrapper | 14 synthetic records / 4 files / 1 balanced journal / 1 claim; source preserved and restore verified/quarantined; owned resources cleaned. |
| Ordinary unit aggregate | 1,868 passed / 0 failed / 107 configured skips. All 107 owned real cases ran separately: existing Mongo 95, owner/admin 10 and avatar 2. Focused counts overlap and are not additive. |
| Final Next.js production build | Passed: Prisma generation, Next compilation (33.9s), TypeScript (84s) and generation progress 103/103. Admin and manual-inspection routes are included. |
| Final production browser journeys | 11 journeys in six files passed against the production build, including admin receipt recovery, gallery photo-only save recovery and unknown raw-upload readback after reload. The new workflows check 320/390/768 widths. |
| Private-value delivery scan | 1,191 source/public/native-export files checked against nine actual private values; zero matches. Private environment files remain untracked. |
| Selected Atlas preparation | Reviewed additive setup verified 52 application collections / 156 indexes, preserving all 53 pre-existing collections and 14 non-marker documents. Owner bootstrap is a separate deliberate operation. |
| Selected account ownership | Applied to the exact existing active `dannyiked@gmail.com` account through the dedicated audited bootstrap. One owner, all staff permissions and `adminAvailable:true` verified; credentials/profile and other existing users/audits preserved. |
| Environment check | Passed; the user supplied the remaining Mux webhook value privately. No new secrets are required. |
| Local runtime handback | Backend on port 3000: `/help`, `/favicon.ico` and `/icon.svg` returned 200; signed-out `/admin` redirected to sign-in and `/api/v1/admin` returned 401. Existing Metro on port 8090 returned `packager-status:running`. |

Four live Geoapify lookups used only supplied strings; both complete Lagos
addresses resolved only to state-level confidence-0 results. This explains the
unverifiable-address state without implying missing support for all Nigerian
addresses. The 100-metre rule and required precision were preserved.

Physical Android/iOS camera/gallery/file-picker/large-file/interruption/accessibility
acceptance remains separate. So do live Mux/Geoapify/Paystack acceptance, merchant
capabilities, deployment and store release. A full Vercel launch still needs an
object-storage adapter and deliberate worker/webhook hosting. No actual provider
payment/payout, public deployment or EAS/store release is claimed by this work.

Follow the [owner/admin guide](owner-admin-setup.md), [environment guide](environment-setup.md)
and [document/address policy](document-providers.md) for setup and operational use.
