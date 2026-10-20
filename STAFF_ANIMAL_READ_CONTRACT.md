# Billing and Delivery animal-read candidate

Prepared against web25e568ede016e963d622154d4a2887fed233a801. Isolated candidate only;
no deployment, gate changes, account changes or production record creation.

The owner now requires Billing and Delivery Staff to see relevant animal records
before invoices or delivery assignments. Existing membership scope is municipal;
no supported pre-assignment business subset or separate animal-status read policy
exists. This owner-approved checkpoint implements same-municipality list/detail reads for active,
verified Staff with inventory, billing or delivery permission. Vendor reads remain
restricted to their protected business and municipality.

## Owner-approved scope and API redaction

Billing/Delivery-only Staff may read all businesses in their protected municipal
scope and pending, approved or rejected records before invoices/assignments exist.
The owning business ID, animal identifiers/species, real weights and times,
revisions, inspection status and measured/estimated separation remain available.
The owner explicitly excludes inspection notes, all actor references and audit
history from these roles' API responses. Server-side allowlisting enforces this
for BOTH list and detail; hiding fields in the UI is not the privacy boundary.

Restricted records have `projection: "staff_read_only_v1"`. They omit createdBy,
updatedBy, inspection.inspectorUid, inspection.notes and carcassWeight.recordedBy.
Real createdAt/updatedAt, inspection.decidedAt and carcass weighing/recorded times
are retained; no evidence is fabricated. No contact details or audit events are
included. Existing full Vendor/Inspector/Inventory projections remain unchanged,
including Vendor own-business isolation. A Staff membership that also has inventory
retains its existing full Inventory authorization; no memberships are broadened.

## Shared API

Existing authenticated routes and schema remain; no role selector is accepted:
- GET /api/mobile/animals/settings adds boolean canRead, canReadHistory and animalReadOnly.
- GET /api/mobile/animals/ returns the existing 25-item bounded page and cursor, using the role-appropriate projection.
- GET /api/mobile/animals/:id returns the same role-appropriate record projection.

For Billing/Delivery-only Staff, canRead=true, canReadHistory=false and animalReadOnly=true; canRecord,
canInspect and canRecordCarcassWeight remain false. Inventory/admin/inspector
retain their existing history eligibility even when recording is paused. Vendor
canRead remains business-scoped and canReadHistory=false. Staff without a
supported permission cannot read. Missing, inactive, unverified or mismatched
role/scope membership remains denied. No client-selected municipality/business/
status filter is introduced. Cursors remain bound to account/role/scope/business.

History, inventory vendor selector and inspector vendor-identity lookup remain
forbidden to Billing/Delivery-only users. Registration, correction, inspection and
carcass mutation predicates are unchanged. Billing, payment, delivery and tracking
routes and their gates are unchanged. No new account permission or production gate
is introduced. Existing production reads remain available while writes are paused.

## Android and release compatibility

Android's isolated companion consumes additive typed optional settings fields,
retains Operations as the Billing/Delivery landing, adds Animal records navigation
alongside it and reloads profile/settings/list without another login. Detail must
skip /history when canReadHistory=false, while paused Inventory retains history.
Android requires the recognized marker and animalReadOnly=true to parse the restricted shape; missing actors are never invented. Full evidence validation and Vendor isolation remain strict.

The installed older signed v2 does not consume these flags and may choose Animals
as its default when list reads begin succeeding, then request forbidden history.
Do not assume backend-first rollout is safe. Review both
patches, prepare/verify a new signed Android artifact and coordinate its update
before enabling the new backend read behavior. New Android with old backend must
retain Operations and fail gracefully for unprovided read flags/denied list access;
verify this mixed-version path before release. No APK assembly/install occurs in
this checkpoint.

Rollback: restore the policy-compatible web25e568e code while retaining all current
manifest values, Auth enforcement, cursor/secrets and records. New Android must
continue showing authorized Operations with animal reads unavailable. No records,
claims or memberships are migrated or reverted. The independent production-carcass
candidate shares server/animals.js but is excluded here; do not merge it silently.
