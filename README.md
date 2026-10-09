# Municipal Slaughterhouse and Vendor Billing Dashboard

A full-stack web application for a Philippine LGU slaughterhouse office, designed to manage slaughter records, vendor billing, invoice generation, and fee computation.

## Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express with Firebase Admin SDK and Cloud Firestore
- Database: Cloud Firestore (project `com-slaughterhouse-app`, region `asia-southeast1`)
- Charts: Recharts
- PDF output: jsPDF

## Features
- Dashboard summary cards and charts
- Slaughter record management with filters and add flow
- Invoice creation and printable receipt modal
- Vendor management and search
- Notifications and unread tracking
- Service computation with editable fixed fees
- Firebase Email/Password sign-in for allowlisted web administrators

## Run locally
1. Use Node.js 22 or newer and install dependencies
   npm install
2. Copy `.env.example` to `.env` and configure both sides of the app:
   - Copy `VITE_FIREBASE_*` from Firebase Console > Project Settings > Your apps > Web app.
   - Set `FIREBASE_PROJECT_ID=com-slaughterhouse-app` and point `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file **outside this repository**, or set the inline Admin SDK fields.
   - Set `WEB_ADMIN_UIDS` to a comma-separated list of Firebase Authentication UIDs allowed to use the web dashboard. Two or more administrators are supported. UIDs are checked on the server; Firestore `Users.role` is not used to grant web access.
   - Optionally set `PORT` and `CORS_ORIGIN` for your environment.
3. Start the app
   npm run dev
4. Open the app in your browser and sign in with an allowlisted account
   http://localhost:5173

The Express API runs on http://localhost:5001. Every `/api` route requires a valid Firebase ID token from an allowlisted web administrator, including `/api/health`. Startup fails if the Admin SDK cannot reach Firestore, no admin UID is configured, or the web and server Firebase project IDs differ. The dashboard closes when the API rejects an existing session. Use `npm run verify` for local checks.

Once the Admin credential path is set, run `npm run check:firebase` for a read-only check of Firestore and the first configured admin UID. This command prints only connection status, not account details or credential contents.

Run `npm run inspect:firestore` for a read-only inventory of database edition, root collections, and sampled field names/types; it does not print document IDs or values. The shared project currently has only `Users`; the dashboard's expected business collections do not exist. See [DATA_MODEL_RECONCILIATION.md](DATA_MODEL_RECONCILIATION.md) for the verified mapping and remaining decisions. The API blocks web writes until the mobile and web data models are reconciled. The UI identifies fee amounts that come from sample defaults rather than a stored schedule.

To find the web configuration in Firebase Console, open **Project Overview > gear icon > Project settings > Your apps > Web app > SDK setup and configuration > Config**. To find an administrator UID, open **Authentication > Users** and select that account. Choose two UIDs for two administrators; do not use a Firestore `role` field to grant web access.

## Business rules (enforced in API + mirrored in forms)
- Same-day payment: invoice `due_date` always equals `date_issued`. Status changes are manual (Unpaid/Paid/Overdue).
- `Both` slaughter records store the explicit cow/pig split; volume charts prefer it over the even-split fallback.
- All business dates are `YYYY-MM-DD` (Asia/Manila wall-clock); month buckets compare `YYYY-MM` prefixes.
- IDs are prefixed and collision-free (`VEN-…`, `SR-…`, `INV-…`, `NOT-…`).

## Firestore rules and mobile app

On 2026-10-09, the owner's approved temporary **deny-all client rule** was published to the default Cloud Firestore database. It blocks every direct Firestore read and write from web and mobile SDKs, including signed-in users. The web dashboard still reads through its authenticated Express API and Firebase Admin SDK. The earlier public, time-limited ruleset was saved locally in Git-ignored `.firestore-rules-backup.local.json`; **do not restore it**, because it allows public reads and writes.

The mobile app's source is on another laptop and no one is currently using an installed copy. Before using it again, inspect its exact Firestore paths, queries, writes, and Firebase Auth flow; design least-privilege rules for that data model; test them in the Rules emulator; then release the reviewed replacement. The current lockdown will make direct mobile Firestore operations fail until that work is finished. The web API uses Admin SDK credentials and therefore needs its own token checks regardless of Firestore rules.

`node scripts/check-firestore-lockdown.js` makes an anonymous, read-only request to a known existing document and reports only whether Firestore denies it. `node scripts/publish-firestore-lockdown.js` reads the live rules without changing them; its `--publish` mode is a guarded one-time lockdown release and should not be used to restore the old rule.

## Notes
- The web API's `vendors`, `slaughter_records`, `invoices`, and `notifications` model has not yet been reconciled with the mobile app's `Users` and `vendorID` model. The demo seed script refuses live writes to the shared Firebase project.
- The Firebase web app configuration identifies the client app; Admin SDK credentials belong only on the server and must never be committed or exposed to the browser.
