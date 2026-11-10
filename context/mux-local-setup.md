# Mux credentials and localhost setup

Keep all settings below in the **root `.env.local`**. Use one Mux environment for
API tokens, signing keys, webhook forwarding and Rentral's videos. The environment
key on Mux's Data analytics onboarding page is not one of these credentials.

## 1. Video API token

Open [Settings → Access Tokens](https://dashboard.mux.com/settings/access-tokens).
Generate a token for your Rentral environment with **Mux Video Read and Write**.
Copy the generated Token ID and Token Secret privately:

```dotenv
MUX_TOKEN_ID=your_actual_token_id
MUX_TOKEN_SECRET=your_actual_token_secret
```

Mux displays the secret when created and cannot recover it later. Token management
requires the appropriate organization administrator role. See
[API authentication](https://www.mux.com/docs/core/make-api-requests).

## 2. Playback signing key

Open **Settings → Signing Keys** in the same environment and create a key. Copy
its ID and full private-key value:

```dotenv
MUX_SIGNING_KEY_ID=your_actual_signing_key_id
MUX_SIGNING_PRIVATE_KEY=your_actual_one_line_base64_private_key
```

These differ from your API token pair. Prefer Mux's one-line base64 private-key
value. If you downloaded a PEM file, encode the actual file once, replacing the
example path below. Do not encode an already-base64 value twice:

```powershell
node -e "console.log(require('node:fs').readFileSync(process.argv[1]).toString('base64'))" "C:\path\to\your-private-key.pem"
```

Paste the output, not the filename, into `MUX_SIGNING_PRIVATE_KEY`. Keep the
file/output private. See [signed playback](https://www.mux.com/docs/guides/secure-video-playback).

## 3. Local webhooks on Windows

The installed `@mux/cli 4.0.0` package has macOS/Linux binaries and no
win32/x64 executable. Its npm installation succeeds, but `mux.cmd login` cannot
run on this computer. This is a CLI packaging limitation, not a Rentral SDK error.

Mux cannot reach your computer's localhost directly. On Windows, use a temporary
HTTPS tunnel and a normal Mux dashboard webhook. Install Cloudflare's native tool:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Open a new PowerShell so its PATH is refreshed. With Rentral's backend running on
port 3000, start a tunnel in another terminal:

```powershell
cloudflared tunnel --url http://localhost:3000
```

If installation succeeded but your existing terminal says the command was not
found, its PATH has not refreshed. Close every VS Code window and reopen it, or
open a new standalone PowerShell. You can also use the verified installation
path immediately from either terminal; running the tunnel needs no administrator
window:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000
```

It prints a temporary public `https://...trycloudflare.com` address. This forwards
your local backend while the process runs. No Cloudflare account/domain is needed.
See [Windows downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows)
and [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

In **Mux → Settings → Webhooks**, add an endpoint in your Rentral environment:

```text
https://YOUR_ACTUAL_TUNNEL_HOST.trycloudflare.com/api/webhooks/mux
```

Replace the example host with the exact generated address. Copy this endpoint's
actual signing secret from Mux into the backend file:

```dotenv
MUX_WEBHOOK_SECRET=your_actual_dashboard_webhook_signing_secret
```

Save and restart the existing backend. The tunnel is only for Mux webhook delivery;
your phone can retain its existing LAN API origin. Stop the tunnel when testing is
finished. Its hostname changes on a new launch, so update the dashboard endpoint
then. Do not add browser login/interactive email protection in front of this
webhook: Mux must reach it and Rentral verifies Mux's signature itself.

See [Mux endpoint instructions](https://www.mux.com/docs/core/listen-for-webhooks).
On supported macOS/Linux environments, the official Mux CLI is an alternative.
After deliberate production hosting, replace the temporary endpoint with
`https://YOUR_BACKEND_DOMAIN/api/webhooks/mux` and use that endpoint's signing
secret in the hosted backend. Quick Tunnels are development infrastructure.

## 4. Rentral worker secret

Generate a separate private random value on your computer:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Save the output as:

```dotenv
MEDIA_WORKER_SECRET=your_generated_random_value
```

It protects Rentral's internal worker endpoint and does not come from Mux.

## 5. Enable and run

Once all six values above are real, set:

```dotenv
MUX_ENABLED=true
MEDIA_WORKER_ENABLED=true
```

Run `npm.cmd run env:check`, replace/clear every reported placeholder, then restart
the existing backend. Keep the tunnel open and start the worker in
another terminal:

```powershell
npm.cmd run worker
```

Use `npm.cmd run worker -- --once` for one deliberate batch. The driver reads the
root private file and calls the local backend with its worker secret. Enabled
processing can consume your Mux account's usage allowance; setting a flag alone
does not start a scheduled worker. Keep optional unrelated worker flags disabled
unless deliberately configuring those integrations too.

If Mux is not ready, keep both flags `false` and unused credential values blank.
Draft/local capture testing remains available; final publication still requires
configured video processing, address verification, document review and payment.
Inspection confirms format/presence only. Live upload/webhook/signed-playback
acceptance remains a separate runtime check. Do not send any secret in chat or
put it in the mobile environment file.
