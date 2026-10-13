# Animal ownership and inspection foundation

Implemented locally on 2026-10-11 for Municipality of Calauag, Quezon, Philippines.

This milestone records individual animals, their vendor ownership and measured weight, followed by a single inspector's verification. It does not generate invoices or provide delivery tracking. Existing aggregate slaughter records are not migrated automatically.

## Permissions and flow

1. Treasurer registers the confirmed vendor business and market stall through Mobile Users. New accounts use email/password invitations. Staff can be assigned inventory, billing and/or delivery functions.
2. An active inventory staff member, or an allowlisted web administrator, records an animal identifier, vendor business, species, weight and weighing time. The record starts pending inspection.
3. An active inspector verifies ownership, species, measured weight and safety details, and submits approval or rejection with notes. Only one decision succeeds for that revision, even when requests race. Web administrators cannot impersonate inspectors.
4. Corrections require the current revision and a reason. They increment the revision, preserve the audit trail and clear approval. Reinspection is required. Records marked as billed or dispatched require a future controlled reversal workflow before correction.
5. Vendors read only their own animals. Inventory staff and inspectors read within their municipality. Billing-only and delivery-only staff receive no animal-register access in this milestone.

Staff/inspector accounts created by the account page remain pending. Assigning functions does not activate an account. Android operational screens and an approved activation procedure are still required.

## API contract

All requests use `Authorization: Bearer <Firebase ID token>`. Direct Firestore client access stays denied. The server checks revocation, active protected membership, municipality and agreement between membership and role/scope claims on each mobile request. Staff functions come from the protected membership, so permission removal affects subsequent requests without replacing tokens.

Web namespace: `/api/animals`. Android namespace: `/api/mobile/animals`.

| Method and suffix | Result and permission |
| --- | --- |
| GET `/settings` | Feature status and recording/inspection permissions |
| GET `/vendors?cursor=...` | Inventory/admin selection of active scoped vendor IDs, names and stall references; no contact details |
| GET `/?cursor=...` | Up to 25 animals and `nextCursor`; vendor ownership enforced |
| GET `/{id}` | One accessible animal |
| GET `/{id}/vendor` | Inspector-only animal-bound business name and market/stall identity; no private contacts |
| GET `/{id}/history` | Latest 20 events for authorized inventory/admin/inspector personnel |
| POST `/` | Inventory/admin registration |
| POST `/{id}/correction` | Inventory/admin correction with optimistic revision check |
| POST `/{id}/inspection` | Inspector decision with optimistic revision check |

Registration example (synthetic vendor ID; select an existing business ID in actual use):

```json
{
  "identifier": "TAG-001",
  "identifierType": "manual",
  "vendorBusinessId": "VEN-example",
  "species": "Pig",
  "weightGrams": 85000,
  "weighedAt": "2026-10-11T02:00:00.000Z"
}
```

`species` is `Cow` or `Pig`; individual animals cannot be `Both`. Weight is a positive safe integer in grams: 85 kg = 85000 grams. Weighing time must include a timezone and cannot be in the future beyond one minute of clock tolerance. Animal ID and municipality are server assigned. Identifiers are normalized and transactionally reserved per municipality/type. `rfid` stores a tag reference only; reader hardware integration and scale verification are not implemented.

Correction body: `vendorBusinessId`, `species`, `weightGrams`, `weighedAt`, `expectedRevision`, `reason`. Identifier changes are not supported. Inspection body:

```json
{ "decision": "approved", "expectedRevision": 1, "notes": "Ownership, animal details and weighing evidence verified." }
```

Decision may be `approved` or `rejected`. Returned records include `id`, the registration fields, `municipalScopeId`, `revision`, timestamps/actor UIDs and `inspection` (status, revision and decision evidence). Lists return `{items, nextCursor}`. Cursors expire after one hour and are bound to account, role, scope, ownership and endpoint. A server restart invalidates cursors when using the default in-memory signing secret; clients should restart pagination after a cursor error.

Handle 401 by ending the session, 403 as denied access, 404 as unavailable record, 409 by refreshing before retrying, and 503 as unavailable workflow/storage. Errors must never be shown as successful empty histories. No record deletion endpoint exists.

## Storage and activation

Protected collections: `animal_records`, `animal_identifiers`, `animal_audit`. Registration, correction and inspection writes include an audit event in the same Firestore transaction. The web Animal Register page is at `/animals`.

`ANIMAL_WORKFLOW_ENABLED=false` is the default. Account management has its own independent default-disabled gate; official billing remains paused. No live configuration, data, rules or indexes were changed. Review and deploy required indexes before any approved live pilot; emulator checks do not validate production index availability. The web registration form currently loads approved businesses through the separately gated account-management API.

Future billing must transactionally bind an invoice to the approved animal revision and prevent duplicate billing. `animalBillingEligible` is a readiness helper, not invoice issuance. Invoice calculation, official rates, payments/receipts, delivery assignments and GPS updates remain separate milestones.

## Verification and Android handoff

Server tests cover permission separation, weight validation, vendor isolation, corrections, stale decisions, duplicate identifiers and signed pagination. Guarded local Auth/Firestore checks exercise actual transactions, approval races, audit snapshots, vendor reassignment and direct-client denial. The web UI has passed typecheck/build; an interactive walkthrough remains pending.

Next Android work: read this contract and ACCOUNT_MANAGEMENT.md; implement inventory registration/correction and inspector verification screens against these endpoints in the isolated rehearsal variant. Use the vendor selection endpoint, preserve exact gram values, send the displayed revision, and clear records/pending requests on logout and account switching. Add synthetic active inventory and inspector memberships only in the emulator. Test wrong roles/scopes/vendors, stale decisions, permission removal, error recovery and correction requiring reinspection. Keep production Firebase configuration, real users and direct client rules unchanged. Billing and GPS should remain visibly unavailable until their server workflows are implemented.

## Inspector vendor identity — 2026-10-12

Read-only **GET /api/mobile/animals/{animalId}/vendor** is available only to an active inspector through the existing animal authentication middleware and enabled workflow. Membership/role/scope claims must agree. The animal and its linked canonical business are read together in a Firestore transaction. Other roles (including inventory, billing, delivery, vendors and web administrators) are denied. The inventory-only /animals/vendors selector is unchanged. Query filters are not accepted.

The response contains exactly vendorBusinessId, businessName, marketName, marketSection and stallNumber. Missing/blank market or stall fields are JSON null, never fabricated. Missing, inactive, invalid or inconsistent businesses return a municipal-review 503; cross-municipality animal/business references return generic 404 without identity data. No email, phone, home address, passwords, Auth identities or unrelated business information is returned. Existing no-store headers apply.

Android binds identity to the selected animal ID, business ID and displayed revision, validates the returned business ID, and discards details/acknowledgment on selection changes, correction, errors, logout or account switching. Approval requires successfully loaded complete business/stall fields and explicit review of the business, ownership evidence and animal details. Missing details or failed loading block approval with a municipal-review message; rejection still requires notes. The acknowledgment is a UI review step, not proof of ownership. It is not added to the inspection request or stored as evidence. Existing expectedRevision and single-decision transactions remain authoritative; conflicts refresh without automatically retrying.

This local contract replaces the previous Android inspector identity limitation. Real account activation, production deployment/index readiness, billing, payments, delivery and GPS remain separately authorized work. Validation results are recorded in the Android MOBILE_INTEGRATION_RESULTS.md.

Inspector identity validation (2026-10-12): 52 server tests passed, including 15 animal tests; 21 guarded Auth/Firestore checks passed. Android passed 40 unit tests per variant (80 executions), compilation/APK builds, lint with zero errors, and all four emulator device tests. Device review verified business/market/stall display, mandatory acknowledgment, missing-stall and identity-503 approval blocks, manual recovery, stale revision refresh with acknowledgment reset, rejection, reinspection, vendor/scope isolation and existing invoice/session behavior. A new reserved synthetic vendor fixture was completed with the existing profile schema after an intermediate test login failure; original demo vendor records stayed unchanged. Physical devices and external ownership-evidence capture remain unverified. No live account activation, configuration, rules/index changes, commit, push or deployment occurred.

## Billing, payment and delivery rehearsal — 2026-10-12

The basic Android/server synthetic workflow now continues from approved animal revision to a transactionally linked canonical invoice, externally verified full-payment/receipt entry, assigned delivery, departure/arrival and explicit foreground location sharing. See [BILLING_DELIVERY_WORKFLOW.md](BILLING_DELIVERY_WORKFLOW.md) for API, permissions, synthetic rates/numbering and production limitations. Earlier “next Android work” and unavailable-billing statements are historical.

The normal server's operations flag additionally requires a demo project and both loopback emulators; it cannot activate this workflow against live Firebase. Existing animal/index/rule configuration and WEB_WRITES_ENABLED remain unchanged. New validation: 62 server tests, 20 actual operations Auth/Firestore checks, 96 Android unit executions, five device tests, builds/lint zero errors; web typecheck/build passed. No live activation, deployment, commit or push.
