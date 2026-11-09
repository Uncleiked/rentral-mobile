# Rentral environment setup, step by step

Rentral uses an Expo Android/iOS app and a separate Next.js backend. Your saved
MongoDB Atlas connection stays on the backend. Accounts use local JWT sessions;
there is no personal KYC onboarding, Supabase setup or OPay integration.

## 1. Keep two private files

| File | What belongs here |
| --- | --- |
| `.env.local` at the repository root | MongoDB, JWT, private storage and optional provider/worker keys |
| `apps/mobile/.env.local` | `EXPO_PUBLIC_API_URL`, plus the optional public EAS project UUID |

Open the existing files in your editor. **Do not replace your saved Atlas URI or
existing signing/encryption keys with template values.** For a fresh checkout,
create files only when they do not already exist:

```powershell
if (-not (Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path -LiteralPath apps/mobile/.env.local)) { Copy-Item apps/mobile/.env.example apps/mobile/.env.local }
```

Both local files are ignored by Git. Only templates contain tracked placeholders.
Never paste backend secrets into an `EXPO_PUBLIC_` variable or a chat message.

## 2. Install and generate the database client

Use Node 24.x and npm 11.19.1. In PowerShell, the `.cmd` form also works when the
computer blocks npm's PowerShell wrapper:

```powershell
npm.cmd install
npx.cmd prisma generate
```

The project pins Prisma 6.19.3 for MongoDB. Do not use Prisma 7, `prisma db push`,
or the historical PostgreSQL migrations to prepare this database.

## 3. Check the required backend values

Your root `.env.local` needs these values:

```dotenv
MONGODB_URL="YOUR_EXISTING_MONGODB_ATLAS_CONNECTION"
JWT_SECRET=YOUR_EXISTING_PRIVATE_SIGNING_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_DEV_EMAIL_OUTBOX=true
RENTRAL_PLATFORM_ENABLED=true
RENTRAL_SAFETY_ENABLED=true
```

- `MONGODB_URL`: copy the Node.js connection from your Atlas cluster's Connect
  instructions. Keep the chosen database name in the URI. Use an Atlas **database
  user**, which is separate from your Atlas website login; percent-encode special
  password characters. If the URI omits the database name, `MONGODB_DB_NAME` supplies
  it, otherwise the application defaults to `rentral`. This optional fallback name
  must be 1–63 letters, digits, underscores or hyphens; a database already named in
  the saved URI takes precedence.
- `JWT_SECRET`: keep the current value, at least 32 UTF-8 bytes. For a new installation, generate one with
  the command below and paste the result only into this backend file. Rotating it
  invalidates existing sessions and file capabilities.
- `NEXT_PUBLIC_APP_URL`: the backend web origin, without a page path. It is
  separate from the phone's API address.
- `AUTH_DEV_EMAIL_OUTBOX=true`: local recovery and email-change codes go to private
  `storage/mail-outbox` text files. Open them privately on the backend computer;
  they are not public file URLs and do not send email.
- `RENTRAL_STORAGE_DIR`: optional absolute private folder. Leave it unset/blank for
  the repository's `storage` directory. Never place private storage in `public`.
- `NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN`: optional host-entered fee ceiling,
  default `10000000` NGN. Use a plain decimal from `0` to `9999999999.99`, with at
  most two decimal places and no commas/exponent. Browser/server builds must use
  the same value. This is a product limit, not a legal assessment of a fee.

Generate a new signing secret only when one is missing:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 4. Prepare the selected MongoDB database

Atlas must permit the **backend computer's current public IP**. An Active entry
for an old IP does not permit a new network address. This is different from the
private LAN address used by your phone. Check the correct project/cluster and
[Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
Keep TLS certificate checks enabled.

For your selected hosted Atlas database:

```powershell
npm.cmd run db:setup -- --allow-remote
```

This prepares additive collections, indexes, validators and feature readiness.
It does not import the old database, replace existing accounts, or grant staff
roles. Runtime requests do not prepare the database automatically. A restore
verification database remains quarantined and is refused by this setup command.

If you deliberately choose local MongoDB instead, follow the replica-set Docker
commands in [README](../README.md) and run `npm.cmd run db:setup` without the
remote flag. A standalone MongoDB server cannot provide the required transactions.

## 5. Set the phone's backend address

Put one reachable origin in `apps/mobile/.env.local`, without `/api/v1`:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000
```

| Where the app runs | API origin |
| --- | --- |
| Physical Android or iPhone | `http://YOUR_COMPUTER_LAN_IP:3000` on the same reachable network |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator on a Mac | `http://localhost:3000` |
| Web preview on the backend computer | `http://localhost:3000` |

On a physical phone, `localhost` means the phone itself. Keep the backend on
port 3000 and allow it through the computer's firewall for the trusted local
network. Expo's port 8081 and optional tunnel serve the app bundle; they do not
forward the separate backend. Restart Expo after changing the mobile file.

These HTTP addresses are for local Expo Go/development builds. Before creating a
release build, set `EXPO_PUBLIC_API_URL` to your deployed backend's **HTTPS** origin
and rebuild; release bundles intentionally reject HTTP. Exporting a bundle alone
does not deploy the backend or establish real-device acceptance.

## 6. Verify and start both processes

```powershell
npm.cmd run env:check
```

This checks both private files without printing their values or contacting the
database/providers. It reports missing or malformed settings by key name. It
does not prove network access, merchant permissions or delivery.

Keep two terminals running:

```powershell
# Terminal 1: backend
npm.cmd run dev
```

```powershell
# Terminal 2: mobile
npm.cmd run mobile
```

If another project uses Expo's default port, start Rentral on a free port instead:

```powershell
npm.cmd run start --workspace @rentral/mobile -- --port 8090
```

Scan the QR code from that Rentral terminal. Changing Metro's port does not change
the separate API origin/port 3000; keep just one Rentral Metro process running.

Open `http://localhost:3000/sign-in` on the computer. Scan Expo's QR code with the
SDK-compatible Expo Go app for ordinary local workflows. Sign in or create an
account; Explore opens directly. Use a development build for remote push.

## 7. Configure optional integrations only when needed

Leave their enable flags `false` for basic local development. Adding a key does
not establish real merchant, email, video or device acceptance.

### Paystack collection

```dotenv
PAYMENTS_ENABLED=true
PAYSTACK_ENVIRONMENT=test
PAYSTACK_SECRET_KEY=YOUR_BACKEND_TEST_SECRET
PAYSTACK_WEBHOOK_SECRET=
PAYSTACK_WEBHOOK_PREVIOUS_SECRET=
```

Use your secret or restricted backend key, never the `pk_` public key. Recognized
test/live prefixes must match the configured mode. See the official
[Paystack key guide](https://paystack.com/docs/developer-tools/api-keys/) and
[project integration notes](paystack-integration.md) for webhook secret rotation
and restricted-key requirements.

The listing publication fee is the existing fixed shared server policy
`PUBLICATION_FEE_KOBO='100000'` (**NGN 1,000**) in
`lib/contracts/listing-payments.ts`. Native display, DTO validation and server
intent creation share that constant. It is not a client-selected price and has
no fee-price environment variable. `NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN`
limits optional host-entered fees, not this publication fee. Keep
`PAYMENTS_ENABLED=false` until matching Paystack keys, merchant permissions and
the return address are deliberately configured; an unavailable native fee action
must not be simulated as paid. The API/native fee increment passed its local
checks/exports; see [the current matrix](completion-status.md) for the distinction
between that verification and real provider/device acceptance.

`NEXT_PUBLIC_APP_URL` must be a usable backend return origin. Callback validation
runs before a new booking/listing payment intent is written; production or live
mode requires HTTPS. Existing history remains readable when checkout is disabled
or callback configuration is unavailable. Native owner controls refresh the saved
fee and reconcile its exact reference after an unknown outcome, never blindly
start a second charge. Old-mode receipts remain historical records, not proof
for new current-mode publication approval.

Paystack cannot send webhooks to a private localhost server. During local testing,
return from checkout and explicitly refresh/reconcile the booking; authenticated
provider verification determines payment status. A browser redirect is not proof
of payment. A public HTTPS callback/webhook requires a later hosting decision.

### Reviewed refunds and payouts

Collection is separate from settlement. Enable only the merchant capabilities
you have arranged and tested:

```dotenv
SETTLEMENT_ENABLED=true
SETTLEMENT_POLICY_ACK=manual-review-v1
PAYSTACK_REFUNDS_ENABLED=true
PAYSTACK_TRANSFERS_ENABLED=false
PAYMENT_ACCOUNT_HASH_SECRET=YOUR_SEPARATE_STABLE_RANDOM_SECRET
SETTLEMENT_HOLD_DEFAULT_POLICY=
```

Generate `PAYMENT_ACCOUNT_HASH_SECRET` with the 32-byte base64url command and keep
it stable; it fingerprints bank accounts. Do not reuse the JWT/analytics keys.
Payouts additionally require transfers enabled, a confirmed recipient, available
provider funds and independent staff approval. `30-70-v1` is an explicit optional
reviewed expired-hold policy, not an automatic fee or an escrow claim. See the
payment integration notes before enabling it.

### Real account email and notification email

```dotenv
AUTH_EMAIL_ENABLED=true
AUTH_EMAIL_ENCRYPTION_KEY=YOUR_SEPARATE_32_BYTE_BASE64URL_KEY
AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY=
RESEND_API_KEY=YOUR_BACKEND_RESEND_KEY
RENTRAL_EMAIL_FROM="Rentral <notify@YOUR_VERIFIED_DOMAIN>"
NOTIFICATION_EMAIL_ENABLED=false
NOTIFICATION_EMAIL_SINCE=
```

Use a verified Resend sender. Authentication email needs its dedicated 43-character
base64url key; keep it available while queued messages are pending. The previous
key is only for a deliberate rotation. Production must use real delivery and
`AUTH_DEV_EMAIL_OUTBOX=false`.

To deliver ordinary notification email, also enable its flag, set an explicit
ISO timestamp with time zone in `NOTIFICATION_EMAIL_SINCE`, and run the lifecycle
worker. The cutoff prevents an old backlog from being mailed. Provider acceptance
is distinguished from inbox delivery; unknown acceptance is not blindly resent.

### Mux, document screening and addresses

```dotenv
MUX_ENABLED=true
MUX_TOKEN_ID=YOUR_VIDEO_API_TOKEN_ID
MUX_TOKEN_SECRET=YOUR_VIDEO_API_TOKEN_SECRET
MUX_WEBHOOK_SECRET=YOUR_MUX_WEBHOOK_SECRET
MUX_SIGNING_KEY_ID=YOUR_SIGNING_KEY_ID
MUX_SIGNING_PRIVATE_KEY=YOUR_MUX_PRIVATE_KEY
MEDIA_WORKER_ENABLED=true
MEDIA_WORKER_SECRET=YOUR_SEPARATE_RANDOM_WORKER_SECRET
GEMINI_API_KEY=
GEMINI_DOCUMENT_MODEL=
GEOAPIFY_API_KEY=
```

The Mux signing value accepts the PEM or the one-line base64 PEM supplied by Mux;
do not encode it twice. The backend pushes local private bytes through resumable
upload and reconciles provider state, so Mux need not fetch a LAN URL. See
[media processing](media-processing.md).

Gemini is optional advisory document screening: configure both a key and a current
image/PDF plus JSON-capable bare model ID, without `models/`. Geoapify supplies
address geocoding when configured. Neither AI nor GPS proves ownership. Publication
still requires independent human document review, a matching address, ready signed
video, and a verified publication fee. Existing originals remain private.

### Local workers

```dotenv
LIFECYCLE_WORKER_ENABLED=true
LIFECYCLE_WORKER_SECRET=YOUR_SEPARATE_RANDOM_WORKER_SECRET
RENTRAL_WORKER_API_URL=http://localhost:3000
```

Generate each worker secret separately using the 32-byte base64url command. Each
worker secret must have at least 32 characters and no whitespace. With
the backend already running, an operator can run one batch or keep the local driver
running. This may send enabled real email/push or reconcile enabled providers:

```powershell
npm.cmd run worker -- --once
npm.cmd run worker
```

The driver accepts loopback backend origins, prevents overlapping requests and
prints counters rather than private records. Workers do not start merely because
the mobile app is open. Keep optional sends disabled until deliberately configured.
Optional driver switches are `--interval-ms=30000` (default 30 seconds; allowed
1,000–3,600,000 ms) and `--timeout-ms=150000` (default 150 seconds; allowed
1,000–180,000 ms). These command switches do not activate disabled provider gates.

### Device push notifications

Backend file:

```dotenv
PUSH_NOTIFICATIONS_ENABLED=true
PUSH_NOTIFICATIONS_SINCE=YOUR_EXPLICIT_ISO_TIMESTAMP_WITH_TIME_ZONE
PUSH_TOKEN_ENCRYPTION_KEY=YOUR_SEPARATE_32_BYTE_STANDARD_BASE64_KEY
EXPO_ACCESS_TOKEN=YOUR_BACKEND_EXPO_ACCESS_TOKEN
EXPO_PUBLIC_EAS_PROJECT_ID=YOUR_PUBLIC_EAS_PROJECT_UUID
```

Mobile file:

```dotenv
EXPO_PUBLIC_EAS_PROJECT_ID=THE_SAME_PUBLIC_EAS_PROJECT_UUID
```

Unlike the auth-email/backup keys, the push encryption key uses standard padded
base64: exactly 44 characters encoding 32 bytes. Generate it separately:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use your EAS project, platform push credentials and a development/store build.
The backend `EXPO_ACCESS_TOKEN` must contain 16–512 printable ASCII characters
without spaces; it is an Expo account access token, not a device push token.
Expo Go remains useful for other workflows; it is not a remote-push acceptance
environment. The member explicitly opts in on the device. The backend sends a
generic alert; opening it loads the authenticated notification inbox. Read the
[Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
and [delivery protocol](https://docs.expo.dev/push-notifications/sending-notifications/).

### Paid Insights, sponsorship and analytics

```dotenv
COMMERCIAL_ENABLED=false
INSIGHTS_PRICE_KOBO=
INSIGHTS_TERM_DAYS=30
SPONSORSHIP_PRICE_KOBO=
SPONSORSHIP_TERM_DAYS=7
RENTRAL_ANALYTICS_ENABLED=false
ANALYTICS_HASH_SECRET=
```

Choose both prices before enabling commercial purchases. `INSIGHTS_PRICE_KOBO`
and `SPONSORSHIP_PRICE_KOBO` must be positive integer strings from `1` to
`100000000000` kobo, without decimals, commas or leading zeroes. No default market
price is assumed. Both term settings accept whole days from `1` to `366`:
`INSIGHTS_TERM_DAYS` defaults to `30` and `SPONSORSHIP_TERM_DAYS` defaults to `7`
only when the setting is absent. An explicitly blank term is invalid; keep the
template's numeric values or supply a valid number. Terms are manually renewed.
Sponsorship needs independent review,
a verified current-mode payment and a current public listing; placement is labeled.
Test-mode receipts do not unlock live-mode service. Refund/reversal reservations
can suspend access until reconciled.

First-party market observations additionally need a separate stable random
`ANALYTICS_HASH_SECRET` with at least 32 characters and the member's persisted
consent. Use the separate 32-byte base64url generator and keep the result stable.
Reports withhold cells below 10 distinct contributors. Consent withdrawal removes
the member's mapped observations; events are retained for at most 90 days. Optional PostHog/Oluso settings
are listed in the template and remain off unless explicitly configured.

## 8. Set staff roles deliberately

Roles are not `.env.local` user-ID lists. Register active accounts, obtain their
UUIDs from the selected database/own account data, then use the audited operator
command for your chosen account:

```powershell
npm.cmd run staff:role -- --user-id USER_UUID --role admin --reason "Initial operator-approved staff bootstrap" --allow-remote
```

Omit the remote flag for a local database. Available roles are admin, moderator,
finance and analyst; `member` revokes a staff role. Staff cannot approve their own
assets or settlement requests. Use separate reviewer accounts for independent review.

## 9. Back up the database and private storage together

Set a dedicated `BACKUP_ENCRYPTION_KEY` using the 32-byte base64url generator.
Keep this key separately from the encrypted archives. Follow
[backup operations](backup-operations.md) for pausing writers, encrypted capture,
an owned disposable restore rehearsal and quarantine. Member JSON export is not
an operator recovery backup. No tool automatically enables a restored database or
replays provider mutations.

## 10. Troubleshoot without changing databases

| Symptom | Check |
| --- | --- |
| Sign-in temporarily unavailable | Keep `npm run dev` running; run `env:check`; confirm Atlas connectivity and explicit setup succeeded |
| Atlas IP entry is Active but connection fails | Compare the current backend public IP, correct project/cluster, database-user credentials and network/TLS reachability |
| App loads but API requests fail | The phone's API URL must reach port 3000; check the trusted-network firewall and restart Expo after editing its file |
| New feature says setup required | Run additive setup for the same selected database; do not switch to an empty database to hide the error |
| Real email, video or payment unavailable | Review that provider's keys, enable flags, merchant/project permissions and worker status; a key alone does not prove readiness |
| Empty Insights report | Consented data, minimum distinct contributors, configured environment and access entitlement are required |
| Push unavailable in Expo Go | Use a configured development build and explicit device opt-in; do not put server tokens in public mobile variables |

Restart the backend after root env changes and restart Expo after mobile env changes.
Keep the saved hosted connection and private storage unless you intentionally plan
a reviewed migration.
