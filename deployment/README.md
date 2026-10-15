# Production deployment package — review only, 2026-10-16

Source: web `997b6c5eb3630d51e4ab15b01307305598a05340` on `fix/foundation-up`, current production plan and configuration loader. No live settings were inspected or changed. Follow the steps below only after separate deployment authorization.

## 1. Finalize the manifest locally

`production-release.pending.json` now contains the user-approved deployed origin `https://web-slaughterhouse-monitoring.onrender.com`. All nine feature gates remain explicitly false and all four unresolved policies remain null. Offline validation passes against the actual configuration loader. The filename remains pending because runtime credentials, permissions and hosting settings have not been verified. Confirm candidate project `com-slaughterhouse-app` and scope `ph-quezon-calauag` against the actual service before deployment; the future Render secret filename is `production-release.json`.

The current foundation supports the web and API on the same origin. Do not substitute a guessed Render hostname. Keep every feature false. Carcass, billing, payment, delivery and tracking writes are rejected even if set true; policy work is still required.

**Business writes paused; authorized emergency deactivation retained.** Scoped administrator emergency deactivation at `POST /api/accounts/:uid/deactivate` remains available independently of the nine gates. Preserve the reads-plus-emergency-deactivation IAM requirements below; strict read-only IAM would break this safeguard.

Validate an approved manifest offline from the repository root; this imports no Firebase client, loads no `.env`, and uses a public test-only signing fixture solely for configuration validation:

```sh
node --input-type=module - /absolute/path/to/production-release.json <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadProductionConfig} from './server/production-config.js';
const path=process.argv[2];
const manifest=JSON.parse(readFileSync(path,'utf8'));
const env={NODE_ENV:'production',PRODUCTION_RELEASE_MANIFEST:path,
  FIREBASE_PROJECT_ID:manifest.projectId,VITE_FIREBASE_PROJECT_ID:manifest.projectId,
  MUNICIPAL_SCOPE_ID:manifest.municipalScopeId,
  CURSOR_SIGNING_SECRET:'test-only-fixed-cursor-key-not-a-real-secret'};
const config=loadProductionConfig(env);
assert.equal(Object.keys(manifest.features).length,9);
assert.ok(Object.values(manifest.features).every(value=>value===false));
assert.ok(Object.values(config.features).every(value=>value===false));
assert.ok(Object.values(manifest.policies).every(value=>value===null));
console.log('Offline manifest validation passed; runtime secrets/settings remain external checks.');
JS
```

Never deploy that test signing fixture. The real stable `CURSOR_SIGNING_SECRET` is required even for paginated reads: 32–4096 UTF-8 bytes (at least 32 after trimming), server-only, identical across instances/restarts. No secret value is included in this package. Syntactic URL validation does not prove ownership, TLS, or stakeholder approval.

The loader also rejects values starting with `placeholder`, `change-me`/`changeme` (including a single separator), or `example`, case-insensitively. It accepts a raw string, not a filename, JSON object or encoded value to decode. Recommended generation is 32 cryptographically random bytes rendered as **64 hexadecimal characters**, without quotes or newline in the Render value. No specific encoding is otherwise required by code.

The reviewed local generation command below was **executed once with explicit user authorization on 2026-10-16**. It made a unique private directory outside this repository (0700), created a new file exclusively (0600), and printed only its path. No secret value is recorded in this package or sent to Render. Reuse that stored value across instances/redeployments; do not rerun during routine configuration updates.

```sh
node --input-type=module <<'JS'
import {mkdtempSync,chmodSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
process.umask(0o077);
const directory=mkdtempSync(join(homedir(),'.slaughterhouse-secrets-'));
chmodSync(directory,0o700);
const path=join(directory,'cursor-signing-secret');
writeFileSync(path,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
console.log(path);
JS
```

## 2. Review Render settings and variables

First manual Render step (read-only): open Render Dashboard, select the existing service whose public URL is `https://web-slaughterhouse-monitoring.onrender.com`, then open **Environment** and inspect variable names and secret-file filenames against `render.env.example`. Do not save or upload anything at this step.

Use that existing service; its settings remain unverified. Native Node web service, repository root, reviewed commit above, build `npm ci --include=dev && npm run build`, start `npm start`, health path `/healthz`. Disable automatic deployment for the reviewed release process. `NODE_VERSION=22.x` bounds the major instead of relying on `engines >=22`; confirm the resolved patch in build logs and validate it before release. Local tests used Node 25.8.0, so Node 22 host acceptance is still required. [Render Node version selection](https://render.com/docs/node-version).

Exact names and non-secret defaults are in `render.env.example`. Supply externally:

| Setting | Required content, without values here |
| --- | --- |
| `WEB_ADMIN_UIDS` | Comma-separated, reviewed existing Firebase administrator UIDs; no emails or synthetic UIDs |
| `CURSOR_SIGNING_SECRET` | Externally provisioned stable secret, raw environment value; no supported `_FILE` alternative |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Approved Firebase web-app identifiers; available at build time; never Admin credentials |
| Secret file **`production-release.json`** | Approved manifest; `PRODUCTION_RELEASE_MANIFEST=/etc/secrets/production-release.json` |
| Existing secret file **`render-readonly-pilot.json`** | Preserve existing filename and credential contents; `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/render-readonly-pilot.json`. Filename does not prove effective IAM or emergency-deactivation permission. |

Do not set inline `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` alongside the credential file: inline credentials take precedence. `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID` must equal the manifest, as must optional `GCLOUD_PROJECT`/`GOOGLE_CLOUD_PROJECT`. `MUNICIPAL_SCOPE_ID` must match exactly. Omit all populated `*_EMULATOR_HOST` variables. Omit `CORS_ORIGIN` or match the approved origin exactly. Leave `PORT` to Render. The three legacy `*_ENABLED=false` switches in the example cannot enable production features.

Render mounts secret files under `/etc/secrets/<filename>`. Saving a secret file triggers deployment; linking environment groups can also trigger deployment. These are future authorized deployment steps, not harmless preparation actions. Public Vite identifiers require rebuilding when changed. [Render environment and secret-file behavior](https://render.com/docs/configure-environment-variables).

### Exact additions and future upload procedure

Preserve populated `VITE_FIREBASE_*`, `FIREBASE_PROJECT_ID`, `WEB_ADMIN_UIDS` and the existing credential path/file. Do not bulk-import `render.env.example`, whose blank placeholders would risk replacing real values. If existing project/scope values differ from the manifest, stop for review instead of overwriting them. Preserve any existing cursor secret; do not replace it merely because this package provides a generation command.

| Add if absent / verify if present | Exact intended value |
| --- | --- |
| `PRODUCTION_RELEASE_MANIFEST` | `/etc/secrets/production-release.json` |
| `CURSOR_SIGNING_SECRET` | Raw privately stored 64-character hex value from the optional command; **not** its path or the test fixture |
| `NODE_ENV` | `production` |
| `SERVE_WEB` | `true` |
| `MUNICIPAL_SCOPE_ID` | `ph-quezon-calauag` |
| `MUNICIPALITY_NAME` | `Calauag` |
| `ACCOUNT_MANAGEMENT_ENABLED`, `ANIMAL_WORKFLOW_ENABLED`, `ANIMAL_OPERATIONS_ENABLED` | `false` each |

`NODE_VERSION=22.x` is the proposed runtime selection; changing an existing version requires the documented host/build acceptance. Leave `CORS_ORIGIN` absent or exactly `https://web-slaughterhouse-monitoring.onrender.com`; review any mismatch. Do not change Firebase app identifiers, admin membership or credential permissions as part of these additions.

Future operator steps, after separate live-change/deployment authorization:

1. Open the existing Render service → **Environment**. Check existing names/values privately; do not include secret values in screenshots or evidence.
2. Add only missing variables above through **Add Environment Variable**. Use **Save only** when saving variables without deployment is specifically authorized. They will not take effect until the next deployment. For `CURSOR_SIGNING_SECRET`, paste the file's raw contents. On this Mac, `pbcopy < "/absolute/path/printed-by-the-command/cursor-signing-secret"` copies without terminal output; it uses the system clipboard, which may sync or retain history. Clear the clipboard after pasting. Never paste the secret into chat, a Git file or a shell argument.
3. Under **Secret Files**, choose **Add Secret File**, filename **`production-release.json`**. Paste the exact entire contents of local `deployment/production-release.json`. Do not upload/replace `render-readonly-pilot.json`, and do not upload the cursor-secret file: the loader expects its value in the environment.
4. **Stop before Save Changes while deployment is unauthorized.** Render secret-file saving starts deployment; it has no equivalent safe staging assumption here. Complete this upload/save only in the separately authorized deployment window after all prerequisites are reviewed.

Intended release state remains **business writes paused; authorized emergency deactivation retained**. User-reported manual observation, 2026-10-16: **Render Read and Deactivate** is assigned to the existing `render-readonly-pilot` service account. This is **manually observed, not runtime-tested**; effective SDK permissions and deactivation acceptance remain unverified. The existing credential filename is preserved.

Local `production-release.json` is prepared as an exact copy of `production-release.pending.json`, with the approved origin, nine false gates and null policies. For preparation only: copy the privately stored cursor value into an unsaved `CURSOR_SIGNING_SECRET` field, and review the local manifest contents. Do not upload files, save Render changes or deploy. The future upload filename remains `production-release.json`.

## 3. Prepare indexes, rules and runtime IAM separately

### Indexes and rules

`deployment/firestore.indexes.json` is an exact snapshot of the canonical root `firestore.indexes.json`: 24 COLLECTION composites, no field overrides. Use the root `firebase.json` configuration for `(default)`; local location is `asia-southeast1`. Do not create another database or delete existing indexes. All definitions are provided; no index deployment is performed here.

Read-required composite families (all fields ASC unless `DESC` is shown):

| Collection | Ordered fields |
| --- | --- |
| `animal_audit` | `animalId, municipalScopeId, at DESC` |
| `animal_records` | `municipalScopeId, vendorBusinessId` |
| `account_audit` | `targetUid, at DESC` |
| `vendors` | `municipalScopeId, status` |
| `invoices` | `municipalScopeId, vendor_id, __name__`; `municipalScopeId, workflow, __name__`; `municipalScopeId, workflow, vendor_id, __name__` |
| `invoices` | `municipalScopeId, date_issued DESC`; `municipalScopeId, payment_status` |
| `invoices` | `municipalScopeId, F` for each `F = total_amount, corral_fee, delivery_fee, anti_mortem_fee, facility_fee` |
| `invoices` | `municipalScopeId, date_issued, total_amount` |
| `slaughter_records` | `municipalScopeId, date DESC`; `municipalScopeId, date` |

The snapshot also retains four legacy unscoped composites and three older species-aggregate composites; retain them without claiming current queries require all seven. Scope/document-ID list and projected coverage queries also rely on automatic indexes. Tracking uses point documents. No additional write-specific composite is required by current code; future approved policies may introduce queries needing review. An authorized index operator must wait for required indexes to become READY and accept the actual queries; emulator/test success does not prove deployed readiness.

Retain the existing deny-all direct-client `firestore.rules`. Admin SDK requests bypass those rules and use IAM plus application role/scope/ownership checks. Index management belongs to a separate operator, never the runtime identity. [Firestore server IAM and RPC permissions](https://docs.cloud.google.com/firestore/native/docs/security/iam).

### Runtime permission sets to review, not IAM changes

See [the deactivation operation/failure analysis](EMERGENCY_DEACTIVATION.md) and [the exact seven-permission custom-role proposal](runtime-read-deactivate-role.proposed.json). They preserve the existing runtime identity and specify the minimum three write-permission additions to the read baseline. Effective IAM remains unverified; viewer permissions cannot support deactivation.

| Mode | Exact runtime permissions |
| --- | --- |
| Strict read-only | `datastore.entities.get`, `datastore.entities.list`, `datastore.databases.get`, `firebaseauth.users.get` |
| Reads **plus existing emergency deactivation** | All read-only permissions plus `datastore.entities.create`, `datastore.entities.update`, `firebaseauth.users.update` |
| Later reviewed account management | Previous set plus `firebaseauth.users.create` |
| Later activation, animal/inspection, financial/delivery/tracking writes | Firestore create/update and transaction permissions above; gate-specific policy/code approval remains mandatory |

Document queries/aggregates require entity get/list; read/write transactions require `datastore.databases.get`. Revocation-aware token validation requires Auth user get. Deactivation transactionally updates `managed_accounts`, merges membership/`Users` status and creates `account_audit`, then disables the Auth user and revokes sessions. It needs create as well as update even with onboarding disabled. IAM document-write permissions are broad; application authorization remains essential.

No document deletion, index administration, IAM administration, Owner/Editor, service-agent role, or service-account token-creator grant is proposed for runtime. Invitation email uses the API-key `accounts:sendOobCode` endpoint; do not add guessed Admin email permissions. Future account enablement still requires authorized-domain, API-key restriction, email-template and delivery acceptance. The exact custom permission set must be accepted with the deployed SDK/credential before release. [Auth permission reference](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth).

## 4. Execute release steps only after authorization

1. Use the approved origin above; confirm project/scope, existing Render service, exact commit, Firebase web app and legitimate administrator/staff/vendor identities. Retain authorized emergency deactivation and its required IAM permissions. Approve the completed manifest and record configuration versions without copying secrets into evidence.
2. Preserve the existing credential and manually observed role assignment; verify effective runtime IAM separately. The cursor key is already generated privately; configure its raw value only with separate authorization. Confirm default database, required APIs, deny-all client rules and READY indexes. Do not seed, reset or rewrite production history.
3. Review Render build/start/root/Node/health settings, HTTPS/domain, Firebase authorized domains and variable names. Schedule secret-file changes as deployment actions. Preserve the prior approved artifact/configuration securely for rollback.
4. Deploy the reviewed web/API artifact with every business gate false. Verify logs contain no credentials and the expected Node version is used. `/healthz` must return 200 `{"ok":true}` with `Cache-Control: no-store`. Startup checks a Firestore document read before listening; the probe is not a continuous database or authorization check.
5. Use approved existing accounts for GET-only acceptance: anonymous `/api/session` → 401; authenticated allowlisted admin `/api/health` → 200 with `store:"firestore"`; `/api/session` → `writesEnabled:false`, all nine capabilities false. `/api/accounts/settings` reports `canManageAccounts:false`, `staffInspectorAvailable:false`, **`canDeactivate:true`**. Animals/operations settings must report write capabilities false while historical reads remain enabled.
6. Read `/api/vendors?pageSize=1`, `/api/slaughter-records?pageSize=1`, `/api/invoices?pageSize=1`, `/api/notifications?pageSize=1`; follow `nextCursor` with the same principal and page size where present. Inspect dashboard, histories and invoice detail. Empty collections are valid, but do not prove page-boundary acceptance. No hidden truncation; incomplete historical data must show coverage/unavailable values rather than invented zero/species splits. Check UI refresh/errors. Health alone cannot accept these reads or deployed indexes.
7. With authorized existing mobile identities, GET `/api/mobile/me` and their allowed historical animal/invoice/tracking reads on the approved Android build. Confirm actual membership/scope/vendor isolation and denied reads for existing inappropriate identities. Use local negative tests for tampered/cross-user cursors; do not obtain another real user's data to construct a test. No live POST/PATCH/DELETE acceptance is included in this read-only release.
8. Release the signed Android artifact only after its approved HTTPS origin, matching project, external signing, real-device login/read/update and disabled-capability behavior pass. Write enablement is a later reviewed code/configuration release, never an IAM grant alone.

### Rollback

Pause business workflows by keeping/restoring all nine gates false, retaining project/scope and the same cursor secret. Authorized historical reads and emergency deactivation remain intended behavior with the appropriate IAM set. Configuration changes require an authorized restart/redeploy; the manifest is loaded at startup.

If the artifact itself fails, restore a previously accepted **matched web/API artifact and configuration**. Keep the cursor secret stable; do not assume pre-pagination builds accept current list response contracts. No prior production artifact is certified by this package: establish the rollback target before first release. Rebuild if public Vite values change. Repeat health, session/settings and representative authenticated reads after rollback. Do not reset data, reverse transactions, restore old passwords/claims or revoke emergency deactivations. Do not rotate the cursor secret as ordinary rollback; emergency rotation invalidates cursors and requires fresh pagination.

## 5. What exists versus what remains unverified

| Evidence available locally | Manual/live status |
| --- | --- |
| Manifest loader/template, default-off gates, stable-secret requirement, rollback reads, settings, same-origin hosting | Implemented; approved origin populated and manifest validated offline; runtime readiness unverified |
| Candidate project/scope and Firebase public defaults in templates; `(default)` / `asia-southeast1` and deny-all rules in files | Local definitions only; deployed project/database/rules/authorized domains/API restrictions unverified |
| 24 index definitions and runtime credential-file support | Existing credential path preserved; user manually observed Render Read and Deactivate assignment, not runtime-tested. Cursor key generated and stored privately locally; Render provisioning, deployed indexes, effective IAM and credential validity unverified |
| Build/start commands and health endpoints | Implemented; deployed origin supplied and approved by user; actual Render variables/files/build/start/health/autodeploy settings, TLS and hosting plan unverified |
| 150 server tests (including reporting regressions), 8 pagination client tests and web checks previously passed | Reused local evidence; actual production reads, query costs/latency, real browser/PDF acceptance and rollback unverified |
| Android capability/map/session checkpoint exists | Signing keys/certificates, production origin, distribution and physical-device release acceptance unverified |

No cloud manual setting is claimed as already installed from a repository template. Remaining business approvals: carcass inclusion/exclusion definition, official fees, numbering and correction/reversal policy. Reporting still requires cross-register reconciliation; multi-query reports are not accounting snapshots. No Graphify discovery was needed because these exact source dependencies were already identified.

Package-only offline checks passed: approved exact origin accepted by the real loader; nine explicit false gates; null policies; exact project/scope bindings; stable cursor derivation; byte-identical 24-index snapshot. The manifest differs from the original template only in `apiOrigin`. Runtime credentials/settings remain unverified. No application code changed or application suite was rerun.

## Reviewed deployment checkpoint

Seven related paths only: `deployment/README.md`, `deployment/EMERGENCY_DEACTIVATION.md`, `deployment/render.env.example`, `deployment/production-release.json`, `deployment/production-release.pending.json`, `deployment/firestore.indexes.json`, `deployment/runtime-read-deactivate-role.proposed.json`. The two manifests must remain byte-identical. The private cursor key, credentials, logs, generated evidence and unrelated working changes are excluded.

The checkpoint prepares a release; committing/pushing it does not authorize uploading files, saving Render settings, deploying indexes or deploying applications. Remaining deployment prerequisites are READY Firestore indexes and automatic-index query acceptance, effective runtime IAM/deactivation acceptance, external Render cursor/manifest configuration, build/runtime/HTTPS/Auth-domain checks, authenticated scoped reads and rollback acceptance. All nine business gates stay off; policy-dependent writes remain a later release.
