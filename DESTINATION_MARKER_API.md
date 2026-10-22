# Inspector-verified destination markers (local v10 candidate)

Base Web `bb264e27715e4bcd04fd3affdba6f976a9e9a919`, installed Android v9 source `5ccb701394ea3217c295530f4923ff98c64f723e`. This checkpoint is implementation/isolated evidence only; no deployment, production pin population, gates/IAM change or device action.

## API and authority

Separate `GET /api/mobile/operations/invoices/:id/destination-map` (Web prefix `/api/operations`) returns exactly:

- `projection: "verified_destination_v1"`, `invoiceId`, `status: "verified" | "unavailable"`, `revision` (nonnegative integer), `destination`.
- Verified destination: `{latitude, longitude, verifiedAt}`. Otherwise `destination:null`; absent pin revision0, stale pin retains its revision for conflict handling.

Reads retain municipal isolation, Vendor own-business and exact Delivery assignee scope. Inspector reads within its municipality; administrator reads oversight only. No verification actors/references cross the public DTO. Missing coordinates remain text-only; malformed stored coordinates/provenance fail visibly. No 0,0 default, geocoding or live-phone/map-centre fallback. Explicitly confirmed zero coordinates are valid numeric values, never defaults.

`POST` the same path is **Inspector only**, under the existing delivery gate and verified-email/active membership/role/scope middleware. Required fields: `latitude`, `longitude`, positive current invoice `expectedRevision`, nonnegative `expectedDestinationRevision`, printable `verificationReference` (1..200), and **`confirmed:true`**, plus exact reviewed `expectedDestination:{vendorBusinessId,marketName,marketSection,stallNumber}` from assignment-options. The tuple is rechecked atomically; joined destination text alone is insufficient, and a changed tuple returns409 before any write. Optional `reason` (1..500) becomes required for correction. Coordinates must be numeric/finite latitude[-90,90], longitude[-180,180]. No strings/coercion, unknown fields or client actor/time. Current owning Vendor, market/section/stall reservation, animal/invoice revision, Inspector approval, actual measurement and explicit Vendor organ choice are rechecked using existing assignment prerequisites.

Dedicated `delivery_destination_pins/{invoiceId}` and atomic `destination_pin_audit` retain independent pin revision, full original/new values, Inspector UID, server time, reason and source reference. Invoice amounts/status/revision, measurement, fees and financial audit are not modified by pin entry. Audit failure rolls back pin save; stale/concurrent revisions fail409; no automatic retry. Pin entry/correction is allowed only before assignment. Assignment snapshots a valid matching point internally with its verified destination; missing/stale point permits honest text-only assignment. Assigned point is locked and never follows a Vendor's later stall edit. Existing assignments without a snapshot remain text-only; no backfill/migration/correction policy is invented.

Existing strict v9 delivery/tracking/assignment DTOs remain unchanged. Legacy invoice projection adds an optional whitelisted **stored** `feeScheduleSnapshot`, which v9's root invoice parser permits. Billing/Vendor/Web now share recorded version/itemization; no historical amounts are recalculated from the current PHP95 schedule. New Pig/Cow issuance retains PHP95, no table fee. Paper official-receipt references stay separate from internal AINV; financial corrections/reversals remain disabled. Historical non-cash payment methods are labelled from stored evidence, never relabelled cash.

## UI, maps and operational limits

Inspector Android coordinate entry provides a local proposed-pin preview and explicit confirmation; proposed is distinct from verified. It is coordinate-based pin selection/preview, not automatic address lookup or live GPS. The Web administrator interface remains read-only. Both authorized clients render **Verified destination** separately from **Last shared delivery position**, including destination-only/shared-only/both/empty states. Destination-read failure is separate from GPS tracking and never clears a valid assignment/shared point. Late responses are discarded on account/assignment change. Web destination reads have an8s timeout. Loaded assignment snapshots explicitly require refresh after mobile writes.

Only typed numeric marker data crosses MAPCN; no actor, source reference, invoice ID, token, URL or arbitrary label. Keep owner-selected MAPCN source `d98f98fdc309153a2ab24eeb5c6335ba2e6bf6bb`, MapLibre6.4.1, bundled worker/CSP/network allowlist, visible OSM attribution and provider caching terms. Web renderer still accepts legacy numeric position messages. No new map library, routes, offline tile bulk download, native WebView geolocation or background tracking.

Tracking remains explicit foreground/resumed sharing; no background/screen-off guarantee. Capture/receive times and stale/error states remain honest; completion stops client sharing and server rejects later uploads while preserving the last completed point. Historical unexplained tracking incident/timing/concurrency limits are not resolved by synthetic tests or the owner's working-map observation.

## Exact verified owner input

For the already approved owning Vendor's **specific market, section and stall**, supply actual WGS84 decimal-degree latitude and longitude and the actual verification source/reference (for example the reference to an actual onsite check or reviewed map pin; no value is supplied here). Inspector must review the proposed pin against that business/stall and explicitly confirm. Numeric validation and scope/reservation association do not prove physical geography; no municipal geofence or surveying accuracy is invented. No production coordinates are populated by this checkpoint.

## Isolated checks and release order

Focused API tests use candidate routers with synthetic verified-role auth and transactional in-memory Firestore; cross-repository tests use actual Android HTTP clients against that loopback server, and Web browser checks use actual components/API records plus built MAPCN/worker with stub tiles. These do not establish real Firestore retry timing or physical-device acceptance. Fresh fixture utility `rehearsal/serve-role-workflow-fixture.mjs` only binds loopback, refuses ready-file overwrite, uses no production credentials, and exposes a guarded synthetic reset only in that new fixture process.

Later release requires scoped source review/commit, compatible backend and signed v10 client, without assuming new gate enablement (current gates already on). No version10 APK built/signed/installed here. Reverting code must preserve all pin/audit/financial/measurement records; v9 ignores additive invoice snapshot fields and cannot enter/render this destination feature. No data deletion or financial reversal is rollback.

## Assignment review guard
V10 also sends optional new fields `expectedDestination` (the same four-field reviewed tuple) and `expectedDestinationRevision` on the existing Inspector assignment POST. Both are validated together, compared atomically with current Vendor/stall/pin, and409 on change. A pin-bearing invoice requires these guards; an old client must refresh/use the compatible client. Existing v9 text-only assignment requests without a pin remain valid. Strict v9 read DTOs are unchanged. This prevents silently attaching a point corrected after the Inspector's last view.
