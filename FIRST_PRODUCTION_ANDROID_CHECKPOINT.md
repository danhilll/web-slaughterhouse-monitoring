# First production Android/backend policy checkpoint — review only

Prepared 19 October 2026. Limited workflow: verified, allowlisted web administrator approves business
ownership and creates an account → user completes official Firebase setup/verification → administrator
approves active membership → normal Android inventory login/registration → inspector identity review
and current-revision approval. All financial/carcass/delivery/tracking capabilities remain independently
unavailable. This document authorizes no deployment, IAM, account or gate operation.

## Exact sources and checkpoint

Web parent: `7d118982ab5594111aef29af6460815d103ee5d4`. The parent already contains the router security
migration, animal-response hardening and review-only first-workflow manifest/IAM proposals. Do not
re-stage those parent changes or bundle the original checkout's pending security/checklist/index/skill
work. This follow-up is exactly these23 paths relative to the web repository:

```text
AUTHENTICATION_POLICY.md
FIRST_PRODUCTION_ANDROID_CHECKPOINT.md
FIRST_PRODUCTION_RELEASE.md
scripts/check-email-verification-ui.mjs
scripts/check-router-ui.mjs
scripts/check-workspace-ui.mjs
server/access.js
server/access.test.js
server/accounts.js
server/accounts.test.js
server/animals.js
server/animals.test.js
server/carcass-weight.test.js
server/client-session.test.js
server/email-verification.test.js
server/hosting.test.js
server/mobile.js
server/mobile.test.js
server/operations.test.js
server/scoped-lists.test.js
src/AuthGate.tsx
src/UsersPage.tsx
src/api.ts
```

Proposed message: `fix(auth): require verified email and approved mobile membership`.
Seven runtime/UI files change: the four server auth/account entry files and AuthGate/UsersPage/api.
The rest are focused tests, verified-caller mock updates and documentation. The two existing browser
scripts only adjust their mocks for verified identities and vendor-pending/general activation; no
new rehearsal runtime or fixture feature is added. No package/lockfile or deployed-manifest change
belongs to this follow-up. The review checkout adds this document and updates only the two existing
policy/release documents beyond the previously tested 22-file snapshot; all runtime code is identical.
The running candidate and its saved evidence remain preserved separately.

Android matching source: `387fbaa80f5f6a9585b2395b41b489ea34241a05` plus 16 uncommitted paths:

```text
app/src/main/java/com/slaughterhouse/app/data/mobile/AnimalHttpApi.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/AnimalSession.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/MobileHttpApi.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/MobileRuntime.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/OperationsHttpApi.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/VendorMobileSession.kt
app/src/main/java/com/slaughterhouse/app/navigation/NavGraph.kt
app/src/main/java/com/slaughterhouse/app/ui/screens/MunicipalLoginScreen.kt
app/src/main/java/com/slaughterhouse/app/ui/screens/VendorLoginScreen.kt
app/src/main/java/com/slaughterhouse/app/viewmodel/VendorViewModel.kt
app/src/test/java/com/slaughterhouse/app/AnimalIntegrationTest.kt
app/src/test/java/com/slaughterhouse/app/MobileIntegrationTest.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/EmailAccessSession.kt
app/src/main/java/com/slaughterhouse/app/viewmodel/EmailAccessViewModel.kt
app/src/main/java/com/slaughterhouse/app/ui/screens/MunicipalAccessLoginScreen.kt
app/src/test/java/com/slaughterhouse/app/EmailAccessTest.kt
```

Android file-map SHA256 (sorted JSON):
`207a173556c2eea028dff2820f12cf0194bf33ad7c68f4fce9996f53bfa82af7`.
Its final immutable manifest is Android
`.rehearsal-runtime/first-production-release-20261019/source-manifest-bcc1753c4194.json`,
SHA256 `bcc1753c4194dda3868b12f0bfa8708fee6bf0c54f716f5adfcf764babb045bf`;
source paths/hashes remain private review evidence, not checkpoint files. Android owns its separate
commit/signing/artifact review. No Android file was edited by this backend review.

Exclude credentials, `.env`, cursor keys, keystores, APKs, private handoffs/evidence, temporary scripts,
main-checkout pending documentation/index helpers/skills, and unrelated Android map/assets work.
Neither review checkout is to be pushed, merged or staged under this preparation authorization.

## Contract comparison — source compatible; production acceptance still outstanding

| Condition | Backend behavior | Android behavior |
| --- | --- | --- |
| Missing/invalid/revoked/disabled Firebase credential |401; revocation-aware `verifyIdToken(token, true)` | Existing fail-closed logout/session handling; never treated as pending verification success |
| Valid credential with missing/false/non-boolean signed `email_verified` |403, `Cache-Control: no-store`, exact body below, before membership/data reads | MobileHttpApi, AnimalHttpApi and OperationsHttpApi all preserve the exact code and fixed public message; optional403/503 fallbacks do not swallow it |
| Verified email but pending/inactive/missing membership, mismatched role/scope or ineligible business |403 under existing endpoint-specific access-denied contract | No application session; primary `/api/mobile/me` authorization still runs after verification; approval-pending/access-unavailable message |
| Verified email and approved active membership | Role/scope/business/function checks still required | Shared pre-access controller reloads Firebase, forces a new token and then calls the normal role/profile authorization; verification alone never activates a session |
| Backend authentication service/permission failure | Safe503; SDK details not exposed | Denied initial access; no automatic promotion based on cached profile; optional workflow503 may be absent while authorized inventory remains usable |
| Recovery/verification mail request | Official Firebase email path; no server password assignment/read/reset-link return | `sendEmailVerification`, `reload`, `getIdToken(true)` and `sendPasswordResetEmail`; neutral recovery response; 60-second cooldown/max 3 requests per screen session |

```http
HTTP/1.1 403 Forbidden
Cache-Control: no-store
Content-Type: application/json
```

```json
{"code":"EMAIL_VERIFICATION_REQUIRED","message":"Verify your email address before accessing this service."}
```

The contract covers supported protected web/mobile/animal/operations requests. Unsupported writes
on the terminal read-only mobile router remain405; no fallthrough is possible. Malformed/oversized
bodies may be rejected by parsing before authorization. Normal policy pauses remain503 after access
checks. New accounts of every mobile role are pending, including vendors. Activation atomically
updates matching managed/profile/membership records and reads Auth without changing verification,
passwords or claims. Vendor activation additionally rechecks matching business assignments and active
same-scope ownership. Administrator business registration is its explicit ownership approval action.

Approval and verification may occur in either order, but BOTH are mandatory before protected mobile
access. Existing active/pending/inactive accounts and verification flags are preserved; existing
unverified users receive no exemption. Web administrators also require verification and their UID
allowlist. Recovery never activates a membership or re-enables a disabled account. The existing
undisclosed random bootstrap credential is not visible/assignable by an administrator; the user
chooses their password through Firebase's official setup/reset flow.

## Exact production topology and configuration — proposed, not applied

Use the existing same-origin Express/Vite deployment at
`https://web-slaughterhouse-monitoring.onrender.com`. Express `server/index.js` mounts profile,
animal and operations APIs from the same source/credential/configuration. Production Android
`MobileRuntime` uses `BuildConfig.MOBILE_API_BASE_URL` for all three clients when
`MOBILE_REHEARSAL=false`. The rehearsal 5002/5003 split is not production topology and is not a
prerequisite for this checkpoint. No rehearsal adapter changes are proposed here.

Preserve existing populated values. Reference: `deployment/render.env.example`; do not bulk-import
its empty placeholders. Required non-secret settings:

```dotenv
NODE_ENV=production
NODE_VERSION=22.x
SERVE_WEB=true
PRODUCTION_RELEASE_MANIFEST=/etc/secrets/production-release.json
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/render-readonly-pilot.json
FIREBASE_PROJECT_ID=com-slaughterhouse-app
VITE_FIREBASE_PROJECT_ID=com-slaughterhouse-app
VITE_FIREBASE_AUTH_DOMAIN=com-slaughterhouse-app.firebaseapp.com
MUNICIPAL_SCOPE_ID=ph-quezon-calauag
MUNICIPALITY_NAME=Calauag
ACCOUNT_MANAGEMENT_ENABLED=false
ANIMAL_WORKFLOW_ENABLED=false
ANIMAL_OPERATIONS_ENABLED=false
```

Preserve the actual current `WEB_ADMIN_UIDS`, stable server-only `CURSOR_SIGNING_SECRET`, and populated
public Firebase web `VITE_FIREBASE_API_KEY`, app ID, messaging sender and storage values. No private
value is included here. Preserve the existing credential file and identity; do not generate/replace a
key. The current server explicitly requires a credential file or supported inline credentials;
an unconfigured ambient-identity deployment must not be substituted. Keep inline credentials absent
when using that file. Avoid a stale repository `.env` in the production artifact. Leave emulator host
variables and rehearsal configuration absent. Omit CORS_ORIGIN, or set only the exact same approved
HTTPS origin. Leave PORT provider-managed. Resolve/test the actual approved Node22 patch; local
Node25 checks alone are not host certification.

Proposed provider build command, reusing the verified runtime-only dependency mitigation:

```sh
npm ci --include=dev --no-audit && npm run typecheck && npm run build && npm ci --omit=dev --ignore-scripts --no-audit
```

Start: `npm start`; health path: `/healthz`. No seeder/check-live-data command belongs in build/start.
No provider setting was saved. `--no-audit` here does not resolve/suppress the separately recorded
four advisory IDs; the old runtime-only/build isolation evidence and residual risks remain.

Android production build inputs: normal package `com.slaughterhouse.app`, correct production
Firebase app/project, `MOBILE_REHEARSAL=false`, and Gradle property
`-PmobileApiBaseUrl=https://web-slaughterhouse-monitoring.onrender.com`. The source default is empty,
so this property must be supplied and the built artifact attested. Require HTTPS; never distribute
rehearsal/debug artifacts as production. Android owns approved signing/certificate continuity,
versionCode/update compatibility and the final release artifact SHA256. No GPS/location runtime
permission is required to accept manual inventory registration and inspection; location/tracking
are excluded and must not become a first-lane gate.

Deployment is three independently authorized operations. A code deployment does not authorize an
IAM assignment or feature-manifest replacement. Keep the already committed proposal files outside
the pending 23-file code diff; their presence in the repository never applies them.

1. **Code only.** Freeze the reviewed backend commit/source map and the matching signed Android
   artifact. Record the actual deployed code/configuration and a policy-compatible rollback artifact.
   Verify existing startup/read permissions and preserve all current secret values. With separate
   code-deployment authorization, deploy this code with `deployment/production-release.json` as
   the secret manifest: all nine features false. Keep proposed IAM and first-workflow manifest
   unapplied. Verify loaded identity, health, verified protected reads and unverified/pending denials.
2. **IAM separately.** An authorized operator reviews the existing effective runtime identity. If
   required, separately approve only `firebaseauth.users.create` beyond the existing reviewed
   seven-permission role. Code deployment neither grants it nor authorizes an IAM operation. Accept
   actual runtime Auth/datastore operations; do not replace credentials or grant broad roles.
3. **First-lane gates separately.** After explicit supervised acceptance and feature authorization,
   replace only the same secret manifest contents with `deployment/first-workflow.proposed.json`:
   accountManagement,activation,animals,inspection true; carcass,billing,payment,delivery,tracking
   false; policies null. This enables supervised account→inventory→inspection acceptance, not
   general production approval. Validate real official-email actions and the authenticated matrix
   below on the exact signed APK/HTTPS backend pair. If it fails, restore the all-off manifest
   while retaining the new authentication code. Do not enable excluded workflows.

Saving Render settings/secret files may itself trigger deployment. No upload/save, role assignment,
feature change or application deployment is authorized by this preparation. All configuration files
remain review references and no deployed rollback SHA is invented.

## Concrete permission, delivery and authenticated-acceptance gaps

| Category | Concrete remaining requirement | Evidence boundary |
| --- | --- | --- |
| Runtime Auth creation | Add/approve `firebaseauth.users.create` for the existing intended runtime identity if its effective grants remain the reviewed seven-permission role | The stored read/deactivate role lacks create; no current live IAM or effective denial was inspected. Do not claim an operator grant or a new current-live absence. |
| Effective runtime operations | Verify existing `firebaseauth.users.get/update` and datastore database-get/entity-get/list/create/update using the actual deployed credential | These are already in the reviewed role specification; they are unaccepted effective operations, not seven newly missing permissions. |
| Setup invitation | Real intended mailbox receives and completes official PASSWORD_RESET setup email; wrong/expired/used action handling remains explicit | Server sendOobCode acceptance and invitationStatus=sent do not prove delivery or completion. |
| Mailbox verification/recovery | Approved password provider, public web/Android API-key restrictions, authorized web/action domains and Firebase templates support verification/resend/reset; completion followed by forced token refresh works | Emulator actions, mocks and existing verified fixtures do not prove real email delivery. No admin may set emailVerified to pass acceptance. |
| Authenticated roles and data | Exact signed Android/HTTPS backend pair accepts the matrix below, including actual scoped queries/transactions/indexes | Passing source/unit checks, public health and old workflow records do not prove these results. Existing index definitions were historically observed READY; they are not newly missing indexes without a failed/missing definition. |

Existing eight-permission role proposal remains `deployment/runtime-first-workflow-role.proposed.json`:
`datastore.databases.get`, `datastore.entities.get`, `datastore.entities.list`,
`datastore.entities.create`, `datastore.entities.update`, `firebaseauth.users.get`,
`firebaseauth.users.update`, `firebaseauth.users.create`. Its only delta from the reviewed seven is
user creation. No delete, IAM-admin, index-admin, token-creator, Owner/Editor or blanket Auth Admin
grant is proposed. Official user verification/recovery SDK calls add no new backend IAM operation.
[Auth IAM permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth),
[Firebase official verification/reset APIs](https://firebase.google.com/docs/auth/web/manage-users).

Authenticated acceptance, not yet run against production:

- Verified allowlisted web administrator can read/create the authorized business and account via
  `/users` with the intended role/scope; duplicate account/ownership conflicts preserve existing data.
- Unverified active user receives the exact403 contract across profile/animal/settings paths and
  opens no protected screen; verified pending/inactive user remains403. Verification and approval
  must each be shown insufficient alone. No existing account flags are edited to manufacture cases.
- User completes real setup/verification; administrator approves without Auth/password/verification
  mutation; user refreshes token/re-authorizes. Inventory-only staff logs in, registers a valid animal
  under the approved business and cannot inspect; inspector reviews linked business/stall/current
  animal revision and approves. Administrator/inventory cannot substitute for inspector.
- Wrong role/scope/vendor ownership, disabled/revoked credentials, normal logout and account switching
  fail closed. Fresh token/profile and exact artifact identities are recorded without secrets.
- Recovery from both web and mobile reaches the intended mailbox, uses the official action, and
  requires normal verified/active authorization afterwards; no admin password entry or link exposure.
- The five excluded workflow gates remain false and their controls/mutations unavailable. Optional
  operations403/503 cannot block otherwise approved inventory access or swallow verification denial.

Existing approved indexes to verify through these queries: account_audit targetUid/at DESC;
animal_audit animalId/municipalScopeId/at DESC; vendors municipalScopeId/status;
animal_records municipalScopeId/vendorBusinessId, plus existing read/bootstrap and automatic ID
indexes. Reuse the existing index plan; do not include unrelated main-checkout helpers or create
indexes under this authorization.

## Rollback configuration — preserve the new authentication policy

Return the same `/etc/secrets/production-release.json` contents to the existing all-off
`deployment/production-release.json` (same project/scope/origin; all nine false; policies null).
Preserve the exact cursor secret/credential/admin allowlist and existing users, verification flags,
records and audit evidence. Authorized reads and existing emergency deactivation remain subject to
verified-email and administrator/membership checks; all-off is not an authentication bypass.

Do not automatically roll backend code back to 7d11898 or any older artifact lacking verified-email
middleware. That would reopen unverified protected reads despite all-off gates. Use only a recorded
policy-compatible rollback artifact/configuration; if none exists, fail closed using an operator-
authorized maintenance stop rather than reverting the policy. No rollback SHA is invented. Android
rollback/update must retain an approved compatible signing identity and supported versionCode; no
uninstall, data clear, forced downgrade, database reset or credential/verification rewrite is allowed.

## Reused validation and concrete conclusion

No additional backend defect or first-lane contract mismatch was identified in this bounded review.
Android separately confirmed/fixed one pre-access cancellation defect: closing before the non-cancellable
Firebase sign-in returned could leave a late Firebase identity signed in, without application access.
The fix owns/invalidates the pending generation before the UID returns. It stays within the same 16
files; only EmailAccessSession.kt and EmailAccessTest.kt differ from the earlier 113-test baseline. Exact original web 22-file and Android 16-file source hashes were checked;
web 143 affected-path tests, 35 final follow-up tests, typecheck/build/mock browser and Android 113-test debug/release baseline and three variant compilations are retained evidence.
After the cancellation fix, Android passed 114 debug tests and six focused release email-access tests,
release assembly and lint (zero errors/27 warnings). The 113 full-release baseline is reused; a new
full 114-test release run is NOT claimed. No checks were rerun by this backend review. Review-only doc
updates are whitespace-checked. No production/network account test or broad audit was repeated.

The policy implementation is ready for a focused checkpoint review, not production approval.
Remaining operational acceptance covers effective runtime creation/transaction permissions, official
mail/action completion and the authenticated first-lane matrix. The owner confirms the signed APK
is verified against the reviewed source; signing itself is no longer an open preparation blocker.
Installation/update continuity and authenticated production behavior remain separate acceptance. Four residual security advisories and retained historical inspector/tracking/Auth-hash
uncertainty remain documented; source tests do not resolve them. No finance policy decision blocks
this lane because those capabilities stay disabled.


## Signed Android artifact boundary — owner-reported verification

The owner confirms that the signed production APK was verified against the reviewed 19 October
source candidate. This supersedes the earlier signing-unconfigured preparation blocker. This backend
packet still references the final 16-file source manifest
`source-manifest-bcc1753c4194.json`, SHA256
`bcc1753c4194dda3868b12f0bfa8708fee6bf0c54f716f5adfcf764babb045bf`, on parent
`387fbaa80f5f6a9585b2395b41b489ea34241a05`.

The retained Android metadata available to this review contains only the earlier unsigned APK:
`b8edb690e475bbf1613501e1a002c3bc7202994aa728b981ea00fd07147a676b`.
That hash is historical and MUST NOT identify the signed APK. No signed APK hash, certificate or
attestation path is invented or independently reverified by this backend task. Attach the owner's
verified signed artifact SHA256/certificate/source attestation to the deployment record before
artifact selection/distribution. This is an artifact-record handoff, not a request to repeat signing.

Expected production identity remains normal package/project, approved HTTPS origin,
MOBILE_REHEARSAL=false and debuggable=false. Record actual final versionCode/name and update
continuity on selected devices; do not infer those results from earlier version1.0/code1 metadata.
No production installation or authenticated role acceptance is established by signing verification.
No Android signing, source, build or device action was performed by this backend task.
