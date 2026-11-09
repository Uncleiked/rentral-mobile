# Optional remote push

Remote push is implemented behind explicit gates. No actual push, EAS build,
credential provisioning or physical-device delivery has been accepted by these
controlled tests. In-app notifications work independently.

The operator must prepare the reviewed Mongo indexes/validators, enable
`PUSH_NOTIFICATIONS_ENABLED=true`, and configure all of:

- `PUSH_NOTIFICATIONS_SINCE`: an explicit ISO timestamp; historical notifications
  before it are never backfilled.
- `EXPO_PUBLIC_EAS_PROJECT_ID`: the UUID of this app's Expo project. It is public
  build configuration and must match the server registration gate.
- `EXPO_ACCESS_TOKEN`: a private Expo access token. Enable Expo's enhanced push
  security for that project; the backend sends this token only to Expo's fixed
  HTTPS push endpoints.
- `PUSH_TOKEN_ENCRYPTION_KEY`: a private canonical base64 encoding of 32 random
  bytes. Tokens are sealed with AES-256-GCM and bound to the device/project.

These settings do not replace native APNs/FCM credentials and an appropriate
development or release build. Remote push requires a physical-device acceptance
pass; Expo Go is not the remote-push validation target. See the official
[Expo setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/).
Keep server secrets out of every `EXPO_PUBLIC_*` setting.

## Consent and device ownership

`GET /api/v1/push` returns `{enabled,projectId,consentVersion,devices}` inside the
normal API envelope. Registration uses `POST /api/v1/push/devices` with strict
`{installationId,installationSecret,expoPushToken,projectId,platform,
permissionGranted:true,optIn:true,expectedConsentVersion}`. Capture the server
consent version before awaiting OS permission or Expo token creation. The server
captures the validated sign-in session internally and rechecks it under the same
User write lock used by logout.

Create the installation UUID and 32-byte base64url secret with native secure
randomness; retain them in secure storage across sign-out. An active token cannot
be rebound to another account. Transfer requires the previous binding to be
revoked and possession of the stable installation proof. An authenticated owner
can explicitly repair its own lost proof or encryption-key rotation.

Registration returns `{device,consentVersion}`. Only an exact already-active
binding in the same session can acknowledge a lost response without a new consent
mutation. A stale epoch cannot reactivate a revoked binding. Explicit opt-out uses
`DELETE /api/v1/push/installation` with `{installationId}` even if registration
has not created a row yet. It advances account consent and returns the updated
capability. `DELETE /api/v1/push/devices/:id` revokes an owned device and also
returns the capability. Logout revokes devices bound to that captured session.

All mutations retain bearer authentication/cookie CSRF and rate limits. Provider
tokens, proof hashes, encryption fields and session IDs never appear in public
device DTOs. After an unconfirmed result, read current devices before an explicit
user decision; do not silently refresh the epoch and replay enrollment.

## Worker recovery and retention

The independent leased jobs `push-dispatch` and `push-receipts` run through the
existing internal lifecycle endpoint and optional local worker driver. Keep all
send gates off until operator/device acceptance is complete. No worker was run
against configured members during implementation.

Dispatch considers only unread notifications created after the operator cutoff,
within the preceding 24 hours and after the device opt-in. It checks current
account activity, session, ownership and binding again before claiming a send.
Every notification/device pair is unique. Payloads contain only a generic
Rentral title/body and `data.kind=rentral_update`; tapping opens the authenticated
notifications inbox, never a payload-provided private link.

A persisted claim precedes the single provider POST. Missing acknowledgement or
an interrupted claim becomes uncertain and is never automatically resent. Known
tickets are checked after 15 minutes; missing receipts receive bounded readback
until 24 hours. A confirmed receipt means APNs/FCM accepted the handoff, not that
a person saw it. `DeviceNotRegistered` disables only the same token binding, so
an old receipt cannot disable a newly rotated one. These distinctions follow
[Expo's receipt contract](https://docs.expo.dev/push-notifications/sending-notifications/).

Prepared databases prune only derived PushDelivery rows older than 90 days, even
when sending is disabled. The 24-hour source window prevents pruning from
recreating old deliveries. In-app Notification history, account/financial/evidence
records, device proof hashes and token hashes are retained. Opt-out can prevent
new claims; it cannot retract a provider request already in flight. Durable
worker incidents preserve uncertainty for review without inventing delivery.
