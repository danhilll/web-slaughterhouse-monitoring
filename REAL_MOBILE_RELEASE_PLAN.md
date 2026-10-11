# Real mobile access: release preparation

Updated: 2026-10-11. Target Firebase project: `com-slaughterhouse-app`.

## Evidence and current boundaries

- Android rehearsal branch: `isolated-mobile-integration-rehearsal`, verified pushed commit `8c70915`.
- Local emulator API rehearsal: 14 checks reported passed. Saved Android instrumentation XML independently checked: 2 tests, zero failures/errors/skips. Device: isolated `Mobile_Rehearsal` AVD, Android 17/API 37.
- These checks use synthetic accounts and local emulators. Production token verification, hosting, IAM, indexes and physical-phone access still need release validation.
- The earlier read-only main-project inventory found three Auth accounts, four historical `Users` documents, no business collections and no municipal claims. This is dated inventory, not a fresh live snapshot.
- Direct Firestore client access remains denied. Web administration retains its UID allowlist. Official web writes remain paused. No production provisioning is authorized by this document.

## 1. Approve the pilot identity and ownership

Collect the first vendor's exact existing Auth UID, municipality and confirmed business identity. Treat the person and business as separate entities. Do not infer ownership from names, email or the historical `vendorID`. Resolve ambiguous historical references before using them.

The existing web administrator can retain web access without gaining a mobile vendor role. Grant a mobile role to that UID only if its business ownership is explicitly approved. Staff and inspectors remain outside this vendor pilot; their operational endpoints are not implemented.

Required decisions:

| Decision | Current state |
| --- | --- |
| Pilot vendor Auth UID | Awaiting owner |
| Municipality name and stable scope ID | Awaiting owner |
| Canonical business ID and verified ownership | Awaiting owner |
| Business name, address, contact, email, animal type and creation date | Awaiting verified values |
| Email verification requirement | Must be decided explicitly; current mobile API does not require it |
| Approved HTTPS API host | Not yet selected/verified |

Do not commit personal account mappings or credentials to this plan.

## 2. Prepare a reviewable provisioning preview

After the decisions above, prepare a script with preview as the default. Recheck exact project identity and existing Auth/profile/business state before proposing writes. Show document paths and changed field names without printing credentials or passwords. Detect conflicts and stop. Do not automatically create identities or assign ownership at sign-in.

The current API contract in `server/mobile.js` requires:

| Resource | Required pilot values |
| --- | --- |
| Auth custom claims | `municipalRole: "vendor"`, `municipalScopeId: <approved-scope>` |
| `mobile_memberships/{uid}` | `role: "vendor"`, `status: "active"`, `municipalScopeId`, `vendorBusinessId` |
| `vendors/{businessId}` | Matching `id`, `municipalScopeId`, `status: "Active"`, nonblank `name`, string `address`/`contact_number`/`email`, `animal_type` in `Cow`/`Pig`/`Both`, valid date-only `created_at` |

Preserve the existing Auth UID, unrelated custom claims, historical `Users` documents and web administrator allowlist. Retain prior claim/document values privately for targeted rollback. Since Auth claims and Firestore writes cannot share one transaction, explicitly handle partial failure; grant active membership only after reviewed business and claims agree. No invoices or sample businesses are inserted into production for demonstration.

Test provisioning preview, conflict handling and rollback in the synthetic environment. Present the exact proposed live changes for owner approval before executing them.

## 3. Prepare the municipal API release

Select the HTTPS runtime and review its Firebase credentials/IAM, allowed origins, logs, request controls and required Firestore queries/indexes. Keep `/api/mobile` read-only and separate from web administrator access. Use an appropriate stable cursor signing secret for the chosen instance topology; the current default secret is random per router instance and is unsuitable for shared pagination across multiple instances.

Validate real project token verification and the query's index requirements in an approved environment. Keep schema/index/backend failures visible as errors, with no unrestricted scan fallback. Obtain separate approval before deploying indexes or the API. Confirm official mutation routes remain paused.

## 4. Prepare Android production configuration

Confirm Android package `com.slaughterhouse.app` and review signing/build identity. After explicit approval, register it in the municipal project and review the generated client config before replacing the old production config. Keep the rehearsal variant and its demo configuration separate.

Build with the approved HTTPS mobile API origin using `-PmobileApiBaseUrl=https://<approved-host>`. Never copy Admin credentials into Android. An empty API origin must not be treated as a working production setup.

## 5. Authorize provisioning and conduct the real pilot

After reviewing the preview, authorize only the approved account/business changes. Refresh the pilot's token and verify exact claim/membership agreement. Test on a physical phone over Wi-Fi and mobile data:

- Correct profile, honest empty invoice history where no official invoices exist.
- Vendor A cannot access Vendor B's records or web administrator routes.
- Logout/account switching clears prior state; offline/backend failures remain distinguishable from empty history.
- Membership deactivation blocks subsequent requests without relying on token expiry.
- Mobile and direct Firestore clients cannot modify fees, invoices, payment status or memberships.

Record results before broader onboarding. Staff/inspector workflows and municipal billing activation require their own policies, authoritative fee rates, server workflows and tests.
