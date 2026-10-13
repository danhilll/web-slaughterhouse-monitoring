# Delivery map work — 2026-10-13

## Scope and behavior

Web administrator tracking now offers **Show map** for an authorized invoice with a reported position. Leaflet 1.9.4 draws the latest point and accuracy radius using OpenStreetMap Standard tiles. Coordinates, capture time, age, stale/offline messages and delivery state remain visible. Opening a map discloses that the viewed area is requested from OpenStreetMap; tokens, account IDs and invoice IDs are not sent to the map service.

Tiles are loaded only after opening the map, without offline downloads or prefetch buffers. Default browser caching remains enabled. Visible OpenStreetMap attribution appears inside and below the map. Policy reviewed: https://operations.osmfoundation.org/policies/tiles/ . Availability is best-effort. There is no route prediction, continuous GPS stream or proof of arrival; the phone must keep its tracking screen open to share periodic positions.

Polling uses one request at a time, aborts on hiding/closing, honors Retry-After across visibility changes, and stops on completion or HTTP 401/403/404. Access loss clears the old position. Temporary errors retain the last fix with an explicit error and increasing age. Switching invoice IDs cannot show the previous invoice's map.

## Changed web files

- `src/DeliveryMap.tsx`: map and accuracy circle, attribution, tile failure notice.
- `src/DeliveryTrackingPanel.tsx`: authorized map integration and foreground notice.
- `src/trackingPolling.ts`, `src/trackingPolling.test.ts`: polling lifecycle and nine focused checks.
- `server/operations.test.js`: completed-delivery ownership and revoked membership regression test; server behavior unchanged.
- `rehearsal/verify-existing-tracking.mjs`: read-only check using existing identity-vendor and Bob accounts, with no seeding/reset/provisioning.
- `package.json`, `package-lock.json`: Leaflet/types and test commands.

## Actual validation

- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-bundle warning remains (main bundle approximately 1.42 MB).
- `npm run test:tracking-ui`: 9 passed (status, payload, no overlap, cleanup, hiding/resuming, 401/403/404, error recovery, completion, Retry-After and timeouts).
- `npm run test:server`: 69 passed before adding the new isolation regression; the subsequently rerun operations file passed all 18 tests, including the added test.
- `npm run test:rehearsal:safety`: 2 passed.
- `git diff --check`: passed.
- Dependency installation still reports 23 audit findings; no broad dependency upgrade was attempted.
- Windows host check found no phone and no listeners on 9199/8180/5002/5003. Existing-record API verification and physical map rendering were therefore not performed. No fixture records were created.

## Android status — build verified

The clean Android checkout was switched from main to `isolated-mobile-integration-rehearsal` and fast-forwarded to the already-fetched 16f6ac2. Added a `DeliveryLocationMap` component and locally bundled Leaflet assets/license. Only position values enter the WebView; it has no native JavaScript bridge or Firebase/API credentials. Network requests are restricted to OSM tile images and bundled assets. Closing/backgrounding disposes the map.

Android is now based on 5dae6ab. After the user confirmed continuing with the updated branch, the obsolete unresolved `DeliveryTrackingMap` call was removed in favor of the implemented `DeliveryLocationMap`. The lifecycle import was corrected for the project's Compose version. No duplicate map is rendered.

Fresh Windows validation: `:app:testRehearsalUnitTest :app:assembleRehearsal :app:lintRehearsal --offline '-PrehearsalHost=127.0.0.1' --gradle-user-home C:\Users\Acer\.gradle` passed. All **64 unit tests passed**, with zero failures/errors, including existing tracking ownership, cancellation, account switching and stale/error checks. The USB-host rehearsal APK was built successfully; lint completed successfully. `git diff --check` passed. Physical map rendering, installation and mobile-data road testing remain unverified because no device or synthetic services were available during the final check.

## Navigation and test procedure

Use existing synthetic accounts only; public password `Synthetic-only-42!`.

1. Delivery phone: **Staff → delivery@rehearsal.example.test → Billing & delivery → View invoice for [existing animal] → Delivery tracking → Start tracking**. Delivery must already be assigned to this account and in transit; no data was invented for this task.
2. Vendor viewer: **Vendor → identity-vendor@rehearsal.example.test → Payments & deliveries → View invoice for [same animal] → Delivery tracking → Show map**. Verify the displayed coordinates/time agree with the driver. Vendors do not need location permission to view a delivery.
3. Stop sharing or background the delivery screen; after 45 seconds the unchanged position should be labeled stale. Completion is the separately recorded delivery status, not inferred from GPS.
4. Sign out and use `bob@rehearsal.example.test`; the identity vendor's invoice and location must not appear.
5. Web: **Operations → invoice's tracking action → Show map** using an authorized administrator. The web remains administrator-only. The separate synthetic web panel is documented in `ALL_ROLE_DEMO.md`; do not use demo accounts in the normal live login.
6. With existing local services and fixtures already running, set the two documented loopback emulator variables and `GCLOUD_PROJECT=demo-mobile-rehearsal`, then run `npm run rehearsal:verify:existing-tracking`. It signs into existing accounts and checks own delivery 200 / Bob 404. It fails explicitly if no existing assigned delivery is available instead of fabricating one.

No production configuration, rules, memberships, claims, rates or live business records were changed. No commits, pushes or deployments. Runtime staging, screenshots and build artifacts remain ignored.
