# Rentral mobile

Expo SDK 58 / Expo Router app for Android and iOS. It uses the local Rentral API, MongoDB-backed email/password JWT accounts, and local file uploads. There is no KYC onboarding, OAuth configuration, mandatory profile wizard, or Supabase dependency.

## Start

Use Node 24.x and npm 11.19.1. From the repository root, follow [backend setup](../../README.md) first:

~~~powershell
npm install
npm run setup:local
npm run db:setup
npm run dev
~~~

MongoDB must be running as a replica set; the root README includes the persistent local Docker setup. Keep this backend running, then open another terminal:

~~~powershell
npm run mobile
~~~

The default command starts Expo Go. Use an Expo Go version compatible with SDK 58; an optional local development build can be used when needed. Android-emulator launch is `npm run mobile:android`. `npm run mobile:ios` needs macOS/Xcode for the iOS simulator. A physical iPhone can use compatible Expo Go from the development computer's LAN.

No EAS/cloud build, deployment, store submission, or signing operation has been run. The source includes optional EAS profiles for future owner-controlled work; they are not needed for this local workflow.

## Backend address

In development the app derives the Expo computer's address and connects to port 3000. Web uses the browser hostname. The fallback for an Android emulator is `http://10.0.2.2:3000`; for iOS simulator/web it is `http://localhost:3000`.

To override, add only this public setting to `apps/mobile/.env.local` and restart Expo:

~~~dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000
~~~

Use the backend origin without a path, credentials, query, or `/api/v1`. A physical phone's localhost refers to the phone, so use the computer's reachable LAN address and allow the backend port through its firewall. HTTP is supported for local development; a future release requires an explicit HTTPS origin.

Never copy `JWT_SECRET`, `MONGODB_URL`, database passwords, or other server credentials into mobile variables. The app rejects public JWT/database-secret settings.

## Accounts

Register or sign in with email and password and enter Explore immediately. Usernames and bios are optional Account settings. Existing verification records are retained truthfully and do not gate marketplace access.

Native sessions persist in device SecureStore; the web preview uses sessionStorage. The client refreshes expiring access credentials, serializes refresh requests, and prevents a delayed response from restoring a signed-out session. The backend validates the JWT signature, session ownership/expiry/revocation, and current database staff role.

Forgot password uses the opt-in private development email outbox on the backend. Read the reset code from `storage/mail-outbox` (or `RENTRAL_STORAGE_DIR/mail-outbox`) and choose Use a reset code in the app. A code is one-use; changing the password revokes old sessions and outstanding recovery codes. Production email recovery is not configured.

## Features

- Explore with location/category/price filters and cursor pagination; listing details, signed walkthrough playback, sharing, and saves.
- Booking requests/history and member conversations, older-message pagination, UUID message retries, and foreground refresh.
- Optional profile edits, owner inventory, and native listing capture using fresh GPS, a silent continuous recording of at most 119 seconds, and private ownership documents.
- Correct iOS MOV/QuickTime and Android MP4 uploads. Camera/location denial and failed uploads retain clear retry paths; files are never renamed to pretend they use another container.

Native camera capture is unavailable in the Expo web preview; use Android/iOS for capture. Uploaded submissions retain existing review/publication rules and do not publish automatically. Supporting asset documents are not personal KYC.

Booking cards link to the local web app for existing host status actions, payment checkout when configured, and inspection check-in. Resume existing web drafts on web. Check Bookings/My Listings after an ambiguous request outcome before sending another create request; message retries have a separate idempotency contract.

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
