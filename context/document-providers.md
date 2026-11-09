# Advisory document and address providers

Gemini screening and Geoapify address matching remain optional server-side aids to an authorized human listing reviewer. Neither can approve identity, legal ownership, a sealed document or a listing. Publication still requires the current active owner, a human document approval, matched current address/private capture point, ready video and verified publication fee under the existing transaction guard. No actual Gemini or Geoapify request was made during implementation or automated verification.

## Gemini

Configuration remains server-only `GEMINI_API_KEY` and `GEMINI_DOCUMENT_MODEL`. The model name is bounded and restricted to an identifier, and the endpoint is fixed HTTPS Google `generateContent`. A staff action explicitly initiates screening; key presence does not start background analysis. Select a model that supports structured JSON responses and test it separately before enabling a real merchant workflow.

The source is the listing’s owned `compliance-docs` reference, not a user-supplied URL. Current local storage verifies MIME, magic bytes, size and sealed metadata. Screening independently compares downloaded bytes to the sealed SHA256 digest and size before sending at most10MiB of PDF/JPEG/PNG. Embedded instructions are untrusted input. The request asks for bounded JSON signals and sets `maxOutputTokens:2048`; no provider error body or file body is logged. The API documents structured response MIME/schema and output-token configuration. [Gemini generateContent reference](https://ai.google.dev/api/generate-content), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

The response has a128KiB actual-byte ceiling and45-second header/body deadline; redirects are forbidden. Exactly one candidate,1–8 bounded parts, and explicit successful `STOP` finish are required; blocked, truncated or extra candidate responses do not update review state. Thought parts are excluded. Signals allow only risk, up to12 findings of500 characters, and a100-character document type. Findings remain `needs_review`, including low-risk results. The listing is locked and its document path rechecked; a human decision is never overwritten by a delayed answer. Google documents finish reasons and candidate safety reporting separately from generated output. [Gemini response semantics](https://ai.google.dev/api/generate-content).

## Geoapify

Configuration remains server-only `GEOAPIFY_API_KEY`. The fixed HTTPS forward-geocoding endpoint receives the current address, `countrycode:ng` filter and limit1. It uses a10-second header/body deadline,64KiB actual-byte ceiling and no redirect forwarding. At most one point is accepted. City/district centroids, confidence below0.8, a returned non-Nigerian country, invalid coordinates and malformed responses cannot produce a match. Geoapify documents country filters and rank confidence as match signals. [Geoapify geocoding API](https://apidocs.geoapify.com/docs/geocoding/).

The transaction locks the listing and verifies the unchanged address fingerprint before comparing the provider point to the private captured point with the existing100m threshold. The result is matched/mismatch/unavailable, not proof of ownership or survey accuracy. Raw GPS stays in the private location collection and is excluded from public DTOs and account export.

## Transport and tests

`lib/providers/bounded-json.ts` enforces the two fixed HTTPS hosts, rejects redirects/non-JSON responses, counts chunked/decompressed bytes rather than trusting Content-Length, cancels overflow and stalled bodies, decodes UTF8 strictly and returns fixed errors without provider text or API keys. It never retries a POST. Mocked checks cover false small lengths, announced overflow, stalled bodies, redirects, malformed JSON/UTF8, incomplete Gemini output, changed sealed bytes, delayed human decisions, stale addresses and excessive geocoder results. Mocks do not constitute live provider activation or acceptance.
