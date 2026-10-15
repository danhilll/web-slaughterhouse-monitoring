# Production release checklist — web and Android

Updated 2026-10-15. Objective: ongoing real-user use of both applications. This is the single current release checklist; older pilot plans/audits are historical evidence. Current local source is authoritative; Graphify indexes are stale/divergent. Preserve existing work. This checklist authorizes no live data/IAM changes, deployment, commit or push.

## Code defects and missing functionality

- [x] Staff/inspector activation is implemented: allowlisted administrator only; matching pending account/profile/membership and Auth identity/claims; explicit staff functions; atomic status changes and audit. Activation defaults off in normal server mounts. Focused account tests: 17 passed at checkpoint review.
- [x] Carcass backend/web/Android implementation and exact contract are complete locally (CARCASS_WEIGHT_API.md): integer grams, current inspector approval, inventory/admin writers, independent revisions, invoice/dispatch lock and transactional audit. Original live weight, inspection and fees remain unchanged.
- [x] Both rehearsal adapters use explicit --enable-carcass-weight with demo/loopback validation; Android retains --preserve-fixtures. No production environment flag enables this feature.
- [ ] Fix Android connected-test selectors: AnimalRehearsalDeviceTest.kt lines 73 and 102 still request exact text "Weight (kg)"; AnimalScreen.kt now labels the field "Live weight (kg)". Source-confirmed acceptance regression; repair and rerun the affected connected test before treating the full device suite as current. Not fixed during this review.
- [ ] Bound legacy dashboard/store database reads before wider use; response limits do not bound whole-collection reads. Validate pagination/aggregates against expected usage.

## Business decisions requiring owner answers

- [ ] Slaughterhouse must confirm included/excluded body parts before production carcass recording. Recorder role, approval stage, pre-invoice/dispatch timing, independent revisions and reasoned corrections are now agreed and implemented. No yield or weight-ratio rules are assumed.
- [ ] Approve official versioned fees, charge basis, invoice/receipt numbering and financial correction/reversal policy before real billing. Synthetic per-animal fees are not official rates; carcass weight must not silently change pricing.
- [ ] Confirm production role/activation responsibilities, business/stall ownership and onboarding/recovery procedure; decide whether verified email is required. Successful vendor login after account transfer was observed; the earlier password failure is historical, not an unresolved blocker.

## Infrastructure/security configuration

- [ ] Review target project and generated release configuration together. Current Android main app/google-services.json identifies com-slaughterhouse-app, correcting the older mismatch finding; this alone does not verify deployed project/app/signing configuration.
- [ ] Review the actual hosting/runtime and build-supplied HTTPS API origin for release; normal mobileApiBaseUrl defaults empty. Existing npm start, opt-in SERVE_WEB=true, /healthz and same-origin wiring are prepared. This checklist does not assert that no external deployment exists; an existing deployment must be checked against the reviewed release.
- [ ] Review permissions/configuration: runtime credentials/IAM, administrator allowlist, municipal scope and protected memberships, Auth domains/invitation settings, denied direct-client rules, required indexes, stable cursor secrets, logging and monitoring. No IAM or live provisioning changes without explicit authorization; never copy synthetic identities, invoices or fees into production.
- [ ] After policy approval, review a concrete production-enablement change for activation, carcass recording and billing/payment/delivery. Normal activation/carcass mounts remain off; operations still require demo project plus loopback emulators. These deliberate guards are not missing feature implementations. Preserve them until reviewed.
- [ ] Review backup/recovery and rollback, then obtain explicit authorization for the exact production configuration, provisioning and deployment changes. Keep production gates closed meanwhile.

## Release acceptance checks

- [x] Existing animal/operations baseline: 40 focused tests, web typecheck, server syntax checks and web build passed on 2026-10-15. Tests used local listeners/in-memory stores, never live Firebase. Existing large-bundle warning remains. These checks precede carcass implementation.
- [x] Reused successful checks: 50 focused animal/carcass/operations server tests, three exact-decimal tests, web typecheck/syntax/build, 14 focused safety/carcass tests and offline Android rehearsal build. Saved Android unit XML shows CarcassWeightTest (15) and AnimalIntegrationTest (18) passing in debug, release and rehearsal (99 executions); no rerun needed for unchanged source. Transaction-double tests alone do not certify real Firestore retry races.
- [x] Android carcass UI and web/Android rehearsal adapter opt-in validated in one focused UI acceptance: matching displays, reasoned corrections, stale revision/review, vendor read-only visibility and invoice lock. See CARCASS_REHEARSAL_RESULTS.md for observed evidence versus automated tests. Production recording remains disabled until definition approval and reviewed enablement.
- [ ] Validate release Android build/signing and real HTTPS connectivity on physical phones over Wi-Fi/mobile data without USB. Exercise role isolation, membership revocation, account switching, offline/error recovery and carcass workflow.
- [ ] After the selector fix, rerun only the affected connected animal test using isolated fixtures. Retain completed focused staff-activation and carcass web/Android UI acceptance; do not restart healthy services or repeat unrelated audits.
- [ ] Complete remaining production web/account/financial and physical delivery/map/GPS acceptance against the approved release configuration. Verify official amounts/numbering, onboarding/revocation, retention, monitoring and rollback before ongoing real-user use.

Retain completed evidence: eight connected Android rehearsal tests and map rendering previously passed; do not repeat unchanged audits or treat rehearsal results as production acceptance. Prior details remain in PILOT_READINESS_REVIEW.md, ONE_VENDOR_PILOT_PLAN.md and HOSTING_OPTIONS.md; stale findings there do not override current source or this checklist. Old checkpoint push authorization is historical; the current instruction prohibits commit/push.

Checkpoint review: scope is staff activation, rehearsal harness and carcass feature only. Exclude log deletion, skills/lockfiles, unrelated map/pilot work, secrets and raw generated evidence; preserve all of them locally. Authored API/results documentation is eligible; screenshots, emulator state, APK/build/test output and private /tmp files are not. Web checkpoint must precede the Android adapter checkpoint because the adapter imports the new shared safety helper. No staging, commit, push or deployment performed.

Review refresh: current diffs retain the same checkpoint scope and connected-test selector defect. Targeted Graphify discovery identified the account test import and Android model/session dependencies; these were verified in local source. Its name-only mobile-test match does not establish activation coverage, and its old snapshot omits the new carcass tests. Reuse the successful local checks listed above; no new implementation changes or uncovered executable paths were found to justify another test run. The selector mismatch blocks complete connected-test acceptance, not app compilation or the completed focused UI walkthrough.
