# Isolated React Router security migration — 17 October 2026

This result applies only to the isolated candidate based on commit
`3539ad169999125c0452b5c61facccddc8e1cad0`. The original checkout and its pending security,
deployment and other documentation remain unchanged. Existing security reports describe their
dated dependency trees; the comparison below describes this candidate. Nothing is deployed.

## Exact changes

- `package.json`: `react-router-dom` from `^6.28.0` (resolved 6.30.6) to exact **7.18.4**.
- `package-lock.json`: matching `react-router-dom` and its exact `react-router` dependency from
  6.30.6 to **7.18.4**; remove obsolete `@remix-run/router` 1.23.4; add router-local `cookie`
  1.1.1 and `set-cookie-parser` 2.7.2 within the new parent's declared ranges. Existing Express
  cookie resolution is unchanged. Only six lock entries differ, including root declarations.
- `scripts/check-router-ui.mjs`: new isolated real-main/AuthGate/App navigation regression using
  mocked Firebase and intercepted API responses, with external browser requests blocked.
- This report. No application source, routes, authorization, React, build configuration, PDF
  implementation, other package resolution, production gate or shared fixture changed.

## Upstream and compatibility decisions

Rechecked current registry metadata for both packages. `react-router-dom` latest and the
`react-router` version-7 tag are **7.18.4**; DOM declares exact router 7.18.4. Router's overall
latest tag points to v8, which is outside this bounded migration. Both v7 packages require
Node >=20 and React >=18, satisfied by the project's Node >=22 / React 18.3.1 declarations.
Execution here used Node 25.8.0; production Node 22 host acceptance remains separate.

Both [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and
[GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) first patch at 7.18.0.
Selected the current v7 patch, retaining later navigation URL-validation corrections in 7.18.3.
See the [7.18.4 release](https://github.com/remix-run/react-router/releases/tag/react-router%407.18.4),
[changelog](https://github.com/remix-run/react-router/blob/react-router%407.18.4/packages/react-router/CHANGELOG.md),
[DOM metadata](https://registry.npmjs.org/react-router-dom/7.18.4) and
[router metadata](https://registry.npmjs.org/react-router/7.18.4).

Reviewed the [official v6→v7 guide](https://github.com/remix-run/react-router/blob/react-router%407.18.4/docs/upgrading/v6.md).
The app remains in declarative BrowserRouter mode, using the supported DOM compatibility exports.
Its root `/*` layout and descendant absolute routes do not have the guide's multi-segment splat /
relative-link combination requiring route restructuring. There is no React.lazy declared inside
a component, data-router loader/action/fetcher, RouterProvider, SSR or hydration flow to migrate.
The applicable transition behavior was exercised through actual navigation/dialog interactions.
The guide's conditional no-breaking-change statement is not a substitute for testing: the same
focused browser harness passed on v6 and v7. No future compatibility flags or data/framework mode
were introduced, and every file under `src/` remains byte-identical to the base commit.

Graphify was queried only for App-linked tests. The 6fd00ea index returned none and predates the
committed browser coverage; direct local reads established `main.tsx`, AuthGate, apiFetch, both
App Routes trees, fixed links and existing browser/session/hosting tests as the relevant scope.

## Verification

All final functional checks passed:

| Check | Result |
| --- | --- |
| Focused router browser baseline, v6.30.6 | Pass: six scenario groups |
| Same focused router browser, v7.18.4 | Pass: six scenario groups; no page errors or unexpected requests |
| Typecheck | Pass |
| Production build | Pass; existing >500 kB chunk warning remains |
| Client session, access and static-hosting tests | 22 passed |
| PDF, list-pagination and tracking-polling unit tests | 23 passed |
| Existing workspace browser check | All eight viewport/theme/motion cases, mock onboarding and paid/unpaid PDF checks passed |
| Existing invoice-PDF browser check | Long 3-page, multiline 5-page, Latin 1-page cases passed; unsupported text visibly blocks download and preserves source text |
| Clean reinstall from migrated lock (`npm ci --no-audit`) | Pass |
| Dependency consistency (`npm ls --all --json`) | Pass |

The focused browser check imports the actual `src/main.tsx`, keeping BrowserRouter/StrictMode,
AuthGate and apiFetch intact. Only Firebase and API responses are replaced. It exercises:

- Anonymous direct `/invoices?source=direct#record`, denied login, authorized login retaining
  the complete URL, and all ten existing URLs with refresh.
- Root-splat/descendant route rendering, sidebar and dashboard navigation, retained layout
  identity, Back/Forward and dialogs after history changes.
- Normal logout, then Back/Forward/refresh without workspace restoration or protected API calls.
- Real apiFetch 401/403 access-loss events clearing AuthGate; refresh remains blocked while denial
  persists. This is mock-backed regression evidence, not live Firebase revocation certification.

Two initial v6 harness runs failed because the new test expected the raw mock-denial message
instead of AuthGate's existing access-loss message, then expected an Unpaid label inside a dialog
that displays invoice identity and amounts. Those assertions were corrected to the existing UI;
the failed logs are retained. No product code was changed to make those tests pass. Existing
paid/unpaid PDF-content assertions were retained and passed separately.

Direct browser URLs and refresh use the temporary Vite shell. The focused hosting tests separately
verify the actual Express SPA fallback and API-authentication boundary. No deployed host, Safari,
physical printing/device or live identity-provider acceptance is inferred. PDF Unicode/address
limits, tracking timing/concurrency limits and both unexplained Auth hash differences remain.

Reproduce with the external Playwright/Chromium configuration described in
`scripts/WORKSPACE_UI_CHECK.md`:

```sh
node scripts/check-router-ui.mjs
node scripts/check-workspace-ui.mjs
node scripts/check-invoice-pdf.mjs
npm run typecheck
npm run build
node --test server/client-session.test.js server/hosting.test.js server/access.test.js
node --experimental-strip-types --test src/invoicePdf.test.ts src/listPages.test.ts src/trackingPolling.test.ts
npm ls --all --json
```

Set `PLAYWRIGHT_MODULE` and optionally `CHROMIUM_EXECUTABLE` to existing external tooling.
`ROUTER_EVIDENCE_DIR` optionally saves the focused router result JSON and signed-out screenshot;
`PDF_EVIDENCE_DIR` remains supported by the existing PDF checks and is also a fallback for the
router evidence directory. Synthetic temporary modules are removed on completion. No fixture
helper or seeder is part of these checks.

## Audit comparison and remaining advisories

Requested before/after audit snapshots were taken in the isolated checkout. Both exit 1 due to
remaining vulnerabilities. No force-fix, override, suppression or unrelated upgrade was used.

| Inventory | Before | After |
| --- | --- | --- |
| Unique advisory IDs | 6 | **4** |
| Affected package entries | 14 | **12** |
| High package entries | 10 | **10** |
| Moderate package entries | 4 | **2** |
| Critical package entries | 0 | **0** |

The two router IDs above disappear. No new advisory ID appears. The low gRPC advisory is still
included under the package's higher aggregate severity; it did not disappear. Remaining findings:

| Advisory | Installed dependency / exposure | Unresolved constraint / mitigation |
| --- | --- | --- |
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), high | Firebase 12.19.0 → Firestore 4.17.2 → gRPC 1.9.16; compat 0.4.14 also propagates. Production dependency installed through the client aggregate; app uses browser app/auth and Express/Admin, with separate server gRPC 1.14.5 copies. | First fixed 1.13.6 / 1.14.5, excluded by Firestore `~1.9.0`. Upstream resolution or reviewed dependency/artifact separation remains necessary. Do not introduce affected optional-client-certificate authentication paths. |
| [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4), low | Same gRPC path; handler-error disclosure requires a gRPC server. | Same patch/range blocker; future gRPC handlers must sanitize sensitive error messages. No affected app handler demonstrated is not a safety finding. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | braces 3.0.3 via nodemon 3.1.14/chokidar 3.6.0 and Tailwind 3.4.19/fast-glob 3.3.3/micromatch 4.0.8. Build/development glob/watch input exposure. | No published patch in the existing upstream review; parent migration/removal remains open. Review inputs and isolate/resource-limit untrusted builds; nodemon removal alone leaves Tailwind's chain. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate | parser 6.1.4 through Tailwind and postcss-nested 6.2.0; CSS build input exposure. | First fixed 7.1.6, excluded by both parents' `^6` ranges. Requires reviewed build migration; restrict hostile selector inputs and isolate builds meanwhile. |

Build tools may remain installed on the documented host; development classification does not prove
their absence from runtime artifacts. All four findings remain unresolved, with 12 propagated
package entries. A passing migration check does not authorize release or establish safety.

## Scope and preservation

Original checkout HEAD/status/file hashes, including pending documentation, and shared listener
ownership/PIDs are checked against the pre-task snapshot. Only the four files listed above belong
to this isolated candidate; evidence, temporary runner scripts and existing pending work are excluded.
No staging, commit, push, deployment, shared-service control, production access, fixture mutation,
Android/device action or production-policy/gate change is part of this migration.
