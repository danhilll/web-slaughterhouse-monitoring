# Verified tracking contract and mobile handoff

Implemented locally 2026-10-13. Foreground Android integration remains the next milestone. Production operations remain emulator/demo gated; no real credentials, accounts, billing or tracking were enabled.

## Verified server changes

GPS updates have their own latest-record collection: `delivery_positions/{invoiceId}`. New tracking writes do not change invoice amount, payment, delivery status or invoice revision and do not append a full financial audit. Invoice/status actions retain their existing transaction/revision/audit behavior.

Each publish transaction rereads membership, invoice assignment/status and previous position. Only active assigned delivery staff with matching scope and permissions can publish. Delivery must be paid and `in_transit`. Completion racing a publish changes the invoice transaction input and forces a recheck; updates after completion are denied. Different vendor/scope and unassigned staff cannot read another delivery. Web reads require the existing administrator allowlist.

One latest-position write per accepted new sample; identical retry is a no-op. Samples must be newer than the accepted capture time. Accepted uploads are at least 10 seconds apart based on server receive time, with 429/Retry-After for early updates. A bounded per-process request limiter allows 30 tracking requests/minute/account, at most 5000 entries, before tracking storage access. This is not a distributed WAF; token verification/membership middleware still precedes it. The persistent per-delivery transaction limit works across instances. Viewer polling must be limited to the selected visible delivery.

## Endpoints

Mobile prefix `/api/mobile/operations`; web prefix `/api/operations`.

### POST `/invoices/{invoiceId}/tracking`

Body has exactly these fields (no invoice expectedRevision):

```json
{"latitude":13.96,"longitude":122.29,"accuracyMeters":12,"capturedAt":"2026-10-13T02:00:00.000Z"}
```

Latitude/longitude must be finite valid coordinates; accuracy 0-1000 m. Capture time must be timezone-bearing, at most 60 seconds old or 10 seconds ahead of server time. Format server accepts is normalized to ISO UTC. Approximate positions must not be displayed as precise. Client clocks/GPS can be inaccurate or spoofed; validation is not proof of physical presence.

### GET `/invoices/{invoiceId}/tracking`

Returns only this delivery's position; no list scan, private contact fields or driver UID:

```json
{
  "invoiceId":"AINV-example",
  "deliveryStatus":"in_transit",
  "trackingState":"recent",
  "location":{"latitude":13.96,"longitude":122.29,"accuracyMeters":12,"capturedAt":"2026-10-13T02:00:00.000Z","receivedAt":"2026-10-13T02:00:01.000Z"},
  "serverTime":"2026-10-13T02:00:02.000Z",
  "updateIntervalSeconds":10
}
```

POST returns the same shape plus `duplicate`. Status is one of `not_started`, `waiting`, `recent`, `stale`, `completed`. Recent means a sample is within 45 seconds; it is not a guarantee the driver is currently connected. Completed takes priority over sample age. Missing position is `null`; reassignment hides the previous assignee's coordinates. Query selectors are unsupported. All responses use no-store.

401: session ended. 403: permission denied; stop and clear local tracking. 404: delivery unavailable to this account; clear tracking. 409: not in transit, completed, or out-of-order sample; refresh status before continuing. 429: obey Retry-After, no tight retries. 400: invalid sample. 503/network timeout: show failure/old-data state; never mark an old position as fresh.

## Existing manual endpoint compatibility

POST `/invoices/{id}/delivery/location` still takes expectedRevision and returns the existing invoice DTO. It now delegates to latest-position storage and does not increment invoice revision or create a GPS audit. For existing manual viewers only, it also mirrors location onto the invoice (a second write), preserving existing display shape. It retains assigned/in-transit permission and older 5-minute sample tolerance. Automatic tracking must use the new tracking endpoint, not the compatibility route. Old embedded invoice locations are not silently migrated; the web tracking panel reads only the dedicated position channel.

## Web changes

OperationsPage provides Track delivery controls. Only one selected DeliveryTrackingPanel polls its targeted endpoint every 10 seconds. Polling is sequential, has an 8-second timeout, honors Retry-After, pauses while hidden, cancels on close/unmount, clears positions on lost access and stops at completed delivery. Sample age advances locally using server-time reference; failures keep the last position visibly old. Map, geocoding and route history are not implemented. Browser typecheck/build passed; an interactive walkthrough is still needed.

## Validation and bottlenecks

- 69 server tests pass, including seven new tracking tests: financial/audit isolation, permissions, ordering/duplicates/rate limiting, concurrency/completion, stale/reassigned positions, malformed samples and bounded bursts/corrupt storage.
- 11 actual local Firebase Auth/Firestore checks pass: race with exactly one accepted position, one latest-position write/no invoice or audit change, idempotency, rate limit, stale-order rejection, vendor/admin agreement, permission removal, completion and direct-client denial. Unique test fixtures are cleaned.
- Typecheck/build pass; existing large JavaScript bundle warning remains.

Typical new upload performs three document reads (membership, invoice, position) and one write, excluding transaction retries and authentication middleware's reads. Tracking GET is three reads for mobile or two for web admin. At 10-second uploads, that is approximately 360 position writes/hour/driver; each viewer polling every 10 seconds adds repeated reads. This is a code-derived estimate, not a production load test or free-tier capacity guarantee. Latest-only storage bounds storage growth but deletes/retention rules are not implemented. Keep trips/viewers/frequency measured before activation.

## Exact next prompt for Android Studio Codex

Implement foreground delivery tracking against TRACKING_API.md in the web checkout. First read the actual server implementation and existing OperationsSession, OperationsScreen, session coordinator, API models and location provider code. Preserve the redesigned UI and current work. Stay on isolated-mobile-integration-rehearsal. Do not over-engineer; use existing dependencies.

Use the new GET/POST tracking endpoint and response models; do not send expectedRevision or use the old manual endpoint for periodic updates. Add explicit Start tracking/Stop tracking for the assigned staff's in-transit delivery. Keep a separate cancellable tracking job/state so uploads do not set financial-form busy flags or reload entire invoice/animal lists. Send at most one upload at a time, approximately every 10-15 seconds; coalesce/skip unchanged positions except a bounded heartbeat. Use fresh capture timestamps and show coarse accuracy honestly. Respect 429 Retry-After; on 409 refresh delivery status and discard obsolete samples rather than blindly retrying.

Run only while the delivery screen is visible/resumed. Stop and release all location listeners/jobs on background/screen exit, explicit stop, completion, reassignment, logout, account changes, permission revocation or denied access. Do not implement a background service, map SDK or direct Firestore writes in this milestone. Viewer/vendor tracking should poll only the selected visible delivery with timeout, no overlap and last-update/stale/error display. Old positions must never appear fresh after a failed request. Clear tracking data on access loss and record/account changes.

Test with synthetic emulator accounts and simulated movement: repeated uploads, visible web/vendor updates, unchanged invoice revision, completion without GPS conflict, stale/out-of-order samples, network loss/recovery, rate limits, permission removal, ownership/assignee/scope restrictions, listener cancellation and late-response disposal. Compile and run relevant unit/device checks, inspect installed-build screenshots, and update MOBILE_INTEGRATION_RESULTS.md with actual evidence and limitations. Existing device tests that assumed GPS increments invoice revision must be adapted to the new verified contract; keep security/financial assertions intact. Do not alter live Firebase configuration, real users, rates, rules, claims or memberships; do not commit, push or deploy. Restart only the synthetic adapters that need to load updated web modules. Report results for this web session to review before the physical-phone stage.
