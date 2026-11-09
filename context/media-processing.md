# Local video processing

The backend now streams private local video to a Mux direct-upload session. Mux
does not fetch a signed file URL from the developer's LAN. This keeps local
development compatible with a remotely hosted video provider.

Dispatch requires explicit media-upload database preparation and the existing
Mux/worker gates. Sources remain owner-scoped, immutable claimed files with an
allowed video type and a 200 MiB maximum. Each leased run sends at most two 8 MiB
chunks. It probes provider-confirmed progress before continuing; it does not load
the full video into memory or persist the signed upload URL.

A lost create acknowledgement leaves the job uncertain. A bounded, paged scan
collects only provider IDs using the durable media ID as passthrough. It binds one
consistent result after the scan, quarantines conflicting candidates, and never
blindly creates another asset. An unresolved scan needs operator review. Upload
timeouts keep the same upload ID; provider-confirmed expired or cancelled sessions
stop with an explicit error rather than silently creating another billable asset.

Completion of uploaded bytes does not publish a video. Provider readback or a
verified webhook must bind the correct media/upload/asset, show an actual video
track with signed-only playback, and confirm a duration of at most 120 seconds.
Compare-and-set writes prevent a delayed upload response from overwriting a newer
webhook result. Closed owners and unpublished inventory are not dispatched.

Controlled verification: 90 focused media policy, transport, dispatch, webhook,
playback and worker regressions passed on 2026-11-09. These use mocked provider
traffic; no real Mux upload or physical-device recording acceptance is claimed.

Provider references: [Mux direct uploads](https://www.mux.com/docs/guides/upload-files-directly),
[Mux upload API](https://www.mux.com/docs/api-reference/video/direct-uploads), and
[GCS resumable upload protocol](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads).
