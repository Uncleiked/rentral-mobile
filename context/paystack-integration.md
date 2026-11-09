# Paystack integration and settlement boundary

Updated 2026-11-09. Provider choice: Paystack only. No live provider calls were
made while implementing or testing these adapters. Passing fixtures demonstrates
the coded contracts; merchant test-mode acceptance and policy approval are still
required before enabling actual movement of money.

## Current native publication-fee increment — locally verified

Native owner source now exposes publication-fee overview, checkout and explicit
reconciliation using the existing `startListingFeePayment` / `reconcilePayment`
services. Native controls, strict binding/guards, final aggregate tests, affected
exports and controlled browser/HTTP acceptance passed. See [final review](final-review.md)
for exact evidence. There was no schema/new financial domain or actual provider
activation; final runtime/Git handback is confirmed separately.

| Method | Owner-scoped path | Contract |
| --- | --- | --- |
| GET | `/api/v1/my-listings/:id/publication-fee` | Strict overview with listing/archive state, current configured mode, truthful latest payment history, availability and checkout/reconcile actions. Readable with sending disabled. |
| POST | `/api/v1/my-listings/:id/publication-fee/checkout` | Strict `{}`; returns `{paymentId,reference,environment,url}` bound to the exact fresh persisted intent/listing/owner/current mode. |
| POST | `/api/v1/my-listings/:id/publication-fee/reconcile` | Strict `{reference}`; exact owned listing-fee provenance and configured mode checked before provider verification; returns refreshed overview. |

The pure shared contract is [listing-payments.ts](../lib/contracts/listing-payments.ts).
`PUBLICATION_FEE_KOBO='100000'` means **NGN 1,000**. This existing fixed server
policy drives intent creation, DTO validation and native display; clients cannot
choose the price/currency. There is no publication-fee price environment variable.
The optional host-entered listing-fee ceiling setting is unrelated to this fee.

Checkout admission checks an owned `pending_verification`, unarchived listing
again under the listing lock, treating Mongo null/missing archive fields safely.
Native persists actor/listing-bound recovery before POST, never replays checkout
automatically after timeout/restart, and uses overview plus exact-reference
reconciliation to recover an unknown result. Before opening Paystack, the returned
URL is restricted to `https://checkout.paystack.com` and re-bound to the matching
pending intent ID/reference/mode; a later unrelated latest payment cannot replace
the proof. Callback redirects/browser closure never establish success.

The booking/listing collection initializers preflight the configured callback
**before any new intent writes**. `PAYMENT_CALLBACK_UNAVAILABLE` is a safe
configuration failure, not an ambiguous charge. HTTP callbacks are development/
test-only; production or live-mode checkout requires HTTPS. Other active/unknown
legacy attempts cannot silently switch environment: mismatches return
`PAYMENT_ENVIRONMENT_MISMATCH`. Current-mode created/pending intents can be
resumed/reused; initializing/uncertain/review/success/reversed never authorize a
new attempt. An explicit new attempt is permitted only after a known failed or
abandoned terminal record with known test/live mode. No POST is blindly retried.

A saved historical-mode fee remains visible with its original mode; it is not
proof for a **new current-mode publication approval**. New publication requires
the correct fixed amount, owner/listing/kind and current-mode verified collection.
Changing merchant mode does not withdraw already-public assets or rewrite old
receipts/journals. Archived fee history can still be read/reconciled, while new
checkout is denied. No status/fee/publication override is accepted from a client.

`PAYMENTS_ENABLED=false`, absent matching keys or unusable callback configuration
leave provider actions unavailable. Reading history does not enable payments.
Setup/merchant capabilities, independent human asset review, verified fee,
location and media conditions remain separate prerequisites; setting a key or
opening checkout does not publish a listing. The full implemented booking,
financial, commercial and other native v1 groups are in [the API guide](mobile-api.md).

## Implemented provider boundary

`lib/payments/providers/paystack/client.ts` exports `createPaystackClient` and
`paystackClientFromEnvironment`. The factory accepts a server secret, explicit
`test`/`live` environment and an injectable fetch transport for fixtures. It does
not open a connection until a method is called. Requests use a fixed HTTPS API
origin, forbid redirects, have a maximum 15-second deadline, bound response
bodies to 1 MiB, and never automatically retry a POST. Provider bodies, credentials,
OTP codes and bank details are excluded from error messages and logs.

| Methods | Contract |
| --- | --- |
| `initializeCollection`, `verifyCollection` | Caller reference and Rentral payment/user metadata; NGN kobo; checkout restricted to the actual Paystack HTTPS host |
| `resolveBankAccount`, `createRecipient`, `fetchRecipient`, `listBanks` | NGN NUBAN resolution; create uses the resolved name; bank account details remain transient server values |
| `initiateTransfer`, `finalizeTransfer`, `verifyTransfer` | Deterministic reference, exact amount, recipient code and provider environment; OTP or URL approval remains action required |
| `createRefund`, `fetchRefund`, `findRefundByReference`, `retryRefund` | Explicit partial amount and source transaction ID; reference-based recovery; bank-ID retry contract |

Normalized DTOs live in `lib/payments/providers/contracts.ts`. Amounts and
provider IDs are decimal strings. JSON parsing preserves unsigned 64-bit integer
tokens using Node 24's JSON reviver source context. Monetary values must fit an
exact safe JSON integer; invalid values fail before sending a request. Paystack
documents 64-bit transaction IDs in its [transaction API](https://paystack.com/docs/api/transaction/).

`PaystackError` exposes a fixed code and `uncertain` boolean. Transport errors,
timeouts, conflicting references, 429/5xx and malformed mutation acknowledgements
are reconciliation outcomes. A missing verification record is not evidence that
a prior submission never happened. No error permits automatic reference changes
or blind re-submission. A successful initiation response alone never posts a
settlement journal.

API keys stay server-side. Recognized test/live prefixes must agree with configured
mode; unrecognized restricted prefixes need explicit `PAYSTACK_ENVIRONMENT`.
Restricted keys require the appropriate transaction, transfer, bank, verification
and refund scopes; they cannot sign the legacy webhook header. See
[Paystack API key guidance](https://paystack.com/docs/developer-tools/api-keys/).

## Refund and transfer state

| Provider status | Operation state |
| --- | --- |
| transfer `pending` | `pending` |
| transfer `otp`, `received` | `requires_action` |
| transfer `success` | `succeeded` |
| transfer `failed`, `blocked`, `rejected`, `abandoned` | `failed` |
| transfer `reversed` | `reversed`, with a compensating journal when previously posted |
| refund `pending`, `processing` | `pending` |
| refund `needs-attention` | `requires_action` |
| refund `processed` | `succeeded` |
| refund `failed` | `failed` |

Transfers need a registered merchant, available provider balance and applicable
fees. An OTP response is not completion. The provider can subsequently reverse
a transfer; reversal preserves prior history. These meanings follow
[Paystack's transfer lifecycle](https://paystack.com/docs/transfers/how-transfers-work/)
and [transfer API](https://paystack.com/docs/api/transfer/).

Refund references are case insensitive and unique within provider mode. Send
a deterministic reference for every partial refund. A 409 triggers reference
reconciliation. Retry of `needs-attention` uses
`POST /refund/retry_with_customer_details/{id}` with
`refund_account_details: {currency, account_number, bank_id}`; bank ID is distinct
from bank code. A retry acknowledgement can omit a legacy reference and cannot
alone satisfy the strict settlement binding. See the
[refund API](https://paystack.com/docs/api/refund/) and
[refund lifecycle guide](https://paystack.com/docs/payments/refunds/).

## Authenticated webhook hints

The route streams at most 256 KiB and checks the signature over original bytes
before decoding JSON. Modern `Paystack-Signature` uses HMAC-SHA512 over
`timestamp + '.' + rawBody`, checks a 300-second clock window and supports multiple
rotation signatures. `PAYSTACK_WEBHOOK_SECRET` and optional
`PAYSTACK_WEBHOOK_PREVIOUS_SECRET` enable modern verification; then the legacy
header is never accepted as a downgrade. Without a modern secret, the legacy
header uses the server secret. This follows
[Paystack webhook authentication](https://paystack.com/docs/payments/webhooks/).

`normalizePaystackWebhook` returns allowlisted hints for charge success, transfer
success/failure/reversal and refund lifecycle events. All require matching
test/live mode and NGN. Event keys are deterministic across JSON order/whitespace,
irrelevant private provider fields and delivery timestamps. A separate canonical
payload hash detects material amount/status differences. Persist only these safe
hints and hashes, never raw webhook payloads, signatures, email/card/bank details.

Refund events can contain only an original transaction reference and no refund
ID or reference. Those events have `hasStrongIdentity:false`; they must trigger
reconciliation of known operations, never infer which equal-valued partial refund
completed. Every hint has `requiresReconciliation:true`. Fetch current provider
truth and recheck source, amount, currency, recipient, reference and environment
before posting money. Out-of-order events never directly overwrite terminal state.
Unknown authenticated event types are ignored safely.

## Implemented financial domain and API

The central schema uses `PaymentRecipient`, `FinancialOperation`,
`FinancialAllocation` and `ProviderReceipt`. Operations use the statuses
`requested`, `approved`, `rejected`, `submitting`, `pending`, `requires_action`,
`succeeded`, `failed`, `reversed`, `uncertain`. Provider IDs are uniquely scoped
by provider, mode and operation kind. Recipients retain last four digits and an
HMAC account fingerprint rather than full account numbers. Resolution confirms
bank routing details; it is not personal KYC or proof of asset ownership.

Immutable source allocations reserve collected funds under source-payment locks.
Requested through uncertain operations, and successful operations, consume the
available source amount. Only confirmed failure/rejection/reversal releases its
reservation. A converted hold cannot fund two rentals or a competing refund.
Ledger transactions are append only, balanced and bound to deterministic business
keys; one collection may have several later settlement/reversal journals.
Approval must come from a current authorized staff member independent of the
requester and both booking parties. Network calls belong outside database
transactions. Leases and compare-and-set transitions handle crashes and unknown
outcomes without repeating a submitted financial request.

The services are implemented in `lib/payments/financial*.ts`; shared strict DTOs
are in `lib/contracts/financial.ts`. Member history is available at
`GET /api/v1/financial`, with payer-only archived source lookup at
`GET /api/v1/financial/payments/{id}`. History is paged by stable date/ID cursors.
Staff use the same overview with `scope=staff` and current `finance:review`
authorization. All DTOs label test/live mode; legacy payment mode can be null and
cannot fund a new operation until reviewed. Converted hold sources expose a
server-derived `refundBookingId` without rewriting their original booking ID.

Recipient setup is `POST /financial/recipients`; deletion disables an owned
recipient. The database retains a pending/uncertain masked record across lost
acknowledgements. A late provider acknowledgement cannot reactivate a recipient
its owner disabled concurrently. Full bank numbers are never stored in this
model. `PAYMENT_ACCOUNT_HASH_SECRET` needs at least 32 bytes, separate from JWT
and analytics keys. Preserve it. Rotation of fingerprints requires a reviewed
operator migration; silently accepting a mismatched hash is forbidden.

`POST /financial/operations` records a refund or payout request using an
actor-scoped client UUID. Exact retries return the same operation; changed
instructions with that ID are rejected. Staff commands use
`POST /financial/operations/{id}` with approve/reject/execute/reconcile/finalize/
retryRefund actions. Only requester withdrawal before submission is available
without privileged authorization. Requests, history and database-only reviews
work while provider credentials or mutation flags are disabled.

Refunds reserve one explicitly selected provider collection. Standard payouts
require completed rental/inspection evidence and no open dispute. Rental funding
includes its one-time allocated hold plus balance, and total payout is bounded
by the accepted booking amount. Every source reservation is serialized with
hold-credit conversion and competing financial requests. Unexpected late provider
success is recorded once but remains `uncertain` if the released source was
already reallocated; it cannot authorize a second external instruction.

`runFinancialReconciliationBatch` processes durable receipts and due operations
under owned leases. It is wired into the guarded local worker as its own job.
Only provider GETs are retried; no financial POST is scheduled automatically.
The queue recovers expired leases, quarantines exhausted attempts including a
crash on the last attempt, and filters the configured provider mode. Receipt
requeue requires audited staff review. Unknown references remain retryable and
eventually reach a dead-letter state. Conflicting canonical payloads require
operator investigation. Webhooks acknowledge after durable receipt storage;
they never post directly from a signed body.

## Activation and acceptance

Keep `PAYMENTS_ENABLED` and `SETTLEMENT_ENABLED` off until the selected merchant
account, signed callback or polling topology, independent approval policy,
custody arrangement, fees and default/inspection dispositions have been accepted.
Collection must not be described as escrow or a wallet balance. A bank recipient
or valid key alone does not establish permission to move held customer funds.

Actual provider mutations additionally require
`SETTLEMENT_POLICY_ACK=manual-review-v1` and the corresponding explicit capability
`PAYSTACK_REFUNDS_ENABLED=true` or `PAYSTACK_TRANSFERS_ENABLED=true`. All flags
default off. Optional hold default requires the separately accepted
`SETTLEMENT_HOLD_DEFAULT_POLICY=30-70-v1`: only an expired, unconverted hold with
reviewed evidence is eligible. The platform retains floor(30% of exact kobo);
the host receives the remaining kobo. One transaction reserves the full source.
Verified success posts a balanced liability debit and provider/platform credits;
reversal appends the full compensating journal. No platform-share transfer is
invented. The policy is never inferred from expiry alone.

The additive financial indexes/validators and `financialVersion` marker must be
prepared before these models are used. Preparation is explicit; requests never
create unindexed collections or change hosted configuration. Collection terminal
states are reconciled from the provider: failed/abandoned permits an explicit new
checkout attempt; uncertain/pending/initializing never does. A definitive rejected
instruction releases its reservation; timeout or unknown acknowledgement does
not. A known read-only recipient preflight failure can release an unsubmitted
execution claim, since no financial POST was attempted.

Localhost cannot receive public provider webhooks. Use explicit authenticated
server polling for local acceptance, or separately approve a public HTTPS callback
deployment. Do not silently create a tunnel or publish private files. Fixture
coverage includes provider contracts, exact IDs/money, duplicates and reversals,
partial refund ambiguity, signature rotation, cross-mode denial, bounded bodies,
uncertain submissions and no secret/error leakage. Actual merchant acceptance
must additionally cover test collection, partial refund, required OTP/approval,
transfer success/reversal, duplicate delivery and recovery after timeout.
