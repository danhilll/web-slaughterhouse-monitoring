# Carcass rehearsal wiring and acceptance — 2026-10-15

Local source and existing uncommitted Android carcass screens were used. No production access, IAM/data changes, deployment, commit or push. Production recording and ordinary router defaults remain disabled; body-part inclusion/exclusion still requires slaughterhouse confirmation.

## Implemented wiring

Both rehearsal launchers accept `--enable-carcass-weight` and pass its guarded result into the actual animal router. The shared guard in `rehearsal/safety.mjs` validates the exact demo project and loopback emulator configuration, rejecting real project IDs, credentials, missing hosts and remote hosts. No environment variable implicitly opts in. Android adapter: `../Capsto-Project/rehearsal/animal-server.mjs`. Exact commands and prerequisites: [CARCASS_WEIGHT_API.md](CARCASS_WEIGHT_API.md#explicit-rehearsal-launcher-option--2026-10-15).

Only the two existing adapter processes were reloaded once to apply the startup option; Android retained `--preserve-fixtures`. Existing Auth/Firestore emulator processes, invoice service and isolated Chrome session were retained. No fixture-seeding/reset command ran. Current rehearsal APK was built offline with `:app:assembleRehearsal` and installed with replacement, without clearing app data or changing the production application.

## Observed UI acceptance

These observations came from the real isolated browser UI (Chrome DevTools interactions with React forms) and Android emulator UI (ADB input plus UI hierarchy/screenshot inspection), not mocked tests. Registration/approval were preparation calls through actual authenticated animal APIs; all carcass saves and invoice issuance below were UI actions. Unique acceptance tag: `CARCASS-1792068622755`; animal: `ANM-9a3d5669-d601-4292-b93b-5c082b445fe3`. Unique synthetic vendor/inventory/inspector identities were created without changing existing passwords or memberships.

| Step | Observed result |
| --- | --- |
| Web first entry | Saved **65.001 kg**, carcass revision **1**. Android inventory list and selected record showed the same value. Live weight remained **85.001 kg**, animal/inspection revision **1**. |
| Web correction | Saved **66.002 kg**, revision **2**, with reason `Acceptance correction after checking synthetic scale entry`. Android deliberately retained its revision-1 form. |
| Android stale submission | Submitted **67.003 kg** with old carcass revision. UI showed `Conflict: This record changed. Refresh animal and carcass revisions before retrying. No submission was retried. Review the refreshed record before submitting again.` It refreshed to **66.002 kg / revision 2**, retained attempted input and required `I reviewed the refreshed record`. |
| Android reviewed correction | Explicitly acknowledged review, supplied reason `Reviewed revision 2 and corrected synthetic scale entry`, then saved **67.003 kg**, revision **3**. Refreshed web register matched. |
| Android invoice | Issued the synthetic invoice through the billing UI for this animal only. UI showed **PHP 95.00**, using the existing synthetic per-animal fee schedule. No new fee policy or weight-dependent calculation was introduced. Invoice: `AINV-12e391a6b75a34d1e70528827730d12b4a293e87`. |
| Web post-invoice attempt | The already-open correction form submitted **68.004 kg**. Actual HTTP response was **409**, with `Carcass weight cannot change after invoicing or dispatch.` Web retained **67.003 kg / revision 3**, refreshed and hid the save form, showing the lock notice. |
| Android vendor visibility | Newly created vendor signed in successfully and saw exactly one own animal, **67.003 kg**, revision **3**, and the invoice lock notice. The selected-record panel had no carcass input or save controls; refresh remained available. Vendor invoice list also showed the synthetic **PHP 95.00** invoice. |

Evidence is local at `/private/tmp/carcass-acceptance-20261015/`: `01-web-recorded.png`, `02-android-matching.png`, `03-web-corrected.png`, `04-android-conflict-message.png`, `05-android-corrected.png`, `06-web-matching-android.png`, `07-android-invoiced.png`, `08-web-invoice-lock.png`, `09-vendor-read-only.png`. Screenshots are transient workspace evidence, not committed assets. Acceptance-created synthetic records are retained; existing fixtures were not reset.

## Automated tests and data corroboration

- **14 focused tests passed**: four rehearsal safety tests and ten carcass HTTP/transaction-double tests (`node --test rehearsal/safety.test.mjs server/carcass-weight.test.js`). Coverage includes absent opt-in, real-project/missing/remote-host/credential rejection, default-disabled router behavior, authorization, revision conflicts, audit rollback and billing lock.
- Both changed launchers passed Node syntax checks; `git diff --check` passed. Offline Android `:app:assembleRehearsal` succeeded. Unchanged web typecheck/build and broader tests retain their earlier evidence and were not repeated for launcher-only changes.
- A guarded read-only check against the actual local Firestore emulator confirmed **67003 grams**, carcass revision **3**, original **85001 grams**, animal/inspection revision **1**, exactly three carcass audit events with the matching before/after snapshots and both correction reasons, and invoice **9500 centavos / syntheticOnly=true**. Failed stale/post-invoice saves created no extra carcass event.
- Five pre-existing protected fixture documents (inventory/inspector/billing memberships, canonical identity business and fee schedule) matched their saved data snapshots after acceptance. Verification output: `/private/tmp/carcass-acceptance-20261015/verified-data.json`.

This acceptance establishes the focused emulator/browser flow only. Physical phones, ongoing production operations and the measurement-policy approval remain release checklist items. No production-enablement claim is made.
