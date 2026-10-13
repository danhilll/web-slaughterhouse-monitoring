# Session resume — web-slaughterhouse-monitoring

## Quick handoff for the next session

- As of 2026-10-09, the four-step Firebase foundation review reached its final local verification. Firestore client access is locked down live; Firebase web sign-in and the authenticated API are connected; the remaining data-model work needs the Android Studio project from the other laptop.
- The web app is not deployed. Web writes remain intentionally disabled because live Firestore has only four `Users` documents and none of the dashboard's business collections. The sample fee values are labeled as samples because no live fee schedule exists.
- The owner confirmed the read-only dashboard opened after signing in. The latest session-handling and fee-warning UI changes still need one manual browser recheck.
- Last checks passed: `npm run verify` (typecheck, six auth tests, seed dry-run, build), read-only Firebase connection, and anonymous Firestore denial. The build has a large bundle warning.
- Start next time by reading [DATA_MODEL_RECONCILIATION.md](DATA_MODEL_RECONCILIATION.md), checking `git status`, and asking for the copied Android Studio project folder path. Inspect mobile Firestore/Auth code before writing migration logic or replacing the deny-all client rules.
- No service-account key or password was committed. `.env` and the old-rules backup are Git-ignored. Working tree changes are uncommitted on `fix/foundation-up`.

## 2026-10-09 security and connection update

- The user authorized work on Firebase access and the web connection. Local web sign-in and server token authorization are implemented on `fix/foundation-up`.
- Firebase Console screenshots showed three Email/Password Auth accounts and a live `Users` collection. The owner later clarified the mobile app is not currently open or active; its source remains on another laptop. A selected UID profile has `role`, `status`, and `vendorID` fields.
- The owner explicitly approved blocking all direct mobile/client Firestore access while the unused mobile app source remains unavailable. On 2026-10-09, the old public time-limited rule was saved to Git-ignored `.firestore-rules-backup.local.json`; the new deny-all `firestore.rules` was validated through the Firebase Rules API and published to `(default)` as ruleset `37296eb4-4c86-4ae4-9c89-c18807aac23a`. An anonymous request for an existing document returned `PERMISSION_DENIED`. Do not restore the public rule.
- Mobile Firestore reads and writes are blocked until its code is inspected, replacement rules are designed and tested, and a new ruleset is published. The web dashboard uses the Admin SDK through the authenticated Express API and is unaffected by client rules.
- Web access uses a server-side `WEB_ADMIN_UIDS` allowlist, independent of Firestore role fields. The owner supplied one UID and the web `firebaseConfig`; both are configured in a Git-ignored local `.env`. A second UID can be added later. The owner supplied an Admin SDK JSON path outside the repository; a read-only check confirmed Firestore reachability and that the selected Auth account exists and is enabled.
- A read-only inventory of the live database found one root collection, `Users` (four sampled documents). Sample field names differ in capitalization/spelling (`status`/`Status`, `fullName`/`fulName`). The dashboard's expected business collections are absent. Web API mutation routes are temporarily blocked, and the UI reports this, to prevent disconnected records.
- The database is Standard edition in `asia-southeast1`. `DATA_MODEL_RECONCILIATION.md` records the verified field shapes and the unresolved mobile/web mapping. The demo seed script now refuses live writes to the shared project, and the dashboard labels sample fallback fees because `config/serviceFees` is absent. No live business data was written.
- Browser sign-in initially returned `auth/invalid-credential` because the selected Firebase Auth UID and its `Users/{uid}` profile had an email spelling error. The owner confirmed the correct Gmail spelling. We checked uniqueness, corrected only that UID's Auth email and matching profile email, generated a one-time reset page locally without posting the link in chat, and the owner confirmed the read-only dashboard opens after sign-in.
- The web session now rechecks access on Firebase ID-token changes and closes the dashboard on API 401/403 responses; API startup rejects mismatched web/server Firebase project IDs. This prevents previously loaded dashboard data remaining visible after an API authorization failure. The UI change passed local typecheck and build; a new manual browser sign-in after this change has not yet been reported.
- Firebase Admin initialization was updated to the installed SDK's modular `firebase-admin/app`, `/auth`, and `/firestore` entry points. The API now reports a missing local credential clearly.
- The web's `vendors`, `slaughter_records`, and `invoices` model has not been reconciled with mobile's `Users`/`vendorID` model. Do not run the live seed script against the shared project.
- The selected Auth user's email and matching `Users/{uid}.email` were corrected to the Gmail address confirmed by the owner. The selected UID and other users/documents were not changed. The deployed Firestore rules were changed as described above; no live business data was seeded.

> One honest note: I can't control whether this chat app keeps history between
> opens — that's the app's session storage, not something I can switch on.
> THIS file is the reliable part: full project state, so any fresh session
> can continue brick-by-brick with zero re-explanation.

## Current verification and remaining gates
- Branch: `fix/foundation-up`; working changes are not committed.
- Local `npm run verify` passes: typecheck, server syntax, six authorization tests, seed dry-run, and production build. The build reports one large JavaScript chunk warning.
- Read-only live checks confirm Firestore reachability, the selected administrator account is enabled, and anonymous direct Firestore access is denied.
- The owner previously confirmed the web dashboard opens after Firebase sign-in. A repeat browser sign-in after the later session-handling and fee-warning UI changes has not yet been reported.
- The web app has not been deployed. The mobile source is unavailable, its Firestore queries and writes are not yet mapped, and web writes remain disabled. `config/serviceFees` is absent, so displayed fee values are marked as samples.

## Key decisions (locked)
- Database: Cloud Firestore, project `com-slaughterhouse-app`, region `asia-southeast1`
- Access model: Express + firebase-admin is the intended business writer, but web mutations are currently paused; direct Firestore client reads and writes are temporarily denied for every user.
- Business rules: same-day due dates, manual status flips, Both-records keep explicit cow/pig split, Manila wall-clock dates, YYYY-MM buckets, prefixed collision-free IDs
- Auth posture: Firebase Email/Password sign-in is wired locally; API access requires a verified Firebase ID token and a server-side UID allowlist. The owner's first administrator UID and local Admin SDK credential path are configured in Git-ignored `.env`. A second administrator UID can be added later.
- Mobile plan (DISCUSSED ONLY — user said do not build yet, wait for signal):
  Web "Users" admin panel creates mobile accounts (vendor/staff/admin) via
  backend `auth.createUser()` + `users/{uid}` docs; mobile signs in with
  email+password against the same project. ~5 bricks when approved.
- Android repo: NOT yet shared. Needed to start mobile track: absolute
  Windows path of the Android Studio project folder.

## Pending / next actions
- Copy the Android Studio project to this laptop and provide its folder path. Inspect its Firestore paths, queries, writes, and Auth flow before re-enabling direct client access.
- Complete the `Users`/`vendorID` to web-business-model mapping. Use a separate test project or emulator for migrations and rules tests; do not seed demo fixtures into the shared live project.
- Obtain approved fee rates before enabling billing. Keep web writes paused until the data contract, rates, and migration are verified.
- Recheck browser sign-in after the latest UI changes. Add a second web administrator only after the owner supplies that account's Firebase UID.

## Sensitive items (never committed)
- `.env` (git-ignored), service-account JSON, `FIREBASE_PRIVATE_KEY`
- Backup of original Firestore config: `C:\Users\Acer\AppData\Local\Temp\opencode\b2-backup-20261003\`

## Why these decisions were made (context for future sessions)

- **Firestore over Supabase/Postgres:** repo already had `firebase.json`,
  `.firebaserc` (`com-slaughterhouse-app`), and the `firebase` SDK installed
  but unwired — adopting it reused existing config instead of adding a new
  stack. Mobile (Android) also integrates with Firebase Auth/Firestore most
  easily, which the owner needs for the vendor mobile app.
- **Express + Admin SDK as intended business writer:** billing totals must be
  computed server-side. Current web writes are paused, and the temporary live
  Firestore rule denies every direct client read and write until mobile access
  requirements are reviewed.
- **Same-day due dates, manual status flips:** matches the treasurer office's
  real policy printed on receipts ("SAME-DAY PAYMENT REQUIRED"); no silent
  auto-overdue job, so nothing changes state behind the treasurer's back.
- **Explicit cow/pig split persistence (B17):** auto-invoices billed the real
  split while stored records fell back to an even split — stored data must
  equal billed data for a government ledger.
- **Manila wall-clock dates (B12/B22):** server UTC dates shifted "today" and
  month buckets near midnight; office operates on Asia/Manila time.
- **Firebase Auth replaced the earlier demo-mode login:** the current web UI
  signs in with Firebase Email/Password and checks access through the server.
- **Web-created accounts plan (on hold):** owner wants the web app to be the
  single registrar of mobile vendor/staff accounts to avoid messy
  self-registration; backend `auth.createUser()` + `users/{uid}` role docs.
- **UI restyle U1–U6 (refined emerald gov):** professor feedback called the
  original UI ugly; direction chosen by owner. Surface-only, zero logic
  changes, verified by `npm run verify` after every brick.

## 2026-10-10 security + load diagnosis (project ~50% complete)

- Owner asked: how vulnerable is this to many docs / many concurrent users, where are bottleneck codes and guards, what is best security layer.
- Diagnosis given (no code changed, no pentest run yet):
  - Guards holding: `firestore.rules` deny-all (`/{document=**}`), `server/access.js` `verifyIdToken(token,true)` + `WEB_ADMIN_UIDS` allowlist, `createWriteGuard(false)` pausing all POST/PATCH/DELETE, `express.json 64kb`, generic 500 handler, `Cache-Control: no-store`, `.env` git-ignored.
  - Load bottlenecks: fake pagination `server/index.js:48-56 applyLimit` (fetch-all then slice); unbounded `.collection().get()` in `listVendors/listRecords/listInvoices/listNotifications` (`server/index.js:331,366,416,466`); `buildDashboard()` full 4-collection scan on every call (`server/index.js:582-588`); frontend `loadData()` 6 parallel GETs per page load (`src/App.tsx:184-191`) + client-side filter/paginate; `markAllNotificationsRead()` unbounded single batch (`server/index.js:499-510`, fails >500); two-step non-transactional auto-invoice (`src/App.tsx:282-345`); `Math.random()` IDs (`server/index.js:22-26`); no rate-limit/helmet/compression/timeout; `verifyIdToken` every request with no cache; defined indexes in `firestore.indexes.json` unused; single Node process.
  - Security gaps: no App Check / MFA / WAF / audit log; coarse single `admin` role via env (prefer custom claims); no field max-length caps / stored-XSS audit for notes/notifications/PDF; inline `FIREBASE_PRIVATE_KEY` in `.env` risk (prefer file + Secret Manager).
- Recommendation locked for later: keep deny-all Firestore + Express Admin-SDK gateway; P0 = rate-limit + helmet + compression + real cursor pagination + dashboard/fees cache + token cache + batched mark-all-read + idempotency; P1 = App Check + MFA + custom claims + audit_log; P2 = Cloud Run/App Hosting autoscale + Cloud Armor + Cloud Logging alerts + k6 load test at 5k docs.
- Owner context: this is ~50% of project, other features not yet added. Owner is fixing UI/UX design first. Agreed UI work must stay via `/api/*` + `apiFetch`, no direct Firestore from client, no secrets in `VITE_*`, no `dangerouslySetInnerHTML`.
- Deferred: full intrusion test only AFTER UI + remaining features land. Owner will signal with `ready for full security test`. Then run: auth bypass, IDOR, write-guard bypass, limit abuse, dashboard flood, Firestore probe, CORS/headers, stored XSS fuzz, secrets/error-leak audit. Needs staging URL + test admin + test non-admin accounts + list of new routes.

## 2026-10-11 pause and mobile integration handoff

The owner paused until tomorrow because usage is running low. Use this section for the latest mobile/Firebase status; it corrects earlier assumptions above. Keep future checks and replies focused.

- The owner now manages both repositories. Android source is at `C:\Users\Acer\AndroidStudioProjects\Capsto-Project`; web source is this repository. The owner runs Codex in Android Studio, pushes updates, then asks this web session to review them and provide the next prompt.
- Android is configured for `slaughterhouse-app-895d2`, a DIFFERENT project from the municipal web's `com-slaughterhouse-app`. The municipal deny-all rules do not control the old Android project. Old-project metadata access returned 403 and Console access failed. Do not repeat attempts with the same denied account.
- The owner told Android Codex that mobile was testing-only, no production mobile users were onboarded, and existing users are in the municipal project. Old-project data remains unknown, not assumed empty. Leave it untouched while preparing the main project.
- Mobile hardening removed demo seeding, presentation/name-login bypasses, automatic vendor creation, direct invoice/payment writes, and direct inspection writes. Current login requires server-managed role/scope claims. Scoped listeners start after login; local logout clears their jobs/state. Cross-ViewModel account switching and actual authorization flows still need integration tests. Vendor password trimming remains a known source issue.
- This session ran Android unit tests and Kotlin compilation successfully after setting command-local `ANDROID_HOME=C:\Users\Acer\AppData\Local\Android\Sdk`. No source or live Firebase data was changed by validation. Later commit `27c0ac4` removed tracked Gradle/IDE artifacts; do not rerun expensive checks for report-only updates.
- Latest reviewed Android commit: `84bb131`. Read `MAIN_PROJECT_INVENTORY.md` and `FIREBASE_INVENTORY.md` there. The new report records live authorized main-project reads, not just source assumptions.
- Main inventory: ACTIVE project; one Standard/native Firestore database in asia-southeast1; three enabled password Auth accounts, no custom claims; four `Users` documents, three matching Auth UIDs; two unresolved vendor links. No business collections, no scope fields, no stored fee schedule. Published Firestore rules deny all clients; zero deployed composite indexes. One web app registration, no Android registration. RTDB contents and some other services remain unverified.
- Current web API remains administrator-only through `WEB_ADMIN_UIDS`; writes are disabled. Android's camelCase fields/UID-keyed vendor profiles differ from web business IDs and snake_case fields. Do not grant mobile users web administrator access or change Firebase config merely to make login work.
- Last response supplied the implementation prompt below. Implementation has NOT been reported complete. Real roles, scope, vendor links, rates and production provisioning remain unapproved. Preserve existing users and `Users` records. No live migration, claims, memberships, rules, registrations, billing writes or Android project switch are authorized by the report.

### Next prompt for Android Studio Codex

Implement the first mobile integration milestone in an isolated emulator/test environment. Inspect both repositories and MAIN_PROJECT_INVENTORY.md first. Preserve existing changes and keep credentials private.

Use a separate `/api/mobile` route group in the municipal Express server. Preserve the web administrator API and its UID allowlist, keep official writes disabled, and retain deny-all direct Firestore client rules. Define a shared DTO contract preserving canonical web vendor IDs, `vendor_id`, invoice fields and payment statuses; do not fabricate missing billing or inspection data.

Propose server-owned `mobile_memberships/{uid}` records with role, status, municipalScopeId and vendorBusinessId where applicable. Authenticate Firebase tokens and enforce active membership, approved role, claim/membership agreement, linked vendor existence, scope and ownership. Missing or inconsistent data must fail closed. Implement `GET /api/mobile/me` and a paginated vendor-only invoice listing. Staff/inspector business endpoints stay unavailable until their access policy is approved.

Adapt Android authentication/vendor invoice loading to this API. Remove reliance on UID-keyed vendor business documents/direct listeners for migrated flows. Clear all account data and pending requests on logout/account switching. Test actual API handlers and Android data flows with synthetic identities: correct access, cross-vendor/scope denial, missing/inactive membership, wrong claims, disabled/revoked users, account switching and denied mutations. Run appropriate checks and save MOBILE_INTEGRATION_RESULTS.md with the final contract, changed files, test evidence and remaining production steps.

Do not change live accounts, claims, records, rules, registrations, permissions or google-services.json; do not deploy or enable billing. Do not infer real roles from historical Users.role or overwrite Users. The owner will push the result and notify this session for review before real-account connection.
# Latest handoff: 2026-10-11 device rehearsal complete

## Android foreground tracking reviewed on Windows - 2026-10-13

Reviewed clean local Android commit fbe8bac after owner updated from Mac. DeliveryTrackingSession has separate sequential job/15-second cadence, session-generation/serial guards, bounded recovery and Retry-After, explicit foreground stop/resume, selected-vendor polling and server-time-based location age. ForegroundLocation requests only fresh callbacks using monotonic capture time, releases listeners on cancellation, preserves actual GPS capture timestamp and supports permitted providers. OperationsScreen lifecycle observer stops publishing outside RESUMED; financial state remains separate. No source defect was demonstrated in this review.

Fresh Windows server suite passed 69 tests. Fresh focused rehearsal DeliveryTrackingTest + OperationsIntegrationTest compilation/unit run passed. Mac report records 126 unit executions, targeted operations tracking device test plus two existing rehearsal device checks, 11 tracking and 20 operations emulator checks. Do not claim a fresh Windows device run or a full five-test device pass for this review. Mac runtime screenshots are absent in Windows because ignored artifacts do not synchronize with Git.

Physical-phone blocker confirmed: RehearsalApplication strictly requires http://10.0.2.2:5002 and connects Auth/Firestore to 10.0.2.2. MobileRuntime uses 10.0.2.2:5003 for operations. This host is emulator-only. Next prepare an explicitly isolated physical-phone rehearsal configuration (e.g. loopback host with USB ADB reverse) and test connectivity before real GPS, while preserving demo project guards and production config. Walking/mobile-network tests need later shared reachable staging. No real accounts or official rates should be activated for the first physical-device rehearsal. Web browser rendering and real coarse-permission/network-loss checks remain outstanding.

## Verified server/web tracking foundation - 2026-10-13

Owner authorized implementing server first and testing before the mobile prompt/physical-phone stage. Added server/tracking.js and GET/POST /api/{mobile/}operations/invoices/{id}/tracking, using delivery_positions/{invoiceId}. New GPS transaction rereads active membership, invoice state/assignment and previous position, writes only latest position, leaves financial/invoice revision/audit untouched. New samples require in_transit, reject stale/out-of-order timestamps, duplicate exact retries make no write, persisted min interval 10s, 429 Retry-After; bounded per-router 30 requests/min/account map max5000 entries protects tracking storage calls. Legacy manual location endpoint preserves its invoice response and assigned/in_transit behavior, mirrors location to invoice without revision increment; it is not the automatic tracking route. Legacy full GPS-audit assumptions in Android-owned verifier/tests need explicit contract update.

Web DeliveryTrackingPanel polls only one selected visible delivery every10s, sequential/8s timeout, pauses hidden, cancels on unmount, clears on401/403, stops completed, derives age using server time and shows retained old location on errors. Map/background tracking not implemented. Browser interactive walkthrough pending; typecheck/build passed, existing bundle warning remains.

Fresh verification: 69 server tests including seven tracking tests passed. New rehearsal/verify-tracking.mjs passed 11 actual local Auth/Firestore checks, including transaction race, one position write/no invoice/audit change, dedup/rate/order, vendor/admin agreement, permission removal, completion with unchanged invoice revision, direct client denial; unique fixtures cleaned. Did not activate live data/config/rules/accounts/indexes or edit Android. Services already running were left alone; their Node adapters must restart before loading the changed modules.

TRACKING_API.md contains verified contract, limits/write estimates and exact next Android prompt. Next: implement foreground mobile tracking/provider/session cleanup plus selected-vendor polling using this contract, update expected GPS revision/audit assumptions meaningfully, run relevant emulator/unit/device checks and return for review before physical-phone staging. No commit or push occurred in this tracking turn. LIVE_TRACKING_PLAN.md is the earlier plan; this entry supersedes its unimplemented-server status.

## All-role demo ready for manual walkthrough - 2026-10-12

Owner chose all-role synthetic demo before real-account pilot. See ALL_ROLE_DEMO.md for emails/password, complete fictional business/stall and walkthrough. Started guarded demo Auth 9199/Firestore 8180, missing-only invoice adapter 5002, animal/operations adapter 5003, and new separate web history panel Vite 5174/API 5004. All were left running. Android rehearsal app was reopened on emulator-5554. Normal .env/live project/account ownership was unchanged.

New web source: rehearsal/web-demo.mjs, web-demo.html, web-demo.tsx; npm rehearsal:web script; tsconfig includes the standalone demo entry; rehearsal README links guide. Demo admin web-admin@rehearsal.example.test / ALL-ROLE-DEMO-WEB-ADMIN exists only in emulator and is allowlisted only in its isolated panel. Browser source refuses nonlocal/non-demo config and Auth connects to loopback emulator before rendering. Vite normal .env is excluded with envFile:false and explicit synthetic client defines. The panel reuses actual OperationsPage and protected operations router; it is not a substitute claim that every normal dashboard/report was tested.

Fresh verification: 20 actual operations API checks passed; app/test APK builds passed; typecheck, syntax and two safety checks passed; demo page/module 200 and demo admin history shows the same completed paid PHP 95 invoice created by the Android test. Full Android suite passed 4/5: remaining denied-account test consistently times out at keyboard visibility (RehearsalDeviceTest.kt:45), before authorization. Focused retry also failed; setting show_ime_with_hard_keyboard to 1 did not fix it and was restored to 0. No Android source/test assertion was weakened or changed. Main animal/inspection and operations flow, vendor switching, API authorization/denial checks passed. Record the unresolved keyboard test honestly; no full-suite pass claimed.

No commit, push, deployment, real membership activation or live invoice/payment happened. User should now manually register unique-tag animal for identity business, inspect/approve, bill/pay with demo reference, deliver, check own vendor/Bob isolation, and refresh demo web panel at http://127.0.0.1:5174/rehearsal/web-demo.html. Existing normal web 5173 remains separate. Terminal sessions started here: emulator launcher 10133, invoice API 79591, animal API 19676, web panel 9705. Keep services running until owner is done; emulator state is machine-local and may be lost on restart without export/import.

## Windows review of Mac staff-login fix - 2026-10-12

Owner pulled Android changes on Windows and asked to verify before real users. GitHub and local Android HEAD match 1c0742d. Reviewed AnimalSession operations-settings fallback (expected 403 retains denial) and AnimalViewModel wiring. Fresh 62 server tests passed. Focused Android AnimalIntegrationTest compilation/test run passed on Windows using Android Studio JBR, local SDK and offline Gradle cache. No fresh device suite was run here; Mac reports focused operations 1/1 and full device suite 5/5 passed. REAL_MOBILE_RELEASE_PLAN.md now records current source blockers and the pilot sequence.

Requested first real pilot person's email and portal role; vendor requires confirmed business/market section/stall. Do not repurpose the owner's previously demo-only account without confirmation. Actual production Android JSON still targets slaughterhouse-app-895d2; no default mobile API URL; operations intentionally require demo project/emulators. Real billing/payment/delivery stays unavailable despite prototype test success. Prepare account-access pilot only after identity/ownership, hosting, Android municipal registration/configuration and targeted activation review. Live users, configuration, memberships and data were unchanged during this verification.

## Pause and resume handoff - 2026-10-12

Resumed on 2026-10-12: reviewed actual inspector identity server transaction/role guard and Android identity/acknowledgment clearing, including stale revision handling. Fresh full server run passed 52 tests (15 animal tests). Saved Android XML confirms 40 debug + 40 rehearsal tests, zero failures/errors; saved device log confirms four tests passed; lint XML has 50 warnings and no errors. Inspected missing-stall screenshot and confirmed the municipal-review state. Current local commits are web afa8555 and Android 50cc7f1; both working trees were clean before this resume note. Remote push status of these latest commits was not checked in this resume turn.

The attempted fresh animal emulator verification was stopped because no listeners were present on 9199/8180; the previous 21-check result remains reported evidence, not a fresh run. No services were started, real data accessed or live configuration changed. Asked owner for official Calauag fee schedule, per-animal/per-kilogram charge basis and invoice-number format, with demo-only billing as an option. Billing implementation has not started during this resume review; awaiting that choice/details. Production approval does not validate Android's ephemeral ownership acknowledgment; it remains a UI review step as documented.

Owner requested saving progress and resuming later or tomorrow. Do not continue implementation during this pause.

Android Codex reports inspector-only GET /api/mobile/animals/{animalId}/vendor and Android business/stall identity display implemented. Approval requires complete business/stall details, notes and explicit review acknowledgment; missing details/load errors block approval, while rejection remains available with notes. Stale decisions refresh without automatic mutation retry. Acknowledgment is a UI review step; external ownership evidence remains necessary.

Reported validation (not independently verified by this web session yet): 80 Android unit test executions, four device tests, 52 server tests, 21 emulator checks; builds/lint zero errors. Updated evidence: web ANIMAL_WORKFLOW.md around line 74 and Android MOBILE_INTEGRATION_RESULTS.md around line 329. Screenshots are in Android .rehearsal-runtime/inspector-identity-screenshots/animal-milestone, notably 11-inspector-business-identity.png and 09-missing-stall-blocks-approval.png. Android remains on isolated-mobile-integration-rehearsal. The implementing agent reports no commit, push, deployment or production configuration change for this latest milestone.

Next steps when the owner resumes:

1. Read the latest changes in both repositories and saved test reports. Independently review inspector-only authorization, scoped linked-business validation, private-field exclusion, missing-stall approval blocking, corrections/conflicts, and stale-response/account-switch clearing. Inspect the screenshots. Repeat only checks needed to resolve concrete gaps.
2. Fix any verified defects, summarize review results and prepare separate source/test/document commits for web and Android. Keep secrets, runtime screenshots/logs, generated artifacts and local.properties excluded. Do not assume the latest work has been pushed.
3. Proceed to staff billing: approved animal revision -> authoritative vendor invoice -> web billing history. First review/confirm municipal rates, charge basis, invoice numbering, and which staff functions may issue bills. Implement duplicate prevention, transactional approval/revision binding, multiple-vendor isolation and amount/report tests using synthetic data.
4. Payment recording/receipts and delivery/GPS follow as separate milestones. Real-user activation, hosting, index deployment and production switches require concrete review and authorization; live writes remain paused until then.

Resume cue: "Resume from SESSION_RESUME.md and review the inspector vendor-identity milestone first."

## Current milestone: staff functions and animal inspection foundation

Owner clarified professor requirements: staff generate vendor bills recorded in the web; delivery tracking should follow the slaughterhouse-to-Calauag-market route; one inspector verifies and approves (two independent inspectors are not required). Owner authorized starting now. First implemented milestone is explicit inventory/billing/delivery staff functions, individual animal ownership/weight recording, corrections and inspector decisions. Billing issuance and GPS are next milestones, not completed by this work.

See ANIMAL_WORKFLOW.md for API contract and Android handoff. Web Animal Register is /animals; mobile endpoints are /api/mobile/animals, with active membership/claims/scope checks, inventory-only recording, inspector-only decisions, own-vendor reads, scoped vendor selection and transactional audit/revision handling. Corrections clear approval. Staff permission editing is available in Mobile Users but does not activate pending memberships.

Latest checks: 47 server tests passed; 18 account emulator checks and 16 animal emulator checks passed. Typecheck/build passed. Interactive web walkthrough and Android operational screens/device tests for this new milestone remain pending. Live account management, animal workflow and official billing gates remain disabled. No live Firebase changes, deployment, commit or push occurred. Existing administrator UID remains administrator; its vendor pilot is demo-only. Municipality and scope are confirmed Calauag / ph-quezon-calauag; older undecided statements below are historical.

## Treasurer account management implementation

Latest continuation: owner confirmed **Municipality of Calauag, Quezon, Philippines**, correcting “Municipal” to “Municipality.” Source defaults now use Calauag and scope `ph-quezon-calauag`. Mobile Users adds business registration with market/section/stall assignment, stable server vendor IDs, duplicate stall prevention and optional personal contact number (no SMS). 36 server tests and 16 emulator account/business checks passed; typecheck/build passed. Account management remains default-disabled, and no live Firebase account, business, index or invitation was created. Stall reassignment, Staff/Inspector operational access, real email delivery and production Android/API activation remain pending. Work is still uncommitted/unpushed.

Owner authorized building web-created Vendor, Staff and Inspector accounts. `src/UsersPage.tsx` and `server/accounts.js` implement creation, invitations, bounded account/business lists, audit history and deactivation. See `ACCOUNT_MANAGEMENT.md`. Account management has a separate default-disabled environment gate; billing remains paused. Existing Auth identities are not adopted automatically. Staff/Inspector memberships stay pending. 34 server tests, frontend typecheck/build and 14 real local emulator account checks passed. New work is uncommitted/unpushed. Live Firebase/configuration remains unchanged. The user chose demo-only for their own vendor pilot and deferred the municipality decision; do not provision their actual administrator UID as a vendor.

Android repo is `C:\Users\Acer\AndroidStudioProjects\Capsto-Project`. Its review branch `isolated-mobile-integration-rehearsal` is pushed at `8c70915`; local and GitHub hashes were verified. Saved instrumentation XML shows 2 tests, zero failures/errors/skips on isolated `Mobile_Rehearsal` AVD, Android 17/API 37. Original Pixel AVD lacked C: disk space; successful testing used generated AVD state on D:. Production Firebase remains unchanged.

Current release preparation is described in `REAL_MOBILE_RELEASE_PLAN.md`. Awaiting owner answers: pilot vendor UID/business ownership and municipality name/scope. Do not assume the existing web administrator owns a vendor business. Live provisioning, deployment, Android production project switch and official billing remain pending concrete review and authorization. Earlier pending device-test and missing-mobile-folder entries below are historical.


## Android billing/payment/delivery milestone completed locally — 2026-10-12

Android remains isolated-mobile-integration-rehearsal at 50cc7f1; web remains fix/foundation-up at afa8555. Existing SESSION_RESUME.md and separately appearing .env.example changes were preserved. New local source implements one invoice per approved animal, integer-centavo server fees, unique full-payment receipt recording, assigned staff delivery status and explicit foreground location sharing. Web /operations displays history. See BILLING_DELIVERY_WORKFLOW.md and Android MOBILE_INTEGRATION_RESULTS.md for the current contract; older pending Android/billing statements are superseded for rehearsal.

Normal server operations mounting is default-disabled and also requires a demo project plus loopback Auth/Firestore hosts, preventing live activation by a flag alone. Synthetic schedule/numbering only; official rates, payment rules, reversals, live account activation/indexes/hosting and physical-device validation remain pending separately authorized work. No production Firebase/configuration/rules/index changes, fixture reset, staging, commit, push, merge or deployment. PR #1 has only the earlier committed changes; this milestone is local and uncommitted.

Validation: 62 server tests; 20 actual operations-emulator checks with test-owned cleanup; 48 Android unit tests per variant / 96 executions; all five device tests including injected synthetic foreground GPS sharing and vendor read-only workflow; builds, web typecheck/build and lint (0 errors / 50 warnings) passed. The prior 21 animal emulator checks remain saved evidence unless rerun explicitly. Local loopback Auth/Firestore/invoice/animal services are available; do not reset them. Use Mobile Synthetic Rehearsal, never the production app, for demo accounts.
