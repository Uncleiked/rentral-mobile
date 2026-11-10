# Owner administration and approved gallery uploads

The owner/admin change uses the existing MongoDB, JWT and private storage setup.
**There are no new admin secrets or owner email settings for `.env.local`.**
Ownership is saved on the account's database identity, not inferred from an
environment variable, a browser flag or the email supplied on each sign-in.

## 1. Open the owner workspace

Sign in with the existing `dannyiked@gmail.com` account. Open `/admin` on the
website. On Android/iOS, refresh Account and choose **Admin**. Access is checked
from the current database role on every request; the link itself grants nothing.

The console includes listing/document review, publication-fee waivers, uploader
permissions, member/staff access, manual inspection evidence and audit history.
Links open existing finance, safety/reports, lease/lifecycle, matching, campaign
and Insights workspaces. Specialized web tools require a browser sign-in.

The owner account cannot be suspended, closed or demoted through ordinary member
or staff actions. Use the explicit ownership-transfer decision to move ownership
to another existing active account. Changing an account email does not transfer
the role to a different user.

## 2. Approve a gallery uploader

1. Open **Members and uploader permissions** and search the member's email,
   username or account ID.
2. Open that account, choose **Approve gallery uploader**, and explain why you
   trust the member to supply media without recording-location verification.
3. Record the decision. The member should refresh their account/listing screen.
4. To approve the owner's own account, explicitly select the owner-override
   checkbox and enter a detailed reason of at least 30 characters.

This is a separate permission, not personal KYC or proof of ownership. Revoking it
blocks further gallery activity and removes gallery listings from discovery
pending review, while preserving files, existing bookings and financial history.
Regranting permission does not silently republish old listings.

Approved users can create a gallery listing, save a partial draft, and upload:

- Up to **10 JPEG/PNG photos**, at most **10 MB each**.
- One optional video, at most **120 seconds / 200 MB**.
- A private authority document for human review: PDF, JPEG or PNG, at most 10 MB.

A photo-only listing needs no video or GPS recording. Gallery videos still require
successful Mux processing before publication. Gallery listings are labelled as
admin-approved gallery media with an unverified recording location. Uploaded
media and authority documents are sealed on submission; make a new listing if
those assets change. A saved recorded draft retains its original recording path;
start a new gallery listing to use the approved exception.

## 3. Review documents and publish

1. Open the listing in Admin; use its listing ID if it is not in the bounded queue.
2. Prepare/open its current private authority document.
3. Choose **Approve current document** or **Reject document** and record a reason.
   Approval binds to the exact file and digest. A replacement requires new review.
4. Confirm the media and other publication requirements.
5. Choose **Publish listing** with a reason. The owner must explicitly use the
   audited override to review their own listing; other staff need another reviewer.

AI document screening has been removed. Historical findings and audit entries are
retained. A human decision does not establish legal title or guarantee condition.

## 4. Allow publication without the listing fee

Open a submitted listing, choose **Waive publication fee**, enter the reason and
record it. The host sees **waived**, not paid. This creates no payment or ledger
entry and can work while online payment collection is disabled.

Human document approval and media requirements still apply. A waiver does not
refund or erase an existing payment; existing uncertain payment references remain
available for reconciliation. Revoking a waiver returns an active listing to
review so publication requirements can be checked again.

## 5. Review gallery inspections

Gallery listings have no captured GPS point. At a confirmed inspection, a
participant submits written evidence through the booking's **Manual inspection
review** section. An authorized administrator who is neither participant reviews
the evidence and records approval or rejection.

This decision records manual evidence, not GPS presence. It sends no refund or
payout. Existing independent financial review and provider-confirmation rules
continue to apply, including to the owner. Ordinary recorded listings retain
their existing proximity and handshake checks.

## 6. Recover a request after connection loss

If a decision or save is unconfirmed, keep the original request. Choose its
status/readback button first. A confirmed receipt clears it without another POST.
Only a missing-receipt result offers an explicit resend of the exact same
instructions and identifier. Do not create a new decision merely to retry one
whose outcome is unknown. Browser recovery is scoped to the current actor and
uses session storage; keep site storage enabled.

## 7. Database setup and owner bootstrap for another environment

Use the existing [environment guide](environment-setup.md) for the MongoDB URI,
JWT secret and public API origins. The reviewed additive setup adds an
`ownerAdminVersion: 1` readiness marker and optional fields. It preserves existing
records; do not use `prisma db push`, reset the database or import old SQL.

For a fresh selected environment, prepare it, register the intended owner account,
and inspect a dry run from the repository root:

```powershell
npm.cmd run db:setup -- --allow-remote
npm.cmd run owner:bootstrap -- --email dannyiked@gmail.com --reason "Approved initial Rentral platform owner account" --allow-remote
```

The owner script is read-only by default. After checking the selected database
and exact account, add `--apply-owner` to apply that specific bootstrap. It refuses
to overwrite a different existing owner or target an absent/inactive account.
The general `staff:role` command cannot assign or demote an owner. Once ownership
is saved in the shared Atlas database, another checkout using that same database
does not need to recreate it.

## 8. Existing provider and local-development settings

Geoapify still supports the ordinary recording/address path. The supplied Ifako
and Bariga Lagos addresses returned state-level results with confidence 0 in the
diagnostic lookup, so they cannot pass building-level admission. This does not
disprove the addresses' existence. No distance was calculated from those results.
The app now distinguishes missing/ambiguous address data from provider outages.
The 100-metre rule is proximity evidence, not exact house/unit identification.

No additional Geoapify key is required for this admin change. Photo-only gallery
publication can use a fee waiver without enabling Mux or Paystack. Videos still
need the [Mux setup](mux-local-setup.md); paid collection still needs Paystack.
Unused Gemini keys can be removed from private settings manually; active code no
longer uses them. Keep every secret out of mobile public variables and Git.

Start the backend with `npm.cmd run dev` and Expo with
`npm.cmd run mobile -- --port 8090`, reusing existing terminals where already
running. Native public configuration continues to contain only the device-
reachable API origin and optional EAS project UUID. Camera/gallery permissions
and actual Android/iOS file handling still require physical-device testing.
