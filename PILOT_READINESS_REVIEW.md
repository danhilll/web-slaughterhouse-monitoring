# Small real-user pilot readiness review — 2026-10-14

**Decision:** not ready for a real mobile pilot yet. A limited vendor sign-in/read-only pilot is the smallest release target. The full billing, receipt, delivery and GPS workflow remains synthetic-only by design.

Owner confirmed 2026-10-14 that the Firebase project and vendor participant remain pending, with no approved HTTPS host. Continue using synthetic accounts for preparation/tests. `HOSTING_OPTIONS.md` records a researched Render recommendation and prerequisites; no provider, account, project or URL has been selected or provisioned.

## Checkout and checks

- Web: `fix/foundation-up`, HEAD `ada20a9`. Existing untracked review document was preserved. Local Git history includes the Mac startup-gate fix; no network fetch or remote freshness check was performed. Use this reviewed branch rather than assuming local `main` has the same contents.
- Android checkout previously inspected at `c2928ba`. Owner now reports **8 connected rehearsal tests passed together**, map rendering passed and the reloaded adapter stayed healthy on Mac. These completed local checks were not repeated here. Physical-device validation remains pending.
- `npm run verify`: **passed**, including TypeScript, server syntax checks, **71 server tests**, seed dry-run and Vite production build.
- `npm run test:rehearsal:safety`: **2 passed**.
- Build warning: main JavaScript bundle about 1.42 MB before gzip. This affects loading performance but is not the first pilot blocker.
- `verify` does not include `test:tracking-ui`, emulator integration scripts, live Firebase inspection, deployed endpoint checks or device/map tests. A passing build does not verify those gates.

Before execution, the entire requested command chain and test imports were inspected. `seed-firestore.js --dry-run` exits before importing/initializing Firebase Admin; it prints a plan only. Server tests use in-memory doubles and temporary local Express listeners. Safety tests check guards without opening Firebase connections. Neither requested command resets an active emulator dataset. No reset-style rehearsal verifier was run.

The new `server/index.test.js` executes the actual route-wiring excerpt with mocked initialization and an in-memory store. It verifies disabled access before initialization, enabled access after a demo project is initialized, and closed access for real projects, missing flags/hosts and a remote emulator host. `server/index.js` now supplies a deferred operations predicate; the operations router evaluates it per request and the animal settings route evaluates the callable operations predicate. The underlying demo-project/loopback predicate is preserved. This corrects the synthetic startup failure; it does not enable real operations.

## Configuration observed locally

Only nonsecret settings and presence flags were inspected; no key or token was printed.

- `.env` client and server project IDs both equal `com-slaughterhouse-app`; web auth domain and `.firebaserc` agree. This is evidence of the web's configured target, **not approval to choose it for production**. The owner's project decision remains pending.
- Public web API-key setting is present; an external Admin credential file is configured and exists. Its current validity/IAM permissions were not exercised.
- One web administrator UID is configured. The API checks verified Firebase tokens with revocation checking and a server UID allowlist.
- Account management, animal workflow and animal operations flags are unset in `.env`, so their enabled checks evaluate false unless separately provided by the launch environment. Process/deployed environment overrides were not inspected.
- Municipality scope defaults in server source to `ph-quezon-calauag`; local `.env` does not set it explicitly.
- CORS origin is unset. This is valid for same-origin hosting; separate-origin hosting needs an approved allowlist. Android native HTTP access does not depend on browser CORS.
- `.env` is ignored and not tracked. No secret files were changed.

## Verified source/configuration blockers

| Area | Evidence | Pilot impact |
| --- | --- | --- |
| Firebase alignment | Android `app/google-services.json` still identifies `slaughterhouse-app-895d2`; web uses `com-slaughterhouse-app`. Rehearsal configuration separately identifies `demo-mobile-rehearsal`. | Android production identities/tokens will not match the intended municipal project. Rehearsal success cannot establish real login compatibility. |
| Mobile API origin | Normal Android `mobileApiBaseUrl` defaults to an empty string. Client rejects an invalid origin and requires HTTPS for release. | An approved reachable HTTPS API origin must be supplied and validated in the actual pilot build. Any private-network rehearsal URL remains a demo route. |
| Deployment wiring | `firebase.json` declares Firestore only; no Hosting configuration/rewrite. Vite proxies `/api` to localhost:5001 only during development. Browser API calls use same-origin `/api`. No deployment manifests were found. | Uploading `dist` alone will not provide the Express API. A selected hosting arrangement must route `/api`, supply server credentials securely and include valid web Auth configuration. The absence of manifests does not prove no external deployment exists. |
| Account/animal gates | Account management and animal workflow are disabled by the inspected local configuration. | Live account creation and animal actions are unavailable in that configuration. Do not enable them until their exact pilot setup is reviewed. |
| Staff/inspector activation | Account setup assigns vendors active membership but leaves staff/inspectors pending. Permissions changes do not activate them; no reviewed activation endpoint exists. | Creating a staff/inspector account does not make its portal usable. A full-role real pilot needs a narrow approved activation/recovery procedure. |
| Billing/delivery/tracking | `syntheticOperationsEnabled` requires an enabled flag, demo project and loopback Auth/Firestore emulators. Both mobile and web operations routes also require the animal flag. Legacy web mutations are hard-disabled. | Real billing and delivery/GPS are unavailable on the municipal project. Removing the guard is not a safe release fix. Official fees/numbering and a separately reviewed production operations path remain prerequisites. |
| Scoped invoice indexes | New vendor API filters invoices by municipality and vendor, ordered by document ID. The committed index list contains legacy vendor/date indexes and no explicit municipality/vendor invoice index. | Query/index readiness requires verification on the target database; a live missing-index failure has not been demonstrated. Emulator success does not establish deployed index readiness. |

## Role enforcement and Firestore rules

Verified in source and the passing unit/HTTP-handler tests:

- Web administrator endpoints require a revoked-token-aware Firebase check and the UID allowlist.
- Mobile endpoints check active protected membership, matching role/scope claims and active scoped vendor ownership. Vendor reads are restricted to their business; cursors are identity/scope-bound.
- Inventory, inspector, billing and delivery privileges are checked on the server. GPS publishing requires the assigned delivery staff account; another vendor cannot read that position. Tests cover revoked/inactive access and completion isolation.
- Account management is mounted after web administrator authentication and has its own gate. Animal and operations routers have independent guards and can perform authorized writes before the legacy web write guard. `WEB_WRITES_ENABLED=false` is therefore not a universal prohibition on every new workflow when its own flags are enabled.
- Repository Firestore rules deny **all** direct client reads/writes. This is compatible with API-backed pilot access because the Admin SDK bypasses rules; the API must enforce authorization. Do not open rules merely to make legacy client paths work. Android still contains legacy direct-Firestore helper code, but this review did not establish that any supported pilot screen invokes it.
- Cursor secrets default to fresh random values per router instance. Use one controlled API instance for a small pilot, or wire a stable shared secret before using multiple instances. Restarts otherwise invalidate existing cursors.

Rules-only audit, in the security auditor skill's requested format:

```json
{
  "score": 5,
  "summary": "Repository rules deny every client operation, so no client create/update bypass, ownership escalation or direct client storage abuse is permitted. API authorization is a separate control and was reviewed separately. Published rules were not re-fetched in this review.",
  "findings": []
}
```

## Unknowns requiring targeted verification

- Published rules/indexes, current enabled Auth accounts, claims, protected memberships, historical profile conflicts, vendor ownership and actual live invoice data were not refreshed from Firebase. Earlier inventory is historical evidence.
- Approved real pilot identity and business/stall ownership have not been established here. Demo account/business names and sample receipts must not be copied into production.
- Any existing deployment's URL, TLS, `/api` routing, IAM, origin policy and availability are unknown. The local credential file's existence is not proof a deployed runtime can use it.
- Invitation delivery/password setup and any chosen email-verification requirement need a real approved mailbox check; current mobile authorization does not require verified email.
- Local rehearsal map rendering now passed according to the owner's Mac results. Production/physical map rendering, phone lifecycle behavior, mobile-data connectivity and road-test outcome remain unverified. Android rehearsal tests do not certify them.
- Dashboard legacy reads can load whole collections before applying response limits; acceptable capacity/read cost for the actual pilot dataset has not been measured. Bound these queries before scaling, rather than treating response limits as database read limits.

## Smallest next fix

Prepare a **production configuration preflight for a one-vendor read-only pilot** before enabling any writes. It should fail unless the reviewed Android client configuration and web/server use the **owner-confirmed project**, the pilot APK has an approved HTTPS API origin, and that origin routes the protected `/api/mobile` endpoints. The web's current `com-slaughterhouse-app` value is not a production selection. Preview the intended Android configuration replacement and host settings without writing to Firebase or deploying.

Then verify/provision only the approved pilot vendor: preserve its Auth identity and unrelated claims; add the reviewed municipal role/scope claims and protected membership, link a confirmed active vendor business, and use real authorized records or an honest empty view. Test sign-in, own-data access, other-vendor denial, logout and deactivation on the physical phone. Any account creation/activation, deployment or live index change needs its own concrete review before execution.

This first pilot can keep account creation, animal writes and operations disabled. Expanding to inventory/inspection requires activation and workflow gates; expanding to billing/delivery requires the separately reviewed production operations implementation and official municipal billing requirements.

## Current provider-independent local preparation

Added `npm start` as `node server/index.js`, providing an API runtime command without nodemon, Vite or a provider choice. The server already reads the runtime `PORT` when no positional port argument is supplied; no port, origin, credential, gate or Firebase project was changed. The command was inspected and not executed because starting it would connect to the configured Firebase project. The existing build and development scripts are preserved.

**Provider-independent deployment wiring is now prepared locally:** `server/hosting.js` supplies opt-in `SERVE_WEB=true` static/SPA serving after the terminal API 404, and a status-only `/healthz` startup-readiness probe. The module is wired into `server/index.js`, documented in `.env.example`, and included in syntax checks. These changes address local routing/probe gaps; actual hosting, TLS and Firebase settings remain pending. The probe does not query Firestore per request or certify ongoing database connectivity.

Focused hosting/startup checks: **6 passed**. Fresh server regression suite after the runtime change: **76 passed** (the previous 71 plus five hosting checks). Tests use temporary local Express listeners/files and in-memory doubles, never live Firebase or active emulator data. No Android/device suite, web build or safety suite was repeated in this update because those unchanged checks were already complete. `node --check` for the modified server and new module passed.

The short remaining checklist is `DEPLOYMENT_CHECKLIST.md`; detailed acceptance checks remain in `ONE_VENDOR_PILOT_PLAN.md`. Firebase project, hosting plan and real vendor remain explicitly pending. No deployment, Firebase mutation, fixture reset, dependency upgrade, commit or push was performed. Existing changes were preserved; generated build output remains ignored.
