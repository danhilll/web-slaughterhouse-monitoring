# Remaining deployment checklist — 2026-10-14

Completed evidence retained: Mac reports **8 connected Android rehearsal tests passing together**, map rendering passing and a healthy reloaded adapter. These are local rehearsal results; physical-device checks remain pending. Web startup fix at `ada20a9`, 71 server tests, build/typecheck and two rehearsal safety checks already passed. Do not repeat those completed checks unless relevant code changes.

- [ ] **Next decision: confirm the Firebase project. Pending.** Web currently identifies `com-slaughterhouse-app`; Android production identifies `slaughterhouse-app-895d2`. Confirmation unlocks official Android client-config preparation and the target-project read-only inventory. No project is selected by this checklist.
- [ ] **Approve hosting/provider/plan. Pending.** Render is a researched recommendation in `HOSTING_OPTIONS.md`. Review budget and provider settings before creating a service, adding secrets or deploying. Local runtime pieces are prepared: `npm start`, opt-in `SERVE_WEB=true` serving built `dist`, and a status-only `/healthz` startup-readiness probe. Use Node >=22 and build before enabling static serving; keep API routes protected.
- [ ] **Prepare the reviewed release configuration after those decisions.** Match web/server/normal Android to the confirmed project, use the actual assigned HTTPS API origin and review IAM, administrator allowlist, Auth settings and required indexes/rules. Preserve the separate demo variant. Keep account/animal writes closed for this read-only pilot and preserve the demo-only operations predicate. No API URL is invented here.
- [ ] **Approve one real vendor and business/stall ownership. Pending.** Then preview the exact UID, claims, protected membership and canonical business linkage, preserving existing identities and unrelated claims. No demo identity or synthetic invoice is copied into live Firebase. Review before provisioning.
- [ ] **Review and approve the concrete deployment/provisioning result.** Only after approval, publish the selected release and apply the reviewed pilot account changes. Keep direct Firestore client rules closed for API-backed access. A full billing/delivery/GPS release remains separate work.
- [ ] **Physical pilot acceptance remains pending.** Check actual HTTPS/mobile-data connectivity without USB, sign-in, own records or an honest empty view, other-vendor denial, errors, logout and approved deactivation testing. Map/GPS physical testing stays in the synthetic workflow until production operations are separately approved.

## Local preparation completed in this update

`server/hosting.js` adds optional static/SPA serving after the terminal API handler, preserving authenticated API JSON failures. Missing assets/dotfiles are not replaced with the login HTML. `/healthz` reports only `{ok}` based on initialized API state, without database queries, identifiers or diagnostics; it is not a continuous Firestore connectivity test. `server/index.js` wires these functions; `.env.example` documents the opt-in and probe, without changing `.env`. `server/hosting.test.js` verifies these behaviors with temporary local Express listeners and files, never Firebase. The standard syntax-check command now includes the new module.

Focused hosting/startup tests: 6 passed. Server regression result is recorded in `PILOT_READINESS_REVIEW.md`. Existing Android repositories, fixtures, operational predicates, dependencies and production configuration were not changed. No deployment, live data changes, commit or push.

Detailed evidence: `PILOT_READINESS_REVIEW.md`. Account/configuration sequence: `ONE_VENDOR_PILOT_PLAN.md`. Provider costs/setup: `HOSTING_OPTIONS.md`.

## Windows-to-Mac checkpoint

The owner authorized a reviewed source/documentation checkpoint on `fix/foundation-up` with commit message `chore(hosting): prepare deployment configuration and pilot checklist`. This authorization covers a normal Git push only; project, hosting plan, participant and live release approvals remain pending.

On Mac, open the web repository and run `git status` first. Preserve any local changes before switching/pulling. For a clean checkout, use `git switch fix/foundation-up` and `git pull --ff-only origin fix/foundation-up`, then read this checklist. If the local branch does not yet exist, fetch origin and create it tracking `origin/fix/foundation-up`. Stop on divergence; do not force-push or discard changes.

The checkpoint contains portable source, tests, a configuration example and documentation. Local `.env`, Admin credentials, generated `dist`, runtime files and Android SDK settings are excluded. Those local files do not synchronize through Git. Use the existing synthetic setup for continued testing; do not start the normal API against a real project as a substitute for rehearsal. The final Windows handoff reports the actual commit hash and push result.
