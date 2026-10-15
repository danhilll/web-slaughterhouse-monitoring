# Production release checklist — web and Android

Updated 2026-10-16. Objective: ongoing real-user use of both applications. This is the single current release checklist; older pilot plans/audits are historical evidence. Current local source is authoritative; Graphify indexes are stale/divergent. Preserve existing work. This checklist authorizes no live data/IAM changes, deployment, commit or push.

## Code defects and missing functionality

- [x] Staff/inspector activation is implemented: allowlisted administrator only; matching pending account/profile/membership and Auth identity/claims; explicit staff functions; atomic status changes and audit. Activation defaults off in normal server mounts. Focused account tests: 17 passed at checkpoint review.
- [x] Carcass backend/web/Android implementation and exact contract are complete locally (CARCASS_WEIGHT_API.md): integer grams, current inspector approval, inventory/admin writers, independent revisions, invoice/dispatch lock and transactional audit. Original live weight, inspection and fees remain unchanged.
- [x] Both rehearsal adapters use explicit --enable-carcass-weight with demo/loopback validation; Android retains --preserve-fixtures. No production environment flag enables this feature.
- [x] Android connected-test selectors fixed in ba2229e. After guarded missing-only demo prerequisite restoration and complete preflight, AnimalRehearsalDeviceTest.realRegistrationConflictReinspectionIsolationAndPermissionRemoval actually executed: 1 passed, 0 failures/errors/skips. This acceptance blocker is resolved.
- [x] Production legacy dashboard/store reads are now scoped and bounded; dashboard totals use database aggregates. Public list views now traverse bounded signed cursor pages above 500 rows; historical reconciliation and large-export acceptance remain separate requirements. Reuse the 129 passing server tests, four rehearsal safety tests, web typecheck/syntax/build and diff checks from the foundation implementation.

- [x] Pending Android capability/session changes default unknown or absent write flags off, separate payment/tracking permissions, retain authorized history during pauses and stop uploads after capability removal/account changes. The four delivery-map assets move unchanged from rehearsal to main with attribution/license and a URL allowlist. Saved XML newer than the reviewed Kotlin sources shows 94 tests per debug/release/rehearsal variant, 282 executions total, zero failures/errors/skips. This is automated evidence, not new UI acceptance.
- [ ] **Confirmed Android release blocker — combined-role rollback navigation:** with an active staff membership containing inventory plus billing/delivery, `animals=false` gives `canRecord=false` while operations settings remain readable (`enabled=true`). `AnimalSession.kt:70–73` skips animal loading and `NavGraph.kt:172` routes directly to operations. Operations only pops back to staff login, so authorized animal history has no UI entry after login. Add an independently authorized animal-read route/capability and a combined-role all-writes-off navigation regression before accepting rollback behavior. Confirmed from current source; no new connected/UI run was performed.
- [ ] **Android checkpoint validation defect:** `rehearsal/verify-android-packaging.py:28–29` requires `tracking-map.html` and `leaflet/leaflet.js`, which exist only as excluded untracked rehearsal assets. A clean checkout of the proposed checkpoint cannot satisfy those assertions. Make the verifier independent of unrelated excluded assets before including it; do not pull those assets into the checkpoint merely to satisfy local validation. This is a reproducibility defect, not evidence of a production map runtime failure.

## Business decisions requiring owner answers

- [ ] Slaughterhouse must confirm included/excluded body parts before production carcass recording. Recorder role, approval stage, pre-invoice/dispatch timing, independent revisions and reasoned corrections are now agreed and implemented. No yield or weight-ratio rules are assumed.
- [ ] Approve official versioned fees, charge basis, invoice/receipt numbering and financial correction/reversal policy before real billing. Synthetic per-animal fees are not official rates; carcass weight must not silently change pricing.
- [ ] Confirm production role/activation responsibilities, business/stall ownership and onboarding/recovery procedure; decide whether verified email is required. Successful vendor login after account transfer was observed; the earlier password failure is historical, not an unresolved blocker.

## Infrastructure/security configuration

- [ ] Review target project and generated release configuration together. Current Android main app/google-services.json identifies com-slaughterhouse-app, correcting the older mismatch finding; this alone does not verify deployed project/app/signing configuration.
- [ ] Review the actual hosting/runtime and build-supplied HTTPS API origin for release; normal mobileApiBaseUrl defaults empty. Existing npm start, opt-in SERVE_WEB=true, /healthz and same-origin wiring are prepared. This checklist does not assert that no external deployment exists; an existing deployment must be checked against the reviewed release.
- [ ] Review permissions/configuration: runtime credentials/IAM, administrator allowlist, municipal scope and protected memberships, Auth domains/invitation settings, denied direct-client rules, required indexes, stable cursor secrets, logging and monitoring. No IAM or live provisioning changes without explicit authorization; never copy synthetic identities, invoices or fees into production.
- [ ] After policy approval, review a concrete production-enablement change for activation, carcass recording and billing/payment/delivery. Production account/activation/animal/inspection gates are independently configurable but default off. Production carcass/billing/payment/delivery/tracking gates reject enablement pending policy-dependent implementation; the separate rehearsal operations path still requires demo project plus loopback emulators. Preserve these deliberate guards until reviewed.
- [ ] Review backup/recovery and rollback, then obtain explicit authorization for the exact production configuration, provisioning and deployment changes. Keep production gates closed meanwhile.

## Release acceptance checks

- [x] Existing animal/operations baseline: 40 focused tests, web typecheck, server syntax checks and web build passed on 2026-10-15. Tests used local listeners/in-memory stores, never live Firebase. Existing large-bundle warning remains. These checks precede carcass implementation.
- [x] Reused successful checks: 50 focused animal/carcass/operations server tests, three exact-decimal tests, web typecheck/syntax/build, 14 focused safety/carcass tests and offline Android rehearsal build. Saved Android unit XML shows CarcassWeightTest (15) and AnimalIntegrationTest (18) passing in debug, release and rehearsal (99 executions); no rerun needed for unchanged source. Transaction-double tests alone do not certify real Firestore retry races.
- [x] Android carcass UI and web/Android rehearsal adapter opt-in validated in one focused UI acceptance: matching displays, reasoned corrections, stale revision/review, vendor read-only visibility and invoice lock. See CARCASS_REHEARSAL_RESULTS.md for observed evidence versus automated tests. Production recording remains disabled until definition approval and reviewed enablement.
- [ ] Validate release Android build/signing and real HTTPS connectivity on physical phones over Wi-Fi/mobile data without USB. Exercise role isolation, membership revocation, account switching, offline/error recovery and carcass workflow.
- [x] Affected animal connected test rerun passed; full preflight verified 18 synthetic fixture accounts, no missing prerequisites and preserved denial membership. Retain completed staff-activation/carcass UI acceptance; do not repeat unrelated checks.
- [ ] Complete remaining production web/account/financial and physical delivery/map/GPS acceptance against the approved release configuration. Verify official amounts/numbering, onboarding/revocation, retention, monitoring and rollback before ongoing real-user use.

Retain completed evidence: eight connected Android rehearsal tests and map rendering previously passed; do not repeat unchanged audits or treat rehearsal results as production acceptance. Prior details remain in PILOT_READINESS_REVIEW.md, ONE_VENDOR_PILOT_PLAN.md and HOSTING_OPTIONS.md; stale findings there do not override current source or this checklist. Old checkpoint push authorization is historical; the current instruction prohibits commit/push.

Historical checkpoint review (a750635 / ba2229e): scope was staff activation, rehearsal harness and carcass feature only. Exclude log deletion, skills/lockfiles, unrelated map/pilot work, secrets and raw generated evidence; preserve all of them locally. Authored API/results documentation is eligible; screenshots, emulator state, APK/build/test output and private /tmp files are not. Web checkpoint must precede the Android adapter checkpoint because the adapter imports the new shared safety helper. No staging, commit, push or deployment performed.

Historical review refresh (superseded for the selector defect by the completed connected-test pass above): the reviewed diffs retained the checkpoint scope and then-open selector defect. Targeted Graphify discovery identified the account test import and Android model/session dependencies; these were verified in local source. Its name-only mobile-test match does not establish activation coverage, and its old snapshot omits the new carcass tests. Reuse the successful local checks listed above; no new implementation changes or uncovered executable paths were found to justify another test run. At that time the selector mismatch blocked complete connected-test acceptance; it is now fixed and the affected test passed.

Production enablement proposal: [PRODUCTION_ENABLEMENT_PLAN.md](PRODUCTION_ENABLEMENT_PLAN.md) maps exact code/configuration work, unresolved measurement/financial policy, IAM/rules/indexes/hosting/signing, phased enablement, rollback and focused acceptance. Checkpoints a750635 (web) and ba2229e (Android) were committed and normally pushed under the owner’s later explicit authorization. The later local foundation implements configuration/read-path changes; production, IAM, Firebase, Render and deployment remain untouched.

### Production foundation — local implementation complete, release still disabled

- [x] Strict reviewed manifest path, exact project/scope/origin validation, separate rehearsal guards and independent default-off gates. See `PRODUCTION_ENABLEMENT_PLAN.md` → Local foundation implementation for exact variables and gate semantics.
- [x] Effective server capabilities; historical reads and scoped administrator deactivation survive a mutation pause. Stable domain-separated production cursor keys are mandatory, without generated fallback.
- [x] Scoped/bounded legacy queries, independent database dashboard aggregates and local invoice/dashboard index definitions. No demo fee defaults in production; incomplete historical species/counts expose coverage and unavailable breakdowns.
- [ ] Review/provision production manifest and stable cursor secret externally. Enable no write gate by copying the example.
- [ ] Approve carcass definition, fees, numbering and correction/reversal policy; implement their reviewed policy-dependent changes. Carcass/billing/payment/delivery/tracking remain rejected in production configuration.
- [ ] Authorize and verify runtime IAM/credentials, deny-all client rules, deployed indexes, invitation delivery, HTTPS hosting and signed Android distribution.
- [ ] Accept physical-device production-host behavior, role/scope isolation, rollback and signed update checks. Reconcile historical registers; accept paginated reads against deployed indexes and review very large exports separately.


### Pending checkpoint review — 2026-10-16

Review only. Web branch `fix/foundation-up` at `a750635`; Android branch `isolated-mobile-integration-rehearsal` at `ba2229e`. No staging, commit, push or deployment. Graphify supplied a small OperationsSession dependency list from stale index `07dc68f`; model/session/coordinator/screen links were verified against local source. No broad audit or repeated test suite was run. Web validation above is reused; Android's newer saved unit XML and byte-identical asset moves were inspected. Physical-device, connected UI and clean-checkout packaging acceptance for this pending Android change remain open. The earlier affected animal connected-test pass remains valid historical evidence, not acceptance of newly changed navigation.

**Web — 23 explicit candidate paths.** Proposed message: `feat(web): add fail-closed production configuration and rollback reads`

```text
.env.example
DEPLOYMENT_CHECKLIST.md
PRODUCTION_ENABLEMENT_PLAN.md
firestore.indexes.json
package.json
production-release.example.json
server/accounts.js
server/accounts.test.js
server/animals.js
server/animals.test.js
server/index.js
server/index.test.js
server/mobile.js
server/mobile.test.js
server/operations.js
server/operations.test.js
server/production-config.js
server/production-config.test.js
server/scoped-reads.js
server/scoped-reads.test.js
src/App.tsx
src/UsersPage.tsx
src/types.ts
```

No additional confirmed web runtime defect was found in this scoped review. Real-project startup now deliberately requires a reviewed manifest and stable cursor secret; the example origin intentionally fails validation. Index deployment/readiness, histories exceeding the legacy view cap, incomplete historical species splits and combined-register reconciliation remain explicit rollout conditions.

**Android — 24 explicit candidate paths (20 resulting files, including four asset moves).** Proposed message: `feat(android): honor server capabilities and share guarded delivery maps`

Hold this checkpoint for the navigation and verifier findings above. Paths are relative to `Capsto-Project`; the four old asset paths are deletions paired with the four main asset additions, not permission to delete unrelated assets.

```text
app/src/main/java/com/slaughterhouse/app/data/mobile/AnimalHttpApi.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/AnimalSession.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/DeliveryMapPolicy.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/DeliveryTrackingSession.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/OperationsHttpApi.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/OperationsModels.kt
app/src/main/java/com/slaughterhouse/app/data/mobile/OperationsSession.kt
app/src/main/java/com/slaughterhouse/app/navigation/NavGraph.kt
app/src/main/java/com/slaughterhouse/app/ui/components/DeliveryLocationMap.kt
app/src/main/java/com/slaughterhouse/app/ui/screens/AnimalScreen.kt
app/src/main/java/com/slaughterhouse/app/ui/screens/OperationsScreen.kt
app/src/main/assets/delivery-map/LICENSE
app/src/main/assets/delivery-map/index.html
app/src/main/assets/delivery-map/leaflet.css
app/src/main/assets/delivery-map/leaflet.js
app/src/rehearsal/assets/delivery-map/LICENSE
app/src/rehearsal/assets/delivery-map/index.html
app/src/rehearsal/assets/delivery-map/leaflet.css
app/src/rehearsal/assets/delivery-map/leaflet.js
app/src/test/java/com/slaughterhouse/app/AnimalIntegrationTest.kt
app/src/test/java/com/slaughterhouse/app/DeliveryTrackingTest.kt
app/src/test/java/com/slaughterhouse/app/OperationsIntegrationTest.kt
app/src/test/java/com/slaughterhouse/app/ProductionCapabilitiesTest.kt
rehearsal/verify-android-packaging.py
```

**Explicit exclusions, preserved locally:** web `firebase-debug.log` deletion, `skills-lock.json`, `.agents/`; Android `.agents/`, `skills-lock.json`, `ANDROID_PILOT_SETUP.md`, `app/src/main/java/com/slaughterhouse/app/ui/screens/DeliveryTrackingMap.kt`, `app/src/rehearsal/assets/leaflet/`, `app/src/rehearsal/assets/tracking-map.html`. Exclude actual `.env`/credential/config secrets, signing keys, APKs, build/test output, logs, emulator state, screenshots and private evidence. The reviewed `.env.example` and manifest example contain no real secrets. Saved XML/APKs are evidence to inspect, never checkpoint files.

**Remaining production decisions and acceptance:** obtain the carcass definition, approved fee basis/amounts, official numbering and correction/reversal policy; confirm ownership/onboarding and email policy. Review exact project/scope/HTTPS manifest, externally provision stable cursor key, runtime IAM/credentials, denied client rules and deployed indexes, invitation delivery, hosting, signing/distribution, retention and map-service terms. Then accept combined-role read-only rollback, actual revocation/account switching, stale-write races, physical signed updates/HTTPS over Wi-Fi and mobile data, map/GPS lifecycle/offline recovery, official financial behavior, monitoring and recovery. All production financial/carcass write gates stay closed. No old vendor-password blocker is reopened.


### Scoped web list pagination — local follow-up, 2026-10-16

- [x] Removed the public 500-record failure for vendors, slaughter records, invoices and notifications. Read pages are municipality-scoped, administrator-only and document-ID ordered; signed cursors bind identity/scope/endpoint/page size/expiry and reuse the stable production key. Invoice detail no longer loads the vendor register.
- [x] Shared list screens/selectors/statistics traverse all bounded pages before using the complete register. Local filters/order/display pagination remain intact. Refresh retains filter state, aborts stale work and shows persistent errors instead of publishing partial counts/reports; expiry restarts once. Dashboard database aggregates remain independent.
- [ ] Production acceptance: deployed index readiness and representative large-register read latency/memory, concurrent-change refresh behavior, and role/scope denial on the approved release. No live acceptance or infrastructure change was performed locally.
- [ ] Separate reporting gap: reconcile legacy slaughter-register volume with the individual animal register and incomplete historical species splits. Do not label either as a verified combined report or invent ratios. Very large exports and cross-request snapshots remain outside this list fix.

Pagination validation: 140 server tests and 8 client pagination tests passed; web typecheck, server syntax checks, build and diff checks passed. Existing large-bundle warning remains. Synthetic stores and temporary loopback HTTP tests only; no live Firebase, deployed-index or browser/device acceptance was performed.


### Reporting completeness correction — local, 2026-10-16

- [x] Removed inferred historical Cow/Pig splits and missing-count-to-zero read fallbacks. Recorded numeric zero remains zero; missing/invalid values remain unavailable. Valid recorded totals and labelled known subtotals are retained.
- [x] Dashboard and statistics expose unknown/missing species, invalid totals/splits, dated coverage and incomplete chart gaps. Tables and print/PDF use the same labels; incomplete vendor rankings and fee pies are withheld. Historical prefills do not invent values. No records were rewritten.
- [x] Municipality-scoped projected completeness scans use bounded 500-document batches and inspect every page. Complete financial count/sum queries remain independent of recent lists or client pages; incomplete amounts have explicit coverage.
- [ ] Accept production-scale completeness read cost/latency and concurrent-refresh behavior. Multi-query reports are not accounting snapshots; cross-register historical reconciliation remains unresolved. All existing financial/carcass production guards remain intact.

Reporting validation: 150 server tests passed, including shared reporting/receipt labels, legacy/scoped dashboards, missing species with three recorded heads, missing versus zero counts, mixed coverage, undated rows and bounded traversal above 500. The 8 pagination client tests, web typecheck, server syntax checks, build and diff checks passed; the existing bundle-size warning remains. Tests used synthetic stores only. No real browser/PDF visual acceptance, live Firebase or stored-data repair was performed.
