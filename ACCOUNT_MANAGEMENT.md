# Treasurer-managed mobile accounts

Implemented locally on 2026-10-11. No live accounts, configuration, rules or indexes were changed.

Confirmed municipality: **Municipality of Calauag, Quezon, Philippines**. Local default scope: `ph-quezon-calauag`. The source display and invoice fallback now use Calauag. The account switch remains disabled in live configuration.

## Workflow

The web dashboard has a **Mobile Users** page at `/users`. An authenticated, allowlisted web administrator supplies the person's name, email and portal role. Vendors must be selected from active, scoped, already approved businesses; creating an account does not create a business or an invoice.

Before account creation, the administrator can register the confirmed business, address, contact number, email, animal type, market name, market section and stall number. The server assigns a stable vendor ID and reserves the normalized market/section/stall combination transactionally. Duplicate stall registration is rejected. Vendor registration creates no invoices or payments. Stall reassignment and additional-stall management require a later reviewed workflow; they are not implemented by this form. Personal contact numbers are optional and do not participate in authentication or SMS delivery.

The server reserves the normalized email and records setup intent before creating a new Firebase identity. Existing Auth accounts are rejected without alteration. The initial password is randomly generated, never displayed, and the new Auth account starts disabled. Protected profile/membership writes, role/scope claims and activation are performed in sequence. Failures leave a visible, closed setup record; retrying creation does not duplicate the identity. Interrupted or failed provisioning requires administrator review; automated repair/reactivation is not implemented. Deactivation is available to stop interrupted setup.

For a vendor, successful setup activates the mobile membership. Staff and Inspector memberships remain **pending** because those operational portals have not been implemented. All three roles can receive password setup requests, but a prepared account is not proof its portal is available.

Staff functions are explicitly assigned: `inventory`, `billing` and `delivery`. The administrator can change these through the account card or `POST /api/accounts/{uid}/permissions` with `{ "staffPermissions": ["inventory"] }`. A transaction updates both the directory and protected membership and records the before/after assignment in account history. Changes do not activate pending accounts. Animal inventory and inspector server endpoints are now implemented locally; see ANIMAL_WORKFLOW.md. Android operational screens, billing and delivery operations remain pending.

Firebase sends a password reset email as the setup invitation. Acceptance means Firebase accepted the request, not that an inbox received it. The treasurer does not receive the password or reset link. Resend is limited to one attempt per account per minute using a transaction. Delivery failure retains the original account and can be retried. Emulator invitations generate local action codes and never deliver real emails.

Deactivation marks the membership inactive before disabling the Firebase identity and revoking sessions. If Firebase cleanup fails, membership access is already closed and the UI reports the cleanup error. Account deletion, editing roles, reactivation and automatic adoption of historical accounts are deliberately not offered yet.

The directory and business dropdown paginate 25 records at a time. Search explicitly applies to loaded users. History shows the latest 20 account events; events record administrator UID, target UID, action and timestamp, without passwords or links. This is a bounded operational history, not a completed municipal compliance audit system.

## Storage and authorization

- `managed_accounts/{uid}`: administrator-only directory and setup/delivery state.
- `account_email_reservations/{sha256(normalizedEmail)}`: unique setup reservation. Preserve until an approved recovery process handles it.
- `Users/{uid}`: new UID-keyed personal profile. Existing identities/profiles are not adopted or rewritten by creation.
- `mobile_memberships/{uid}`: protected role/scope/ownership/status used by mobile authorization.
- `account_audit/{eventId}`: append-only events through the account router.
- `market_stall_assignments/{assignmentHash}`: protected normalized stall reservation linked to a vendor business and municipality.
- `vendor_audit/{eventId}`: business registration event with actor, vendor ID and timestamp.

The account router is after web administrator authentication and before the billing write guard. It has its own disabled-by-default gate. `/api/mobile` cannot reach it. The route accepts only vendor/staff/inspector roles and derives municipal scope from server configuration. Existing web administrator UIDs are protected from account deactivation/invitation endpoints. All direct Firestore clients remain denied.

## Activation prerequisites

Do not enable in live configuration yet. Review the exact changes first:

1. Municipality confirmed by the owner: Calauag, Quezon, Philippines. Review `ph-quezon-calauag` as the stable scope before live activation.
2. Approve canonical vendor business records with scope and ownership. Historical `vendorID` strings do not establish ownership.
3. Confirm the server Firebase project and `VITE_FIREBASE_API_KEY` identify the same approved project. Invitation delivery uses this existing client identifier on the server, never an Admin private key in the browser.
4. Review email templates/delivery and test with an approved mailbox. Decide email-verification policy; current mobile API does not require verified email.
5. Review HTTPS hosting, IAM, rate controls and the added local `account_audit`/scoped-vendor index definitions. Indexes have not been deployed; emulators do not establish production index readiness.
6. After explicit approval, set `ACCOUNT_MANAGEMENT_ENABLED=true` and the approved scope. Official business mutations remain independently paused by `WEB_WRITES_ENABLED=false`.
7. Conduct the approved vendor physical-phone pilot before broader onboarding. Staff/Inspector workflows still need their own policy, endpoints and device validation.

## Validation

- `npm run test:server`: 47 passing tests, including 12 account tests covering authorization, duplicate prevention, rejected ownership/role fields, preserved claims, pending staff/inspector membership, provisioning failure, invitation retry, membership-first deactivation, business registration, optional contact validation and staff function assignment.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-bundle warning remains.
- `npm run rehearsal:verify:accounts`: 18 checks passed with real local Firebase Auth and Firestore. Tests register a unique synthetic business through the API, reject duplicate normalized stalls, create identities without resetting the running mobile demo, consume a local setup code, sign in to the mobile API and verify denial after deactivation, including rejection of late setup completion. Staff function assignment/reassignment persists in both protected documents without activating pending access. Test-owned records are removed afterward.

Run the emulator verification with both hosts explicitly set to `127.0.0.1:9199` and `127.0.0.1:8180`, after the documented guarded emulator launcher has finished starting. Never use live credentials or run it against production. UI typechecking/build completed; an interactive browser walkthrough of the Users page is still required.
