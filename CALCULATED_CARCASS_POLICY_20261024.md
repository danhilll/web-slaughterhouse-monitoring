# Calculated carcass weight policy — 2026-10-24

**Owner procedure (Pig and Cow):** calculated carcass weight = recorded live weight × 0.8. Example: 100 kg → 80 kg. This corrects the earlier rule that a post-slaughter scale measurement was mandatory before invoicing and dispatch. A scale reading is now **optional**. Fees are unchanged: PHP 95 per animal (15/25/10/45) for both methods.

## Rule (`carcassBasis` in `server/owner-workflow-policy.js`)
1. Requires Inspector approval of the **current** animal revision, a Cow or Pig, and a positive integer live weight in grams. Otherwise there is no basis (409).
2. If a **current** scale measurement exists (animal revision matches), the basis is `measured`. It takes precedence and is kept unchanged.
3. Otherwise the basis is `calculated_80_percent`: `weightGrams = (liveWeightGrams × 80 + 50) / 100` (integer, nearest gram, half up), which is the existing `manager_80_percent_v1` estimate. A stored estimate must match the live weight and revision, or the record fails closed. Legacy records without a stored estimate derive it.
4. A well-formed measurement of an **older** revision is ignored for the basis but never deleted. A **malformed** stored measurement fails closed.
5. The same basis is required for invoice preview and issue, the eligible list, Inspector assignment, delivery status changes and foreground tracking publication.

## Provenance
- The invoice stores an immutable `carcassBasis` snapshot at issue: `{method, liveWeightGrams, factor (0.8, calculated only), carcassWeightGrams, rule, rounding, animalRevision}` for calculated, or `{method:'measured', liveWeightGrams, carcassWeightGrams, weighedAt, measurementRevision, animalRevision}` for measured.
- It appears in the invoice projections (Billing, Vendor, Delivery, municipal oversight) and in the `operation_audit` before/after snapshots.
- Earlier invoices have no `carcassBasis` and read normally. Nothing is migrated.

## Wire compatibility (deployed Android v13 parsers)
- The animal and delivery projections are **unchanged**. The `carcassEstimate` and `carcassWeightSelection` objects are key-strict in v13. The wire value `source:"estimated"` now means *calculated (80% of live weight)*; the name is kept so v13 keeps parsing.
- The invoice-preview response and the assignment confirmation are key-strict in v13, so they are **unchanged**. `carcassBasis` appears only on invoice objects, which v13 parses tolerantly.

## Labels
- Calculated: **"Calculated carcass weight (80% of live weight)"**, always followed by "not scale-measured".
- Measured: **"Scale-measured carcass weight"**.

## Android v13 behaviour with this server
- Invoice eligibility, preview, issue and Inspector assignment all work (they are server-checked).
- **Dispatch actions are blocked by the v13 client** for any animal without a current scale measurement (`hasCurrentMeasuredCarcass`, `OperationsSession.kt:288`, `OperationsScreen.kt:287`). An Android build changing that gate and the wording is required before a calculated-weight animal can be dispatched from the phone.

Supersedes, for the carcass-weight requirement only, the "actual measured carcass weight is mandatory before invoicing/dispatch" statements in `OWNER_WORKFLOW_POLICY_20261021.md` and `CARCASS_WEIGHT_CONTRACT.md`.
