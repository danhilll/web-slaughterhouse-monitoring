# Session resume — web-slaughterhouse-monitoring

> One honest note: I can't control whether this chat app keeps history between
> opens — that's the app's session storage, not something I can switch on.
> THIS file is the reliable part: full project state, so any fresh session
> can continue brick-by-brick with zero re-explanation.

## Where we are
- Branch: `fix/foundation-up` (all work here; `main` untouched)
- Backend + foundation bricks B0–B16: DONE
- Contract/frontend bricks B17–B25: DONE
- Polish/docs/verify B26–B29: DONE
- Full QA B30: DONE (13/13 live, `npm run verify` green)
- UI upgrade U1–U6 (refined emerald gov, full restyle + motion): DONE, verified
- Verdict chain: audit → 31 fix bricks → UI restyle → QA all complete

## Key decisions (locked)
- Database: Cloud Firestore, project `com-slaughterhouse-app`, region `asia-southeast1`
- Access model: Express + firebase-admin is SOLE writer; clients auth-gated reads, no client writes
- Business rules: same-day due dates, manual status flips, Both-records keep explicit cow/pig split, Manila wall-clock dates, YYYY-MM buckets, prefixed collision-free IDs
- Auth posture: demo mode, no fake logout (B26). Firebase Auth login UI = separate future track
- Mobile plan (DISCUSSED ONLY — user said do not build yet, wait for signal):
  Web "Users" admin panel creates mobile accounts (vendor/staff/admin) via
  backend `auth.createUser()` + `users/{uid}` docs; mobile signs in with
  email+password against the same project. ~5 bricks when approved.
- Android repo: NOT yet shared. Needed to start mobile track: absolute
  Windows path of the Android Studio project folder.

## Pending / next actions
1. `node scripts/seed-firestore.js --live` (needs FIREBASE_* creds) — once per project
2. `firebase deploy --only firestore:rules,firestore:indexes`
3. Enable Email/Password Auth in Firebase console (needed for accounts track)
4. Browser click-through: dark toggle, PDF, filters, dashboard Retry card
5. User signal for: push/PR, Android audit path, or `go accounts` build

## Sensitive items (never committed)
- `.env` (git-ignored), service-account JSON, `FIREBASE_PRIVATE_KEY`
- Backup of original Firestore config: `C:\Users\Acer\AppData\Local\Temp\opencode\b2-backup-20261003\`

## Why these decisions were made (context for future sessions)

- **Firestore over Supabase/Postgres:** repo already had `firebase.json`,
  `.firebaserc` (`com-slaughterhouse-app`), and the `firebase` SDK installed
  but unwired — adopting it reused existing config instead of adding a new
  stack. Mobile (Android) also integrates with Firebase Auth/Firestore most
  easily, which the owner needs for the vendor mobile app.
- **Express + Admin SDK as sole writer (no direct client writes):** billing
  money-totals must be computed server-side so a tampered client can never
  forge fees; rules (`B7`) enforce read-only + signed-in clients.
- **Same-day due dates, manual status flips:** matches the treasurer office's
  real policy printed on receipts ("SAME-DAY PAYMENT REQUIRED"); no silent
  auto-overdue job, so nothing changes state behind the treasurer's back.
- **Explicit cow/pig split persistence (B17):** auto-invoices billed the real
  split while stored records fell back to an even split — stored data must
  equal billed data for a government ledger.
- **Manila wall-clock dates (B12/B22):** server UTC dates shifted "today" and
  month buckets near midnight; office operates on Asia/Manila time.
- **Demo mode instead of fake auth (B26):** a Logout button that logs out
  nothing is a trust lie in a government tool; honest label until the real
  Firebase Auth login-UI track is built.
- **Web-created accounts plan (on hold):** owner wants the web app to be the
  single registrar of mobile vendor/staff accounts to avoid messy
  self-registration; backend `auth.createUser()` + `users/{uid}` role docs.
- **UI restyle U1–U6 (refined emerald gov):** professor feedback called the
  original UI ugly; direction chosen by owner. Surface-only, zero logic
  changes, verified by `npm run verify` after every brick.
