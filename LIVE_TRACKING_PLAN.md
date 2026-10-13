# Foreground delivery tracking plan

Source review: 2026-10-13. Android checkout: 358b968, clean at review. Web sources are also clean at review. This is a plan only; no Android, backend, account, configuration or live-data changes are made by it.

## Current implementation

- OperationsScreen LocationShare/currentLocation obtains a single GPS/network fix after a manual tap and removes its listener afterward. A 20-second timeout is visible; no periodic upload loop exists.
- OperationsSession.location uses the ordinary invoice mutation path and shared busy state. Every location request currently advances invoice revision.
- Server operations validates active delivery permission, scope, assignee, paid invoice, allowed delivery state, coordinates/accuracy and capture time. It accepts updates while assigned/in_transit, stores latest location on invoice and writes a full operation audit snapshot.
- Android/vendor and web OperationsPage show the latest coordinates after manual refresh. No automatic refresh or map is implemented. No background service is declared.
- Rehearsal uses 10.0.2.2:5002/5003; physical devices require a separately prepared reachable test API/auth environment. Normal Android still has separate production configuration; do not switch it as part of this plan.

## Implementation order

1. Add a dedicated latest-position record/channel per delivery, separate from invoice revision and financial audit. Check active membership/claim agreement, scope, invoice assignment and in_transit state transactionally on each update. Stop writes after completion, assignment changes or permission removal. Validate capture timestamp/accuracy and reject out-of-order locations. Use the same ownership restrictions for vendor/admin reads; no direct client Firestore access. Retain existing billing/payment/revision behavior. Preserve or explicitly migrate the current manual location contract and tests rather than silently breaking them.
2. Add Start tracking / Stop tracking controls for the assigned delivery staff. Foreground only: start after departure with permission, upload approximately every 10-15 seconds, only one upload in flight, coalesce position updates, and skip unchanged positions except a bounded heartbeat. Display approximate/low-accuracy fixes honestly. Stop and release listeners on screen exit/background, logout, account change, permission loss, reassignment or completion. Foreground-only does not promise screen-off tracking.
3. Add targeted latest-position polling for the open delivery view on vendor/web; avoid full invoice-list/dashboard reloads every interval. Show location, accuracy, capture/receive time and a derived age/stale/offline status. Pause polling in hidden/background screens. Failed requests must not convert old data into a fresh location or silently clear it as an empty history. Do not persist stale/offline status on every timer tick.
4. Verify with synthetic emulator movement: repeated upload, matching vendor/admin display, invoice revision unaffected, stale/out-of-order updates, network interruption/recovery, completion stopping uploads, role/scope/vendor/assignee denial and session cleanup. Keep only latest position initially; route history/map/geocoding are separate choices. Track actual read/write counts and avoid one full financial audit per GPS point.
5. After emulator verification, prepare separate physical-phone staging connectivity and account/configuration previews. Validate real GPS and mobile-network interruptions on a short walking route before any delivery pilot. Keep official rates/data and real-account activation separate. Background tracking requires a later Android-specific design and physical-device checks.

## External guidance used

- Android location lifecycle: https://developer.android.com/develop/sensors-and-location/location/request-updates
- Firestore operations/quota: https://firebase.google.com/docs/firestore/quotas

Free-tier suitability depends on actual driver count, trip duration, upload frequency and viewer polling, not only whether the application compiles. Sharing Git branches does not share laptop emulator data. Both viewer and driver must address the same backend/environment.
