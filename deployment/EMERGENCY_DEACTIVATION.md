# Emergency deactivation permission proposal

Review only. Intended release: **business writes paused; authorized emergency deactivation retained**. Preserve `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/render-readonly-pilot.json`; the name does not establish effective IAM. No live permissions were inspected or changed.

Manual observation reported by the user, 2026-10-16: the **Render Read and Deactivate** custom role is assigned to the existing `render-readonly-pilot` service account. Record this as **manually observed, not runtime-tested**. The agent has not inspected the live binding or tested the runtime credential, effective permissions, transaction, Auth disablement or revocation.

## Exact operations

`server/accounts.js:315` handles `POST /api/accounts/:uid/deactivate` with an empty JSON object. The caller must be an authenticated allowlisted web administrator. `owned()` reads the managed account, requires the configured municipality, and rejects allowlisted administrator targets. No arbitrary target/account changes are accepted.

| Sequence | Actual operation | Required IAM |
| --- | --- | --- |
| Authenticate administrator | `verifyIdToken(token, true)`; SDK checks disabled/revoked status through a user lookup | `firebaseauth.users.get` |
| Resolve eligible target | Get `managed_accounts/{uid}` | `datastore.entities.get` |
| Begin transaction and re-read target | `runTransaction`, `tx.get(managed_accounts/{uid})`; automatic retry/rollback as needed | `datastore.databases.get`, `datastore.entities.get` |
| Transactional closure | `tx.update(managed_accounts/{uid}, {status:'inactive'})` | `datastore.entities.update` |
| Transactional closure | `tx.set(mobile_memberships/{uid}, {status:'inactive'}, {merge:true})`; same merge for `Users/{uid}` | `datastore.entities.create` **and** `datastore.entities.update` (merge-upsert, not update-only) |
| Transactional audit | `tx.create(account_audit/{newId}, {action:'deactivated', actorUid, targetUid, at})` | `datastore.entities.create` |
| Auth cleanup after commit | `auth.updateUser(uid, {disabled:true})`; installed SDK then calls `getUser(uid)` | `firebaseauth.users.update`, `firebaseauth.users.get` |
| Auth cleanup after disabling | `auth.revokeRefreshTokens(uid)` updates the user's valid-since time | `firebaseauth.users.update` |

Sources: `server/accounts.js:91` transaction helper; `server/accounts.js:188` target check; `server/access.js:8` verifier; installed `firebase-admin/lib/auth/base-auth.js` update/revoke implementation and `auth-api-request.js` valid-since update. Permission mapping: [Firestore RPC IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam), [Firebase Auth permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth).

## Access closure and partial failure

- **After a successful Firestore commit:** `mobile_memberships/{uid}.status` is inactive. Both mobile middleware paths re-read membership on every request (`server/mobile.js`, `server/animals.js:84`); animal middleware also protects mobile operations/tracking routes. A still-valid token cannot bypass inactive membership. With Auth available and the token otherwise valid, the next request returns 403; a disabled/revoked token may instead return 401. An Auth/storage outage returns an error and does not authorize access. Already-authorized in-flight requests are not cancelled, and previously downloaded data is not erased.
- **Membership closure alone is not global Firebase logout.** Until Auth cleanup succeeds, the identity may remain enabled and sessions unrevoked; other services that only inspect tokens are outside this application's membership guarantee. Web administrator access uses the UID allowlist independently; those administrator targets are protected. Direct Firestore clients remain subject to the separately retained deny-all rules.
- **Firestore transaction failure before commit:** membership/status/audit changes are atomic, so no partial closure from that transaction. Auth cleanup is not attempted. Raw failures return 503 with the generic account-operation retry message; an explicit missing-target error returns 404. A lost commit response can make the outcome uncertain: inspect current status before retrying; do not assume failure means no commit.
- **Firestore committed, then either Auth call fails:** inactive records and audit remain committed. Response is 503: `Mobile access was deactivated, but Firebase session cleanup needs administrator retry.` There is no automatic reopening or background cleanup job. The second call is skipped if `updateUser` fails, including failure of the SDK's post-update lookup; the Auth user may already have been disabled in that case.
- **Retry the same endpoint after the cause is resolved:** already-inactive targets are accepted; closure is reaffirmed, a new audit event is appended, and disabling/revocation are retried. Success is 200 `{"success":true}`. Repeated audit events are expected; the endpoint has no idempotency key. A missing Auth user currently produces the same cleanup-required 503 and needs administrator review.

Existing local tests cover membership-first cleanup failure/retry, next-request membership denial, protected/cross-scope targets and all-gates-off deactivation (`server/accounts.test.js`, `server/mobile.test.js`). Those tests do not validate deployed IAM or network behavior; no application code changed and no test suite was repeated for this documentation.

## Minimum permission proposal

`runtime-read-deactivate-role.proposed.json` contains the seven-permission custom-role proposal for the existing runtime identity. Reads require entity get/list, transaction begin/rollback and Auth user get. Relative to that baseline, the **three additions** are `datastore.entities.create`, `datastore.entities.update`, `firebaseauth.users.update`. Viewer-only permissions cannot satisfy these operations. Verify actual effective grants first: do not assume the baseline is already present.

Proposed binding target: the existing service-account principal represented by `render-readonly-pilot.json`, in approved project `com-slaughterhouse-app`; obtain the principal identity privately from existing credential metadata/administrative records, never paste the private key. No new identity, key or credential-file replacement is proposed. The role file is a proposed definition, not an applied binding or proof of IAM custom-role acceptance.

These permissions cannot be restricted to an `inactive` field transition or this HTTP endpoint by the role itself. Firestore document IAM is broader than the four paths above; Auth user update can change more than disabled/revocation fields. Retain application authorization, scope checks, deny-all direct-client rules and nine false gates. Do not describe a project binding as municipality- or collection-limited. No user creation/deletion, document deletion, email sending, index administration, IAM administration, Owner, Editor or broad Firebase Admin role is needed. Validate any proposed database IAM condition separately before relying on it; none is invented here.

## Cursor command review and next manual steps

The reviewed command in `README.md` stores the key in a unique `~/.slaughterhouse-secrets-*` directory, outside the current repository; directory 0700, exclusive file creation (`wx`) with mode 0600 and umask 077. It prints only the path, generates 32 cryptographic random bytes as 64 hex characters and writes no newline. The script contains no secret literal and uses no secret shell argument. **Executed locally with explicit user authorization on 2026-10-16**; no key value is recorded here or sent to Render. Storage is plaintext with filesystem permissions, not encrypted; keep the directory outside Git and any shared/synced location, with access limited to the operator. Clipboard copying is optional and may expose it to clipboard history/sync. Reuse the generated key; do not regenerate for ordinary configuration updates.

1. Read-only manual review: identify the existing credential's service-account principal and inspect its effective IAM in the approved project, including inherited grants, conditions and denies. Preserve credential contents, Firebase variables and administrator allowlist. Do not export key material into evidence.
2. Role assignment is now manually observed as reported above; no further role binding is requested by this package. Verify that its actual permission set matches the proposal and confirm runtime SDK operations and permission propagation before acceptance. Do not substitute a broad predefined role.
3. Plan a separately authorized acceptance using a designated account/fixture: verify transaction closure/audit, disabled Auth user, revocation, next-request denial and cleanup retry. This changes live state if run in production, so it is not authorized by the current request. Do not deactivate a real user merely to test permissions. Local/emulator evidence alone cannot certify effective IAM.
4. The cursor key has been generated/stored locally; use the existing generated file for the raw environment value and the prepared local `production-release.json` from `README.md`. Render secret-file saving triggers deployment. Do not upload, save live settings or deploy during this preparation.

The role assignment is manually observed; effective runtime IAM and deactivation acceptance remain untested. The settings response `canDeactivate:true` is configured availability, not a live permission probe.
