# Media Vault and listing metadata

Updated: 2026-11-07 (Africa/Lagos).

## Implemented

- `/marketplace/vault` reads the current authenticated owner's persisted draft listings containing a walkthrough. Queries explicitly bind `lister_id`, `draft` status and non-null video, select no coordinates, and bound results to the latest 100 rows.
- Groups use known broad Lagos areas and the first draft-save date in Africa/Lagos. Every draft keeps its own card, including separate assets recorded at the same location; grouping never deduplicates rows.
- Video/poster sources are the existing authenticated same-origin media routes. No signed URLs, raw object paths or exact addresses are serialized into the gallery. Draft originals are owner-authorized independently of Mux publication.
- Each card links to the existing ownership-checked draft-resume wizard. Capture, Save Draft & Exit, then sign in on desktop is a supported workflow. Unsaved blobs remain device-local. “Saved” is deliberately not called a verified capture timestamp.
- Successful draft saves with video lead to the Vault; drafts without video remain available in Your Listings. The wizard includes a Vault back link. No save server action or database migration was needed.

## Backward-compatible metadata

All additions use the existing JSON metadata column and are optional, so legacy listings and drafts retain valid shapes. Shared forms now have labelled controls, associated errors, responsive fieldsets and consistent semantic input styles.

Shared: `listingTitle`, `description`, `rentalIntent` (`rent|buy|squat|shortlet`), `hostCapacity` (`owner|agent|tenant|organization`), `pricePeriod` (`year|month|day|trip`), `state`, `neighborhood`, `agencyFee`, `legalFee`, `cautionFee`, `serviceCharge`.

- Capacity describes this listing, not an account role or a claim of licensing.
- House: existing bedroom/bathroom/size/amenities fields plus `propertyType`, `kitchens`, `floors`, `landlordPreferences`. Zero bedrooms supports studios.
- Vehicle: existing transmission/mileage/seats/fuel plus `bodyType`, `engineType`, `insuranceStatus`, `insuranceDetails`.
- Boat: existing vessel/capacity/captain plus `lifeJackets`, `safetyEquipment`. These are host declarations, not independently verified safety claims.
- Fee amounts are optional exact NGN decimal strings with up to two decimal places; negatives, exponent notation, extra precision and amounts above the configured cap are rejected. Blank/zero is allowed. BigInt comparisons avoid floating-point rounding.
- Optional `NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN` sets the per-field cap (default `10000000` NGN). This public build-time configuration must be consistent across server/browser and is a product limit, not a legal assessment. No fee is declared lawful, refundable or paid by the metadata form.

## Proof documents

The document step requires a non-empty PDF/JPEG/PNG no larger than 10 MB before continuation. The upload surface is keyboard-operable. Copy distinguishes property title/authority, vehicle particulars and vessel registration/operating authority; agents/tenants must supply permission and relevant safety/insurance documents can form one proof PDF. Review supports verification; automated screening is never represented as legal proof of ownership.

## Verification and remaining acceptance

- 29 focused tests passed across new metadata/fee/grouping/owner-projection tests and existing listing save/upload regressions.
- Homepage focused ESLint passed. Full TypeScript check no longer reports errors in this feature; concurrent booking/document changes had separate errors at the time of the check.
- Root agent owns final lint, build, browser checks and overall progress tracker/memory updates. Authenticated cross-device capture/playback still needs sandbox/device acceptance; unit mocks do not prove hosted Storage policies or provider behavior.
