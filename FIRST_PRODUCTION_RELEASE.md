# First usable production workflow — proposed, not enabled

Candidate base: web `3539ad169999125c0452b5c61facccddc8e1cad0`, with the already-tested
DOM/router 7.18.4 migration copied into this separate checkout. The original web worktree,
pending documentation/index work and original isolated router candidate are preserved.
UAT is stopped; no further rehearsal feature, fixture, device or workflow action is part of this work. This document's table is the current blocker list for this candidate; historical checklist entries and audit counts are retained, not promoted as current defects. jsPDF 4.2.1 and the earlier compatible security fixes are already in the base.

Scope: allowlisted web administrator registers a business and creates accounts; reviewed activation
of inventory staff and inspectors; normal mobile login; inventory registration; inspector ownership/
current-revision review and approval. The web entry for onboarding is `/users`, not the legacy
Vendors mutation form. Inventory correction remains reasoned/revisioned and clears prior approval.
Inspectors remain the only decision writers; administrator activation is not inspection approval.

## One release-blocker list

| Category | Concrete blocker / current disposition |
| --- | --- |
| Confirmed code defects | **Fixed in this web candidate:** animal API validation accepted stored records without audit fields required by the mobile parser, permitting malformed HTTP 200 responses. A regression first failed (`createdAt` absent → 200), then passed after validating created/updated timestamps/actors and completed inspection evidence. Invalid records now return existing review-required 503s; no missing evidence is fabricated and no stored data is rewritten. **Android-owned candidate:** optional operations/settings 503 blocked otherwise authorized inventory login; Android's final candidate includes the reproduced optional-service fix, preserves 401/primary authorization and passes the added regressions, including inspector independence. Source/artifact provenance is recorded below; neither fix establishes the cause of the unexplained inspector incident. |
| Missing configuration/permissions and acceptance | Existing read/deactivate role proposal lacks `firebaseauth.users.create`; proposed first-workflow role adds only that permission. Effective runtime IAM is still unverified. Verify existing Firebase/Render identity, administrator allowlist, stable cursor secret, web app build variables, same-origin HTTPS, denied client rules, required READY indexes, Auth password provider/API-key restrictions and actual approved-mailbox setup-email delivery. Do not substitute emulator invitations. No approved release signing key was found by Android; debug/rehearsal APKs are not the production distribution artifact. A reviewed signed APK and narrow authenticated first-workflow/physical HTTPS acceptance remain required. The active-inspector UAT error has no captured stage/exception or established cause and remains an acceptance gap, not a diagnosed production defect. |
| Owner decisions | Name who may validate business/stall ownership and approve inventory/inspector activation/recovery; decide whether verified email is mandatory. Current code permits password setup without enforcing email verification. Identify an approved signing identity/distribution channel. Decide whether the four residual advisories below require pre-release remediation or an explicit temporary risk acceptance with mitigations. Financial/body-part/delivery policy decisions do **not** block this limited lane: those capabilities stay unavailable. |
| Unresolved advisories | Four unique web IDs remain (12 affected package entries, not 12 vulnerabilities): two gRPC findings in the production dependency tree; braces and selector parsing in build/development tooling. Installed exposure, constraints and mitigation are listed below. Test success and absent observed triggers are not safety decisions. Android's separately prepared dependency fixes also need exact candidate/artifact provenance; no security acceptance transfers automatically between APKs. |

## Local changes and reused evidence

- `server/animals.js`: validate complete animal response/audit and completed inspection evidence.
  The shared validator also rejects malformed stored records before transactional use. It preserves
  scope, role, current revision, ownership, conflict and policy gates.
- `server/animals.test.js`: missing required audit/decision evidence must fail closed for list/detail;
  normal registration/inspection still succeeds; failed reads do not change the record or audit events.
- `server/carcass-weight.test.js`: retain the fixture's complete inspector evidence when testing a
  rejected/approved status. This is a fixture compatibility edit, not carcass production enablement.
- `server/production-config.test.js`: proposed four-gate lane loads with legacy flags false;
  all-off rollback keeps stable cursor identities and reserved capabilities closed.
- `package.json`, `package-lock.json`, `scripts/check-router-ui.mjs`, `ROUTER_SECURITY_MIGRATION.md`:
  copied unchanged from the reviewed router candidate. DOM/router 7.18.4, router-local cookie 1.1.1,
  set-cookie-parser 2.7.2; obsolete @remix-run/router removed. No override or unrelated update.
- `deployment/first-workflow.proposed.json`, `deployment/runtime-first-workflow-role.proposed.json`:
  review artifacts only. Existing active/default `production-release.json` and pending all-off
  manifests remain byte-identical. This document is the release plan, not permission to apply it.

Reused router evidence: v6/v7 direct URLs/refresh, history, nested navigation, dialogs,
login/logout/access loss, existing workspace/PDF browser checks and lock consistency. Current
candidate's frontend/router bytes match that evidence. No full onboarding/tracking/device suite is
repeated. **Passed:** 110 focused tests, six proposed-configuration checks, typecheck, build, dependency consistency and source/diff checks. The existing large-bundle warning remains. **Runtime mitigation verified after recovery:** clean runtime-only install, imports and consistency passed; braces/parser/Tailwind/nodemon are absent from that isolated tree. The initial ENOSPC failure is retained; only this task's regenerable dependency installs were removed to make room. Original/candidate source, dist, logs and existing checkouts were retained. Build-space headroom must be monitored, but the probe is no longer blocked. New changed-path checks cover accounts, production configuration, access, mobile,
animals, shared carcass validation and operations, plus typecheck/build/dependency consistency.
Initial failing regression and fixture-compatibility failure logs are retained with the final passes.

## Exact future deployment changes — separate authorization required

1. **Freeze artifacts and retain rollback first.** Record the reviewed candidate commit/tree digest,
   Node patch/build inputs, built web assets, signed production Android APK hash/certificate and
   configuration digest. Preserve the currently deployed code/artifact/configuration and cursor
   secret references. Do not use rehearsal APK `91a559…`, normal debug `fcef6e…`, synthetic identities
   or an untracked working-tree build as the new signed production identity. Preserve current records
   and establish backup/recovery/monitoring ownership before ongoing use.
2. **IAM/configuration review.** Preserve the existing runtime service account and credential file
   `/etc/secrets/render-readonly-pilot.json`; do not replace keys. The proposed eight-permission set is
   the existing seven plus `firebaseauth.users.create`: datastore.databases.get;
   datastore.entities.get/list/create/update; firebaseauth.users.get/update/create. No delete, index/IAM
   administration or token-creator grant is proposed. IAM remains broad at the document level;
   application authorization stays mandatory. An authorized operator must verify exact effective
   SDK permissions before enabling onboarding. [Auth permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth),
   [Firestore server IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam).
3. **Preserve production data/rules/indexes.** Project `com-slaughterhouse-app`, `(default)` database,
   scope `ph-quezon-calauag`; retain direct-client deny-all rules and existing indexes. Canonical
   first-workflow composites: animal_audit `(animalId ASC, municipalScopeId ASC, at DESC)`;
   account_audit `(targetUid ASC, at DESC)`; vendors `(municipalScopeId ASC, status ASC)`;
   animal_records `(municipalScopeId ASC, vendorBusinessId ASC)`. Verify automatic name/order indexes
   for scoped account/animal lists too. Existing web bootstrap/dashboard reads still need their
   canonical read indexes, even with financial writes off. Reuse the existing separately prepared
   additive ten-index operator plan where required; do not replace it or delete unrelated indexes.
   No new index helper or live index operation was added here. All required queries must be accepted
   against READY indexes; emulator/mock tests do not prove this.
4. **Build/runtime settings.** Existing Render origin:
   `https://web-slaughterhouse-monitoring.onrender.com`; same-origin web/API, `SERVE_WEB=true`,
   `NODE_ENV=production`, `PRODUCTION_RELEASE_MANIFEST=/etc/secrets/production-release.json`,
   matching FIREBASE_PROJECT_ID/VITE_FIREBASE_PROJECT_ID and municipal scope. Preserve current
   populated web Firebase values, WEB_ADMIN_UIDS and stable CURSOR_SIGNING_SECRET; leave emulator
   variables absent. Keep legacy ACCOUNT_MANAGEMENT_ENABLED, ANIMAL_WORKFLOW_ENABLED and
   ANIMAL_OPERATIONS_ENABLED false. They are not production authorization controls. Verify the
   approved Node 22 host patch; local checks on Node 25.8.0 alone do not certify that host.
5. **Exclude development tools from the running artifact.** Proposed build command:
   `npm ci --include=dev --no-audit && npm run typecheck && npm run build && npm ci --omit=dev --ignore-scripts --no-audit`;
   start remains `npm start`. The second install retains dist and installs the same locked runtime
   tree without dev tools. A separate runtime-only install/import/consistency probe passed after recovery from an initial ENOSPC failure. The resulting tree excludes braces, selector-parser, Tailwind and nodemon; gRPC 1.9.16 remains alongside patched 1.14.5. Runtime module imports performed no app initialization or credential/network access. Only this task's regenerable dependency installations were removed for space; logs/source/evidence remain. The source candidate needs npm ci again for any future dev checks.
   Build workers still process vulnerable tooling: use reviewed inputs, disposable credential-free
   workers and external resource/time limits. No audit suppression or vulnerability resolution is
   implied by `--no-audit`; advisory review is the separate saved evidence.
6. **Deploy with writes still paused first.** Keep the existing all-off manifest during deployment.
   Verify health, same-origin login, protected reads/denials, effective configuration and artifact
   identities. No live writes or administrator/role provisioning is authorized by this document.
7. **After owner decisions, IAM/mail delivery, artifact and scoped acceptance are satisfied, review
   the exact enablement delta.** Replace only the secret manifest contents with
   `deployment/first-workflow.proposed.json`: accountManagement/activation/animals/inspection true;
   carcass/billing/payment/delivery/tracking false; all financial/body-part policy fields null.
   Loader refusal of reserved enablement remains. Render secret-file saving can trigger deployment;
   do not treat it as a harmless staging operation. This step needs explicit future authorization.
8. **Accept only this lane on the exact release.** Web `/users`: legitimate approved business/account,
   real participant mailbox password setup, pending denial, explicit inventory function/activation;
   mobile normal package on approved HTTPS origin: authorized inventory registration and inspector
   business/stall/current-revision review/approval, wrong-role/scope denial and logout/account switch.
   Record only new scoped outcomes. Historical successful workflows and the unresolved later
   inspector error remain separately attributed. Finance/carcass/delivery acceptance is not required
   or authorized for this release lane.

## Rollback

First restore the **same-project/scope/origin all-off manifest** from
`deployment/production-release.json`; preserve the same stable cursor secret. All nine mutations
close; authorized history and existing allowlisted emergency deactivation remain available.
Then, if needed, restore the previously recorded known-good server/web artifact and its matching
reviewed configuration, not an arbitrary historical commit. No exact deployed rollback SHA is
invented here: it must be captured before deployment. Retain the newly created business/account/
animal/audit records; no database rollback, deletion, reset or credential rotation is automatic.
If a particular new account must be contained, separately authorize the supported deactivation
path; do not rewrite memberships by hand. Android rollback requires a signature-compatible
approved artifact and a separately reviewed install path without uninstall/data clear/downgrade
bypass; current production signing/artifact continuity is unresolved.

## Residual advisory exposure and mitigation

Reuses the router candidate's dated audit comparison: 14→12 affected package entries,
six→four unique IDs; no router finding/new ID. No new broad audit was run for unchanged lock bytes.

| Advisory / installed package | Actual reviewed exposure | Constraint and mitigation |
| --- | --- | --- |
| GHSA-m9gg-hp2v-232j (high), @grpc/grpc-js 1.9.16 via Firebase 12.19.0 → Firestore 4.17.2 (compat 0.4.14 also propagates) | Production dependency remains installed. App imports browser Firebase app/auth; Express/Admin's separate server copies are patched 1.14.5. No app gRPC server/getAuthContext authentication was found. This is limited observed reachability, not safety. | Fixed 1.13.6/1.14.5, outside Firestore ~1.9.0. Upstream/dependency packaging remediation remains. Do not introduce the optional-client-certificate server-authentication path; require verified client certificates if such a server is later approved. |
| GHSA-f596-whhp-79r4 (low), same gRPC path | Server-handler error-message disclosure; same installed affected copy and current no-server observation. | Same fix/range constraint; future handlers must strip sensitive error detail. Unresolved despite no demonstrated trigger. |
| GHSA-vfj7-8cjw-p6xm (high), braces 3.0.3 via nodemon/chokidar and Tailwind/glob/micromatch | Build/watch inputs can cause stack exhaustion. The proposed runtime-only install was verified to exclude the development chains in isolation. Build workers remain exposed; the deployed artifact has not been changed or accepted. | Existing upstream review found no patch. Parent migration/removal required; isolate/review/resource-limit builds. Removing nodemon alone would leave Tailwind's chain. |
| GHSA-rj75-hqrm-r3gf (moderate), parser 6.1.4 via Tailwind/postcss-nested | Hostile CSS selectors consume CPU during builds; verified absent from the isolated runtime-only tree, but still used during build. No deployed mitigation is claimed. | Fixed 7.1.6 outside both parents' ^6 constraints. Reviewed build migration required; restrict untrusted CSS and isolate builds. |

IDs link to their upstream records in DEPENDENCY_SECURITY_REVIEW.md. Risk acceptance, if granted,
must name these conditions, mitigation owner and review/expiry; it is not remediation. Release/signing,
effective IAM, mailbox delivery and the narrow mobile acceptance gap remain blockers independently.


## Android candidate — separately owned and verified

See `/Users/johnvianneynoscal/Documents/NewFile/Capsto-Project/ANDROID_PRODUCTION_RELEASE.md`.
Android owns the confirmed optional-operations fix and opt-in fail-closed signing configuration.
Its explicit overlay scope is `app/build.gradle.kts`, `gradle/libs.versions.toml`,
`app/src/main/java/com/slaughterhouse/app/data/mobile/AnimalSession.kt`,
`app/src/test/java/com/slaughterhouse/app/AnimalIntegrationTest.kt` and
`app/src/test/java/com/slaughterhouse/app/DependencySecurityTest.kt`. Existing tested protobuf-javalite
3.25.5 / Okio 1.17.6 security changes are included without unrelated map/assets or new dependency upgrades.

Final saved evidence: **103 debug + 103 release tests passed**, both assemblies passed, release lint
**0 errors / 27 warnings**, partial signing configuration rejects early, packaging isolation passed.
This web review read the saved provenance/checks and rehashed both retained APKs; it performed no
Android build/install/device action or source edit.

Source base `95769a037d2da094c74a6f7232cb5b51963c8212` plus the five explicit overlays;
no immutable new commit is claimed. Artifacts/provenance:
`app/build/outputs/production-candidate/production-release-20261018-023930/` in the Android checkout.

- Supervised debug only: `app-debug.apk`, SHA-256
  `2c64245d187ffa7f4b1baa2db34d3830dffc49ab463726816e7e026a3e47535e`.
- Unsigned release: `app-release-unsigned.apk`, SHA-256
  `fb98548955ba4a3974053777403157608658efd823462ea9fd9b92b3ee5772ba`.

Both normal package `com.slaughterhouse.app`, Firebase `com-slaughterhouse-app`, approved HTTPS API,
MOBILE_REHEARSAL=false, version 1.0/code 1. Neither is an approved signed production distribution.
Once an existing release key is approved, Android expects secure local environment values
ANDROID_RELEASE_STORE_FILE, ANDROID_RELEASE_KEY_ALIAS, ANDROID_RELEASE_STORE_PASSWORD and
ANDROID_RELEASE_KEY_PASSWORD. No secret value belongs in chat/arguments/committed files.
No key was found/created, no debug signing fallback applied, and no APK was installed.
