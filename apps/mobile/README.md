# Rentral mobile

Expo SDK 58 / Expo Router app for Android and iOS. It uses the local Rentral API, MongoDB-backed email/password JWT accounts, and local file uploads. There is no KYC onboarding, OAuth configuration, mandatory profile wizard, or Supabase dependency.

## Start

The Account screen exposes Admin when the current server role permits it. Approved
gallery uploaders may choose photos and an optional video without GPS recording;
their listings use human review and truthful gallery labels. Photo-only galleries
are supported. See [owner/admin setup](../../context/owner-admin-setup.md).

The recording-time GPS lock requires online backend acknowledgment, a completed
take and exact uploaded-video binding. Address preflight and final submission
compare a precise geocoded address with the private capture within100metres. Old
recordings without this evidence require a new take. Follow
[location setup](../../context/recording-location-setup.md) and
[Mux setup](../../context/mux-local-setup.md).

The new logo and opening reveal need no public key. Native OS splash/launcher
icons need a new native binary; Expo Go shows the JavaScript intro. The intro is
720ms, or180ms without scale for reduced motion, and cannot wait on the backend.

Use Node 24.x and npm 11.19.1. First complete [backend/database setup](../../README.md).
It preserves the saved MongoDB connection. Atlas needs the backend computer's
public IP access and explicit `npm run db:setup -- --allow-remote` preparation;
the optional local Docker replica set uses `npm run db:setup`.

**Terminal 1, repository root — leave the backend running:**

~~~powershell
npm run dev
~~~

Wait for the backend to listen on `0.0.0.0:3000`.

**Terminal 2, repository root — leave Expo running:**

~~~powershell
npm run mobile
~~~

The default command starts Expo Go. Use an Expo Go version compatible with SDK 58; an optional local development build can be used when needed. Android-emulator launch is `npm run mobile:android`. `npm run mobile:ios` needs macOS/Xcode for the iOS simulator. A physical iPhone can use compatible Expo Go from the development computer's LAN.

Expo's port 8081 serves JavaScript; it does not start the API on port 3000.
Account requests need both servers and the selected database to be ready.

No EAS/cloud build, deployment, store submission, or signing operation has been run. The source includes optional EAS profiles for future owner-controlled work; they are not needed for this local workflow.

## Backend address

Use an explicit address when testing a phone or emulator:

| Device | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| Physical Android/iPhone | `http://YOUR_COMPUTER_LAN_IP:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Web on the backend computer | `http://localhost:3000` |

Create or edit `apps/mobile/.env.local`, then restart Expo:

~~~dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000
~~~

Use the backend origin without a path, credentials, query, or `/api/v1`. A physical phone's localhost refers to the phone, so use the computer's reachable LAN address and allow the backend port through its firewall. HTTP is supported for local development; a future release requires an explicit HTTPS origin.

Development can infer port 3000 from a usable local Expo host. Native loopback,
missing-host or tunnel configurations require the explicit setting above;
emulator addresses are not guessed automatically. An Expo tunnel exposes its
bundle server, not the backend. A LAN address requires a network route from the
phone to the computer, normally the same Wi-Fi.

For a timeout, first open
`http://YOUR_COMPUTER_LAN_IP:3000/api/v1/auth/web-session` in the phone browser.
A JSON response confirms API reachability only. It does not prove Atlas access
or account creation. See [current troubleshooting](../../context/local-development.md).

Never copy `JWT_SECRET`, `MONGODB_URL`, database passwords, or other server credentials into mobile variables. The app rejects public JWT/database-secret settings.

## Accounts

Register or sign in with email and password and enter Explore immediately. Usernames and bios are optional Account settings. Existing verification records are retained truthfully and do not gate marketplace access.

Native sessions persist in device SecureStore; the web preview uses sessionStorage. The client refreshes expiring access credentials, serializes refresh requests, and prevents a delayed response from restoring a signed-out session. The backend validates the JWT signature, session ownership/expiry/revocation, and current database staff role.

Current live phone sign-in, profile edits, listings/messages/bookings/saves and
filtered discovery are verified against the selected Atlas database. Registration
after a fresh backend restart completed in12.4 seconds. Camera/GPS/permissions
and other device/provider acceptance remain separate; see [runtime evidence](../../context/local-development.md).

Forgot password uses the opt-in private development email outbox on the backend. Read the reset code from `storage/mail-outbox` (or `RENTRAL_STORAGE_DIR/mail-outbox`) and choose Use a reset code in the app. A code is one-use; changing the password revokes old sessions and outstanding recovery codes. Production email recovery is not configured.

## Features

- Explore with category-specific filters, exact budgets/counts, cursor pagination, a focused walkthrough feed, device-scoped saved searches, listing details and saves.
- Native booking quotes, holds/conversion, requests, participant detail/actions and inspection check-in. Paystack checkout opens its validated browser URL; only server reconciliation confirms payment. Durable actor-scoped commands preserve unknown booking outcomes without automatic replay.
- Member conversations with listing shares, unread/read markers, bounded foreground activity polling, older-message pagination and encrypted exact-nonce recovery. Squat-Mates has separate opt-in preferences, explained overlap, accepted contacts, private messages, blocking and redress.
- Optional profile/avatar edits, public profiles/reviews, notifications, analytics consent, account security/session controls, record export and guarded account closure.
- Owner inventory, server draft save/resume/archive, posted listing editing and private vault. Native capture uses fresh GPS, a silent continuous recording of at most 119 seconds, and private asset ownership documents. SDK file uploads stream rather than buffering the full video in JavaScript.
- Submitted owner details include the exact publication fee, Paystack checkout and explicit server/provider verification. Unknown payment actions survive restart without replay; a verified fee remains separate from human publication and media/address review.
- Member financial request/history and recipient controls, lease renewal/termination requests, and account metrics. Staff settlement/review and Insights/campaign administration have explicit web handoffs.
- Optional generic remote push in a configured development/production native build. Permission is requested only after opt-in; Expo Go and web cannot register remote updates. Native OS permission/provider delivery still requires physical-device acceptance.
- Explicitly labeled sponsored Explore cards stay separate from ordinary results, show test/live mode and use the same filters. Optional visible-impression/click measurement follows the account analytics choice; ordinary result ranking and pagination stay independent.
- Correct iOS MOV/QuickTime and Android MP4 uploads. Camera/location denial and failed uploads retain clear retry paths; files are never renamed to pretend they use another container.

Native camera capture is unavailable in the Expo web preview; use Android/iOS for capture. Uploaded submissions retain existing review/publication rules and do not publish automatically. Supporting asset documents are not personal KYC.

Ordinary booking status actions and inspection check-in run in the native app.
Check server state after an ambiguous mutation; recovery controls retain the exact
command and never automatically repeat a provider or domain mutation. Browser
handoffs may require a separate browser sign-in and never carry app credentials in
the URL. Camera/GPS, large uploads, native share sheets, notification permission
and actual provider delivery remain physical-device acceptance boundaries.

## Checks

From the repository root:

~~~powershell
npm run mobile:typecheck
npm exec --workspace @rentral/mobile -- expo install --check
npm exec --workspace @rentral/mobile -- expo export --platform all
npm test
npm run lint
~~~

See [implementation and acceptance evidence](../../context/expo-implementation.md). Bundle, mock-browser, and isolated backend tests do not establish physical Android/iOS camera/GPS, permissions, playback, accessibility, or provider acceptance.
