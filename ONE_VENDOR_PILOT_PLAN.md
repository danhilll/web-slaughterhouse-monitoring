# One vendor read-only pilot — preparation, 2026-10-14

Current reviewed web commit: `ada20a9`, branch `fix/foundation-up`. Android: `c2928ba`, branch `isolated-mobile-integration-rehearsal`. This is a release plan, not permission to deploy or provision. No real-user identity or API URL has been selected by this document.

Owner decisions received 2026-10-14: **Firebase project remains pending; no HTTPS host is approved; no real vendor is approved.** Continue local preparation/testing with existing synthetic accounts. Hosting recommendation and expected costs are in `HOSTING_OPTIONS.md`; that recommendation is not a provider selection or deployment authorization.

## Decisions required from the owner

1. **Firebase project:** web `.env`, `.env.example` and `.firebaserc` identify `com-slaughterhouse-app`; normal Android `app/google-services.json` identifies `slaughterhouse-app-895d2`. Confirm the intended real project explicitly. The isolated rehearsal uses `demo-mobile-rehearsal` and must remain separate.
2. **HTTPS API host:** provide an already approved URL/provider, or choose a runtime after reviewing budget, availability, Node support, credential handling and region. No production URL is established in either checkout. The Mac private-network rehearsal does not establish a real production API.
3. **Vendor identity/ownership:** approve the person's email/Auth UID and confirmed business/market section/stall. The owner's personal account remains demo-only unless separately confirmed. Existing historical profiles or emails do not establish business ownership.
4. **Sign-in policy:** approve the email/password invitation process and whether verified email is required. The current API checks role/scope/membership, but does not require `email_verified`. Any required policy change needs its own local implementation/test before activation.

## 1. Prepare a configuration preview; no live writes

After the project decision, compare the actual server/web project, client app IDs and Android package/signing registration in that project. Do not hand-edit a client API key to imitate alignment.

For Android, prepare the official Firebase client configuration for package `com.slaughterhouse.app` in the approved project, then review the replacement of `app/google-services.json`. Preserve `app/src/rehearsal/google-services.json` and rehearsal application ID `com.slaughterhouse.app.rehearsal`. Supply the approved API origin through `-PmobileApiBaseUrl` for the normal pilot build; leave emulator/USB/private-host settings confined to rehearsal. Build validation must demonstrate a nonempty HTTPS origin and matching approved project. No Admin credentials belong in the APK.

For web/server, prepare public Vite app identifiers for the same approved project, a server-only credential/IAM setup, the existing approved web administrator UID allowlist and explicit municipality scope `ph-quezon-calauag` for review. Do not print keys or use real credentials in emulator commands. Keep account management, animal workflow and demo operations disabled for the first read-only release unless a separately approved account-setup action needs its own gate.

## 2. Prepare HTTPS hosting and review before deploying

The project needs static Vite output and the Node Express API. `npm run build` produces the web assets; `npm start` runs Express and honors `PORT`. The locally prepared `SERVE_WEB=true` option serves built `dist` from the same origin, with protected API failures remaining JSON. `/healthz` reports initialized startup status for hosting probes; `/api/health` remains protected. Node must satisfy the repository's >=22 requirement. `npm run dev` and `npm run preview` are development/preview tools.

Prefer one externally visible web origin with `/api` routed to Express: the frontend already requests same-origin API paths. If separate origins are selected, prepare both frontend routing and the exact server CORS allowlist; setting CORS alone does not reroute frontend requests. Android calls the API origin directly and does not rely on browser CORS.

Review TLS, stable hostname, secure server credentials, approved Firebase IAM, Auth authorized domains/templates and logs. Runtime startup currently requires a configured credential file or inline credential fields; platform-managed credentials alone are not yet accepted by the startup presence check. Select one controlled API instance for this small pilot, or implement shared cursor signing secrets before selecting multiple instances. Hosting resources, rules/index publication and API deployment need a concrete configuration review before execution.

## 3. Read-only live inventory and targeted provisioning preview

Once a project is approved, inspect its current Auth account, unrelated custom claims, `Users/{uid}`, `mobile_memberships/{uid}`, business link and deployed indexes/rules. No imports from the demo project. Record collisions and missing canonical fields before proposing writes.

The vendor API requires:

| Resource | Required reviewed values |
| --- | --- |
| Firebase Auth | Correct project, enabled account, usable email/password sign-in; preserve UID and unrelated claims |
| Custom claims | `municipalRole: vendor`, `municipalScopeId: ph-quezon-calauag` |
| `mobile_memberships/{uid}` | `role: vendor`, `status: active`, matching municipality and confirmed `vendorBusinessId` |
| `vendors/{businessId}` | Matching `id` and scope, `status: Active`, real nonblank `name`, string `address`, `contact_number`, `email`, supported `animal_type`, valid date-only `created_at`; review market/stall identity for ownership |
| Invoices, if present | Owned/scoped canonical records with valid dates, status, head counts and fee totals; otherwise show an honest empty list |

Existing account creation rejects existing Auth emails rather than adopting them. An existing user's linkage requires a reviewed targeted provisioning procedure; do not bypass that conflict or assume Users documents supply authorization. Auth claims and Firestore cannot share a transaction: prepare a fail-closed sequence, partial-failure handling and exact rollback. Review the proposal before any write. Invitations and inbox delivery must be tested with the approved mailbox, never by exposing passwords or reset links.

Keep direct Firestore rules deny-all for API-backed vendor access. Re-fetch the published rules rather than relying only on repository text. Verify the scoped invoice query/index on the target database; current local indexes do not explicitly declare its municipality/vendor combination. A missing production index has not been demonstrated, so prepare only an index confirmed necessary by the query, then review before publishing it.

## 4. Acceptance checks for the approved vendor build

After reviewed hosting and provisioning are actually performed:

1. Verify web administrator and Android pilot build use the same approved project; valid protected API requests succeed over HTTPS with USB disconnected.
2. Vendor signs in and sees only their confirmed business and authorized invoices, or an honest empty view. No synthetic receipt/charge is inserted to make the screen look populated.
3. Other-vendor invoice IDs/selectors/cursors and an inactive or mismatched membership are denied. Perform any revocation/deactivation test only on an explicitly approved pilot/test identity, with a restoration plan.
4. Logout/account switching clears prior records. A stopped/unreachable API produces a visible error instead of an empty-success message or local authorization fallback.
5. Verify normal web administrator access still works. Pilot vendor cannot access administrator APIs or change fees, invoices, payments, animals or GPS.

The read-only pilot does not include meat-delivery tracking: that router is intentionally demo-only. Map rendering/manual road testing can continue separately in the synthetic rehearsal. A later real delivery release needs official operational policy and an independently reviewed production operations path; do not remove the demo gate for this pilot.

## Completed local work

Mac startup-gate fix confirmed at `ada20a9`. Earlier `npm run verify`: 71 server tests, TypeScript, syntax checks, seed dry-run and build passed; safety checks: 2 passed. Owner now reports eight Android connected rehearsal checks and map rendering passed; physical-device checks remain pending. Added a standard API start script, opt-in same-origin static hosting and status-only readiness probe. Six focused hosting/startup checks and all 76 server regression tests passed after this runtime update. No completed device/build/safety checks were repeated. Tests do not mutate/reset emulator data. No project selection, hosting resources, production configuration changes, live provisioning, deployment, dependency upgrade, commit or push.

Use `DEPLOYMENT_CHECKLIST.md` as the short remaining action list.
