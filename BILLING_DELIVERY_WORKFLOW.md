# Animal billing, recorded payments and delivery — synthetic rehearsal

Current production boundary (2026-10-16): historical operations/tracking reads are mounted with authorization while all nine manifest capabilities are off. The production loader rejects enabling `carcass`, `billing`, `payment`, `delivery` or `tracking` until policy-dependent implementation is reviewed; legacy flags cannot override this. The flow below remains a synthetic emulator contract, not approved official amounts, numbering, payment or delivery policy. Android foreground tracking is implemented; physical GPS/lifecycle/HTTPS acceptance remains open. Use ALL_ROLE_DEMO.md for the supported-onboarding screen sequence and DEPLOYMENT_CHECKLIST.md for the single current production-blocker list.

Tracking follow-up (2026-10-13): read TRACKING_API.md. Automatic clients now have a separate latest-position GET/POST channel that does not advance invoice revisions or create a full financial audit per GPS point. The old manual endpoint delegates to this storage and mirrors its position for existing viewers without changing invoice revision. The earlier description below of every location update as an audited invoice revision is superseded. The web can poll one selected delivery; Android foreground automation remains pending its handoff.

Implemented 2026-10-12. This completes the basic rehearsal workflow after animal inspection. Official municipal rates, invoice/receipt numbering, cash-handling rules and a production pilot remain unapproved. No live Firebase changes or deployment occurred.

## Simple workflow

1. Inventory registers an animal and an inspector approves its current revision.
2. Active billing staff review the displayed animal and approved fee schedule, then issue one invoice per animal. Integer centavos are calculated on the server. The invoice and animal link are written transactionally; duplicate/racing requests have one winner. Billed animals cannot be corrected through the inventory endpoint.
3. Billing staff record an externally verified **full payment**, amount, method (`cash` or `bank_transfer`) and receipt reference. Partial payments, online payment processing, refunds and voiding are not implemented. The receipt reference is normalized/reserved uniquely per municipality; repeated payment is denied. This records staff confirmation, not evidence from a bank or an official digital receipt.
4. Active delivery staff assign a paid invoice to themselves from Android, with its destination. The server also accepts another active delivery staff UID in the same municipality. Only the assignee advances `assigned` → `in_transit` → `delivered`, with confirmation notes.
5. The assignee may explicitly share a recent location while assigned/in transit. Android requests foreground fine/coarse permission only on the share action; no background permission or tracking service is added. Each share stores the latest coordinates, accuracy and capture/receive times. Completed deliveries reject location updates. Vendor and web viewers refresh for the latest status/location; continuous tracking is not claimed.

## API

Mobile prefix: `/api/mobile/operations`. Web prefix: `/api/operations`, after the existing allowlisted administrator middleware. Mobile requests reuse the animal Auth verifier and active membership/role/scope claim checks. Membership permissions are reread on each request.

| Method and suffix | Contract |
| --- | --- |
| GET `/settings` | enabled, canBill, canDeliver, feeSchedule/feeMessage |
| GET `/eligible?cursor=...` | Billing only; approved unbilled animals; bounded register traversal, potentially empty filtered page with continuation |
| GET `/invoices?cursor=...` | Billing/delivery scoped invoices; vendors own business only; 25 items and signed account/scope/endpoint-bound cursor |
| GET `/invoices/{id}` | Accessible workflow invoice, fee breakdown, payment/receipt and delivery |
| POST `/animals/{id}/invoice` | Billing only: expectedRevision, feeScheduleVersion, dueDate (`YYYY-MM-DD`) |
| POST `/invoices/{id}/payment` | Billing only: expectedRevision, amountCents, receiptReference, method |
| POST `/invoices/{id}/delivery` | Delivery only: expectedRevision, assigneeUid, destination |
| POST `/invoices/{id}/delivery/status` | Assigned staff only: expectedRevision, status, notes |
| POST `/invoices/{id}/delivery/location` | Assigned staff only: expectedRevision, latitude, longitude, accuracyMeters, capturedAt (timezone-bearing ISO time) |

Requests accept only documented fields. Monetary inputs are safe integers, full payment must equal the stored total, location must be no more than five minutes old (one minute future tolerance), coordinates must be valid, and accuracy must be 0–1000 m. All mutations have transactional audit snapshots in `operation_audit`. Conflicts require refresh and explicit resubmission; Android never automatically retries a mutation. Logout, account switching and permission removal clear data/cancel pending work; late responses are discarded.

## Storage and gates

`operation_fee_schedules/{scope}` contains status `approved`, positive integer version, basis `perAnimal`, currency `PHP`, and nonnegative integer corralCents/deliveryCents/inspectionCents/facilityCents; total must be positive. The Android adapter creates a **synthetic-only** schedule for SCOPE-A if absent: PHP 15 + 25 + 10 + 45 = 95 per animal, regardless of species/weight. These are public test values, not Calauag's official rates.

Generated `invoices` retain the existing canonical vendor invoice fields and add workflow `animal`, totalCents, animalId/animalRevision, feeScheduleVersion, revision, payment and delivery. Deterministic synthetic invoice IDs use an AINV hash of municipality and animal ID. This is not an approved official invoice-numbering scheme. `operation_receipts` reserves normalized receipt references; `operation_audit` records each transition. The existing vendor invoice API and web invoice/history collections read generated totals/statuses. Legacy web PATCH/DELETE refuses animal-workflow invoices, preserving receipt and animal links.

Production mounting requires ANIMAL_WORKFLOW_ENABLED and ANIMAL_OPERATIONS_ENABLED, and additionally an actual `demo-*` Firestore project with both explicitly configured loopback emulator hosts. The new switch **cannot enable the workflow on a live project**. Rehearsal adapters mount the actual router after the existing strict demo/network guard. Existing WEB_WRITES_ENABLED, Auth accounts, production configuration, client deny rules and deployed indexes remain unchanged.

Potential future production indexes (not deployed or validated here): invoices on municipalScopeId + workflow + document ID; vendor invoice workflow additionally vendor_id. The existing invoice and animal indexes remain relevant. Real rates/numbering, reversals/refunds, production index review and real-account activation require separate work.

## Validation and setup

See the Android MOBILE_INTEGRATION_RESULTS.md and rehearsal/README.md for final counts and device evidence. New server tests exercise actual router/store functions with synthetic transaction fixtures; the Android `rehearsal/verify-operations.mjs` additionally verifies actual Firebase Auth/Firestore transactions with unique fixtures and cleans only its own scope. It does not reset the demo.

The web page `/operations` displays scoped invoices, receipts and delivery/location history with pagination, refresh, disabled/error/empty/loading states. It remains gated in the normal live web application. Interactive browser rendering and physical-phone GPS require a later pilot; Android emulator UI and API tests are recorded separately.
