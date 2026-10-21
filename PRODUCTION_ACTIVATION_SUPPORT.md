# Final local activation-support release package — 2026-10-22

## Identity and scope
Web base is `7edb61abe38b3651a778986b4a28e7857b624d00`. This is an isolated, uncommitted 16-file candidate; exact file hashes/patch/evidence are frozen outside Git. Original checkout and other isolated work are preserved. Production identity is reused from the prior verified release; no fresh production access was made in this implementation batch.

Installed Android v7 source `414ece773dabf88f36d0f9858f5832108ddc3e44`, signed APK SHA256 `c7b56c370515a3dfecc226d577c680eff503e479b41eb30031a2d96a798240a7`, receipt `/private/tmp/oppo-v7-install-20261021/INSTALL_RECEIPT.json`, remains the installed artifact. New Vendor choice entry needs the coordinated isolated v8 candidate; no new APK artifact is built/signed/installed here. Existing v7 response shapes remain unchanged. New client should be installed/verified before enabling this complete flow; packaging/installation requires a later authorization.

## Implemented policies
The owner resolved the body-part policy: BOTH Pig/Cow actual post-slaughter scale weight includes head, skin/hide and feet; excludes organs/offal. Local operational definition only, not universal. Estimate remains 80% of live grams with existing exact rounding; neither estimate nor live weight fills actual measurement. Actual measurement remains mandatory for invoice/dispatch, with existing approval, actor/time, revisions, reasons, history and locks. Historical records unchanged, not retrospectively certified.

Vendor-only own-business explicit collect/decline is new. Unset is null, never decline; no disposal instruction, no weight arithmetic, no financial effect. Independent endpoint, dedicated transaction/audit and optimistic animal/choice revisions preserve existing v7 DTOs. Ownership/revision changes invalidate choice. Choice can be made after invoicing but is locked at Inspector assignment. Assignment requires current explicit choice. API contract is in CARCASS_WEIGHT_API.md and `/private/tmp/ORGAN_COLLECTION_API_CONTRACT_20261022.md`. No digital offal quantity capture is implemented or claimed.

Operations gates require exact owner policy acknowledgement: AINV internal application bill reference; separate paper official receipt; financial corrections/reversals disabled. New cash entry rejects generated AINV as paper receipt. Billing Staff alone writes invoices/cash; municipal administrator reads oversight. Inspector retains assignment authority, active verified owning-vendor destination and current measurement checks. Unpaid dispatch is permitted, payment due same Manila day. Existing verification, municipal/Vendor scope, audits, snapshots, locks and tracking authorization remain.

## Configuration and fee creation — proposed only
`deployment/owner-policy-activation.proposed.json` records the approved local definition and operations acknowledgement while retaining:
- ON: accountManagement, activation, animals, inspection.
- OFF: carcass, billing, payment, delivery, tracking.

Preserve actual `/etc/secrets/production-release.json` identity/origin/scope, all secrets, stable cursor key, IAM/runtime settings, CORS, AutoDeployOFF and WEB_WRITES_ENABLED=false. No rehearsal bypass or client-side authority changes.

Fee target `com-slaughterhouse-app/(default)/operation_fee_schedules/ph-quezon-calauag`. Reuse prior read-only ABSENT observation `2026-10-21T14:46:52.755Z` only as historical evidence. On later explicit authorization, re-read transactionally and CREATE ONLY the approved `schedule` from `deployment/approved-fees.owner-20261021.proposed.json`: approved version1, PHP/perAnimal, Coral1500 + Delivery2500 + Ante/post-mortem1000 + Facility4500 =9500 centavos. Pig/Cow only; independent of weights/collection. No table fee, other-species fallback or historical recalculation. Stop on existing/conflict/unknown outcome; no overwrite or blind retry.

## Minimum release and gate sequence
1. Review/freeze both exact source candidates; later authorize scoped code release with all gates unchanged. Verify policy-compatible rollback, health/admin/effective capabilities, existing v7 reads and new scoped choice contract. Prepare/verify compatible new Android client; do not replace signed client with debug.
2. Separately authorize only carcass=true with approved local definition. Inventory Staff records actual post-slaughter carcass measurement from the scale after current Inspector approval; Vendor makes explicit collect/decline. Compare same animal/revisions on Web. No invented values/automatic estimate submission.
3. Separately authorize create-only fee provisioning/read-back, then billing=true. Billing previews validated owning-vendor/animal/current measurement and exact PHP95 itemization; issues once. Verify duplicate guard, internal AINV, audit/snapshot and Vendor/Web same IDs/amount/balance. Payment remains off.
4. Enable delivery=true only when compatible Vendor choice entry is available. Inspector confirms Vendor choice, verified destination and active Delivery Staff, assigns once, then authorized assignee updates status. Dispatch may be unpaid. Measurement/choice are locked by existing invoice/assignment boundaries; no new assignment authority.
5. tracking=true only if fresh positions are required; payment=true separately only for actual cash against the existing paper official-receipt number. These are not prerequisites for unpaid dispatch. Corrections/reversals remain disabled.

Minimum new gates for measured invoice/unpaid delivery: carcass+billing+delivery. Add tracking for fresh sharing, payment for cash recording only. Reuse READY indexes; this support adds only direct document reads/writes. Runtime transaction rights and authenticated physical workflow acceptance remain to be verified at activation, not proven by synthetic tests. No known missing IAM grant is asserted.

## Tracking and physical evidence limits
Foreground/resumed sharing only, about15s; no background service/screen-off guarantee. Stale after45s, pause after3 failures; coarse accuracy remains honest. Vendor own-business authorized latest position/time only; delivery completion stops new writes and retains last point as completed, not live. No invented destination coordinates/geocoding/arrival proof. Historical unexplained reactivation and timing/concurrency uncertainty remain. Prior/manual emulator and supplied OPPO evidence are not captured HTTP or new physical flow acceptance. Mandatory new UI guidance/choice requires new client, despite v7 read compatibility.

## Remaining concrete release conditions
No unresolved carcass/fee/numbering owner policy question remains for this limited flow. Financial corrections stay disabled. Code is local/uncommitted; Android compatible choice candidate must finish matching-contract validation and later packaging/signing/installation. Physical contents of a scale cannot be proven from a numeric value; Inspector SOP and supervised acceptance must use this local definition. No digital offal quantity capture or disposal policy is authorized by this choice feature.

## Rollback
On unexpected/unknown writes, stop and read back known IDs, never automatically resubmit. Set tracking/delivery/billing/payment/carcass=false first; preserve current four ON and all secrets/runtime/cursor values; verify health/admin/effective capabilities. Only then may code revert to exact7edb61abe38b3651a778986b4a28e7857b624d00 (its loader rejects five gates ON). Preserve fee version, invoice/payment amounts/snapshots, paper references, measurements/revisions, choice documents/audits, assignments/retained positions and indexes. No data deletion, reclassification, recalculation or reversal. Paused rollback can prevent new Vendor choice writes without losing recorded choices; baseline old code cannot display new choices.
