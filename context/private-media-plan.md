# Private Listing Media

Status: implementation and local policy checks complete; remote cutover is not authorized.

## Decisions

- Preserve the existing bucket and object keys; no copying or path migration.
- Saved draft, profile and feed previews use `/api/listings/:id/source?kind=video|poster`.
- Authenticate before reading the database. Query only owner or active listings.
  Resolve the path from that row, validate its owner prefix and media extension,
  then issue a five-minute Storage URL with a non-cacheable redirect.
- Pending/draft previews are owner-only. While Mux is disabled, active inventory
  keeps authenticated original-video playback. When enabled, originals are
  owner-only and visitors use signed Mux playback. Compliance documents never use
  this endpoint. Missing Storage/configuration fails closed without public fallback.
- Protected thumbnails bypass Next image optimization, which cannot forward the
  viewer's credentials and has a shared cache. Keep the existing UI tokens/layout.
- Use the project's Prisma migration history for the private-bucket change.
  Do not apply it to a shared environment before explicit staging acceptance.

## Verification

Unit tests cover authentication, owner/active predicates, unsafe paths, kinds,
expiry, headers, Mux rollout behavior and provider failures. Browser tests verify
anonymous route handling. Staging must prove actual Storage RLS, range requests,
draft resume, owner previews, active visitor playback and signed-URL expiry.

`pnpm test:storage` starts an isolated temporary local PostgreSQL cluster, replays
the existing Storage migration and private-bucket migration against a minimal
Storage fixture, asserts access rules and shuts it down. Requires local `initdb`,
`pg_ctl` and `psql`. It never loads the app's environment or connects to Supabase.
This is actual PostgreSQL RLS coverage, not full Supabase Storage/API acceptance.

## Cutover

1. Deploy the authorized preview code before changing the bucket.
2. Confirm a separate staging target, backup and approved migration inventory.
   Inspect all `storage.objects` policies, including dashboard-created policies.
3. Replay the migrations on staging, then run the owner/other-user/anonymous
   matrix against uploaded test objects. No fixture PII or production identities.
4. Verify Mux source signing still works and private thumbnails do not pass
   through `/_next/image`. Check seeking with real videos and mobile browsers.
5. After acceptance, approve the production migration separately. Do not roll
   back to public access as a playback fix; roll forward or disable affected UI.

Signed URLs are bearer capabilities until expiry, not instantaneous revocation.
Old public URLs and cached/downloaded copies cannot be retroactively made secret;
inventory prior exposure and confirm CDN invalidation/expiry with the provider.
The endpoint alone does not make a public bucket private. Committed-object deletion
protection and durable orphan cleanup remain separate pending work.

## References

- https://supabase.com/docs/guides/storage/buckets/fundamentals
- Installed Next.js `image.md` and `route.md`: authenticated images require
  `unoptimized`; route params are asynchronous in this installed version.
