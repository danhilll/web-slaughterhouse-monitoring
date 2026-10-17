# All-role synthetic walkthrough

Prepared 2026-10-12. Uses only demo-mobile-rehearsal and fictional market/stalls. The reserved synthetic administrator uses the documented public demo credential; the six fresh actors use protected, privately chosen credentials. Fresh-actor passwords/action codes are never publication artifacts and must not be replaced with reserved-fixture passwords. No real-account membership or municipal business record is created.

## Current repeatable screen rehearsal — supported onboarding, 2026-10-16

This is the single current full-flow procedure. The reserved-account walkthrough below is historical evidence, not a substitute for fresh supported onboarding. Use the real web `UsersPage`, `AnimalsPage` and `OperationsPage` through the existing guarded panel and the Android **rehearsal** application. No normal debug/production account is used. This preparation does not enable any gate or certify an executed full screen run.

### Shared runtime and timing

The web and Android Codex tasks must acknowledge a shared window before creating actors or manipulating screens. Proposed handoff: T+0–15 minutes web business/account setup; T+15–20 private password setup and activation; T+20–35 Android inventory/inspection/carcass; T+35–50 billing/delivery/tracking/vendor; T+50–60 web reconciliation/logout and sanitized notes. Android readiness was acknowledged on 2026-10-17 for emulator-5554 / Pixel_10_Pro. Fresh onboarding completed and the explicit Android screen handoff was sent; see the completion record below. Timing estimates are coordination guidance, not measured acceptance durations.

Observed loopback listeners are Auth 9199, Firestore 8180, invoice API 5002, animal/operations API 5003, web API 5004 and panel 5174. Preserve these healthy services and their data. Android owns 5002/5003 and its selected device; web owns 5004/5174. No reset, parallel connected suite or reset-style seed command is allowed during the window. Check `/rehearsal/health` and current local source/configuration; both Firebase services must remain `demo-mobile-rehearsal` with explicit loopback hosts and no real credentials. The existing launchers enforce these guards.

A health HTTP 200 alone does not prove current source is loaded. Privately verify account settings include `canManageAccounts`/`staffInspectorAvailable` and operations settings include explicit `canRecordPayment`/`canPublishTracking` values appropriate to each actor. Missing fields require a coordinated owner review/reload with unchanged options and preserved data, before screen writes; do not compensate by changing gates or granting extra permissions. Serialize preservation snapshots and authentication probes, because password sign-in updates Auth session metadata.

Web entry: `http://127.0.0.1:5174/rehearsal/web-demo.html`. Android package: `com.slaughterhouse.app.rehearsal`, using emulator-host ports 9199/8180/5002/5003. Use the existing reserved synthetic administrator to open the panel; bootstrap of that administrator is a prerequisite, not an alternative to onboarding the six fresh actors below. Do not start the normal web server or Android debug app for this procedure.

If prerequisites are missing, use the existing Android `ensure-android-operations-fixtures.mjs --dry-run` / `connected-suite-fixtures.mjs --dry-run` with their documented arguments to inspect them. Missing-only restoration requires the shared owner to review its exact plan; never use it to create or activate the fresh walkthrough actors. Do not overwrite an existing schedule, account or business. If an adapter option/capability is off, mark that branch blocked and coordinate separately; this procedure does not authorize gate changes or restarts.

### Fresh actors through actual web screens

Choose a unique run label `flow-<UTC-timestamp>` and a new stall for each of two fictional businesses. Repeating the rehearsal uses a new label, not a reset or reused email. Preserve prior runs.

1. Open **Mobile users → Register vendor business**. Register business A and business B with fictional market/section, distinct run-labelled stalls, valid synthetic contact values and `@rehearsal.example.test` contact emails. Keep the server-generated business IDs privately in the run notes. Duplicate normalized stall rejection may be checked only against this run's own fictional stall.
2. Use **Create the person's account** for six fresh addresses `<run>-vendor-a`, `<run>-vendor-b`, `<run>-inventory`, `<run>-billing`, `<run>-delivery`, `<run>-inspector` at `rehearsal.example.test`. Link the two vendors only to their respective businesses. Choose Staff for each of the three functions and select exactly its one function. Inspectors receive no business link or staff function. No password field, bootstrap password or reset link should appear in administrator responses.
3. Verify vendor account cards are active and the four staff/inspector cards are pending. The protected membership is authoritative; an enabled Firebase password login alone must not grant pending operational access.
4. Consume each account's **existing Auth emulator password-setup action** privately in the guarded panel's **Local password setup** form. Reuse the OOB-code lookup pattern from `rehearsal/verify-accounts.mjs` solely to locate that exact run email's action; keep the action code/password in local memory/private UI, never terminal/chat/log/screenshot evidence. The installed emulator action endpoint only returns JSON instructions suggesting a password query parameter; do not use that URL. The masked form calls Firebase `confirmPasswordReset`, clears successful inputs and exposes only fixed status messages. Do not directly call Admin `updateUser` to set a password. No real email is delivered. Stop if an action points outside the loopback emulator.
5. Exercise **Assigned staff functions → Save staff functions** on the pending inventory/billing/delivery cards, retaining only the intended function. Verify saving does not activate them. Then use **Activate mobile access** for each staff/inspector and confirm the displayed saved functions. Verify active cards and account-history activation events. Production accountManagement/activation settings remain off throughout.

### One linked animal/invoice/delivery through Android and web

| Step and real screen | Expected result / dependency | Sanitized evidence |
| --- | --- | --- |
| Android Staff: fresh inventory-only login; register Pig for business A, unique `<run>-animal` tag, 85.001 kg and current weighing time | Pending animal revision; no billing or delivery writer privilege | UI success, pending status and revision; no passwords/tokens |
| Android Inspector: fresh inspector login; review business/stall and animal, enter notes/acknowledgement, approve displayed revision | Approval matches current animal revision; inventory/admin cannot substitute for inspector | Approved status/revision and reviewed identity match |
| Android inventory or real web Animals screen: record synthetic dressed carcass 60.001 kg **only if the existing rehearsal capability is already on** | Current inspector approval and no invoice/dispatch link; independent measurement revision; no fee change | Recorded measurement/revision; optional correction requires reason. If capability is off, mark unverified/blocked; do not enable it |
| Android Billing: fresh billing-only login; select the same approved animal, review the existing synthetic SCOPE-A schedule and issue invoice | Exactly one invoice for that animal/revision; schedule basis/version/currency verified from settings | Invoice/animal correspondence and total match; no official numbering claim |
| Android Billing: record externally confirmed **synthetic** full payment with a unique `<run>-receipt` reference and supported method | Amount equals stored total; duplicate/stale requests denied without a second payment | Paid status and matching amount/reference; no actual money or official receipt |
| Android Delivery: fresh delivery-only login; self-assign the paid invoice, fictional destination, then in-transit | Active scoped delivery permission, payment and assignment required | Assigned→in-transit transition; only assignee controls |
| Android Delivery: explicit foreground location sharing using synthetic emulator coordinates, then delivered | Already approved local permission/capability; uploads stop after delivery/logout; map loads or failure is explicit | Latest position/timestamps/status, stopped upload indicator; no physical-GPS claim |
| Android Vendor A: fresh vendor-A login; own profile/invoice/operations detail and delivery read | Own business only; no write controls | Same invoice/amount/delivery, role/scope match; no personal record export |
| Android Vendor B: fresh vendor-B login | This run explicitly approves these two synthetic identities and this run's invoice for isolation: A invoice absent for B; direct supported detail denied if tested | Absence/403/404 only, never another user's returned record |
| Web Workflow history and Animals: administrator reads same run tag/invoice, payment, delivery, latest position and audit | Same demo datastore/API contract; no parallel financial truth created | Cross-screen correspondence, audit transitions and explicit missing/error states |
| Normal Sign out in each screen | Workspace clears; next private identity cannot inherit prior records or writer state | Signed-out UI and unauthorized unauthenticated read; no token reuse/revocation claim |

Do not infer a production requirement that carcass weight must precede every bill: the current billing transaction requires current inspection approval and a fee schedule, but does **not** enforce a carcass prerequisite. Required species/parts/timing and any billing dependency are unresolved policy decisions. All rehearsal money, numbering and receipt references remain synthetic.

### Historical onboarding and interim operational observations

2026-10-17, run `flow-1792172121150`: two fictional businesses and six fresh actors were created through the actual web forms. Vendors were active; inventory/billing/delivery staff and inspector were initially pending. Each staff function was explicitly saved before normal activation; all four pending actors became active. All six completed masked Firebase password setup. Private read-only checks confirmed active SCOPE-A memberships, exact single staff functions, vendor business links, municipal role/scope claims, password login and mobile profile HTTP 200. Actual web History screens displayed all six provisioning histories and the four activation events. Normal web sign-out cleared the workspace; a subsequent token-free account-settings request returned 401. No tokens/passwords/OOB codes are evidence artifacts. Protected handoff material remains ignored under `.rehearsal-runtime/` with directory 0700/file 0600.

The old web-only process returned settings without `canManageAccounts`, so the current UI correctly hid account creation. Only ports 5004/5174 were restarted with the existing demo configuration and existing carcass option to load current source. Auth/Firestore/5002/5003 and prior records were retained; no reset/seed ran. At that historical handoff, Android received the linked operational screens with outcomes still pending; the current results below supersede those pending observations. This is emulator/local evidence, not production mailbox or physical-device acceptance.

Android subsequently registered the run-owned Pig at 85001 grams, revision 1, inspection pending through its real inventory screen. A GET-only capability check identified a second stale process on 5003: payment/tracking fields were absent. Android reloaded only its adapter with the existing `--preserve-fixtures --enable-carcass-weight` arguments. After reload, authenticated reads for all six actors verified the exact intended capability matrix: inventory record/carcass; inspector inspect; billing bill/payment; delivery deliver/tracking; vendors no writer capabilities. Inventory/inspector operations settings returned the expected 403. These checks concern isolated demo capabilities, not production gate state. Inspection and downstream screen outcomes were pending at that intermediate checkpoint; current results are recorded below.

Reload preservation comparison: all 223 Firestore documents matched exactly; 35 Auth identities remained, with no additions/removals, and 29 other user records matched exactly. The six fresh actors' full Auth hashes changed while web performed six explicitly acknowledged password sign-ins for capability verification; the snapshots include login/session metadata. Their same passwords, claims and protected memberships were verified. No raw before-fields were retained, so exact field-level Auth equality is not claimed. No restoration, reset or seed was attempted. Screen actions resumed only after this overlap was disclosed and the comparison categorized.

Additional private Auth checks confirmed all six emails match the manifest, accounts remain enabled, municipal claims match, password-update timestamps precede the preservation snapshot and last-login timestamps follow it. No password update during the reload was found. This narrows the metadata explanation without claiming complete Auth byte-equality.

Android real-screen follow-through subsequently passed current-revision inspector identity/stall review and approval, then inventory recording of 60.001 kg dressed carcass at measurement revision 1 / animal revision 1. Live weight remained 85.001 kg. These are fresh run-owned synthetic measurements; they do not approve body-part definitions or a weight-based fee policy. Fresh billing reviewed the existing 15+25+10+45 PHP schedule and issued exactly one PHP 95 invoice for this run's approved animal revision 1, with issue/due date 2026-10-17 Manila. An empty receipt reference disabled payment submission; entering the unique run-owned reference saved the full synthetic PHP 95 cash payment and displayed its details. No actual money or official receipt/numbering approval is implied. Delivery/tracking/vendor screen acceptance was still in progress at that intermediate checkpoint; current scoped results follow below.

Delivery self-assignment and transition to in-transit passed through real screens. The automation retained part of the default destination while typing the synthetic destination; the valid demo-only saved text was retained, with no rewrite/reassignment. At the original incident checkpoint, controlled tracking was **unverified/on hold**: after the first permission denial, a position and open map appeared before the driver's recorded second grant/GPS/map actions. Android stopped the publisher through the normal UI and retained the position. The web controller performed no ADB, permission, GPS or map actions. At that point, manual interaction and outstanding local driver activity required clarification before attributing tracking evidence or resuming. A later read-only UI observation showed sharing active again after the earlier Stop; that earlier screenshot is not durable-stop evidence. Android contained the run by force-stopping only the rehearsal package, preserving app data. Cause remains unresolved (controller activity or lifecycle behavior must be investigated); containment was verified: rehearsal process absent and retained position unchanged during a five-second observation. This is short containment evidence, not durable lifecycle acceptance. Delivery completion and vendor A/B read/isolation checks were pending at that historical checkpoint. The later scoped passes below supersede those pending statuses without establishing production readiness.

### Current evidence-backed results — 17 October 2026

This section supersedes the historical pending observations above for the existing synthetic run;
it does not authorize another workflow or device action. Existing reports, readbacks and screenshots
were reused; no repeat onboarding or full workflow is needed to establish these recorded outcomes.

- **Onboarding/mobile access passed:** two fictional businesses and six fresh actors were created
  through real web forms, with private password setup, explicit staff functions and reviewed activation.
  All six authenticated mobile profiles returned 200. Inventory registered the animal and carcass;
  inspector approved its current revision; billing issued/paid the synthetic PHP95 invoice; delivery
  self-assigned and completed it. Saved creator/inspector/payment/assignee identities match those fresh
  actors. This is synthetic emulator evidence, not production account creation or physical-phone login.
- **Completion/audit passed:** one UI completion produced Delivered revision 5 while preserving the
  stored payment, assignment, destination and retained tracking. A scoped read-only web audit check
  found exactly one completion event matching actor, animal, scope, time and final invoice response.
- **Vendor isolation passed within scope:** Vendor A's authenticated profile and own invoice/delivery
  reads matched the run; Vendor B's exhausted lists were empty and exact-A detail/tracking GETs each
  returned 404 without protected payload. Their fresh identities matched saved authenticated readbacks.
  Vendor A's case-sensitive UI animal-label assertion remains unverified; matching API identity and
  case-insensitive navigation do not convert that particular assertion into a pass.
- **Web reconciliation/logout passed:** the controlled web context matched Delivered revision 5,
  payment/reference, assignment/destination, linked approved animal revision 1, live 85.001kg, carcass
  60.001kg/revision 1 and retained tracking. Normal web logout cleared protected UI and its persisted
  user; five token-free reads returned 401. Mobile Vendor B normal logout and restored rehearsal
  force-stop were reported by Android. Pre-existing browser tabs were untouched; no global logout
  or token-revocation claim is made.
- **Tracking acceptance is bounded:** checkpoint 95769a0 passed the reported permission/Start/Stop
  and lifecycle observations. Exact in-flight HTTP timing, callback order, controller IDs and device
  maximum concurrency remain inconclusive; an already-sent request completing after Stop was not
  established. The original reactivation cause remains unconfirmed. User recollection about granting
  permission/Start does not establish its timing or causation. Android remains sole emulator controller
  and the restored force-stopped hold remains intact.

The preserved onboarding/adapter snapshot comparison concerns 223 documents; the later web
restoration/reconciliation comparison concerns 233 documents, all hash-equal across its own snapshots.
These are separate checkpoints. The six fresh-user Auth differences in the earlier overlap do not
establish full Auth equality. Both later reserved-administrator Auth hash differences (before/after
startup and after-startup/after-browser) remain unexplained; neither is established as session metadata.
Two saved raw administrator exports match each other and the after-startup hash, but cannot reveal
the changed fields in the other hash-only phases. See the committed preserve-mode result in
DEPLOYMENT_CHECKLIST.md; private exports/readbacks remain excluded.

Real mailbox invitation delivery, production web-created-account/mobile login, physical-device
acceptance and real-screen denial while staff/inspectors are still pending remain unverified.
Ownership/activation responsibilities, email-verification/recovery policy, runtime user-create IAM and
reviewed production enablement remain unresolved. Existing fee/numbering/payment/carcass/delivery
policy requirements, security advisories and release/signing obligations remain unchanged; the latest
security/PDF findings are in DEPENDENCY_SECURITY_REVIEW.md. Production gates remain unchanged.

Use the existing CARCASS_REHEARSAL_RESULTS.md / DEPLOYMENT_CHECKLIST.md for the linked run's result and exact web/Android commits, selected rehearsal package/device, dates and sanitized step outcomes. Mark each step passed, failed or unverified. Keep private run IDs/account addresses/action links/passwords/tokens, emulator state, APKs, screenshots and raw API data out of Git. Source tests and earlier reserved-fixture device passes do not certify this new supported-onboarding screen run. Leave test-owned accounts/data in place until owners agree cleanup of that exact run; never reset shared services.

## Historical verification — 2026-10-12

Fresh Windows run: 20 actual Auth/Firestore operations checks passed; rehearsal application/test APK builds passed; web typecheck, launcher syntax and two safety tests passed. Web page and module returned HTTP 200, synthetic administrator authenticated, and its history returned the same paid/delivered PHP 95 invoice created by the Android device test.

Device suite: four of five passed (animal/inspection, package identity, billing/payment/delivery/location, and vendor pagination/account switching). The denied-account test repeatedly timed out at RehearsalDeviceTest.kt:45 waiting for software-keyboard visibility before sign-in. Enabling show_ime_with_hard_keyboard did not resolve it; the original value 0 was restored. This is an unresolved keyboard/test-environment failure, not a passing full device suite. API role/ownership/membership denial checks passed independently. Do not present this as production certification. Browser page/API smoke checks passed; a human browser rendering walkthrough remains to be done.

Keep local Auth 9199, Firestore 8180, invoice API 5002 and animal/operations API 5003 running. Android must use com.slaughterhouse.app.rehearsal, not the normal app. These services are machine-local; Windows and Mac have separate emulator data even when source code is synchronized.

## Historical reserved fixture accounts

All accounts below use the public test password `Synthetic-only-42!`.

| Portal | Email |
| --- | --- |
| Inventory staff | inventory@rehearsal.example.test |
| Inspector | inspector-animal@rehearsal.example.test |
| Billing staff | billing@rehearsal.example.test |
| Delivery staff | delivery@rehearsal.example.test |
| Vendor for this walkthrough | identity-vendor@rehearsal.example.test |
| Different vendor for isolation | bob@rehearsal.example.test |
| Demo web administrator | web-admin@rehearsal.example.test |

Use Synthetic identity business A / ANDROID-IDENTITY-BUSINESS-A, Synthetic test market, Test meat section, stall TEST-01. Original Alice/Bob businesses have no fabricated stall details; use the complete identity business for inspector approval.

## Historical walkthrough using reserved actors

1. Inventory: register a Pig for the identity business, with a unique tag such as MANUAL-DEMO-<date-time>, weight 85.001 kg and current weighing time. Copy its tag; inspection starts pending.
2. Log out. Inspector: open that tag, review business/stall and animal details, enter synthetic verification notes, acknowledge review and approve the displayed revision.
3. Log out. Billing: open the workflow, select that approved animal, review the synthetic PHP 95 per-animal schedule and issue an invoice. Record its invoice ID. Refresh/repeat attempts must not create a second invoice.
4. Record a synthetic full payment of PHP 95 with a unique test receipt reference such as DEMO-RECEIPT-<date-time>. This simulates external staff confirmation; no money is transferred and no official receipt is issued.
5. Log out. Delivery: find that invoice, self-assign to a fictional market destination, mark in transit, explicitly share an emulator location if available, then confirm delivered. Location sharing is a foreground update, not continuous tracking or a physical GPS certification.
6. Log out. Vendor: sign in as identity-vendor and verify own invoice, payment and delivery. No write controls should appear. Sign out and switch to Bob; the identity business's invoice must be absent.
7. Web: open http://127.0.0.1:5174/rehearsal/web-demo.html and click Open demo administrator history. Refresh to verify the same invoice ID, PHP 95 amount, payment reference, delivery and last location. This standalone panel reuses the web OperationsPage and actual protected server handlers. It does not claim to exercise every main dashboard/report page. Your normal live web dashboard at 5173 stays separate.

Do not use personal Gmail accounts in this demo. Services must remain running for the walkthrough. Emulator restarts without export/import can lose synthetic state; do not mistake that for a Git synchronization error. Do not use reset-style seed commands while preserving a walkthrough.

## Web panel launcher

After starting the documented guarded emulators and Android-owned adapters, run from the web checkout with FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199, FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 and GCLOUD_PROJECT=demo-mobile-rehearsal:

`node rehearsal/web-demo.mjs`

The launcher rejects real credential environment variables, restricts networking to loopback, uses a separate allowlisted synthetic administrator, and ignores the normal .env when configuring Vite. No Admin key enters the browser. The entry refuses non-demo projects and nonlocal browser hosts. API port 5004 and Vite port 5174 are separate from the normal web/API. Stop its terminal with Ctrl+C when finished.
