# Production release checklist — web and Android

Updated 2026-10-16. Objective: ongoing real-user use of both applications. This is the single current release checklist; older pilot plans/audits are historical evidence. Current local source is authoritative; Graphify indexes are stale/divergent. Preserve existing work. This checklist authorizes no live data/IAM changes, deployment, commit or push.

## Code defects and missing functionality

- [x] Staff/inspector activation is implemented: allowlisted administrator only; matching pending account/profile/membership and Auth identity/claims; explicit staff functions; atomic status changes and audit. Activation defaults off in normal server mounts. Focused account tests: 17 passed at checkpoint review.
- [x] Carcass backend/web/Android implementation and exact contract are complete locally (CARCASS_WEIGHT_API.md): integer grams, current inspector approval, inventory/admin writers, independent revisions, invoice/dispatch lock and transactional audit. Original live weight, inspection and fees remain unchanged.
- [x] Both rehearsal adapters use explicit --enable-carcass-weight with demo/loopback validation; Android retains --preserve-fixtures. No production environment flag enables this feature.
- [x] Android connected-test selectors fixed in ba2229e. After guarded missing-only demo prerequisite restoration and complete preflight, AnimalRehearsalDeviceTest.realRegistrationConflictReinspectionIsolationAndPermissionRemoval actually executed: 1 passed, 0 failures/errors/skips. This acceptance blocker is resolved.
- [x] Production legacy dashboard/store reads are now scoped and bounded; dashboard totals use database aggregates. Public list views now traverse bounded signed cursor pages above 500 rows; historical reconciliation and large-export acceptance remain separate requirements. Reuse the 129 passing server tests, four rehearsal safety tests, web typecheck/syntax/build and diff checks from the foundation implementation.

- [x] Pending Android capability/session changes default unknown or absent write flags off, separate payment/tracking permissions, retain authorized history during pauses and stop uploads after capability removal/account changes. The four delivery-map assets move unchanged from rehearsal to main with attribution/license and a URL allowlist. Saved XML newer than the reviewed Kotlin sources shows 94 tests per debug/release/rehearsal variant, 282 executions total, zero failures/errors/skips. This is automated evidence, not new UI acceptance.
- [x] **Historical Android combined-role navigation blocker resolved in `eb2d519` (included in current `ab771a0`).** Current `AnimalSession.login` attempts authorized animal history independently of write flags; `staffStartDestination` chooses animals unless reads are explicitly denied and operations remain available. Recorded `AnimalIntegrationTest` passes mixed-role empty/nonempty history and all billing/delivery flag combinations, operations-only access and transient-read retry routing in both variants (24 cases each; 2026-10-16T12:21Z). Physical combined-role navigation acceptance remains pending; no new connected run is claimed.
- [x] **Historical Android packaging-verifier dependency resolved in `eb2d519`.** Current `rehearsal/verify-android-packaging.py` no longer requires excluded `tracking-map.html` or `leaflet/leaflet.js`; it checks tracked shared map assets, attribution/license, production fixture exclusion and rehearsal guards. Existing debug/release/rehearsal APKs passed again during Android reconciliation. No clean-checkout rebuild was performed. Do not include unrelated rehearsal assets.

## Business decisions requiring owner answers

- [ ] Slaughterhouse must confirm included/excluded body parts before production carcass recording. Recorder role, approval stage, pre-invoice/dispatch timing, independent revisions and reasoned corrections are now agreed and implemented. No yield or weight-ratio rules are assumed.
- [ ] Approve official versioned fees, charge basis, invoice/receipt numbering and financial correction/reversal policy before real billing. Synthetic per-animal fees are not official rates; carcass weight must not silently change pricing.
- [ ] Confirm production role/activation responsibilities, business/stall ownership and onboarding/recovery procedure; decide whether verified email is required. Successful vendor login after account transfer was observed; the earlier password failure is historical, not an unresolved blocker.

## Infrastructure/security configuration

- [ ] Review target project and generated release configuration together. Current Android main app/google-services.json identifies com-slaughterhouse-app, correcting the older mismatch finding; this alone does not verify deployed project/app/signing configuration.
- [ ] Complete authenticated/physical HTTPS acceptance and signed distribution review. Current Android generated debug/release BuildConfig uses `https://web-slaughterhouse-monitoring.onrender.com` via committed gradle.properties; the earlier empty effective-origin finding is historical. Anonymous GETs to mobile me/invoices/animal-settings/operations-settings returned JSON 401 with no-store. This does not verify authenticated identities or current capabilities. Release signing remains unconfigured.
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

Historical checkpoint proposal: committed as `eb2d519` after the navigation/verifier corrections above; current Android HEAD `ab771a0` additionally includes orange branding. The former hold is resolved. Paths below describe that historical checkpoint; the four old asset paths are deletions paired with main asset additions, not permission to delete unrelated assets.

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

### Real-user acceptance preparation — 2026-10-16, for 2026-10-17

This focused update supersedes older infrastructure-unverified statements only for the observations below. It does not approve an operational rollout. No live writes, account/permission changes, provisioning, deployment, staging, commit or push occurred. All unrelated local changes remain excluded and preserved.

**Release identity and evidence limits**

- Local branch `fix/foundation-up`, HEAD `d5a21743de96403922603b5c4152b7a02b3f57c9`. Owner reports this UI release deployed and working. Public deployed HTML serves `index-CTL8UkEf.js` and `index-CL4__l0X.css`; the stylesheet was byte-identical to the local pre-fix build (SHA-256 `c33af45397eb34300552adf28e8867dddc3a58addf062b109d03b87e27ec6132`). The deployed script contains the dialog portal layer. Its hash differs from the local build; public build configuration can affect artifacts. No public endpoint attests the exact backend commit or Node version, and Render deploy/config/log access was unavailable.
- Deployed `/healthz` returned 200 `{"ok":true}` and `Cache-Control: no-store`; anonymous `/api/session` returned 401 JSON. These are public availability/authentication-boundary observations, **not authenticated deployment acceptance**.
- Safari has the deployed tab open, but JavaScript inspection is blocked by its disabled “Allow JavaScript from Apple Events” setting. No password/token was requested, copied or printed, and no replacement identity/token was minted. Deployed effective capabilities, approved-administrator reads, real role/vendor isolation, account switching/revocation and protected history/detail reads remain unverified. The last reported nine-gates-off configuration is retained as historical evidence only.

**Read-only infrastructure observations**

- [x] Existing Firebase operator login was used for metadata reads. All ten required composite definitions in the preserved create-only plan are currently `READY` (10 composites returned). Automatic-index query acceptance and representative page-boundary/performance behavior still require authenticated deployed reads. No index creation command was run.
- [x] The currently published `cloud.firestore` ruleset exactly matches local `firestore.rules`: recursive deny-all for direct clients. Published ruleset `37296eb4-4c86-4ae4-9c89-c18807aac23a`, release update `2026-10-09T12:27:20.456523Z`. This protects direct clients; Admin SDK authorization relies on IAM and the API.
- [x] Project IAM binds the documented `render-readonly-pilot` service account, without a binding condition, to custom role `renderReadDeactivate` with the seven reviewed permissions: database get, entity get/list/create/update, and Auth user get/update. Existing datastore/Auth viewer roles are also present. This confirms direct project grants, not the credential actually loaded by Render, inherited/group/deny policies, or successful deactivation. The local `.env` credential is a different principal, so local startup cannot certify Render IAM. No live deactivation was attempted.

**Focused security review and confirmed local fixes**

- Current source verifies revocation-aware Firebase tokens and allowlisted web UIDs; mobile access additionally requires active matching role/scope claims and protected membership, active scoped vendor ownership, and role-specific staff permissions. Production scope comes from the validated manifest. Scoped lists and signed cursors bind principal/scope/route/page size/expiry; mobile vendor reads validate returned ownership. New production read mounts and emergency deactivation precede the legacy write guard intentionally; each recording path has its own feature/role checks. Emergency deactivation remains a separately authorized write and protects existing administrator accounts. No confirmed authorization bypass was found in the reviewed paths.
- Graphify's `6fd00ea` snapshot identified authentication tests (`access`, `accounts`, `animals`, `mobile`) but omitted `scoped-lists.js`. Findings were checked against current local source and tests; unchanged successful authorization/pagination/carcass checks were reused. No broad audit or full suite rerun was performed.
- Confirmed on the deployed public bundle: invoice display/print/PDF calls any invoice an “Official Receipt” and asserts same-day/no-advance payment rules. **Fixed locally only**: neutral invoice-record heading, explicit historical-copy/policies-await-approval wording, and removal of blank official signature templates. Paid/unpaid status, stored amounts and dates are preserved. Exclude deployed invoice printing/PDF from tomorrow's acceptance until this fix is separately reviewed/released. Legacy same-day write behavior remains behind the closed write guard and is not an approved policy.
- Confirmed with synthetic malformed JSON: parser messages can contain submitted text, and the central API handler logged them verbatim. **Fixed locally only**: centralized error handler logs fixed status metadata, preserves safe 400/413/503/500 responses and explicit public coverage messages, and sanitizes errors forwarded after response headers. Existing deployed logging remains a release follow-up; avoid malformed-body probes against production.
- Verification after these fixes: **15 focused server tests passed**, **all eight isolated Chrome cases passed**, and paid/unpaid display/print-area/downloaded-PDF regressions passed. Typecheck, server syntax, new-module syntax, build and whitespace checks passed. Existing bundle-size warning remains. No new Safari, physical-device or authenticated deployed acceptance is claimed.

**Dependency/security tooling**

Existing package scripts provide typecheck, server tests/syntax, UI pagination/tracking tests, build and rehearsal safety checks. No repository CI/security workflow or dedicated dependency scanner configuration was found in the targeted tooling check. `npm audit` was run against the unchanged lockfile: **23 affected packages (4 critical, 12 high, 7 moderate)**, including inherited findings; this is not a count of independently reachable exploits.

Application reachability review: jsPDF is used only for text and `save()`, with no HTML/image/AcroForm/addJS/new-window-output calls; the critical [new-window HTML advisory](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5) needs those absent output options. Express does not configure proxy trust or IP-based authorization, so the [proxy-addr trust-subnet advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) lacks its trigger. Concurrently/shell-quote are development tooling with fixed repository commands; glob/selector/source-map advisories concern build/watch inputs, not uploaded application data. Router destinations are fixed application paths and no SSR hydration is used. The flagged gRPC 1.9.16 belongs to unused client Firestore dependencies; server Firestore/google-gax resolve gRPC 1.14.5. gaxios uses UUID v4, not the reported v3/v5/v6 buffer overloads. No reachable dependency exploit was confirmed in the reviewed application paths; vulnerable versions remain installed and require a targeted maintenance plan before adding affected features. No blanket upgrade, forced audit fix, package or lockfile change was performed.

**Tomorrow's smallest safe scope and outstanding acceptance**

Recommend a **supervised read-only web acceptance session with approved existing users**, conditional on the checks below passing first. Do not call this approval for routine operational use. Keep all nine business gates off. Exclude official receipts/PDF, registration/onboarding/activation, animal/inspection/carcass recording, billing/payment/corrections, delivery assignment/GPS publishing, and live emergency-deactivation testing.

1. Using an existing approved administrator in the deployed browser, confirm GET `/api/session` returns `writesEnabled:false` and all nine `capabilities` false; GET `/api/health` returns 200 with `store:"firestore"`. Record sanitized status/capability evidence, never credentials or raw account records.
2. GET `/api/accounts/settings`: management/activation false, intended emergency `canDeactivate:true`; GET `/api/animals/settings` and `/api/operations/settings`: historical reads available and every recording/payment/delivery/tracking capability false. A visible button or source default does not establish deployed enforcement. No live POST/PATCH/DELETE is part of this session.
3. With that administrator, GET the four scoped register endpoints with `pageSize=1`, follow a returned cursor, and inspect dashboard plus an authorized invoice/history detail. Record unavailable-data labels, completeness, latency and errors; empty registers cannot establish page-boundary acceptance. Do not describe historical dashboards as reconciled financial accounts.
4. With existing approved mobile vendor/staff/inspector identities on the reviewed artifact, confirm `/api/mobile/me` and permitted own/scoped reads. Check denial with an existing inappropriate identity and verify vendor ownership without fetching another person's records as a test fixture. Tampered/cross-user cursor cases stay local. No approved mobile identities/artifact were available for automated acceptance here.
5. Before any operational release, obtain the approved carcass inclusion/exclusion definition; versioned official fee basis/amounts; invoice/receipt numbering; payment timing/receipt policy; and correction/reversal procedure. Confirm onboarding/activation responsibility, vendor/stall ownership, recovery and verified-email policy. Do not infer approval from earlier rehearsal code or successful login.
6. Android navigation and excluded-asset verifier source defects were resolved in `eb2d519`; preserve physical combined-role rollback/navigation acceptance, release signing, authenticated phone HTTPS, isolation/offline/map/GPS acceptance as open. A clean-checkout rebuild has not been newly performed. Establish the matched artifact/config rollback target, backup/recovery, monitoring and retention before ongoing real-user use.

### Supervised acceptance follow-up — user-observed emulator evidence

- [x] Owner reports vendor login and manual button checks now work in the **normal Android debug app on an emulator**. Record as user-observed emulator evidence only. Exact button coverage, API responses and backend gate values were not supplied; no operational-write success, isolation, signed-release, physical-device or mobile-network acceptance is inferred. Existing physical-device acceptance items remain open.
- Earlier supervised attempt: Safari blocked inspection while “Allow JavaScript from Apple Events” was disabled; no authenticated API requests or logout occurred then. This historical blocker is superseded for the administrator checks recorded below. Never paste tokens, passwords, raw responses or personal records.
- No application or production configuration was changed for this follow-up; no live writes, account changes, gate changes, commit, push or deployment occurred. The administrator GET-only procedure above remains the acceptance requirement; public health/anonymous 401s and emulator success cannot substitute for it.

### Authenticated deployed administrator acceptance — 2026-10-16 12:58 UTC

Owner enabled Safari Apple Events inspection and prepared the approved deployed administrator tab. The reviewed private browser probe ran against `https://web-slaughterhouse-monitoring.onrender.com`. The first attempt stopped before API requests because its existing stored token had expired; reloading the app through its normal Firebase session recovery restored the workspace. No token/password/private record was returned to the assistant. The acceptance probe used GET only; no gates, accounts, data or settings were changed.

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Authenticated administrator session | Passed | `/api/session` 200; role administrator and returned UID matches the private browser session; no identity value recorded. |
| Effective production gates | Passed | Exactly nine capabilities false and `writesEnabled:false`; response `no-store`. |
| Authenticated runtime read health | Passed | `/api/health` 200, `store:"firestore"`, `no-store`. This accepts observed runtime reads, not every IAM operation or an exact backend commit. |
| Account settings | Passed | 200, expected municipality scope, historical reads enabled, management/activation false, intended emergency `canDeactivate:true`; no deactivation attempted. |
| Animal/operations settings | Passed | Both 200; historical reads enabled and all reviewed recording/carcass/billing/payment/delivery/tracking flags false. |
| Four scoped register first pages | Passed | Vendors, slaughter records, invoices and notifications: 200 JSON with bounded `pageSize=1`, correct scope for returned rows and `no-store`; approximately 334–510 ms per request. Vendor page nonempty; other three pages empty. |
| Actual page-boundary traversal | Unverified | None of the four first pages returned `nextCursor`; existing data did not provide a page boundary, and no fixtures were created. |
| Invoice detail | Unverified | No eligible existing invoice returned; no guessed IDs or other-user record probes. |
| Animal history register | Passed | 200 scoped list, `no-store`. |
| Animal audit/detail history | Unverified | No eligible existing animal returned for a detail/history request. |
| Dashboard | Passed | 200 with summary and explicit record-basis label; `no-store`, approximately 500 ms. Does not certify historical financial reconciliation. |
| Cross-identity/cross-record isolation | Unverified | No explicit test identity/record pair was approved; no such probes performed. |
| Logout | Passed — 2026-10-16 13:00 UTC | Owner confirmed using the application's normal Sign out button. Token-free probe confirmed sign-in screen visible, workspace absent and no persisted default-app account. GET `/api/session` and `/api/mobile/me`, without Authorization headers, both returned 401. No former token was read or reused. This verifies client logout, not token revocation. |

No failed application check was observed in this run. Vendor own-profile/invoice deployed acceptance remains separate from the user-observed Android emulator evidence. Physical-device, page-boundary/detail/history, isolation and operational-write acceptance items remain open.

**Single repeatable real-screen rehearsal**

ALL_ROLE_DEMO.md starts with the current supported-onboarding procedure and a shared 60-minute handoff sequence; older reserved-fixture runs are explicitly historical. It reuses the existing guarded web panel, Android adapters and missing-only fixture tools. On 2026-10-17, run `flow-1792172121150` created two fictional businesses and six fresh actors through actual Users forms, completed private password setup and reviewed staff/inspector activation. Private checks verified active SCOPE-A memberships, single staff functions, vendor links, municipal claims and all six mobile profiles HTTP 200. The existing demo panel now has a masked Firebase `confirmPasswordReset` form because the installed emulator action endpoint offered only password-in-URL JSON instructions. Typecheck/build and four rehearsal safety tests passed after that change. No password/OOB/token is recorded in evidence.

**Historical intermediate checkpoint (superseded by the completion/reconciliation result below):** Android acknowledged emulator-5554 / Pixel_10_Pro readiness, installed the hash-verified patched rehearsal APK without clearing app data and received explicit protected-file handoff. Real Android screens passed fresh Pig registration at 85001 grams, current-revision inspector approval, carcass 60001 grams/revision 1, one synthetic PHP 95 invoice, mandatory-receipt full cash payment, delivery self-assignment and in-transit status. At that point, controlled tracking was on hold: a position/open map appeared outside the recorded grant/GPS/map driver steps. Android initially stopped publishing, but later observed sharing active again; normal Stop/lifecycle acceptance was then unverified. It force-stopped only the rehearsal package while preserving data; the rehearsal process was confirmed absent and the retained position was unchanged over a five-second observation. This is containment evidence, not durable-stop acceptance. No outstanding driver was found then; manual/single-controller clarification was pending at that point. At that intermediate checkpoint, delivery completion, vendor A/B isolation and final web reconciliation were unverified; their later scoped passes are recorded below. See ALL_ROLE_DEMO.md for the exact resumable checkpoint; no reset/reassignment was performed. Stale web 5004/5174 and subsequently Android-owned adapter 5003 were reloaded with their existing isolated configurations/carcass option; 5003 retained `--preserve-fixtures`. All six fresh roles' effective animal/operations capabilities then matched least privilege, including explicit payment/tracking booleans. Auth/Firestore/5002 processes remained intact. Reload verification found all 223 Firestore documents unchanged and no Auth identity additions/removals; six fresh actors' full Auth hashes changed during overlapping acknowledged verification sign-ins, so full Auth byte-equality is not claimed. Details are in ALL_ROLE_DEMO.md. No reset, duplicate repository fixture helper, production change, commit, push or deployment occurred. Fresh local onboarding does not establish production mailbox delivery, physical-device acceptance or completion of the full operational flow.

Actual web account History reads passed for all six fresh actors, including provisioning and four reviewed activation histories. Normal demo Sign out cleared the workspace and a fresh token-free account-settings request returned 401. No prior token was reused for logout verification. This is separate local evidence; deployed administrator acceptance above remains unchanged.


Current evidence-backed status: the existing six fresh web-created actors completed synthetic mobile
access and the linked inventory/inspection/billing/delivery flow. Delivered revision 5, the single
completion audit event, Vendor A reads, Vendor B exact-invoice isolation and controlled web
reconciliation/logout passed as detailed in ALL_ROLE_DEMO.md and the committed preserve-mode
result below. Only the reserved synthetic administrator uses the public demo credential; fresh-actor
passwords/action codes remain protected and are not evidence/publication artifacts. No new workflow
or device action is authorized by this record.

Vendor A's UI animal-label assertion remains unverified. Tracking timing/concurrency limits, original
incident uncertainty, both unexplained reserved-administrator Auth hash differences, physical-device
and pending-account-denial acceptance, mailbox delivery, production account/mobile-login evidence,
activation/email-verification/recovery responsibilities and runtime user-create IAM remain open.
No full Auth-equality, universal tracking correctness or production-readiness claim is made. Production
policies/gates, unresolved security advisories and signing/release requirements remain unchanged.

## Local web rehearsal preserve-mode restoration — 17 October 2026

This result supersedes the historical completion/reconciliation-pending statements above and in
ALL_ROLE_DEMO.md for the existing supported-onboarding synthetic run. Android reported one completed
delivery (revision 5), Vendor A read agreement, Vendor B empty lists and exact-invoice detail/tracking
404s, followed by normal mobile logout and restored force-stop. The separate web read-only audit
verified exactly one completion event with matching assignee, animal, scope, time and final invoice
snapshot. Android's case-sensitive UI animal-label assertion remains unverified; API identity matched.
Those completed steps require no repetition. No new device action is authorized by this record.

Added `--preserve-fixtures` to the documented web launcher, with read-only reserved-administrator
prerequisite validation and no provisioning fallback. Existing default behavior retained. Nine focused
startup/safety tests passed, along with syntax/diff checks. Started only missing 5004/5174 listeners;
the existing Auth/Firestore/5002/5003 PIDs were unchanged. No gates or carcass flags changed.

Web-owner checkpoint verification on 17 October ran the five startup tests and four existing safety
tests once: nine passed, zero failures/cancellations/skips, exit 0. Sanitized execution output is saved
locally at `.rehearsal-runtime/preserve-mode-checkpoint-20261017/focused-tests.sanitized.log`.
These isolated tests use mocked startup dependencies and do not restart services or access fixtures.

Authorized controlled browser reconciliation passed for the same Paid PHP95, Delivered revision 5
invoice, payment/reference, assignment/destination, retained tracking and linked approved animal
(revision 1, live 85.001kg, carcass 60.001kg, measurement revision 1, locked, with history).
Normal sign-out cleared protected UI and persisted user in that browser context; five token-free
GETs returned 401. Pre-existing browser tabs were untouched; no global logout/revocation claim.

All 233 Firestore document hashes were unchanged after startup and browser checks. Auth count
remained 35 with no additions/removals. The reserved administrator's hash differed both from before
startup to after startup and from after startup to after browser reconciliation. Both differences remain
unexplained: neither is established as session metadata. The initial and final phases retained hashes
only, so changed field names cannot be recovered. The two saved raw administrator exports have no
changed fields and both match the after-startup hash; they do not explain either hash difference.
A separate direct before/after run of the actual preserve-mode reader reported no administrator
field changes. A pre-existing Chrome connection was observed, without establishing causation.
Do not claim full Auth preservation from these comparisons.

Sanitized details/evidence are in Android's ignored `.rehearsal-runtime/web-preserve-restoration/`
(`RESULTS.md`, `browser-results.json`); private readbacks/exports are not publication artifacts.
No new fixtures, business writes, production access, healthy-service restarts, Android actions,
commits or pushes. Android remains under its force-stopped hold. Historical incident cause remains
unconfirmed; this is scoped synthetic acceptance, not complete production readiness.

Reported tracking acceptance on Android checkpoint 95769a0 covers the observed permission,
Start/Stop and lifecycle cases only. Exact in-flight HTTP timing, callback order, controller IDs and
device maximum concurrency remain inconclusive; completion of an already-sent request after Stop
was not established. Physical GPS/mobile-data/network recovery, production policies and operational
enablement remain open. Existing security/dependency findings, including critical jsPDF, remain
unresolved by this checkpoint. Production gates are unchanged; Android's hold remains intact.
