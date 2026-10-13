# All-role synthetic walkthrough

Prepared 2026-10-12. Uses only demo-mobile-rehearsal, fictional market/stalls and public synthetic credentials. No real-account membership or municipal business record is created.

## Current verification

Fresh Windows run: 20 actual Auth/Firestore operations checks passed; rehearsal application/test APK builds passed; web typecheck, launcher syntax and two safety tests passed. Web page and module returned HTTP 200, synthetic administrator authenticated, and its history returned the same paid/delivered PHP 95 invoice created by the Android device test.

Device suite: four of five passed (animal/inspection, package identity, billing/payment/delivery/location, and vendor pagination/account switching). The denied-account test repeatedly timed out at RehearsalDeviceTest.kt:45 waiting for software-keyboard visibility before sign-in. Enabling show_ime_with_hard_keyboard did not resolve it; the original value 0 was restored. This is an unresolved keyboard/test-environment failure, not a passing full device suite. API role/ownership/membership denial checks passed independently. Do not present this as production certification. Browser page/API smoke checks passed; a human browser rendering walkthrough remains to be done.

Keep local Auth 9199, Firestore 8180, invoice API 5002 and animal/operations API 5003 running. Android must use com.slaughterhouse.app.rehearsal, not the normal app. These services are machine-local; Windows and Mac have separate emulator data even when source code is synchronized.

## Accounts

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

## Walkthrough

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
