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
