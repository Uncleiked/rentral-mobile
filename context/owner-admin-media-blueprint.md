# Owner administration, manual review and approved gallery media

Status: explicitly approved by the user, 2026-11-10; source implemented and
current-source local verification passed. See the [increment review](owner-admin-review.md) for
current evidence and external acceptance gates. The profile-storage repair and
address diagnostics are included. The delivery revision is recorded in Git.

## What we are building

Provide `/admin` on the website and a native admin screen, backed by the same
current-account authorization and audited services. Give the existing active
account `dannyiked@gmail.com` ownership through a deliberate database-operator
bootstrap. Replace optional AI document analysis with human review, support
publication-fee waivers, and let explicitly approved users create gallery photo
and video listings without recording GPS or automatic address comparison.

## Language and policy

- **Owner**: the persisted account identity with all administrative permissions
  and exclusive authority to manage ownership. An email match in an ordinary
  sign-in/API request never grants ownership. Ordinary admins cannot demote,
  suspend or close the owner account.
- **Manual document review**: an authorized person opens the exact uploaded
  document and approves/rejects it with a reason. Approval binds to that document;
  replacement invalidates it. Existing human review is retained and the optional
  Gemini screening action/provider is removed. Historical findings remain.
- **Fee waiver**: an explicit listing-specific administrative decision, displayed
  as waived rather than paid. It permits publication without collection and
  works when payment processing is disabled. It creates no payment or ledger
  fiction and does not refund or erase an existing payment.
- **Approved gallery uploader**: a separate, revocable permission, unrelated to
  personal KYC. This user may choose up to ten photos and one optional video from
  their gallery; photo-only listings are supported. Their listings have an
  explicit gallery origin and receive human document/listing review. They have
  no invented capture, GPS match or location-verified badge.
- **Manual inspection review**: gallery listings cannot satisfy a recorded-GPS
  check-in. Inspection evidence therefore goes to an authorized nonparticipant
  for manual approval/rejection. This creates no spatial proof and does not
  automatically release money. Recorded listings keep their existing proximity
  and handshake rules.

## Decisions

1. Keep MongoDB/JWT, npm, Expo Android/iOS, the Next.js website/API, Paystack only,
   private storage and the removal of personal KYC.
2. Bootstrap only the named existing active account, with an audit record, after
   the implementation and tests are ready. Bind ownership to its immutable user
   ID. Protect the last owner; ownership transfer requires a deliberate owner
   operation, never the ordinary staff-role selector or an email change.
3. Owner controls include user access/roles, gallery approvals, listing/document
   review, publication/suspension, fee waivers and audit history. Existing guarded
   finance, disputes, safety, lifecycle, matching, campaign and Insights tools
   remain available through the admin hub. Native exposes the core review/user/
   waiver workflows; specialized existing web workspaces have authenticated links.
4. The owner may review/publish their own listings only through an explicit
   reasoned owner override recorded in the audit. Other staff retain independent
   review. Existing restrictions on self-interested financial approval and
   independent settlement review remain in force, including for the owner.
5. Recheck current gallery permission on upload authorization, save, submission,
   edits and publication. Revocation blocks further gallery use and removes
   affected listings from public discovery pending review; existing bookings,
   evidence and financial history remain preserved.
6. Gallery photos receive the same ownership, byte/type/digest validation and
   storage claims as other uploaded media. Gallery videos still need Mux before
   publication. A photo-only listing does not require video processing. Discovery,
   listing details and owner editing display photos appropriately.
7. Ordinary recorded listings retain the server recording lock and 100-metre
   address rule. Improve lookup messages to distinguish missing/ambiguous building
   data from provider outages. Do not silently accept a street/city centroid or
   lower precision to make an incorrect address pass. Proximity within 100 metres
   cannot establish an exact house number or apartment.
8. Test the user's clarified addresses in Ifako and Bariga, Lagos with the
   configured provider. No private recording GPS is sent to the geocoder. Live
   provider coverage is reported honestly; another key is not assumed necessary.

## How to build it

1. Diagnose and repair profile-image upload availability, preserving selected
   images and private environment settings; add a regression for the root cause.
2. Introduce additive owner/gallery/waiver/manual-inspection metadata, strict
   shared contracts, permission checks, audit decisions and database readiness.
3. Remove active AI document-screening entry points and bind manual approvals to
   exact documents. Add server APIs for native and web administration.
4. Build the web `/admin` hub and native admin workflows, including empty/loading/
   error states, private document previews and explicit uncertain-result readback.
5. Implement gallery upload, photo-only rendering and the manual-inspection branch;
   preserve the ordinary recorded listing path and truthful trust labels.
6. Verify authorization, revocation races, document replacement, waivers with
   payments disabled, gallery storage claims, ordinary GPS admission and inspection
   financial boundaries using owned fixtures. Check responsive web/native flows,
   TypeScript/lint, production build and Android/iOS exports as appropriate.
7. Apply reviewed additive preparation to the selected Atlas database, bootstrap
   the specified owner, verify access, update environment/run instructions, remove
   obsolete active AI files and deliver through the already authorized repository.
   Preserve private files, user uploads, historical records and migrations.

## Acceptance boundaries

No provider payment, payout, public deployment, EAS/store release or broad data
reset is part of this change. New admin controls use existing business rules for
money movement. Physical camera/gallery/file-picker acceptance remains distinct
from automated browser/transport fixtures. The admin gallery exception is shown
explicitly; it is not represented as verified recording evidence.
