# Squat-Mates

Matching is optional. A new account has no matching profile and is never opted
in by reading a screen. Members choose one to three coarse Lagos areas, a monthly
share in exact integer kobo, a short introduction and explicit home preferences.
No protected demographics, exact locations, email addresses, private documents,
credit scores or inferred financial labels are part of matching.

Discovery requires both profiles visible, clear of a matching restriction and
attached to current active accounts. Areas and stated budget ranges must overlap.
The displayed score explains only those preferences: area 20–40 points, range
overlap 5–30, and stated/flexible routines 0–30. It predicts neither compatibility
nor ability to pay. Candidates are bounded cursor pages rather than a population
export. Avatars allow only the owner's public relative raster reference.

Contact requests use a unique normalized account pair and an actual sorted user
write lock. The invited member accepts before either person can message. Daily
request caps and a seven-day closed-contact cooldown limit repeated requests.
Every message read/send checks current participants, acceptance, visibility,
moderation, accounts and blocks. A sender's client UUID binds a retry to the same
conversation and text; the message, last-activity pointer and generic notification
commit together. Notifications never contain message text. Read acknowledgements
do not move conversation activity or claim someone is online.

Blocking closes the contact and hides both profiles from each other. Unblocking
does not reopen contact. Withdrawal hides the profile and makes conversations
unavailable while preserving private history. Account closure hides the matching
profile and closes active contacts within the existing account transaction.
Existing participants can obtain only profile/connection IDs from report-context
after a thread becomes unavailable. This supports redress without returning
hidden preferences or messages. Staff can read the selected reported evidence,
not an unrelated conversation. Both participants are barred from deciding their
report. A different independent reviewer must restore restricted eligibility;
owner edits cannot clear a staff restriction. No matching report creates a public
safety notice automatically.

Member API prefix: `/api/v1/squat-mates`.

| Route | Use |
| --- | --- |
| `GET /` | Cursor discovery |
| `GET/PUT/DELETE /profile` | Own preferences, explicit visibility, withdrawal |
| `GET/POST /connections` | Own inbox and contact request `{profileId}` |
| `GET/PATCH /connections/:id` | Current header and accept/decline/close |
| `GET/POST /connections/:id/messages` | Cursor history and `{clientId,body}` |
| `POST /connections/:id/read` | Own monotonic cutoff `{messageId}` from displayed messages; legacy empty acknowledgement is a safe no-op |
| `GET /connections/:id/report-context` | Participant-only reporting IDs |
| `GET /blocks`, `PUT/DELETE /blocks/:profileId` | Own block controls |
| `GET/POST /reports` | Own private history and selected evidence report |

Staff safety-review routes are under `/api/v1/staff/matching`; the web queue is
`/marketplace/admin/matching`. Every write rechecks the current persisted staff
role in its transaction. Member web screens start at `/marketplace/squat-mates`.

The database must carry the reviewed matching preparation marker. No client
configuration, KYC flag or paid entitlement bypasses these checks. Unit tests
mock storage; the optional Mongo runner uses its owned fresh database and browser
fixtures intercept member traffic. No real members or providers are contacted by
these checks. Hosted feature preparation and device acceptance remain explicit
operational steps after the reviewed source is accepted.
