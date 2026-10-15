# Dressed carcass weight — Android contract

Implemented locally 2026-10-15. Production recording remains disabled. The slaughterhouse must confirm included/excluded body parts before a separate production-enablement change is reviewed. This definition is not inferred from live weight, species, fees or inspection notes.

## Endpoints and authorization

Mobile prefix: `/api/mobile/animals`. Web prefix: `/api/animals`.

All requests require `Authorization: Bearer <Firebase ID token>`; POST uses `Content-Type: application/json`. Existing authentication verifies revocation, active protected membership and agreement of role/scope claims. Mobile writers must be staff with the `inventory` function. Web writers use the existing allowlisted administrator middleware. Inspector, vendor, billing-only and delivery-only identities cannot record carcass weight. Municipality is server-derived. No direct Firestore writes or new client rules are introduced.

`GET /settings` adds these fields alongside the existing settings:

```json
{
  "carcassWeightEnabled": true,
  "canRecordCarcassWeight": true,
  "carcassDefinitionStatus": "awaiting_confirmation"
}
```

The first two are false on the normal server. `canRecordCarcassWeight` combines the animal gate, carcass gate and writer permission; approval/lock eligibility must additionally be checked per animal. The definition status remains `awaiting_confirmation` even in rehearsal.

`POST /{animalId}/carcass-weight` creates or corrects the single current measurement. Both return **200**, with the full updated animal representation (not an envelope). No query parameters are accepted.

First entry:

```json
{
  "weightGrams": 65001,
  "weighedAt": "2026-10-15T06:00:00.000Z",
  "expectedRevision": 1,
  "expectedCarcassRevision": 0
}
```

Correction:

```json
{
  "weightGrams": 66002,
  "weighedAt": "2026-10-15T06:05:00.000Z",
  "expectedRevision": 1,
  "expectedCarcassRevision": 1,
  "reason": "Corrected scale entry after checking the recorded measurement."
}
```

| Field | Exact validation |
| --- | --- |
| `weightGrams` | Required JSON number: positive safe integer, 1–9007199254740991 inclusive. Input UI is decimal kg with at most three fractional places; convert exactly to grams without rounding. Example: 65.001 kg → 65001. Android should use `Long`/exact decimal parsing, not `Int` or floating-point rounding. |
| `weighedAt` | Required parseable timestamp string ending in `Z` or `±HH:mm`; use ISO 8601. May be at most 60 seconds ahead of server time. Stored normalized to UTC ISO format. No body-part or weight-ratio rule is implied. |
| `expectedRevision` | Required positive safe integer equal to the displayed animal `revision`. |
| `expectedCarcassRevision` | Required nonnegative safe integer: 0 when `carcassWeight` is null, otherwise the displayed `carcassWeight.revision`. |
| `reason` | Required for every correction, including replacing a measurement linked to an older animal revision. Optional on first entry. If supplied, must be a string whose trimmed length is 1–500, with no ASCII control characters. Stored trimmed in the audit. |

Unknown fields, arrays and missing required fields are rejected. Clients cannot submit actor IDs, municipality, inspection changes, invoice changes, kilograms, ratios or a server-assigned revision. Animal IDs follow the existing identifier rules: 1–128 characters, already trimmed, no slash, not `.` or `..`.

## Response and reads

Example first-entry response (synthetic identifiers):

```json
{
  "id": "ANM-example",
  "municipalScopeId": "SCOPE-A",
  "vendorBusinessId": "VEN-example",
  "identifier": "TAG-001",
  "identifierType": "manual",
  "species": "Pig",
  "weightGrams": 85001,
  "weighedAt": "2026-10-15T05:00:00.000Z",
  "revision": 1,
  "createdAt": "2026-10-15T05:00:00.000Z",
  "createdBy": "inventory-uid",
  "updatedAt": "2026-10-15T06:00:00.000Z",
  "updatedBy": "inventory-uid",
  "inspection": {
    "status": "approved",
    "revision": 1,
    "inspectorUid": "inspector-uid",
    "decidedAt": "2026-10-15T05:30:00.000Z",
    "notes": "Animal details verified."
  },
  "carcassWeight": {
    "weightGrams": 65001,
    "weighedAt": "2026-10-15T06:00:00.000Z",
    "revision": 1,
    "animalRevision": 1,
    "recordedAt": "2026-10-15T06:00:00.000Z",
    "recordedBy": "inventory-uid"
  },
  "carcassWeightLocked": false
}
```

The new `carcassWeight` and `carcassWeightLocked` fields also appear in existing `GET /{id}`, list items (`GET /?cursor=...`) and animal audit snapshots. Older/unmeasured records return `carcassWeight: null`; no migration is required. The carcass object contains exactly the six fields shown. `recordedAt`/`recordedBy` identify the latest save; previous measurements and actors remain in audit snapshots. `carcassWeightLocked` is true when an invoice or dispatch link exists; it does not replace the settings/approval checks. Existing role/scope/vendor read restrictions remain in force.

The transaction requires inspector approval matching the current animal revision and no `billingInvoiceId`/`deliveryId`. The measurement and `animal_audit` event commit together; failed audits roll back the measurement. Actions are `carcass_weight_recorded` and `carcass_weight_corrected`, with `before`, `after`, `reason`, `animalId`, `municipalScopeId`, `actorUid`, and server `at`. Existing history endpoint returns `{items}` (latest 20) to authorized inventory/admin/inspector personnel.

Carcass saves increment only `carcassWeight.revision`, starting at 1; top-level `revision`, original live `weightGrams`/`weighedAt`, and the entire inspection decision remain unchanged. `carcassWeight.animalRevision` binds the measurement to the approved animal revision at save time. If a later allowed live-record correction occurs, the measurement remains as historical evidence bound to that earlier revision. Display it as requiring review; do not present it as verified against the new revision. Reinspection plus a reasoned carcass correction are required to bind it to the newer revision. Existing invoicing eligibility and fees remain unchanged; carcass weight is not a new billing prerequisite. No yield percentage or ratio threshold is calculated.

## Errors and client handling

Domain errors have JSON shape **`{"message":"..."}`**, with no machine `code` field. Do not parse messages to choose client behavior; use HTTP status. Responses through the animal router carry `Cache-Control: no-store`.

| Status | Cases / representative exact messages | Android handling |
| --- | --- | --- |
| 400 | Invalid fields/grams/timestamp/revisions or any query: `Provide positive integer grams, a valid weighing time, current animal and carcass revisions, and supported fields.` Missing correction reason: `A reason is required to correct carcass weight.` Invalid ID: `Invalid animal ID.` Malformed JSON: `Invalid request body.` | Keep input visible; request correction. |
| 401 | Missing bearer: `Sign in is required.` Rejected/revoked/disabled Firebase session through animal auth: `Animal access is unavailable.` | Clear account state and require sign-in. |
| 403 | Wrong writer: `Inventory recording permission is required.` Invalid/inactive membership or claim mismatch: `Approved animal workflow access is required.` Other existing membership-validation messages can apply. | Clear writable state and show denied access. |
| 404 | Missing/cross-municipality animal: `Animal record not found.` | Clear selected animal and refresh accessible records. |
| 409 | Revision conflict: `This record changed. Refresh animal and carcass revisions before retrying.` Missing current approval: `Inspector approval of the current animal revision is required.` Invoice/dispatch lock: `Carcass weight cannot change after invoicing or dispatch.` Vendor transaction check may return `Vendor ownership must reference an active business in this municipality.` | Reload record and require explicit review/resubmission; never silently retry. |
| 413 | Normal server/rehearsal adapter JSON parser: `Request body is too large.` Limit is 16 KB. | Reduce request; do not retry unchanged. |
| 503 | Gate: `Carcass recording is disabled pending slaughterhouse definition approval.` Animal gate: `Animal workflow is awaiting pilot activation.` Invalid stored animal: `Animal record requires administrator review.` Exhausted carcass revision: `Carcass measurement requires administrator review.` Unexpected transaction/storage failure: `Animal operation failed. Refresh the record before retrying.` Existing Auth/storage unavailable messages can also apply. | Show unavailable, not an empty measurement or success; preserve safe input and refresh before manual retry. |

If a response is lost after a successful write, resending the old revisions returns 409. Refresh first to establish whether it committed. Clear pending submissions, selected measurements and audit state on logout/account switching, consistent with existing Android sessions. Network errors and non-JSON infrastructure failures are unavailable-service errors, never successful empty values.

## Local enablement and production boundary

`rehearsal/web-demo.mjs` opts in after `createRehearsalContext` validates its demo project and loopback emulators. It mounts both prefixes, including mobile Auth, on its existing local port 5004 (web Vite proxy on 5174). It is not started or used to seed data by this implementation. Existing Android-owned port-5003 adapters do not automatically opt in; their owners must explicitly enable the router option in the isolated adapter when integrating. Normal `server/index.js` mounts omit `carcassWeightEnabled`, which defaults false; no production environment flag enables it.

Production remains blocked on the slaughterhouse body-part definition and a reviewed enablement change. Fee policy, official numbering, release configuration and physical acceptance remain separate items in `DEPLOYMENT_CHECKLIST.md`.

## Validation

Focused animal/carcass/operations tests use in-memory transactional doubles and temporary loopback HTTP listeners, not live Firebase. Tests cover both writer namespaces, gates, scope/role/session denial, validation, approval/locks, concurrent revision winners, audit rollback, historical linkage after live correction and unchanged billing. Exact decimal conversion/display tests include gram precision and safe-integer boundaries. Typecheck, server syntax checks and web build pass. Actual Firestore retry behavior, interactive browser operation and Android feature integration still require acceptance testing; no such results are claimed here.

## Explicit rehearsal launcher option — 2026-10-15

Both adapters now require **`--enable-carcass-weight`**. Omitting it keeps carcass recording off even with animal workflows enabled. The shared `rehearsalCarcassWeightEnabled` guard calls `assertEmulators` before returning true: exact demo project, explicit separate loopback Auth/Firestore hosts, no real credentials/config. The adapters retain their stricter saved-port checks and loopback network guard. No production route consumes this option.

From the web checkout, with the existing healthy emulators running:

```sh
GCLOUD_PROJECT=demo-mobile-rehearsal \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
node rehearsal/web-demo.mjs --enable-carcass-weight
```

Android-owned adapter (replace the web path with the local checkout):

```sh
MOBILE_WEB_REPOSITORY=/absolute/path/to/web-slaughterhouse-monitoring \
GCLOUD_PROJECT=demo-mobile-rehearsal \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
node ../Capsto-Project/rehearsal/animal-server.mjs --preserve-fixtures --enable-carcass-weight
```

Conflicting project or credential environment values are rejected, not overridden. Do not restart healthy emulators or rerun fixture seeding. A running adapter needs one deliberate reload to change its startup option; Android's `--preserve-fixtures` skips existing identity, membership, business and schedule writes. Web UI: `http://127.0.0.1:5174/rehearsal/web-demo.html`; Android uses its existing animal origin on port 5003. The earlier note that Android adapters do not opt in automatically is superseded by this explicit option.
