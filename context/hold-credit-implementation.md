# Holding credit implementation — 2026-11-07

The user's existing platform authorization covers the implementation decisions below. This change does not enable provider flags, access environment files or call a remote database/provider.

## Blueprint

A holding credit is an internal allocation of an already verified collection. A rental quote retains its full gross amount; the allocated hold reduces only the additional amount collected. Allocation happens when the host accepts a rental request, never when the renter merely sends it.

- The renter follows **Use hold toward rental** from their confirmed hold, or continues from the listing's holding notice. The server checks current ownership. Discovery continues to expose a deadline without exposing the holder's identity.
- Requests record an optional source hold ID in the server-generated quote. Source and rental must have identical asset, participants, currency and dates. The original hold must remain confirmed, unexpired, unsettled and funded by exactly one matching successful collection. A source marked for review cannot fund a rental.
- Host acceptance locks the listing, then bookings. It converts the source and creates one immutable `HoldCreditAllocation`, with unique source and target keys, in the same transaction that accepts the rental. A second accepted request cannot reuse that hold.
- The immutable quote records gross total, source ID, credit and remaining balance as integer-kobo strings. The payment intent and provider receipt must equal the remaining balance exactly.
- The balance deadline is the earlier of 30 minutes after acceptance and the original hold deadline. A converted source protects the whole asset only while its target awaits payment within that window. After rental confirmation, the rental's own date exclusion protects its dates.
- If the credit equals the full rental quote, acceptance confirms the rental without sending a zero-amount provider request. If the credit exceeds the quote, conversion fails and directs the participants to reconciliation; excess refunds are not fabricated.
- Cancelled or expired conversions keep the immutable allocation. Both source and target move to settlement review, so the source cannot be reused or treated as an ordinary expired hold eligible for compensation. A late balance receipt records the collection for review and cannot revive the rental.

## Persistence and checks

Migration `20261107180000_hold_credit` adds `Booking.hold_credit_kobo`, the `converted` holding status and the private `HoldCreditAllocation` table. It enables RLS and revokes anonymous/authenticated Data API access. Database triggers require a paid source with a corresponding collection ledger, reject mismatched parties/dates/amount/currency, enforce final quote bindings at commit, and make allocations and allocated booking terms immutable. Application code follows the established listing → booking → payment lock order.

`lib/bookings/hold-credit.ts` owns allocation and review rules. Booking and payment services share it; components format the gross, credit and remaining balance using integer money. Versioned booking API responses add `holdCreditKobo`, `payableKobo`, `holdBookingId` and `rentalBookingId` for authorized participants.

## Verification

- 63 targeted Vitest checks passed across hold-credit, hold-credit payment integration, booking policy/service, payments and discovery.
- TypeScript passed after implementation.
- `tests/database/hold-credit-assertions.sql` covers a real local allocation, wrong participant/amount rejection, private-table access, append-only records, immutable credit, single use and cancellation preserving review without inventing another collection. The root agent runs this with the isolated platform fixture; this subtask did not connect to remote databases.
- Root performs final combined lint, build, database and integration acceptance after all concurrent features freeze.

## Review and limits

The implementation matches the approved one-time credit scope, existing modular domain boundaries and semantic Tailwind tokens. Actual provider refunds, host payouts, recipient onboarding and holding-default 70/30 settlement are still separate unfinished work. An allocation is evidence that an existing liability funds a rental; it does not claim that money moved, that funds are legally escrowed, or that a refund/payout succeeded. An abandoned conversion currently requires settlement review rather than automatically recycling the credit. Authenticated browser/device/provider acceptance remains required before enabling financial features.
