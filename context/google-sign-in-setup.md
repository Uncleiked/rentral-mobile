# Google sign-in alongside email/password

Reviewed 2026-11-11. These steps apply to **RentralMobile** and its MongoDB/JWT backend at localhost:3000. They do not use Supabase or add a second database.

## Current source and activation boundary

Email/password remains available. Google uses a web authorization-code flow with browser-bound state, nonce and PKCE, verified Google ID-token signatures and the existing MongoDB sessions. Native email/password is unchanged; this increment adds Google to the web sign-in page only.

Google identity storage is additive and explicitly gated by `googleAuthVersion: 1`. The latest read-only follow-up found this marker and organizationVersion at version1 in the database selected by .env.local. These were prepared outside this follow-up; no agent database writes ran. Verify preparation separately if production uses a different database. Existing core authentication remains available without this marker.

## 1. Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a Rentral project.
2. Open **Google Auth Platform**. Configure **Branding** with your app name, support email and developer contact. Use the real homepage, privacy and terms addresses when publishing.
3. Choose **Audience -> External**. While testing, add the Google accounts that will test sign-in.
4. Under **Data Access**, use only `openid`, email and profile.
5. Under **Clients**, create a **Web application** client.
6. Add `http://localhost:3000` as an authorized JavaScript origin. Add your real HTTPS origin separately when deployed.
7. Add this exact authorized redirect URI:

```text
http://localhost:3000/auth/google/callback
```

For deployment, add `https://YOUR-REAL-DOMAIN/auth/google/callback`. This is a direct Rentral callback; do not enter the old Supabase callback. Google requires the exact configured redirect. [Google web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## 2. Configure the backend privately

Add the client credentials to the existing root `.env.local` without replacing its MongoDB or JWT settings:

```dotenv
GOOGLE_AUTH_ENABLED=false
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Neither credential belongs in mobile `EXPO_PUBLIC_` configuration or chat. The secret must never use a `NEXT_PUBLIC_` prefix. The existing `JWT_SECRET` also protects short-lived encrypted OAuth cookies; no additional identity database or Supabase key is needed.

## 3. Prepare the additive identity collection

The reviewed Mongo setup now includes an immutable `GoogleIdentity` mapping keyed by Google's stable subject, with a unique user mapping and its own readiness marker. It also includes organization admission if that increment is in the same checkout. This is additive preparation, not a reset.

For an explicitly chosen disposable/local replica set, run `npm.cmd run db:setup`. For the existing Atlas database, review the full pending setup before deliberately running `npm.cmd run db:setup -- --allow-remote`. No hosted setup was run as part of this implementation.

After preparation and credential configuration, set `GOOGLE_AUTH_ENABLED=true`, restart the backend, and run `npm.cmd run env:check`.

## 4. Test the actual web flow

1. Open `http://localhost:3000/sign-in`.
2. Existing members can choose **Continue with Google**. If the Google email matches an existing local account, confirm that account's existing password once. Email matching alone never links accounts.
3. For a new account, choose **Create Account**, select Individual or Organization and accept the terms before choosing Google. If an unknown Google user started in sign-in mode, the app asks for the same choice before creating the local account.
4. Organization signup still requires separate registration evidence and admin approval; Google does not grant that approval.
5. Confirm repeat Google sign-in uses the same MongoDB account, staff role and permissions.
6. Check a cancelled/expired Google attempt, existing email/password sign-in, logout and recovery.

Google tokens are not stored as Rentral credentials. Password resets, password changes and email changes invalidate the saved Google credential binding. The next Google sign-in must reconfirm the current Rentral password, including after a confirmed Rentral email change. Initial linking still requires a matching verified Google email. Google identity never overrides current credentials or account availability.

Email/password users keep their current password. New Google-only accounts have no invented password; they can use the existing verified-mailbox password-recovery process to set one. Production recovery requires configured email delivery. Password-based native login remains available after a password has been set.

Provider configuration, key presence, unit/browser fixtures and compilation do not prove a live Google login. Test a real browser callback after these external steps are complete.

## Production setup for rentral.vercel.app

GOOGLE_AUTH_ENABLED is a boolean feature flag. Its exact value is true, without
quotes or an API key. It works even if an existing Vercel variable has Secret type;
there is no separate key to obtain for this flag.

1. Open Google Cloud Console, select the project, and open Google Auth Platform ->
   Clients. Select the Web application OAuth client already used locally, or create
   one if missing. This client supplies GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
2. Add these Authorized JavaScript origins:
   - http://localhost:3000
   - https://rentral.vercel.app
3. Add these exact Authorized redirect URIs:
   - http://localhost:3000/auth/google/callback
   - https://rentral.vercel.app/auth/google/callback
4. In Vercel Project Settings -> Environment Variables, select Production and set:

```dotenv
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=YOUR_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_OAUTH_WEB_CLIENT_SECRET
NEXT_PUBLIC_APP_URL=https://rentral.vercel.app
```

Paste each value without surrounding quotation marks in Vercel. Keep the secret
server-only. Preserve the existing stable JWT_SECRET and valid MongoDB settings;
production must use a database prepared for GoogleIdentity. A Preview deployment
needs its own matching registered domain if Google is enabled there.

5. In Google Auth Platform Audience, add test accounts while the application is
   in Testing; publish the consent configuration when ready for public use.
6. Deploy the updated source containing the callback-origin correction. Saving
   Vercel environment values does not update an existing deployment: redeploy.
   Open a fresh https://rentral.vercel.app/sign-in and start a new Google attempt.

[Google OAuth client and redirect setup](https://developers.google.com/identity/protocols/oauth2/web-server),
[Google credentials](https://developers.google.com/identity/openid-connect/openid-connect),
[Vercel environment changes](https://vercel.com/docs/environment-variables).

## Callback-origin correction and diagnostics

The follow-up reproduced a valid local encrypted/state-bound cancellation being
rejected before token exchange. Next constructed request.url from its internal
0.0.0.0 bind address. The callback now accepts an exact configured public Host over
that internal URL. It never trusts arbitrary forwarded hosts; internal HTTP to
HTTPS is accepted only for the Vercel runtime with its HTTPS forwarding marker.
State, nonce, PKCE, cookie encryption and token validation remain required.

A real local browser cancellation now returns google=cancelled instead of failed,
without visiting Google login or creating an account. Failure logs contain only
a fixed stage: configuration, callback, state, exchange or account. Never share
callback query strings, authorization codes, cookies, provider responses or secrets.
A successful cancellation verifies the callback boundary, not a full live login.
