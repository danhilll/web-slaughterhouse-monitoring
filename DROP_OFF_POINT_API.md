# Optional Delivery Staff-selected drop-off point

Isolated Web base `830f2df81b7b8265c729b9fbc369a58945f0fd7f`; companion Android release requires a compatible new APK. This is a selected entrance/unloading point, not an Inspector-verified stall, a tracking sample, proof of arrival, route or ETA. Final handover remains at the assigned vendor stall. It is optional and does not block any delivery transition.

## API

Separate GET/POST `/api/mobile/operations/invoices/:id/drop-off-point` (Web prefix `/api/operations`) leaves existing invoice/assignment/tracking DTOs unchanged.

GET exactly `{projection:'delivery_drop_off_v1',invoiceId,invoiceRevision,revision,canUpdate,point}`. Invoice revision is positive, point revision nonnegative. Point is null (revision0) or `{latitude,longitude,selectedAt,selectionMethod:'map_tap'|'device_location'}`. No actor identity in this read response. Exact assigned Delivery Staff, owning Vendor and same-municipality administrator may read, including after completion. Other Vendor, non-assigned Delivery Staff, unrelated roles and foreign municipality fail404. Administrator/Vendor cannot update. Multi-permission Staff retain their explicitly granted delivery permission, without granting writes to other roles.

POST requires exactly `{latitude,longitude,expectedRevision,expectedDropOffRevision,selectionMethod,confirmed:true}`. Numeric finite coordinates must be within latitude[-90,90]/longitude[-180,180]; no coercion, extra fields/query, client timestamp/actor, implicit confirmation or selection from last-shared tracking. Current invoice and independent pin revisions are rechecked atomically. A revision conflict returns409; no automatic retry. Source method records the client's declared selection method, not independent geographic verification. Server time and actor are authoritative.

Only assigned active Delivery Staff can write, and only while assigned/in_transit, under the existing delivery gate and verified-email/active-membership middleware. After completion updates409 and reads retain the pin. `canUpdate` is false for completed deliveries, read-only roles and paused delivery gate. Missing optional pin never blocks assignment/dispatch/completion. No delete/backfill/automatic snapshot migration is introduced.

## Storage and authorization

Independent `delivery_drop_off_points/{invoiceId}` stores scope, Vendor, assignee, point revision, selection method, actor and server time. An atomic `delivery_drop_off_audit` entry retains before/after, actor, time and action for each save/update. Audit failure rolls back the point. Neither operation changes invoice/animal revisions, financial data, paper receipts, Inspector destination or live tracking. Corrupt/cross-bound stored points fail visibly503 instead of showing another identity's point.

## Clients and renderer

Exact label: **Drop-off point—selected by Delivery Staff.** Explanation: may represent a market entrance/unloading area; final handover remains at the assigned vendor stall. Android offers map-tap or fresh current-device-location selection, proposed preview and explicit confirmation. Selection never starts/shares tracking; cancel does not save. Permission denial must not reuse the last-shared point. Web administrator is read-only and refreshes saved data from the same authoritative endpoint.

Readonly Web MAPCN accepts additive numeric `dropOff` alongside `position`/`destination`, retaining legacy formats. Purple square is selected drop-off, orange diamond Inspector destination, green circle last-shared position. Only numeric coordinates cross the renderer; no tokens, invoice/actor IDs or arbitrary labels/URLs. Existing pinned MAPCN/MapLibre, bundled worker, provider/OSM attribution, CSP/network/caching restrictions remain. No routing or ETA. Null/missing coordinates never become0,0 or an invented marker.

Web AuthGate keys App by session UID and unmounts on logout; new local state is not persisted, reads abort on unmount/invoice change and stale identity responses are ignored. Android must clear proposed/saved markers, pending one-shot location callbacks and selection bridge state on logout/account change. Foreground tracking and completion behavior remain unchanged; no background guarantee is added.

## Evidence and release limits

Focused synthetic tests cover authorization, numeric validation, confirmation, independent revisions/audits, missing optional pin, unpaid dispatch, completion lock and preserving existing records/DTOs. Browser checks use actual Web components/API routers, in-memory transactional storage, real MAPCN/WebGL2 and synthetic tile stubs; these are not physical-device acceptance or real Firestore retry timing proof. No production pin, transaction, deployment, gate/IAM edit or device action in this checkpoint.

Later release uses compatible backend plus newly signed/installed Android under separate authorization. Reverting code must preserve point/audit/financial/tracking data and verification enforcement; older clients ignore the separate optional endpoint. No new gate is required. Financial corrections remain disabled.
