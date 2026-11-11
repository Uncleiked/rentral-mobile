# Local setup audit - active RentralMobile application

Checked: 2026-11-11. Scope: the application in
`C:/Users/Mudian Consult/Documents/RentralMobile`, served on port 3000.
Only variable names, flags and verification outcomes are recorded here. No secret,
connection string, token, password, user record or provider response body is included.
No environment value, hosted database record, provider configuration or permission
was changed by this audit.

Follow-up 2026-11-11: local Google enable flag and credential fields are now present,
and the selected database has googleAuthVersion1 and organizationVersion1. This was
confirmed read-only after user configuration. The initial audit below is historical.
A callback-origin code fix is saved locally; production needs the updated source,
matching HTTPS environment values and redeployment. See google-sign-in-setup.md.
## Which project is running

There are two different local projects:

- `Documents/RentralMobile`: npm workspace, Next.js, MongoDB, local JWT/email-password
  accounts, private local file storage and the `/admin` owner workspace. This is
  the active port-3000 application investigated for the reported gallery control.
- `Documents/rentral`: the older Supabase/PostgreSQL project, with the previous
  Google-only and organization-admission source changes. Its separate preview used
  port 3100. Changes in that directory do not update RentralMobile's admin page.

The earlier Supabase instructions described the older directory. Do not add those
credentials to RentralMobile or run PostgreSQL migrations against its MongoDB.

## Why sign-in works without Supabase

The active application does not use Supabase authentication. Its
`lib/server.ts` is a local adapter, despite method names such as
`signInWithPassword` resembling the old SDK.

1. The browser sends email/password to the application's server action.
2. `lib/auth/service.ts` reads the matching account from MongoDB and checks its
   stored password hash with scrypt (`lib/auth/password.ts`). Passwords are not
   stored as plaintext by this code.
3. The backend writes an `AuthSession` record, signs a 15-minute access JWT using
   `JWT_SECRET`, and issues an opaque refresh token with a 30-day lifetime. The
   refresh token's hash is stored in MongoDB.
4. Web sessions use HttpOnly, SameSite=Lax cookies. Protected requests validate the
   token and current database session/account; staff authorization reads the
   current database role. Native clients use the same backend with bearer tokens.

`MONGODB_URL` connects the backend to your database. `JWT_SECRET` signs the session.
Those are the connection/signing settings required by this implementation, not a
Supabase API key. This is real account/session code, not a simulated sign-in.

The repair now adds Google as an alternative alongside email/password, using the
same MongoDB accounts and JWT sessions. The server needs GOOGLE_AUTH_ENABLED,
GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, plus additive GoogleIdentity preparation.
Google is not active merely because its source is present. Follow the Google setup
guide in this project; the old Supabase callback instructions do not apply.

New web accounts choose Individual or Organization. Organizations submit CAC
registration evidence and require independent administrator approval before
marketplace access. This new OrganizationApplication workflow needs additive
preparation as well; it adds no third-party API credential or personal KYC gate.

## Actual private configuration checked

The active root `.env.local` contains configured, nonempty values for:

- Core: `MONGODB_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`.
- Video: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`,
  `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`.
- Processing: `MEDIA_WORKER_SECRET`.
- Addresses: `GEOAPIFY_API_KEY`.

Enabled flags:

- `AUTH_DEV_EMAIL_OUTBOX=true`
- `RENTRAL_PLATFORM_ENABLED=true`
- `RENTRAL_SAFETY_ENABLED=true`
- `MUX_ENABLED=true`
- `MEDIA_WORKER_ENABLED=true`

The mobile private file contains `EXPO_PUBLIC_API_URL`. Backend credentials are not
present there. No `.env.development.local`, `.env.development` or `.env` override
was found in this project, and the audit shell had no matching environment override.
An already-running process still retains the environment with which it started.

The older project's own `.env.local` does contain Supabase URL, publishable key,
service-role key, both PostgreSQL URLs, its CA path and Didit settings. Their presence
there does not configure the active MongoDB application.

## Verification performed

- `npm.cmd run env:check`: passed its offline format checks.
- Read-only MongoDB ping: passed.
- All readiness fields required before this repair were present at version 1, including
  `schemaVersion`, `ownerAdminVersion`, `storageClaimsVersion`, `captureVersion`,
  `mutationVersion`, `authSecurityVersion`, `mediaUploadVersion`,
  `financialVersion`, `lifecycleVersion`, `matchingVersion`,
  `commercialVersion`, `messagingActivityVersion` and `pushVersion`.
- Read-only Mux Video API request: HTTP 200. The configured playback private key
  parses as a private key. This does not establish that it matches its signing ID.
- Read-only Geoapify sample request for Lagos: HTTP 200. This proves API access,
  not building-level accuracy for every address.

These checks did not upload a video, change a permission, send a payment/email,
verify a webhook or prove physical-device playback. Readiness markers describe
prepared database structure; they do not activate optional providers.

## New feature preparation remains pending

The audit did not change Atlas. The newly added googleAuthVersion and
organizationVersion markers and their collections/indexes have not been applied
to that saved database. Existing email/password accounts and admin/gallery controls
continue with their already-prepared structure. Google and organization review
fail closed until their separate preparation passes.

After reviewing the additive setup and choosing to apply it to the saved Atlas
target, run npm.cmd run db:setup -- --allow-remote. This command changes the selected
database's indexes, validators, collections and readiness markers; it is not an
offline test. It must not be substituted with prisma db push or old SQL migrations.
The implementation work did not run it. No existing account permission was changed.

For Google, then follow context/google-sign-in-setup.md. Register the exact local
callback http://localhost:3000/auth/google/callback with Google Auth Platform,
keep the Client ID and Client Secret server-only in .env.local, and enable
GOOGLE_AUTH_ENABLED only after configuration and preparation. Keep JWT_SECRET and
the existing MongoDB URI unchanged. Test new Google accounts and explicit
password-confirmed linking for an existing account; matching email alone never links.

## Setup still needed, in useful order

### 1. Use the correct app and npm

Open a terminal in `Documents/RentralMobile` and keep its existing backend running:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000/admin` after signing in with an authorized account.
Use `npm.cmd run env:check` after changing private settings. Save your file, restart
the backend and refresh the page when environment values change.

Next.js loads environment files from the project root. Existing process variables
have priority over environment files; public `NEXT_PUBLIC_` values are bundled
into browser code during builds. Deployed environment settings must be configured
separately from ignored local files.
[Next.js environment documentation](https://nextjs.org/docs/app/guides/environment-variables).

### 2. Finish video processing acceptance

Your Mux credentials are already present and accepted for read access. Do not
replace them with example values.

1. In the same Mux environment, confirm your webhook points to the reachable HTTPS
   backend route `/api/webhooks/mux` and its signing secret matches your local file.
2. For local Windows development, follow `mux-local-setup.md` to forward that
   endpoint through a temporary HTTPS tunnel; localhost is not reachable by Mux.
3. Keep the backend running and start `npm.cmd run worker -- --once` for a deliberate
   processing batch, or `npm.cmd run worker` for the local loop. Enabled flags do
   not start a worker process by themselves.
4. Use a small authorized test video to confirm upload, processing, signed playback
   and failure recovery. This can create Mux assets/usage and is a separate test
   from this read-only audit.

[Mux API authentication](https://www.mux.com/docs/core/make-api-requests),
[webhooks](https://www.mux.com/docs/core/listen-for-webhooks),
[signed playback](https://www.mux.com/docs/guides/secure-video-playback).

### 3. Configure Paystack when you want real test checkout

No Paystack settings are present, so payment collection remains disabled.

1. Open a Paystack account/dashboard in Test mode and copy its backend secret key.
2. Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_ENVIRONMENT=test` and, only when ready to
   test collection, `PAYMENTS_ENABLED=true` in the root private file.
3. Confirm `NEXT_PUBLIC_APP_URL` is the actual backend return origin. Configure a
   reachable HTTPS `/api/webhooks/paystack` endpoint for webhook tests.
4. Use Paystack's test payment methods and verify server reconciliation. A return
   redirect is not proof of payment. Modern webhook signing secrets are optional
   only when the matching signing mode is used; follow `paystack-integration.md`.
5. Keep refunds/transfers and settlement disabled until their separate merchant,
   recipient, independent-review and execution requirements are accepted.

Authorized admin fee waivers are separate from payment collection and must display
as waived, never as paid. They do not require a Paystack key.
[Paystack keys](https://paystack.com/docs/developer-tools/api-keys/),
[webhooks](https://paystack.com/docs/payments/webhooks/).

### 4. Choose development email or actual email delivery

`AUTH_DEV_EMAIL_OUTBOX=true` currently writes recovery/email-change codes into
private `storage/mail-outbox` files. It does not send messages to an inbox.

For actual delivery:

1. Create a Resend account, add your own sender domain, and install its requested
   DNS records until verification passes.
2. Add server-only `RESEND_API_KEY` and `RENTRAL_EMAIL_FROM` using that domain.
3. Generate a separate 32-byte base64url key for `AUTH_EMAIL_ENCRYPTION_KEY`; keep
   the current JWT secret unchanged.
4. Set `AUTH_EMAIL_ENABLED=true`. Production requires
   `AUTH_DEV_EMAIL_OUTBOX=false` and real delivery acceptance.
5. For ordinary notification email, additionally configure
   `NOTIFICATION_EMAIL_ENABLED`, an explicit `NOTIFICATION_EMAIL_SINCE` timestamp,
   and `LIFECYCLE_WORKER_ENABLED` plus a separate `LIFECYCLE_WORKER_SECRET`. Run the
   lifecycle worker deliberately after reviewing what it will process.

Generate a new dedicated key locally only when missing:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep the result in the private backend file, never chat or an Expo public variable.
[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

### 5. Prepare deployment and recovery before public release

- MongoDB currently connects successfully. If the backend's network changes, permit
  its current public IP in the correct Atlas project's IP access list. Keep TLS
  validation enabled. [Atlas IP access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
- Set `BACKUP_ENCRYPTION_KEY` to a separate stable 32-byte base64url key and follow
  `backup-operations.md` to back up MongoDB and private files together. Keep the key
  separately from archives; do not rotate the current JWT key merely for setup.
- Configure the actual hosting environment's secrets and public HTTPS origin.
  Private filesystem storage needs persistent storage; a disposable serverless
  filesystem alone is not a suitable production store for these files.
- Remote push is optional and needs EAS/push credentials, a development/store
  build, consent, a dedicated encryption key and delivery cutoffs. None of those
  settings are currently configured. Follow `environment-setup.md` when needed.
- Paid Insights, sponsorship, first-party analytics and real settlement are also
  optional, currently unconfigured. Their prices, separate hashing keys and
  reviewed enable flags must be selected before use.

Owner/gallery permissions themselves need no new `.env.local` key. They are
stored and audited in MongoDB and enforced by current server-side authorization.
Never enable permission by adding a browser flag, changing a frontend label or
copying the old Supabase admin-ID allowlist into this project.
