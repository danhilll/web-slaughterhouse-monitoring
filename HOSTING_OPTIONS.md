# Hosting recommendation — researched 2026-10-14

Status: recommendation only. Firebase project, hosting approval and real vendor participant remain pending. No infrastructure, billing account, API URL or credential upload was created.

## Recommended shape

Use one Render Node Web Service for the Express API and, after a small reviewed local routing change, the built Vite frontend. One HTTPS origin would keep existing browser `/api` requests working; Android would use that same origin. Firestore remains the database, so no Render database or persistent disk is needed for this design.

Render documents native [Node/Express deployment](https://render.com/docs/deploy-node-express-app), managed TLS on its [web services](https://render.com/docs/free), and [environment variables/secret files](https://render.com/docs/configure-environment-variables). This is a compatible hosting option, not proof this project's deployment or credential access has been validated.

## Expected cost and limits

| Option | Expected base compute cost | Suitability |
| --- | --- | --- |
| Render Free web service | USD 0 within platform allowances | Demonstrations only; service sleeps after 15 minutes idle and may take about a minute to start. Render advises against using it for production. |
| Render `0.5c-512mb` (formerly Starter) | USD 7/month for one service | Suggested baseline for a small scheduled real-user pilot, subject to observed memory/CPU and latency. Paid instances run continuously. |
| Cloud Run in the intended Firebase project | Usage-based; no-cost allowances are conditional | Requires Cloud Billing/Blaze in that project, so it is not the first recommendation under the current Spark-only preference. |

The USD 7 figure is service compute, not a guaranteed total bill: review workspace-plan fees, taxes, bandwidth/build usage and any optional custom domain before approval. Reconfirm the dashboard price before purchasing. The free plan can suspend services at limits, and usage charges can apply when a payment method is present. Sources: [Render free-service limits](https://render.com/docs/free), [Render compute plans](https://render.com/docs/compute-plans), [Render's September 2026 published cost example](https://render.com/articles/production-rails-hosting-guide), [Render pricing](https://render.com/pricing) and [billing FAQ](https://render.com/docs/faq).

Project-specific concern: Android's transport uses 10-second connect/read timeouts. A roughly one-minute free-service wake-up can produce a login/API error even when the configuration is correct. Do not present Free as reliable always-on municipal access or work around its limits with artificial keep-alive traffic.

Hosting the Node API outside Google Cloud does not itself link a Google billing account; keeping Firebase on Spark is possible for supported Auth/Firestore usage within quotas. Cloud Run is unavailable in a Spark project, and linking Cloud Billing upgrades that project to Blaze. Source: [Firebase pricing-plan documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans). Actual approved project plan/quota state still needs verification after project selection.

## Required preparation before any deployment

1. Approve the provider/plan and expected budget. Keep project and participant decisions explicit; do not copy demo memberships, businesses or receipts into live data.
2. Local Express static-asset/SPA routing is prepared behind `SERVE_WEB=true`, with API authentication/JSON errors preserved and missing assets/dotfiles excluded from HTML fallback. Review this option in the eventual deployment configuration; leave it unset for normal Vite development.
3. Review Node >=22, build command `npm ci && npm run build`, and start command `npm start`. Vite public app identifiers must be provided at build time for the subsequently approved project. Admin secrets must never have a VITE_ prefix or enter the client bundle. Do not start normal `npm start` locally for synthetic verification: its current .env targets the configured real project.
4. After project approval, prepare a reviewed runtime environment: matching Firebase project, existing administrator allowlist and explicit scope; keep account/animal writes disabled for the first read-only release. Preserve the demo-only operations predicate. No emulator hosts or synthetic adapter/control routes belong in a public production deployment.
5. Review least-privilege server credentials/IAM. Render secret files are available at `/etc/secrets/<filename>`; a later reviewed `GOOGLE_APPLICATION_CREDENTIALS` setting can point to the selected file. Never upload the whole Windows .env or commit an Admin key. Treat secret-file save/service creation as deployment actions that require review first.
6. Use the prepared status-only `/healthz` startup-readiness probe in the eventual provider configuration. `/api/health` remains administrator-only. The public probe exposes no account, database or project details and does not continuously probe database connectivity. Review deploy automation and require manual release approval.
7. After an actual approved service exists, use its real assigned HTTPS origin—do not invent one. Prepare Android normal-project alignment and `mobileApiBaseUrl` for that origin, then verify deployed TLS, sign-in, authorized reads, forbidden reads, outages, logout and deactivation for the approved participant.

## Preparation now

Provider-independent startup, opt-in static routing and health-probe code are now prepared locally. Five new hosting checks plus the startup regression passed; the full server suite now passes 76 tests. Earlier build/safety checks were not repeated. The owner reports eight connected Android rehearsal checks and map rendering passed on Mac; physical-device checks remain pending. Public hosting of Firebase emulators is not part of this proposal. Project selection, provider/plan approval and real participant/business ownership remain prerequisites for the later pilot; no hosting service, credentials or URL have been created.
