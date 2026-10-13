# Firestore data model reconciliation

Status: analysis and migration plan, 2026-10-09. No business data was changed.

## Verified database state

- Project `com-slaughterhouse-app`, database `(default)`, Standard edition, `asia-southeast1`.
- The only root collection found is `Users`, with four documents sampled. No sampled document has a subcollection. Field values and document IDs were not included in this inventory.
- All four documents have `email` and `vendorID`. Three have `role`. Names occur as `fullName` (one), `fulName` (one), or `name` (two). Status occurs as `status` (two) or `Status` (two).
- `vendors`, `slaughter_records`, `invoices`, `notifications`, and `config/serviceFees` do not exist in the live project. The dashboard's fee amounts currently come from code defaults, not an approved Firestore fee schedule.
- Direct client Firestore access is temporarily denied by the live rules. The web API uses the Admin SDK and its own administrator UID allowlist. Web mutations remain blocked.

## What the two applications expect

| Area | Live Firestore | Web dashboard | Decision needed |
| --- | --- | --- | --- |
| Identity | `Users/{documentId}` with email, name variant, role/status variant, vendorID | Firebase Auth UID allowlist for web administrators | Preserve Auth UID as identity; inspect mobile sign-in and whether every `Users` ID is an Auth UID. Do not grant web access from editable `role`. |
| Vendor | `vendorID` is present in `Users`; one `Users/V001` document exists | `vendors/{vendorId}` with name, contact, address, animal type, status | Determine whether `Users/V001` is a vendor record, a user account, or a link. The observed fields cannot populate the full web vendor model without guesses. |
| Slaughter | No live collection observed | `slaughter_records/{recordId}` references `vendor_id` | Inspect mobile collection paths, record fields, and vendor reference format. |
| Invoice | No live collection observed | `invoices/{invoiceId}` references vendor and optional slaughter record; stores fee snapshot and status | Agree on billing ownership, fee source, payment workflow, and immutable invoice fields. |
| Notifications | No live collection observed | `notifications/{notificationId}` with `is_read` and timestamp | Decide if notifications are global, staff-only, or user-scoped. |
| Fee schedule | `config/serviceFees` absent | Four hardcoded fee IDs/amounts used as fallback | Obtain approved office rates before enabling billing or fee edits. Do not treat fallback values as live rates. |

## Mapping rules to confirm with the mobile source

1. Keep the existing `Users` path and field spellings working until the mobile queries and writes are known. A rename or case change would create a different collection or field from the app's perspective.
2. Model authentication identity by Firebase Auth UID. Treat `vendorID` as a possible domain reference until mobile code proves its meaning. A vendor ID must not automatically become an administrator UID or vice versa.
3. Use one canonical representation for names and status in new data, but first enumerate mobile reads, writes, queries, accepted status values, and whether the mixed spellings are already handled by the mobile app.
4. Define the authoritative vendor record and its ID before connecting slaughter records and invoices. Do not fabricate vendors from `Users` profiles or seed demo records into the shared project.
5. Keep money fields and invoice totals calculated or validated by the server. Require an approved, versioned fee schedule; invoices should preserve the rate snapshot used when issued.

## Safe implementation sequence

1. Obtain a copy of the Android Studio project or a read-only code export. Search all Firestore collection/document paths, queries, updates, listeners, and Firebase Auth flows. Include any Realtime Database or Storage use.
2. Produce a field-by-field contract for `Users`, vendors, records, invoices, notifications, and fees. Mark required/optional fields, types, ID formats, and who may read/write each path.
3. Build a read-only compatibility adapter in the web API for existing data where a mapping is confirmed. Keep schema normalization inside the server and report missing/ambiguous fields; do not silently substitute invented values.
4. Test a migration against a separate Firebase project or emulator with a copy of non-sensitive fixture data. Verify both web and mobile reads/writes, references, billing arithmetic, and rollback.
5. Back up live data, then deploy reviewed code and least-privilege rules in a controlled cutover. Re-enable mobile only after its actual queries pass the Rules emulator tests. Keep the old public rule retired.

## Current boundaries

- `scripts/seed-firestore.js --live` is blocked for the shared project. Its records and rates are demo fixtures.
- The web dashboard currently remains read-only. Do not enable write routes or represent the fallback fee schedule as official until the contract and rates are verified.
- Existing `firestore.indexes.json` describes anticipated web queries, not observed mobile queries. Review index requirements after reading mobile code; do not deploy speculative indexes as part of this step.
