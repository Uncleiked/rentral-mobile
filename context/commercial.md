# Paid Insights and labeled sponsorships

Commercial source is implemented for Paystack only. It remains explicitly gated;
controlled tests use owned Mongo databases and provider doubles. No actual charge,
campaign activation on configured members, deployment or commercial certification
is implied.

Set `COMMERCIAL_ENABLED=true` only after reviewing database setup, payment
credentials, public URL and independent staff permissions. The payment gate must
also be enabled with matching `PAYSTACK_ENVIRONMENT` and key mode. Configure exact
positive integer kobo in `INSIGHTS_PRICE_KOBO` and `SPONSORSHIP_PRICE_KOBO`;
missing or invalid prices fail closed. `INSIGHTS_TERM_DAYS` defaults to 30 and
`SPONSORSHIP_TERM_DAYS` to 7; valid terms are 1–366 days. Prices and terms are saved
on each order with an immutable price version and billing environment. There are
no recurring mandates or automatic renewals.

Members use `/marketplace/purchases` for checkout/history/reconciliation,
`/marketplace/insights` for access and reports, `/marketplace/campaigns` for
sponsorship proposals, and `/marketplace/financial` for their own refund history.
Checkout uses an exact saved order and a hosted Paystack URL. Redirects alone do
not grant service. A verified matching collection and balanced journal are
required. Test collections cannot grant live service. Unknown provider outcomes
require explicit status readback, with no blind new reference or charge retry.

Insights terms are granted once per verified paid order. Manual renewal starts
after any existing valid term. Replay preserves the original dates. Refund
reservation, reversal, account closure or incompatible payment evidence suspends
access while preserving payment history. Internal `insights:view` permission
allows authorized review but does not bypass aggregation privacy.

Sponsorship requires an owned public, nonarchived listing, a fixed proposed
window, independent current-role staff approval and a verified paid order.
Owners can pause or withdraw; resubmission needs review. Expired or withdrawn
service is never silently extended, and these actions do not imply a refund.
Closed owners and inactive listings cannot receive sponsored exposure.

Sponsored placements are separately labeled, respect the same discovery filters
and public projection, and do not change organic ranking. The bounded rotation
uses time windows rather than private personal targeting. Consented impressions
require visible placement; clicks link only to that campaign's public listing.

Reports separate search/view/checkout interest from verified booking observations
and sponsorship interactions. Each displayed event/month/coarse group requires
at least ten distinct contributors; suppressed values are not shown as zero or
combined into differencing totals. There are no financial-risk, creditworthiness
or forecasting claims. Monthly pseudonyms and withdrawal mappings share the
existing opt-in and90-day retention policy. Verified booking observations come
from actual confirmed rental/payment records, never client success assertions.

Four real commercial/analytics cases passed in the owned core42-case sequence,
including once-only entitlement, billing-mode isolation, reviewed sponsorship,
refund-reservation revocation, observation deduplication and withdrawal. The
combined core/financial/auth sequence passed78 checks before later push changes.
Final broader UI/API acceptance is tracked separately in the progress log.
