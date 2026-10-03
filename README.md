# Municipal Slaughterhouse and Vendor Billing Dashboard

A full-stack web application for a Philippine LGU slaughterhouse office, designed to manage slaughter records, vendor billing, invoice generation, and fee computation.

## Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express (Firestore via `firebase-admin` when credentials are set, in-memory seed store otherwise)
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
- Demo-mode profile: Maria Christina Lopez, Municipal Treasurer (no sign-in; Firebase Auth login UI is a separate track)

## Run locally
1. Install dependencies
   npm install
2. (Optional) Configure environment
   Copy `.env.example` to `.env` and fill in values.
   Without Firebase variables the app runs fully on the seeded in-memory store.
   - Web Firebase config: `VITE_FIREBASE_*` (Firebase console > Project Settings > Your apps > Web app)
   - API Firestore mode: `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
     (or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account JSON file)
   - API port: `PORT` (default 5001). Production CORS allowlist: `CORS_ORIGIN`
3. Seed Firestore (only needed once per Firebase project, requires API credentials)
   node scripts/seed-firestore.js --dry-run
   node scripts/seed-firestore.js --live
4. Start the app
   npm run dev
5. Open the app in your browser
   http://localhost:5173

The Express API runs on http://localhost:5001. Health check: http://localhost:5001/api/health.

## Business rules (enforced in API + mirrored in forms)
- Same-day payment: invoice `due_date` always equals `date_issued`. Status changes are manual (Unpaid/Paid/Overdue).
- `Both` slaughter records store the explicit cow/pig split; volume charts prefer it over the even-split fallback.
- All business dates are `YYYY-MM-DD` (Asia/Manila wall-clock); month buckets compare `YYYY-MM` prefixes.
- IDs are prefixed and collision-free (`VEN-…`, `SR-…`, `INV-…`, `NOT-…`).

## Deploy (Firebase)
- `firebase deploy --only firestore:rules` — least-privilege rules (signed-in reads, server-only writes)
- `firebase deploy --only firestore:indexes` — composite indexes for vendor/date and status/date queries

## Notes
- Without credentials the API uses a seeded in-memory dataset suitable for demo and development; restart wipes runtime writes. With credentials it persists to Firestore.
- The Firestore security rules expire nothing and grant nothing to anonymous clients.
