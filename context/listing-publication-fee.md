# Listing publication fee

Submitted listings require a verified publication fee as well as the existing
asset, document, address and media reviews. Payment alone never publishes a
listing. The shared pure `PUBLICATION_FEE_KOBO` constant is100000 kobo (NGN1,000)
and is reused by the charge service, owner response and publication admission.
Clients never supply the price.

Native owners manage this from their listing screen using:

| Request | Successful data |
| --- | --- |
| `GET /api/v1/my-listings/:id/publication-fee` | Listing/status, fixed amount/currency, configured mode, latest own fee attempt and server action hints |
| `POST .../publication-fee/checkout` with `{}` | `{url,paymentId,reference,environment}` |
| `POST .../publication-fee/reconcile` with `{reference}` | Refreshed fee overview |

All responses use the standard private API envelope and strict shared contracts
in `lib/contracts/listing-payments.ts`. Authentication, current actor restriction,
cookie CSRF and rate limits remain enforced. References must match this actor,
listing and `listing_fee` kind; another owned booking's reference is insufficient.
Customer email, raw provider payloads and stored checkout URLs are excluded from
the overview.

Checkout requires an active owner, a submitted nonarchived listing and configured
Paystack collection. The callback is validated before creating or claiming an
intent. Production and live-mode callbacks require HTTPS. An invalid callback
does not leave an artificial uncertain intent. History and reconciliation remain
available when checkout configuration needs repair.

A returned checkout URL is tied to its exact persisted own fee intent under
User/Listing/Payment locks. The URL must have a unique historical binding, belong
to the current latest attempt, use the configured mode and remain pending. If a
webhook already confirmed payment or another attempt replaced it, checkout
returns409 with readback guidance rather than a stale URL. Native reopening also
checks the captured actor/listing and current payment ID, reference and mode.

Unknown initialization outcomes never automatically create another charge.
Refresh and reconcile the original reference. A known failed/abandoned attempt
can receive an explicit new attempt, including a deliberate change between known
test/live modes; the original row remains unchanged. Nonterminal attempts in a
different mode and legacy unknown modes are not silently reused or replaced.

New staff publication requires a succeeded fee in the currently configured mode.
Switching to live does not make historical test receipts eligible for new live
publication. Existing published listings and historical receipts are not rewritten
by this admission rule. The fee is a collection, with refunds and settlement
handled through their separate reviewed workflows.

Backend unit/API checks and source lint are recorded in the progress tracker.
Owned Mongo regression cases cover archived admission, callback preflight,
current-mode reuse/retry, exact URL binding and new-publication fee proof. Their
final aggregate run and native device acceptance remain separate evidence; no
actual provider charge is performed by these controlled tests.
