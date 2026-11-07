# Rentral staging setup

Verified against the implementation and official provider documentation on 2026-11-07 (Africa/Lagos).

Use a separate Supabase project, separate provider test environments, and the ignored `.env.staging` file. Enter credentials in your editor or deployment secret manager, never in chat, source control or screenshots. The steps below prepare a test environment; no service has been enabled or a remote migration applied merely by writing this guide.

## 1. Create the Supabase staging project

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and create a new project named `rentral-staging`. Give it its own database password. Keep the existing Rentral project unchanged.
2. In staging Project Settings / API, obtain the project URL, publishable key and server-only service-role/secret credential supported by the app's Supabase client. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.staging`. Keep the actual service-role value server-side; it never gets a `NEXT_PUBLIC_` prefix.
3. Use the dashboard's **Connect** panel to obtain staging connection URLs. `DIRECT_URL` is used by the Prisma CLI for migrations: use the direct endpoint where IPv6 is available, or the Session pooler on port 5432 if appropriate for your network. `DATABASE_URL` is the runtime connection; use the documented connection mode for your host, including Transaction pooler on port 6543 for serverless deployment when needed. URL-encode special characters in passwords. Every URL must point to the same new staging project.
4. Use dedicated test accounts and files. A fresh project is preferable to cloning real customer identities or production documents. [Supabase environment management](https://supabase.com/docs/guides/deployment/managing-environments), [Prisma connection modes](https://supabase.com/docs/guides/database/prisma).

Create the local file only if it does not exist:

```powershell
if (-not (Test-Path -LiteralPath '.env.staging')) {
  Copy-Item -LiteralPath '.env.staging.example' -Destination '.env.staging'
}
```

Fill it in locally. Keep `DIDIT_ORDERING_ENABLED`, `RENTRAL_PLATFORM_ENABLED`, `PAYMENTS_ENABLED`, `MUX_ENABLED`, both worker flags, and analytics flags `false` initially. Run staging commands through `pnpm.cmd staging ...` on Windows (`pnpm staging ...` elsewhere). The wrapper selects `.env.staging`, rejects the local/production Supabase project reference, validates database project references, and prevents absent staging optional secrets from falling through to `.env.local`. Do not substitute ordinary `pnpm dev` when you intend to use staging.

## 2. Prepare the staging database before enabling features

First run `pnpm check:staging`, then `pnpm check:staging --remote`. The first validates
project/key/connection formats without displaying credentials. The second checks
Auth/Storage API acceptance and both TLS database connections using read-only SQL.
If the machine cannot use an IPv6-only direct database endpoint, use the staging
project's Session pooler (5432) for `DIRECT_URL` and Transaction pooler (6543) for
`DATABASE_URL`. Copy the exact host/region from **Connect**, rather than guessing it.
Successful API-key checks alone do not prove that the database password works.

From the repo root, inspect the selected staging project and migration state:

```powershell
pnpm.cmd staging prisma migrate status
pnpm.cmd staging prisma validate
```

On a new project, pending migrations or no migration table can produce a nonzero status. Confirm the displayed datasource is staging. Then apply the checked-in history to this disposable staging target:

```powershell
pnpm.cmd staging prisma migrate deploy
pnpm.cmd staging prisma migrate status
pnpm.cmd staging prisma generate
pnpm.cmd staging prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

`deploy` writes schema changes to staging; `status` and `diff` inspect it. A diff exit code of 0 means Prisma-supported structure agrees; 2 means differences and 1 means an error. Diff does not verify unsupported PostGIS columns, triggers, Storage policies or RLS. Inspect those separately and run the repository database acceptance checks against a disposable fixture. Confirm clean replay, private buckets, denied cross-owner reads and booking/payment concurrency before enabling corresponding gates. Stop on a migration failure and preserve the error; do not fix it with `db push`, `migrate reset` or a fabricated baseline. [Prisma v7 migration commands](https://docs.prisma.io/docs/cli/migrate), [Prisma CLI reference](https://docs.prisma.io/docs/orm/reference/prisma-cli-reference).

The migration source of truth is `prisma/migrations/`; do not separately replay a second Supabase migration history. Follow the existing [private-media cutover plan](private-media-plan.md) and [media staging runbook](media-staging.md) for existing inventory and Storage acceptance.

## 3. Give callbacks a reachable HTTPS address

1. Start an explicitly selected staging server on a spare port:

   ```powershell
   pnpm.cmd staging dev --port 3101
   ```

2. Use a hosted staging deployment or an HTTPS tunnel to that port. With ngrok installed/authenticated according to its [official setup](https://ngrok.com/docs/start), a tunnel command is `ngrok http 3101`. Keep its credentials in the tool's local secret configuration.
3. Set `NEXT_PUBLIC_APP_URL` to the resulting HTTPS origin and restart staging. In staging Supabase Auth URL Configuration, set Site URL to this origin and allow the exact `https://YOUR-STAGING-HOST/auth/callback` redirect. Configure email/password, SMTP and any OAuth providers in this staging project separately. OAuth providers need the staging Supabase callback URI shown in their provider configuration as well. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
4. Register the webhook paths below with their providers. `localhost` is not reachable from provider servers. If the tunnel hostname changes, update application origin, auth redirects and provider destinations together.

| Service | Staging destination |
| --- | --- |
| Supabase application callback | `/auth/callback` |
| Didit status webhook | `/api/webhooks/didit` |
| Paystack payment webhook | `/api/webhooks/paystack` |
| Mux asset webhook | `/api/webhooks/mux` |

For phone recording, open the HTTPS staging/tunnel URL on the phone and allow camera/location. An ordinary HTTP LAN address cannot provide the same secure-context permissions.

## 4. Configure Didit Sandbox

1. Select Sandbox in the Didit console. Create a sandbox API key and KYC/KYB workflows within that same sandbox application/environment.
2. Set `DIDIT_API_KEY`, `DIDIT_KYC_WORKFLOW_ID` and `DIDIT_KYB_WORKFLOW_ID` to those staging values.
3. Create the sandbox webhook destination above and put its own signing secret in `DIDIT_WEBHOOK_SECRET`.
4. Apply `20261107160000_didit_event_ordering` to staging and verify its two `WebhookLog` columns and session/time index. Set `DIDIT_ORDERING_ENABLED=true` only in staging after schema acceptance; the receiver returns 503 before new-table access while disabled. Restart staging after changing the flag.
5. Create sessions through Rentral using test accounts. Exercise approved, declined, in-review, repeated and stale-session events, then newer revocation followed by an older approval and same-second conflicting events. Verify the signed body's dispatch timestamp matches `X-Timestamp`, and that a revoked database identity cannot continue protected mutations even during a failed Supabase metadata refresh. Follow [the identity cutover and reconciliation guide](identity-review.md) before production activation.

The key selects the environment; a live key does not create a sandbox session. Sandbox mocks do not prove real registry coverage or real identity acceptance. [Didit sandbox testing](https://help.didit.me/getting-started/sandbox-and-testing), [webhook setup](https://help.didit.me/integration/webhooks-basics).

## 5. Configure Paystack Test mode

1. Create/sign in to your Paystack business dashboard and select **Test mode**. In Developers / API configuration, copy the **test secret** (`sk_test_…`) to `PAYSTACK_SECRET_KEY`. This server integration does not require a browser public key.
2. Add the HTTPS `/api/webhooks/paystack` URL to Test-mode webhook settings. For modern signing, generate that mode's webhook signing secret (`whsec_…`) and set `PAYSTACK_WEBHOOK_SECRET`. Rentral then requires the timestamped `Paystack-Signature` header and never downgrades to legacy verification.
3. If your Test-mode integration still sends only legacy `x-paystack-signature`, leave `PAYSTACK_WEBHOOK_SECRET` blank until modern signing is actually active. Legacy HMAC verification uses `PAYSTACK_SECRET_KEY`.
4. After migration acceptance, set `RENTRAL_PLATFORM_ENABLED=true` and `PAYMENTS_ENABLED=true` **in staging**, restart, and pay through a test checkout created by Rentral. Use Paystack's [official test payment data](https://paystack.com/docs/payments/test-payments/).
5. Verify server-side provider lookup confirms the reference, amount, NGN currency, payer and metadata; duplicate success webhooks must not create duplicate settlements/ledger entries. Test failed payment, retry, expiry and an unavailable provider. Returning from checkout alone is not confirmation.

Test mode does not move real money and does not process normal settlements. This checkout implementation does not establish regulated escrow custody, arbitrary bank-transfer verification, or production payout approval. [Paystack test/live modes](https://paystack.com/docs/api/authentication/), [webhook signing](https://paystack.com/docs/payments/webhooks/).

## 6. Prepare OPay separately

1. Register a merchant account from OPay's official merchant portal. Its onboarding documentation describes a test account and a separate production transition.
2. Ask OPay to confirm the approved Nigerian merchant product, sandbox credentials, callback-signature scheme and features Rentral needs: collections, virtual accounts, refunds, transfers/splits and any proposed holding arrangement. Use only the contract/documentation provided for that approved product.
3. Use the official sandbox fixtures to test success, pending and failed payment cases. Do not use real cards in the documented test environment.
4. The current Rentral implementation has a Paystack adapter; no OPay adapter or enable switch exists. Supplying an `OPAY_SECRET_KEY` alone will not activate OPay. An adapter and its contract tests must follow merchant product approval; no endpoint or escrow capability should be guessed.

[OPay merchant setup](https://documentation.opaycheckout.com/getting-started.html), [OPay end-to-end sandbox tests](https://documentation.opaycheckout.com/end-to-end-testing.html).

## 7. Configure a dedicated Mux environment

1. Create/select a dedicated development/staging environment in the Mux dashboard. Its assets, access tokens, signing keys and webhooks are separate from production.
2. Create an API access token with the Video read/write permissions required for ingest/reconciliation. Set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` from that token.
3. Create a signing key in that same environment. Store its key ID in `MUX_SIGNING_KEY_ID` and its private key in `MUX_SIGNING_PRIVATE_KEY`. Prefer the **one-line base64-encoded PEM returned by Mux**, copied directly without re-encoding. The pinned Mux Node SDK also supports real PKCS1/PKCS8 PEM strings, but a literal `\\n` sequence is not the same as a newline.
4. Create the environment webhook at HTTPS `/api/webhooks/mux`. Store that destination's signing secret as `MUX_WEBHOOK_SECRET`. If using `mux webhooks listen --forward-to http://localhost:3101/api/webhooks/mux` instead, use the CLI listener's secret for those forwarded requests; it differs from the hosted destination's secret.
5. After the media migrations/private-bucket checks pass, set `MUX_ENABLED=true` in staging and restart. Submit a small test listing, verify signed asset creation and ready/error events, duplicate-event handling, owner-only pending playback, active playback and token expiry. Mux readiness must not by itself publish a listing.

Environment names do not guarantee free usage; inspect Mux billing/test-asset options before ingesting many clips. [Mux environment isolation](https://www.mux.com/docs/core/mux-fundamentals), [signing keys and base64 format](https://www.mux.com/docs/guides/secure-video-playback), [webhook signatures](https://www.mux.com/docs/core/verify-webhook-signatures), [local forwarding](https://www.mux.com/docs/core/listen-for-webhooks).

## 8. Configure Gemini document screening

1. In Google AI Studio, create/import a dedicated test Cloud project and create a current supported API key. Put it in server-only `GEMINI_API_KEY`. Use the current key type and restrictions required by Google's dashboard rather than an old unrestricted key.
2. Use the Gemini Models API `models.list` for that project/key and select a currently available stable model supporting `generateContent`, image/PDF input and structured JSON output. Put the bare model identifier in `GEMINI_DOCUMENT_MODEL` (omit the `models/` prefix). The repo deliberately has no hardcoded Gemini 1.5 default.
3. Confirm account billing/quota and privacy/retention choices. Use synthetic documents with no real identity details for staging.
4. Trigger screening of a test listing from the authorized review workflow. Verify structured `risk`, `findings` and `documentType` results; rate limits, invalid files or provider failure must leave manual review required. A low-risk AI result must never automatically prove ownership or approve the listing.

The application uses the REST API with `x-goog-api-key`; no extra SDK is needed. Google changes model availability and key requirements, so choose from the live list in your account rather than copying an old model name. [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [Models API](https://ai.google.dev/api/models), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## 9. Optional geocoding, email, analytics and administrator access

- **Address matching:** create a Geoapify test project/key and set server-only `GEOAPIFY_API_KEY`. Without it, automated address matching remains unavailable; no match should be fabricated. [Geoapify key setup](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/).
- **Email:** create a separate Resend key, verify a sender domain and set `RESEND_API_KEY` plus `RENTRAL_EMAIL_FROM`. Test only with approved staging inboxes. These app notification settings are separate from Supabase Auth SMTP configuration. [Resend Next.js setup](https://resend.com/docs/send-with-nextjs).
- **Access:** place authenticated staging user UUIDs in server-only `RENTRAL_ADMIN_IDS` and `RENTRAL_INSIGHTS_IDS`. Never treat a username, email or browser-editable profile property as administrator authorization.
- **Analytics:** leave `RENTRAL_ANALYTICS_ENABLED=false` and `NEXT_PUBLIC_POSTHOG_ENABLED=false` until intentional testing. First-party aggregation requires a separate `ANALYTICS_HASH_SECRET` of at least 32 characters; review retention and consent before enabling it. Do not reuse worker or provider secrets.

## 10. Enable and schedule workers after acceptance

Generate each worker/hashing secret independently on your machine. This command copies a fresh 64-character random value to the clipboard without printing it; paste it into the appropriate local secret field and clear the clipboard afterwards:

```powershell
pnpm.cmd exec node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

| Worker | Flags/secrets | Schedule |
| --- | --- | --- |
| Media | `MUX_ENABLED=true`, all five Mux credentials, `MEDIA_WORKER_ENABLED=true`, independent `MEDIA_WORKER_SECRET` (32+ characters, no whitespace) | POST `/api/internal/media-worker` every five minutes; one concurrent request, at least a 60-second timeout |
| Lifecycle | `RENTRAL_PLATFORM_ENABLED=true`, `LIFECYCLE_WORKER_ENABLED=true`, independent `LIFECYCLE_WORKER_SECRET` (32+ characters) | POST `/api/internal/lifecycle-worker` at the cadence tested for reservation expiry and notification delivery |

Configure the matching `Authorization: Bearer <worker-secret>` in the scheduler's secret manager, not in a URL, browser link or committed script. GET-only cron services cannot call these POST endpoints. Alert on non-2xx responses and uncertain jobs; a successful batch response does not prove every provider task completed. Test overlapping calls and missed callbacks before scheduling. Both workers stay disabled by default.

## Completion checklist

Before any production rollout, keep evidence for: successful clean migration replay and upgrade; fresh auth/signup/recovery; Didit sandbox outcomes; private media authorization; Mux ready/error/replay recovery; server-verified Paystack test payments and duplicate handling; mutually exclusive bookings; message isolation; human document review; hold expiry; real device recording; responsive/accessibility checks; and provider-supported refund/payout reconciliation. External merchant approval and local test success are different requirements. Preserve the staging environment and its credentials independently from production.
