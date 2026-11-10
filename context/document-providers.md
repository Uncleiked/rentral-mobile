# Human document review and recorded-address lookups

Current policy, 2026-11-10: documents receive authorized human review through
the web/native admin console. Active Gemini screening and its configuration have
been removed. This path is retained so earlier documentation links still resolve;
older descriptions of AI screening are historical. Existing findings and audit
history remain factual records.

## Human review and publication

An authorized reviewer opens the listing's current private authority document
and records approval or rejection with a reason. Approval binds to the exact
owned document path, validated bytes and digest. File replacement or a relevant
listing change requires fresh review. Documents and embedded instructions are
untrusted evidence; approval does not establish legal title or guarantee condition.

Publication independently checks document approval, current account/media rules,
and either the verified publication fee or an audited listing-specific waiver.
A waiver is displayed as waived and creates no payment or journal fiction.
The owner may review their own listing only through the explicit reasoned owner
override. Financial approvals and manual inspection decisions retain participant
independence. See [owner setup and workflows](owner-admin-setup.md).

Approved gallery uploads are a separate, revocable permission. Their media origin
is explicit, and they carry no invented capture or location-verified badge.
Photo-only publication does not require Mux; a gallery video still needs ready
processing. Ordinary recorded listings retain their recording/address rules.

## Geoapify and Nigerian addresses

The existing backend-only `GEOAPIFY_API_KEY` configures forward geocoding. Only
the entered address is sent to Geoapify; private recording GPS is not sent.
Requests use the fixed HTTPS endpoint, Nigeria filter and one-result limit,
with a 10-second deadline, 64 KiB actual-byte ceiling and no redirects. Admission
requires an explicit Nigerian building/amenity result with confidence at least
0.8, within **100 metres** of the immutable recording point. A city, state or
street centroid cannot satisfy this requirement. Current bindings and address
fingerprints are rechecked under the listing lock after provider I/O.

Geoapify uses international datasets, including OpenStreetMap and OpenAddresses.
Availability of country data does not imply that every numbered building is
mapped. Its API supports structured house/street/city/state input and confidence
signals. [Data sources](https://www.geoapify.com/geocoding-api/),
[geocoding contract](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/).

Four deliberate diagnostics used only the user's supplied address strings.
The two partial strings produced no result or an unrelated low-confidence
building. Adding the supplied Ifako/Bariga, Lagos details produced only Lagos
state-level results with confidence 0 for both addresses. The configured key and
network worked; neither specific building resolved reliably. No distance was
calculated, no stored GPS was read/sent, and no application record was changed.
These results do not disprove the addresses' existence or establish their distance.

## Honest lookup states and transport

New clients request `/captures/:id/check-address?details=1`. Unavailable results
may include one bounded reason:

| Reason | Meaning |
| --- | --- |
| `no_result` | The lookup completed without a result. |
| `low_confidence` | A building candidate did not meet the confidence threshold. |
| `imprecise` | The result did not confirm a precise Nigerian building/amenity. |
| `provider_unavailable` | Configuration, network or provider response prevented a usable lookup. |

Older clients keep the exact response shape without this opt-in. Newer clients
also accept older responses and use neutral fallback wording. An unresolved
building is no longer described as an outage. All unsuccessful states preserve
the draft and remain unable to authorize recorded submission.

`lib/providers/bounded-json.ts` permits only the Geoapify host, bounds streamed
bytes and timing, rejects redirects/non-JSON/malformed responses and never returns
provider text or keys. Tests cover bounded transport, lookup reasons, stale
addresses, private projections and the unchanged proximity boundary. Four live
diagnostics do not constitute complete Nigerian coverage or device acceptance.
Proximity within 100 metres is not exact house/unit identification or GPS attestation.
