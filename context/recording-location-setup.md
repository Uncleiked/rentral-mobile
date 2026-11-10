# Recording location and address matching setup

This increment uses the approved MongoDB architecture, not PostgreSQL/PostGIS.
The backend persists private recording evidence and checks the entered address
against it. A recording requires an online location acknowledgment before the
camera starts; text drafts can still be retained without a verified address.

## 1. Prepare the existing MongoDB database additively

This selected Atlas database was prepared during the approved increment:
52 application collections/156 indexes were checked, and preservation hashes
confirmed all 52 pre-existing collections and 4 non-marker records unchanged.
The capture marker is ready. Fresh checkouts or another selected database still
need the explicit setup below; repeating it on the same target is additive.

Keep your saved MongoDB URI and JWT secret. First allow the backend computer's
**current public IP** in your Atlas project's Database & Network Access → IP
Access List. An Active entry for an older address does not allow your current
address. For stable access, use a fixed outbound IP; the general environment
guide explains network troubleshooting. Keep TLS certificate checks enabled.

In PowerShell, from the repository root, run:

```powershell
npm.cmd install
npx.cmd prisma generate
npm.cmd run db:setup -- --allow-remote
```

Stop the running backend before Prisma generation if Windows reports that the
query-engine DLL is locked. Restart it after these steps. The explicit
`--allow-remote` option selects your saved hosted MongoDB connection; without it,
setup accepts loopback development databases only.

The setup workflow creates/verifies reviewed indexes and validators, adds the
private `ListingCapture` collection and records `captureVersion: 1`. It does not
import old SQL migrations or reset existing application records. Do not run
`prisma db push` or replace your Atlas data to enable this feature. Back up any
production database before deliberately applying schema preparation.

Until capture preparation is complete, capture endpoints fail with a setup-needed
response. The new capture marker does not disable unrelated authentication.

## 2. Create a Geoapify geocoding key

1. Open [Geoapify MyProjects](https://myprojects.geoapify.com/) and sign in/create
   your account.
2. Create a project for Rentral.
3. Open that project's **API Keys** tab. Copy the generated API key privately.
4. If you configure key restrictions, allow requests from the **backend**. The
   geocoding request is made server-side; a browser-referrer-only restriction can
   block it. A fixed backend outbound IP also makes IP restrictions stable.

See [Geoapify's official key instructions](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/).
Review the provider's current quota/pricing in your account before live use.

## 3. Add the key to the backend file

Open `.env.local` in the repository root. Add or update this line, replacing the
example text with your actual key:

```dotenv
GEOAPIFY_API_KEY=your_actual_geoapify_key
```

Keep one definition of this variable. Save the file. Do not change the existing
`MONGODB_URL`, `JWT_SECRET`, payment flags or other private keys for this feature.
Do not paste the key into chat, a screenshot, Git or the mobile environment file.

Run the offline settings check:

```powershell
npm.cmd run env:check
```

It reports missing settings by name without printing values or contacting Atlas
or Geoapify. Passing this check confirms format/presence, not provider acceptance.

## 4. Keep the mobile environment public-only

`apps/mobile/.env.local` continues to contain the backend origin reachable from
your device:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000
```

Use your actual LAN address when testing a physical phone, with phone and computer
on the same network. This is different from the public IP allowed in Atlas. Keep
the optional EAS project UUID if already configured. There is no
`EXPO_PUBLIC_GEOAPIFY_API_KEY`, MongoDB URI or JWT secret in the app.

Logo assets and the opening animation require no new environment variables.
Expo Go shows the JavaScript opening reveal. The operating-system splash and
launcher/adaptive icon require a new native development/store binary; Expo Go
does not fully reproduce those native launch surfaces.

### Finish the Mux webhook setting

The latest offline settings check found only `MUX_WEBHOOK_SECRET` still a
template value. The other Mux/worker fields are populated; this confirms presence,
not live upload/playback acceptance. No private values were printed or changed.
Follow the [Windows Mux setup guide](mux-local-setup.md) to create the dashboard
webhook using your deliberately started HTTPS tunnel and copy that endpoint's
actual signing secret into the root file:

```dotenv
MUX_WEBHOOK_SECRET=your_actual_mux_webhook_secret
```

Keep the already configured credentials. Run `npm.cmd run env:check` again after
saving, then restart your existing backend. The [Mux guide](mux-local-setup.md)
covers token permissions, signing-key representation and deliberate worker use.
If you defer Mux testing, keep `MUX_ENABLED=false` and
`MEDIA_WORKER_ENABLED=false` until its credentials and webhook are ready.

## 5. Restart and check the user flow

Restart your existing backend terminal, then run:

```powershell
npm.cmd run dev
```

In another terminal:

```powershell
npm.cmd run mobile -- --port 8090
```

1. Reload Rentral, sign in and choose Create Listing.
2. Allow camera and **precise foreground location**. No background tracking is
   required. Keep Rentral open while recording.
3. Start a take. The app gets a fresh GPS sample and waits for the backend to
   acknowledge its private location lock before recording.
4. Finish the walkthrough. Rentral checks a fresh end sample and recording timing,
   then binds the server capture to the validated uploaded video before saving.
5. Enter the complete building number/name, street, neighborhood, city and state.
   Check the address. The backend needs a sufficiently confident Nigerian
   building/amenity result within **100 metres** of the recording start location.
6. Correct a mismatch. If GPS is too coarse, move outdoors and record a new take.
   If the address cannot be resolved precisely or the provider is unavailable,
   keep the draft and correct the address or try again later. A city/street
   centroid does not satisfy the check.
7. Submit for review. The backend independently rechecks the exact capture/video
   and address; a stale UI result cannot authorize submission. Document review,
   payment and staff publication remain separate requirements.

A retake creates a new capture. Address edits cannot rewrite the accepted GPS.
Recording start, finish and video sealing use the same authenticated session;
complete those steps before signing out. An already sealed owner draft can later
resume in another valid session.
Changing the entered address invalidates its displayed match. Old recordings
without server recording evidence remain recoverable but need a new take before
new submission. Unknown saves/finishes show explicit status readback; do not create
a duplicate command merely because a response was lost.

## Website, backend and mobile deployment

The repository is one npm workspace: the root contains the Next.js website/API
and `apps/mobile` contains the Expo Android/iOS app. A root Vercel deployment
serves the website and backend; it does not publish native Android/iOS binaries.
Mobile distribution requires a separate native build, and the app's public API
origin must point to the deployed HTTPS backend before its release build.

The current private upload adapter uses persistent local disk. A full Vercel
deployment needs an object-storage adaptation and deliberate worker/webhook
hosting; local file persistence cannot simply be assumed there. See
[Vercel file guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)
and [Expo distribution](https://docs.expo.dev/distribution/introduction/).

## Accuracy and acceptance limits

The captured reading is device-reported evidence: fresh, bounded accuracy and
known mock-location rejection where the operating system provides that signal.
This prevents ordinary API edits from replacing the recorded location and blocks
addresses outside the approved radius. It does not attest every device against
GPS spoofing, verify a particular apartment/unit, or establish ownership.

Exact GPS is private, is excluded from owner/public API projections, and is not
sent to Geoapify; the backend sends the entered address to that provider. Automated
tests use controlled fixtures. Live provider acceptance and physical Android/iOS
camera/GPS/permission/interruption/startup checks require separate device testing.
