# Dependency security review — 2026-10-16

**Current status — 17 October 2026:** the continuation below supersedes the original installed-version,
held-jsPDF-migration and audit-count statements in this historical 16 October record. jsPDF is now
4.2.1 and DOMPurify 3.4.17 locally. Current audit: **14 affected packages, 0 critical, 10 high,
4 moderate**. Remaining findings are unresolved vulnerabilities, not accepted-as-safe findings.
Nothing in this report establishes deployed remediation or changes production policy/gates.

**PDF follow-through:** the historical checkpoint review below found layout/Unicode defects. The
subsequent local PDF layout fix at the end of this report supersedes those layout-failure statuses
for tested inputs. Unsupported scripts now block download with an explicit limitation; universal
Unicode support is not claimed. Dependency findings and production-policy limits remain unchanged.

Baseline lockfile SHA-256: `48f5ecc074d064bff104af8d7f264f6c8f0f0bd05832ec93cfd2c6e4d776f81b`. Reviewed lockfile SHA-256: `4737d276d5582a7ca5cd67f7bd8e331772cdfba61609a5e48300f139368a5992`. Tools: npm audit JSON and npm registry version/dependency metadata; current source verified for applicable calls. No force fix, blanket upgrade, override or direct-dependency declaration change. npm's affected-package counts include inherited findings, not independent exploit counts.

Before: **23 affected packages (4 critical, 12 high, 7 moderate)**. After targeted compatible updates: **16 affected packages (1 critical, 10 high, 5 moderate)**. Vulnerable dependencies remain installed. An absent confirmed application trigger is **not a safety determination**. These changes are local and undeployed.

## Exact package disposition

Applied compatible resolutions: `proxy-addr` 2.0.7→2.0.8, `source-map-js` 1.2.1→1.2.2, `brace-expansion` 5.0.9→5.0.12, `concurrently` 9.2.4→9.2.5 (its exact `shell-quote` pin becomes 1.12.0), and `@google-cloud/storage` 8.2.0→8.4.0 within Firebase Admin's `^8.1.0`. The storage update replaces `gaxios` 6.7.1 with 7.3.1 and `node-fetch` 2.7.0 with 3.3.2, removes UUID 9 and deduplicates existing compatible SDK dependencies. These transitive major changes are declared by the compatible parent release, not forced into incompatible leaf ranges. The root dependency declarations are byte-identical; the complete lockfile diff was reviewed.

| Package / baseline → current | Direct/transitive; lock exposure | Advisory IDs (including inherited) | Applicable exploit conditions and current application exposure | Smallest compatible fix / remaining migration |
| --- | --- | --- | --- | --- |
| @firebase/firestore 4.17.2 → 4.17.2 | Transitive; production dependency tree (firebase → @firebase/firestore) | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | Inherited gRPC advisories. Web imports Firebase app/auth only; unused Firestore package is still installed. | Same gRPC upstream-pin blocker; do not accept npm suggested Firebase downgrade to 9.14.0. |
| @firebase/firestore-compat 0.4.14 → 0.4.14 | Transitive; production dependency tree (firebase → Firestore compat → Firestore) | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | Inherited gRPC advisories; compatibility Firestore API is not used. | Same gRPC upstream-pin blocker. |
| @grpc/grpc-js 1.9.16 → 1.9.16 | Transitive; production dependency tree (Firebase → Firestore → gRPC) | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | mTLS server getAuthContext with optional client certificates; server handler error disclosure. This Express app hosts no gRPC server; vulnerable copy remains installed. | Patched 1.13.6/1.14.5; Firebase Firestore pins ~1.9.0 even in 4.18.0. Requires upstream pin change or separately reviewed range override; no compatible resolution now. |
| brace-expansion 5.0.9 → 5.0.12 | Transitive; development (nodemon → minimatch → brace-expansion) | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | Attacker-controlled nested/ambiguous brace patterns cause CPU/stack exhaustion; current inputs are repository watch patterns. | Minimum 5.0.12; applied 5.0.12 within ^5.0.8. |
| braces 3.0.3 → 3.0.3 | Transitive; development (Tailwind/nodemon → glob/watch → micromatch/braces) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Deeply nested attacker-controlled glob brace patterns cause stack exhaustion; untrusted repository/build inputs remain a risk. | No patched release (latest 3.0.3). Remove/migrate affected parent chains after compatibility review; Tailwind 4 migration alone does not remove nodemon chain. |
| chokidar 3.6.0 → 3.6.0 | Transitive; development (Tailwind/nodemon → chokidar) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Inherited braces stack-exhaustion risk in glob/watch inputs. | Parents pin Chokidar ^3.x; Chokidar 4/5 migration/removal changes glob support. No range-compatible patched braces exists. |
| concurrently 9.2.4 → 9.2.5 | Direct; development (root dev concurrently) | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | Inherited shell-quote command injection requires untrusted token/comment/line-terminator input; current npm commands are fixed. | Applied first compatible parent fix 9.2.5, replacing exact shell-quote 1.9.0 with 1.12.0. |
| dompurify 2.5.9 → 2.5.9 | Transitive; production dependency tree (jsPDF optional DOMPurify) | [GHSA-vhxf-7vqr-mrjg](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg), [GHSA-h7mw-gpvr-xq4m](https://github.com/advisories/GHSA-h7mw-gpvr-xq4m), [GHSA-crv5-9vww-q3g8](https://github.com/advisories/GHSA-crv5-9vww-q3g8), [GHSA-hpcv-96wg-7vj8](https://github.com/advisories/GHSA-hpcv-96wg-7vj8), [GHSA-r47g-fvhr-h676](https://github.com/advisories/GHSA-r47g-fvhr-h676), [GHSA-rp9w-3fw7-7cwq](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq), [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882), [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9), [GHSA-x4vx-rjvf-j5p4](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4), [GHSA-76mc-f452-cxcm](https://github.com/advisories/GHSA-76mc-f452-cxcm), [GHSA-39q2-94rc-95cp](https://github.com/advisories/GHSA-39q2-94rc-95cp), [GHSA-cjmm-f4jc-qw8r](https://github.com/advisories/GHSA-cjmm-f4jc-qw8r), [GHSA-cj63-jhhr-wcxv](https://github.com/advisories/GHSA-cj63-jhhr-wcxv), [GHSA-h8r8-wccr-v5f2](https://github.com/advisories/GHSA-h8r8-wccr-v5f2), [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7), [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4), [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | Sanitization bypass/mutation-XSS under affected configurations, hooks, DOM/IN_PLACE/Trusted Types/custom elements. App does not call HTML sanitization but vulnerable code remains an optional shipped dependency. | Latest audit set requires >3.4.15 (3.4.16 minimum; current latest 3.4.17). jsPDF 2 pins ^2.5.4; migrate jsPDF to 4.2.1 then resolve DOMPurify >=3.4.16. Major changes held. |
| fast-glob 3.3.3 → 3.3.3 | Transitive; development (Tailwind → fast-glob → micromatch) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Inherited braces DoS in glob patterns; npm fixAvailable is not evidence of a compatible complete fix. | Resolve/remove braces parent chain; no patched braces currently published. Do not downgrade based only on audit fixAvailable. |
| firebase 12.19.0 → 12.19.0 | Direct; production dependency tree (root firebase) | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | Inherited Firestore/gRPC findings; tree-shaking/unused features do not make the installed vulnerable dependency safe. | Current Firebase range cannot lift its exact Firestore/gRPC constraints; upstream fix or reviewed override required. |
| gaxios 6.7.1 → 7.3.1 | Transitive; production dependency tree (firebase-admin → Cloud Storage → gaxios) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Inherited UUID buffer-overload advisory; credentials/runtime calls must retain API compatibility. | Applied compatible Cloud Storage 8.4.0 (first fixed 8.3.0), replacing the 6.7.1/UUID 9 chain with gaxios 7.3.1; common compatible dependencies deduplicated. No overrides. |
| jspdf 2.5.2 → 2.5.2 | Direct; production dependency tree (root jsPDF) | [GHSA-w532-jxjh-hjhj](https://github.com/advisories/GHSA-w532-jxjh-hjhj), [GHSA-8mvj-3j78-4qmw](https://github.com/advisories/GHSA-8mvj-3j78-4qmw), [GHSA-f8cm-6447-x5h2](https://github.com/advisories/GHSA-f8cm-6447-x5h2), [GHSA-pqxr-3g65-p328](https://github.com/advisories/GHSA-pqxr-3g65-p328), [GHSA-95fx-jjr5-f39c](https://github.com/advisories/GHSA-95fx-jjr5-f39c), [GHSA-vm32-vv63-w422](https://github.com/advisories/GHSA-vm32-vv63-w422), [GHSA-cjw8-79x6-5cj4](https://github.com/advisories/GHSA-cjw8-79x6-5cj4), [GHSA-9vjf-qc39-jprp](https://github.com/advisories/GHSA-9vjf-qc39-jprp), [GHSA-67pg-wm7f-q7fj](https://github.com/advisories/GHSA-67pg-wm7f-q7fj), [GHSA-p5xg-68wr-hm3m](https://github.com/advisories/GHSA-p5xg-68wr-hm3m), [GHSA-7x6v-j9x4-qf24](https://github.com/advisories/GHSA-7x6v-j9x4-qf24), [GHSA-wfv2-pwc8-crg5](https://github.com/advisories/GHSA-wfv2-pwc8-crg5), [GHSA-vhxf-7vqr-mrjg](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg), [GHSA-h7mw-gpvr-xq4m](https://github.com/advisories/GHSA-h7mw-gpvr-xq4m), [GHSA-crv5-9vww-q3g8](https://github.com/advisories/GHSA-crv5-9vww-q3g8), [GHSA-hpcv-96wg-7vj8](https://github.com/advisories/GHSA-hpcv-96wg-7vj8), [GHSA-r47g-fvhr-h676](https://github.com/advisories/GHSA-r47g-fvhr-h676), [GHSA-rp9w-3fw7-7cwq](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq), [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882), [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9), [GHSA-x4vx-rjvf-j5p4](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4), [GHSA-76mc-f452-cxcm](https://github.com/advisories/GHSA-76mc-f452-cxcm), [GHSA-39q2-94rc-95cp](https://github.com/advisories/GHSA-39q2-94rc-95cp), [GHSA-cjmm-f4jc-qw8r](https://github.com/advisories/GHSA-cjmm-f4jc-qw8r), [GHSA-cj63-jhhr-wcxv](https://github.com/advisories/GHSA-cj63-jhhr-wcxv), [GHSA-h8r8-wccr-v5f2](https://github.com/advisories/GHSA-h8r8-wccr-v5f2), [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7), [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4), [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | Untrusted image/data URLs, Node file paths, AcroForm/FreeText/addJS/XMP and output(new-window) options can trigger DoS, file disclosure or injection. Current app uses fixed text APIs and save(), without these features; it is still a critical installed dependency. | Minimum 4.2.1 covers all listed jsPDF advisories; 2→4 major upgrade and optional DOMPurify change require separate migration/PDF validation. Not applied. |
| micromatch 4.0.8 → 4.0.8 | Transitive; development (Tailwind/fast-glob → micromatch → braces) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Inherited braces DoS for untrusted nested patterns. | Upstream dependency removal/migration needed; no compatible patched braces release. |
| nodemon 3.1.14 → 3.1.14 | Direct; development (root dev nodemon → chokidar) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Inherited braces risk from watched glob patterns. No server production invocation (npm start uses node). | Latest nodemon 3.1.14 still pins Chokidar 3; await upstream fix or review watcher replacement. Reject audit suggested downgrade to 1.14.10. |
| postcss-nested 6.2.0 → 6.2.0 | Transitive; development (Tailwind → postcss-nested) | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Inherited selector-parser quadratic DoS when processing malicious CSS. | 6.2.0 pins parser ^6.1.1; major parent migration needed for parser >=7.1.6. Latest nested 9 requires Node 22/24/26, excluding this local Node 25; not applied. |
| postcss-selector-parser 6.1.4 → 6.1.4 | Transitive; development (Tailwind/postcss-nested → selector parser) | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Long flat malicious CSS selectors cause quadratic CPU use; untrusted build CSS can trigger it. | Minimum 7.1.6; parents pin ^6.1.x. Tailwind/postcss-nested major migration or reviewed override required. Not applied. |
| proxy-addr 2.0.7 → 2.0.8 | Transitive; production dependency tree (Express → proxy-addr) | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | Spoofed X-Forwarded-For with incorrectly configured IPv4-mapped IPv6 trust subnet; app does not configure trust proxy or IP-based authorization. | Minimum 2.0.8; applied patch within Express ~2.0.7. |
| react-router 6.30.6 → 6.30.6 | Transitive; production dependency tree (react-router-dom → react-router) | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | Backslash-containing untrusted navigation destinations allow open redirects; SSR deserializeErrors constructor injection requires attacker-influenced hydration data. Current routes are fixed and app uses BrowserRouter without SSR. | Minimum router 7.18.0; react-router-dom pins exact matching router 6.30.6. v6→v7 migration (at least 7.18.0) held; latest pair 7.18.4. |
| react-router-dom 6.30.6 → 6.30.6 | Direct; production dependency tree (root react-router-dom) | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | Inherited router navigation/SSR advisories; fixed routes are an exposure limitation, not remediation. | Major upgrade to matching router/dom >=7.18.0; not applied. |
| shell-quote 1.9.0 → 1.12.0 | Transitive; development (concurrently → shell-quote) | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | quote() after a comment token plus line terminator can inject commands. Fixed commands reduce present exposure, not dependency risk. | Minimum 1.11.0; parent 9.2.5 requires 1.12.0 exactly, now applied. |
| source-map-js 1.2.1 → 1.2.2 | Transitive; development (PostCSS → source-map-js) | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Malicious indexed source-map offsets cause event-loop DoS. Build/dev inputs, not an exposed document API. | Minimum 1.2.2; applied compatible 1.2.2. |
| tailwindcss 3.4.19 → 3.4.19 | Direct; development (root dev Tailwind) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Inherited braces/glob and selector-parser build/watch DoS; not safe merely because tooling is development-only. | Tailwind 4 changes build/plugin/CSS configuration; migration must also resolve nodemon chain. Not applied. |
| uuid 9.0.1 → removed | Transitive; production dependency tree (Cloud Storage → gaxios → uuid) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | v3/v5/v6 caller-provided buffer bounds mishandling. Reviewed gaxios call uses v4; other future consumers remain a risk. | UUID >=11.1.1 is patched, but forcing it into gaxios ^9 is unnecessary: compatible Cloud Storage 8.3.0+ removes that chain. Applied Storage 8.4.0 within Firebase Admin ^8.1.0; UUID 9 is removed. |

## Individual advisory inventory

These rows retain each exact advisory/range reported by the baseline audit; propagated packages are mapped above. Links point to advisory records. “Resolved” refers only to the updated local lockfile.

| Package | Advisory | Severity | Affected range reported | Local disposition |
| --- | --- | --- | --- | --- |
| @grpc/grpc-js | [GHSA-m9gg-hp2v-232j: @grpc/grpc-js: In certain configurations, getAuthContext can return unauthorized certificates as though they were authorized ](https://github.com/advisories/GHSA-m9gg-hp2v-232j) | high | `<1.13.6` | Still affected; see conditions/migration above |
| @grpc/grpc-js | [GHSA-f596-whhp-79r4: @grpc/grpc-js: The server transmits some error messages thrown by method handlers to the client in status messages ](https://github.com/advisories/GHSA-f596-whhp-79r4) | low | `<1.13.6` | Still affected; see conditions/migration above |
| brace-expansion | [GHSA-q2hr-2g5m-vwhr: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service ](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | `>=4.0.0 <5.0.12` | Resolved by compatible local update |
| brace-expansion | [GHSA-qhr7-859c-m2p7: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion ](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | `>=4.0.0 <5.0.11` | Resolved by compatible local update |
| brace-expansion | [GHSA-6j4f-fj2g-mc7p: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion ](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | `>=4.0.0 <5.0.10` | Resolved by compatible local update |
| braces | [GHSA-vfj7-8cjw-p6xm: braces vulnerable to stack-exhaustion denial of service through deeply nested patterns ](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | high | `<=3.0.3` | Still affected; see conditions/migration above |
| dompurify | [GHSA-vhxf-7vqr-mrjg: DOMPurify allows Cross-site Scripting (XSS) ](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg) | moderate | `<3.2.4` | Still affected; see conditions/migration above |
| dompurify | [GHSA-h7mw-gpvr-xq4m: DOMPurify: FORBID_TAGS bypassed by function-based ADD_TAGS predicate (asymmetry with FORBID_ATTR fix) ](https://github.com/advisories/GHSA-h7mw-gpvr-xq4m) | moderate | `<3.4.0` | Still affected; see conditions/migration above |
| dompurify | [GHSA-crv5-9vww-q3g8: DOMPurify has a SAFE_FOR_TEMPLATES bypass in RETURN_DOM mode ](https://github.com/advisories/GHSA-crv5-9vww-q3g8) | moderate | `>=1.0.10 <3.4.0` | Still affected; see conditions/migration above |
| dompurify | [GHSA-hpcv-96wg-7vj8: DOMPurify: Cross-realm IN_PLACE sanitization leaves executable markup intact via realm-bound `instanceof` checks ](https://github.com/advisories/GHSA-hpcv-96wg-7vj8) | moderate | `<=3.4.5` | Still affected; see conditions/migration above |
| dompurify | [GHSA-r47g-fvhr-h676: DOMPurify: IN_PLACE mode preserves attributes of a clobbered root element, allowing XSS via attacker-controlled root DOM ](https://github.com/advisories/GHSA-r47g-fvhr-h676) | moderate | `<=3.4.5` | Still affected; see conditions/migration above |
| dompurify | [GHSA-rp9w-3fw7-7cwq: DOMPurify IN_PLACE Sanitization Bypass via Attached Shadow Root Inside <template>.content ](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq) | moderate | `<=3.4.6` | Still affected; see conditions/migration above |
| dompurify | [GHSA-cmwh-pvxp-8882: DOMPurify: Permanent `ALLOWED_ATTR` pollution via `setConfig()` bypassing the hook clone-guard (incomplete fix of the 3.4.7 hook-pollution patch) ](https://github.com/advisories/GHSA-cmwh-pvxp-8882) | moderate | `<=3.4.10` | Still affected; see conditions/migration above |
| dompurify | [GHSA-vxr8-fq34-vvx9: DOMPurify: Trusted Types policy survives `clearConfig()` and can poison later `RETURN_TRUSTED_TYPE` output ](https://github.com/advisories/GHSA-vxr8-fq34-vvx9) | low | `<3.4.9` | Still affected; see conditions/migration above |
| dompurify | [GHSA-x4vx-rjvf-j5p4: DOMPurify: `IN_PLACE` mode trusts attacker-controlled `nodeName` on live non-form nodes, allowing script retention and XSS via attacker-supplied DOM objects ](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4) | low | `<=3.4.6` | Still affected; see conditions/migration above |
| dompurify | [GHSA-76mc-f452-cxcm: DOMPurify: Hook mutation of `data.allowedTags` / `data.allowedAttributes` permanently pollutes `DEFAULT_ALLOWED_TAGS` / `DEFAULT_ALLOWED_ATTR` ](https://github.com/advisories/GHSA-76mc-f452-cxcm) | moderate | `<3.4.7` | Still affected; see conditions/migration above |
| dompurify | [GHSA-39q2-94rc-95cp: DOMPurify's ADD_TAGS function form bypasses FORBID_TAGS due to short-circuit evaluation ](https://github.com/advisories/GHSA-39q2-94rc-95cp) | moderate | `<=3.3.3` | Still affected; see conditions/migration above |
| dompurify | [GHSA-cjmm-f4jc-qw8r: DOMPurify ADD_ATTR predicate skips URI validation ](https://github.com/advisories/GHSA-cjmm-f4jc-qw8r) | moderate | `<=3.3.1` | Still affected; see conditions/migration above |
| dompurify | [GHSA-cj63-jhhr-wcxv: DOMPurify USE_PROFILES prototype pollution allows event handlers ](https://github.com/advisories/GHSA-cj63-jhhr-wcxv) | moderate | `<=3.3.1` | Still affected; see conditions/migration above |
| dompurify | [GHSA-h8r8-wccr-v5f2: DOMPurify is vulnerable to mutation-XSS via Re-Contextualization  ](https://github.com/advisories/GHSA-h8r8-wccr-v5f2) | moderate | `<3.3.2` | Still affected; see conditions/migration above |
| dompurify | [GHSA-55q2-fjhq-7xh7: DOMPurify: IN_PLACE hook removal leaves a detached subtree executable, causing XSS ](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) | moderate | `<=3.4.12` | Still affected; see conditions/migration above |
| dompurify | [GHSA-c2j3-45gr-mqc4: DOMPurify: `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` for allowed custom elements. ](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) | low | `<=3.4.11` | Still affected; see conditions/migration above |
| dompurify | [GHSA-6688-9rhm-gjv2: DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes ](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | low | `<=3.4.15` | Still affected; see conditions/migration above |
| jspdf | [GHSA-w532-jxjh-hjhj: jsPDF Bypass Regular Expression Denial of Service (ReDoS) ](https://github.com/advisories/GHSA-w532-jxjh-hjhj) | high | `<3.0.1` | Still affected; see conditions/migration above |
| jspdf | [GHSA-8mvj-3j78-4qmw: jsPDF Denial of Service (DoS) ](https://github.com/advisories/GHSA-8mvj-3j78-4qmw) | high | `<=3.0.1` | Still affected; see conditions/migration above |
| jspdf | [GHSA-f8cm-6447-x5h2: jsPDF has Local File Inclusion/Path Traversal vulnerability ](https://github.com/advisories/GHSA-f8cm-6447-x5h2) | critical | `<=3.0.4` | Still affected; see conditions/migration above |
| jspdf | [GHSA-pqxr-3g65-p328: jsPDF has PDF Injection in AcroFormChoiceField that allows Arbitrary JavaScript Execution ](https://github.com/advisories/GHSA-pqxr-3g65-p328) | high | `<=4.0.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-95fx-jjr5-f39c: jsPDF Vulnerable to Denial of Service (DoS) via Unvalidated BMP Dimensions in BMPDecoder ](https://github.com/advisories/GHSA-95fx-jjr5-f39c) | high | `<=4.0.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-vm32-vv63-w422: jsPDF Vulnerable to Stored XMP Metadata Injection (Spoofing & Integrity Violation) ](https://github.com/advisories/GHSA-vm32-vv63-w422) | moderate | `<=4.0.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-cjw8-79x6-5cj4: jsPDF has Shared State Race Condition in addJS Plugin ](https://github.com/advisories/GHSA-cjw8-79x6-5cj4) | moderate | `<=4.0.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-9vjf-qc39-jprp: jsPDF has a PDF Object Injection via Unsanitized Input in addJS Method ](https://github.com/advisories/GHSA-9vjf-qc39-jprp) | high | `<4.2.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-67pg-wm7f-q7fj: jsPDF Affected by Client-Side/Server-Side Denial of Service via Malicious GIF Dimensions ](https://github.com/advisories/GHSA-67pg-wm7f-q7fj) | high | `<4.2.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-p5xg-68wr-hm3m: jsPDF has a PDF Injection in AcroForm module allows Arbitrary JavaScript Execution (RadioButton.createOption and "AS" property) ](https://github.com/advisories/GHSA-p5xg-68wr-hm3m) | high | `<4.2.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-7x6v-j9x4-qf24: jsPDF has a PDF Object Injection via FreeText color ](https://github.com/advisories/GHSA-7x6v-j9x4-qf24) | high | `<=4.2.0` | Still affected; see conditions/migration above |
| jspdf | [GHSA-wfv2-pwc8-crg5: jsPDF has HTML Injection in New Window paths ](https://github.com/advisories/GHSA-wfv2-pwc8-crg5) | critical | `<=4.2.0` | Still affected; see conditions/migration above |
| postcss-selector-parser | [GHSA-rj75-hqrm-r3gf: PostCSS: Quadratic complexity in flat selector parsing allows CPU exhaustion ](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | moderate | `<7.1.6` | Still affected; see conditions/migration above |
| proxy-addr | [GHSA-jqcg-44mw-7w3h: proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet ](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | critical | `>=1.1.0 <2.0.8` | Resolved by compatible local update |
| react-router | [GHSA-wrjc-x8rr-h8h6: React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass) ](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) | moderate | `>=6.0.0 <7.18.0` | Still affected; see conditions/migration above |
| react-router | [GHSA-337j-9hxr-rhxg: React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration ](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | moderate | `>=6.4.0 <7.18.0` | Still affected; see conditions/migration above |
| shell-quote | [GHSA-pqg4-j6r4-53mv: shell-quote: `quote()` command injection via a line terminator in a token after a `{ comment }` token ](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | critical | `>=1.8.4 <1.11.0` | Resolved by compatible local update |
| source-map-js | [GHSA-68fv-2mgg-jv7q: source-map-js allows event-loop denial of service through indexed source-map section offsets ](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | `>=1.0.0 <1.2.2` | Resolved by compatible local update |
| uuid | [GHSA-w5hq-g745-h8pq: uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided ](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate | `<11.1.1` | Resolved by compatible local update |

## Breaking or unsupported resolutions held separately

- jsPDF 2→4 plus DOMPurify 2→3: validate all PDF/download/printing behavior; target jsPDF >=4.2.1 and DOMPurify >=3.4.16.
- React Router 6→7: matched router/dom >=7.18.0, route/navigation regression and supported Node review.
- Tailwind 3→4 / watcher and PostCSS migration: review build/plugin/CSS changes, Node support and nodemon separately. Braces currently has no patched published version.
- Firebase gRPC ~1.9 pin: no compatible leaf upgrade. Obtain upstream dependency changes or separately review overrides; do not silently force out-of-range versions or accept npm downgrades. The separate gaxios/UUID finding was resolved through the compatible Cloud Storage parent update. Server Firestore/google-gax use separate gRPC 1.14.5 copies.

## Verification

77 focused onboarding/authentication/production-gate/animal/operations tests plus four rehearsal safety tests passed after the compatible lockfile updates, including all five onboarding personas. Firebase Admin app/auth/Firestore/Storage modules import without credential or network initialization. Web typecheck and build passed; existing large-bundle warning remains. The existing browser check passed all eight interaction cases, paid/unpaid print-area/PDF checks and the extended mock-backed Users-screen persona/assignment/activation/paused-controls checks. Existing live acceptance evidence is reused; dependency changes have not been deployed.


## Continuation — targeted security migration, 17 October 2026

This continuation is authoritative for the current local dependency tree. Before this continuation:
16 affected packages (1 critical, 10 high, 5 moderate). After: **14 affected packages
(0 critical, 10 high, 4 moderate)**. These are npm's propagated package counts, not counts of
independent root advisories. In particular, the ten high package entries come from two root issues.
The original baseline was 23 packages (4 critical, 12 high, 7 moderate).

### Applied change and source verification

Pinned direct jsPDF from `^2.5.1` (resolved 2.5.2) to **4.2.1**, the smallest release covering all
currently reported jsPDF advisories. Its supported optional range `dompurify:^3.3.1` resolves to
**3.4.17**, beyond the audit's required minimum 3.4.16. No DOMPurify override or new direct
DOMPurify dependency was added. [Upstream release](https://github.com/parallax/jsPDF/releases/tag/v4.2.1).

Compared with the already-modified lockfile at the start of this task, only the root jsPDF declaration
and jsPDF's dependency subtree changed: jsPDF/DOMPurify updated; fast-png 6.4.0, iobuffer 5.4.0,
pako 2.2.0 and type packages added; atob/btoa removed. Prior compatible storage/gaxios, proxy-addr,
source-map-js, brace-expansion and concurrently/shell-quote work is preserved. No audit force-fix,
blanket update, override or lifecycle installation script was used. Current lock SHA-256:
`655ee99d9385ec1cc74907a41fe6511a27d683461ec9cd01f3da5aae31099ff1`.

Graphify was queried only for the PDF source/import neighborhood. Its index is at 6fd00ea, older
than local source; it did not identify the current export implementation. Local `rg` and direct reads
establish `src/App.tsx` as the only jsPDF consumer: text/font operations and `save()`, without images,
HTML, annotations, AcroForm, embedded JavaScript, local file reads or new-window output overloads.
These usage limitations were not treated as remediation; the vulnerable versions were upgraded.

Output inspection found the built-in Helvetica font cannot encode the peso glyph: jsPDF emits the
amount line as unsupported-font Unicode text. The PDF-only formatter now uses readable `PHP`
currency labels with the same stored amounts. Browser and print currency formatting are unchanged.
The browser check now verifies paid/unpaid filenames, PDF header/trailer/page, vendor/invoice/date,
headcount, every fee, total/status, neutral historical-copy wording and absence of JavaScript/Launch
actions. jsPDF's default first-page/zoom OpenAction is allowed; an initial overly broad test rejected
that harmless navigation entry, was corrected, and the failed execution log was preserved.

### Every critical/high root advisory rechecked

Fetched GitHub advisory API records and npm registry metadata on 17 October 2026. Ranges and
first patched versions below refer to the installed release line; advisory links also retain other
release-line ranges. The earlier inventory preserves moderate/low advisory IDs, including jsPDF's
XMP/shared-state and DOMPurify findings; current audit no longer reports jsPDF or DOMPurify.

| Advisory / package | Affected installed line; first patched | Local usage / exposure condition | Current disposition |
| --- | --- | --- | --- |
| [GHSA-w532-jxjh-hjhj](https://github.com/advisories/GHSA-w532-jxjh-hjhj) / jspdf (high) | `< 3.0.1`; 3.0.1 | Untrusted image/data URLs through addImage, html or addSvgAsImage; local invoice export calls none of these. | Resolved locally by 4.2.1; covers minimum 3.0.1. |
| [GHSA-8mvj-3j78-4qmw](https://github.com/advisories/GHSA-8mvj-3j78-4qmw) / jspdf (high) | `<= 3.0.1`; 3.0.2 | Malformed PNG input through addImage/html; no image or HTML export calls in local source. | Resolved locally by 4.2.1; covers minimum 3.0.2. |
| [GHSA-f8cm-6447-x5h2](https://github.com/advisories/GHSA-f8cm-6447-x5h2) / jspdf (critical) | `<= 3.0.4`; 4.0.0 | Node-build loadFile/addImage/html/addFont with attacker-controlled local paths; local application imports jsPDF only in browser invoice export. | Resolved locally by 4.2.1; covers minimum 4.0.0. |
| [GHSA-pqxr-3g65-p328](https://github.com/advisories/GHSA-pqxr-3g65-p328) / jspdf (high) | `<= 4.0.0`; 4.1.0 | Untrusted AcroForm choices/options/appearance states can inject PDF actions; local export creates no fields. | Resolved locally by 4.2.1; covers minimum 4.1.0. |
| [GHSA-95fx-jjr5-f39c](https://github.com/advisories/GHSA-95fx-jjr5-f39c) / jspdf (high) | `<= 4.0.0`; 4.1.0 | Untrusted BMP dimensions through addImage/html can exhaust memory; neither API is used. | Resolved locally by 4.2.1; covers minimum 4.1.0. |
| [GHSA-9vjf-qc39-jprp](https://github.com/advisories/GHSA-9vjf-qc39-jprp) / jspdf (high) | `< 4.2.0`; 4.2.0 | Untrusted addJS content injects PDF objects; local export does not call addJS. | Resolved locally by 4.2.1; covers minimum 4.2.0. |
| [GHSA-67pg-wm7f-q7fj](https://github.com/advisories/GHSA-67pg-wm7f-q7fj) / jspdf (high) | `< 4.2.0`; 4.2.0 | Untrusted GIF dimensions through addImage/html can exhaust memory; neither API is used. | Resolved locally by 4.2.1; covers minimum 4.2.0. |
| [GHSA-p5xg-68wr-hm3m](https://github.com/advisories/GHSA-p5xg-68wr-hm3m) / jspdf (high) | `< 4.2.0`; 4.2.0 | Untrusted AcroForm radio appearance state injects actions; local export has no AcroForm calls. | Resolved locally by 4.2.1; covers minimum 4.2.0. |
| [GHSA-7x6v-j9x4-qf24](https://github.com/advisories/GHSA-7x6v-j9x4-qf24) / jspdf (high) | `<= 4.2.0`; 4.2.1 | Untrusted FreeText annotation color injects PDF objects; local export has no annotation calls. | Resolved locally by 4.2.1; covers minimum 4.2.1. |
| [GHSA-wfv2-pwc8-crg5](https://github.com/advisories/GHSA-wfv2-pwc8-crg5) / jspdf (critical) | `<= 4.2.0`; 4.2.1 | Untrusted options to pdfobjectnewwindow/pdfjsnewwindow/dataurlnewwindow inject browser HTML; local export uses save() only. | Resolved locally by 4.2.1; covers minimum 4.2.1. |
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) / @grpc/grpc-js (high) | `<1.13.6 or >=1.14.0 <1.14.5`; 1.13.6 / 1.14.5 | gRPC server authentication trusts getAuthContext with optional client certificates (including xDS/RBAC paths). Local app hosts Express HTTP, not a gRPC server; browser Firebase app/auth imports do not use Firestore. Vulnerable installed copy remains. | Unresolved 1.9.16 in Firebase client subtree; parent pins ~1.9.0. Separate server SDK copies are patched 1.14.5. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / braces (high) | `<= 3.0.3`; none published | Deep untrusted brace-pattern ASTs exhaust the stack. Installed via Tailwind/fast-glob/micromatch and nodemon/chokidar. Repository CSS/glob/watch inputs are the relevant exposure; dev-only placement does not make it safe. | Unresolved 3.0.3; no patched release. Parent-chain migration required. |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) / proxy-addr (critical) | `>= 1.1.0, < 2.0.8`; 2.0.8 | Misconfigured IPv4-mapped IPv6 proxy trust can accept forged X-Forwarded-For. Local Express source has no trust-proxy configuration or IP-based authorization. | Earlier compatible local fix retained: 2.0.8. |
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) / shell-quote (critical) | `>= 1.8.4, < 1.11.0`; 1.11.0 | Untrusted shell-quote strings after a comment token plus a line terminator permit command injection. Current concurrently commands are fixed npm scripts. | Earlier compatible local fix retained: 1.12.0 via concurrently 9.2.5. |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) / source-map-js (high) | `>= 1.0.0, < 1.2.2`; 1.2.2 | Malicious indexed source-map section offsets block the event loop. Exposure is build/dev map input, not an application document endpoint. | Earlier compatible local fix retained: 1.2.2. |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) / brace-expansion (high) | `>= 4.0.0, < 5.0.11`; 5.0.11 | Deeply nested brace expansion patterns exhaust the stack; local use is nodemon watch globs. | Earlier compatible local fix retained: 5.0.12. |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) / brace-expansion (high) | `>= 4.0.0, < 5.0.10`; 5.0.10 | Untrusted brace patterns exhaust stack during comma parsing/array expansion; local use is nodemon watch globs. | Earlier compatible local fix retained: 5.0.12. |

### Remaining affected packages and smallest supported paths

- **High, gRPC:** `@grpc/grpc-js` 1.9.16, propagated to `@firebase/firestore` 4.17.2,
  `@firebase/firestore-compat` 0.4.14 and `firebase` 12.19.0. The separate low-severity handler-error
  disclosure advisory GHSA-f596-whhp-79r4 is also unresolved in that leaf. Latest stable Firebase
  13.0.0 still selects Firestore 4.18.0 with `@grpc/grpc-js:~1.9.0`; it does not remediate this issue
  and also raises Firestore's Node requirement to >=24.12.0. Smallest fixed gRPC lines are
  1.13.6/1.14.5, outside the parent's supported range. No compatible parent release exists in the
  inspected stable metadata. An upstream dependency fix, reviewed modular SDK migration/removal,
  or separately validated out-of-range override is still needed; none was silently applied.
- **High, braces:** `braces` 3.0.3, propagated to `chokidar` 3.6.0, `fast-glob` 3.3.3,
  `micromatch` 4.0.8, `nodemon` 3.1.14 and `tailwindcss` 3.4.19. Registry latest braces remains
  3.0.3 and the advisory has no patched version. Latest nodemon still uses Chokidar ^3.5.2.
  Tailwind 4.3.3 is a build/plugin/CSS migration, not a compatible leaf update, and would not
  remove nodemon's separate chain. No unsupported downgrade or cross-major leaf override applied.
- **Moderate, selector parsing:** `postcss-selector-parser` 6.1.4 and `postcss-nested` 6.2.0;
  long malicious flat selectors can cause quadratic CPU use during CSS processing.
  GHSA-rj75-hqrm-r3gf requires parser >=7.1.6, outside current Tailwind/postcss-nested ^6 ranges.
  Requires a separately tested parent/build migration. Untrusted repository/CSS input remains a risk.
- **Moderate, routing:** `react-router`/`react-router-dom` 6.30.6; GHSA-wrjc-x8rr-h8h6 and
  GHSA-337j-9hxr-rhxg require matching router/dom >=7.18.0. The first needs attacker-controlled
  backslash navigation destinations; the second needs attacker-influenced SSR hydration errors.
  Current BrowserRouter uses fixed destinations without SSR. A targeted v6→v7 migration remains
  outstanding; these conditions do not make the installed vulnerable packages safe.

Remaining risk is unresolved even where reviewed source lacks a demonstrated trigger. The audit
is a dated database snapshot, not proof that no undisclosed vulnerability exists. No production
runtime, gates, service listeners, rehearsal records or Android/device state were changed by this work.

### Continuation verification and evidence

- **163 passed**: all server tests plus the five startup and four safety tests. HTTP tests used
  temporary ports and in-memory mocks; no shared emulator fixtures or production credentials used.
- **17 passed**: list/pagination and tracking UI unit tests.
- **Eight browser scenarios passed**: desktop/mobile widths, light/dark themes and enabled/paused
  motion; navigation, dialogs, input, dismissal, theme and logout. Existing mock-backed onboarding
  scenarios also passed without creating any real or emulator accounts.
- Paid and unpaid actual browser PDF downloads passed the expanded content checks described above;
  their bytes are retained as `pdf/UI-Paid.pdf` and `pdf/UI-Unpaid.pdf`. Display/print disclaimers
  passed. These synthetic text checks do not establish arbitrary Unicode font coverage, long-input
  layout, physical printing or exploit-proofness of every unused jsPDF API.
- Typecheck, server syntax checks, production bundle build and `npm ls --all` passed. Firebase Admin
  app/Auth/Firestore/Storage imports passed without initialization, credential lookup or network access.
  The existing >500kB bundle warning remains; no unrelated bundle/config migration was added.
- Post-install audit: 14 affected packages, zero critical, ten high, four moderate. No jsPDF or
  DOMPurify findings in this audit snapshot. Remaining packages/conditions are listed above.
- Working-tree preservation comparison confirmed only `package.json`, `package-lock.json`,
  `src/App.tsx`, `scripts/check-workspace-ui.mjs` and this report changed during this continuation.
  Earlier uncommitted lockfile/browser work was retained. Nothing staged, committed or pushed.

Ignored local evidence: `.rehearsal-runtime/dependency-security-20261017/`, including advisory API
records, selected registry metadata, before/after audits, pre-edit input copies, targeted lock diff,
dependency-resolution JSON, build/typecheck/syntax/unit/server logs, the initial failed browser
assertion log and corrected passing browser log, and the two synthetic PDFs. These artifacts are
not checkpoint/publication files. No service restarts, existing-listener changes, deployment,
production access or Android/device actions occurred. Browser tests used their own short-lived
mock-backed Vite listener on a dynamically selected port; it was closed when testing finished.

## Dependency checkpoint review — 17 October 2026

Review only: reused the completed 163 server/startup/safety tests, 17 UI unit tests, eight browser
scenarios, typecheck, build and resolution checks. No upgrades or product-code edits were added
during this review. Only this security report was updated, with ignored local review evidence.

### Exact proposed file/hunk scope

- `package.json`: only jsPDF `^2.5.1` → exact `4.2.1`.
- `package-lock.json`: the complete reviewed dependency-security diff, including earlier compatible
  updates listed below. Compared with HEAD there are 37 changed package entries; compared with
  the pre-jsPDF working lock there are exactly ten (root plus nine subtree entries). The root changes
  only its jsPDF dependency declaration; no other package declaration or unrelated lock entry changed.
- `src/App.tsx`: PDF-only `PHP` currency formatting in `exportPdf`; no other product changes.
- `scripts/check-workspace-ui.mjs`: only the `mkdir` import and expanded PDF download/content
  assertions plus optional `PDF_EVIDENCE_DIR` artifact saving. Exclude its earlier pending five-persona
  onboarding mocks/scenarios. Existing paid/unpaid PDF checks are already in HEAD.
- `DEPENDENCY_SECURITY_REVIEW.md`: the complete security review, including this failed visual result.

Do not include `ACCOUNT_MANAGEMENT.md`, `ALL_ROLE_DEMO.md`, `BILLING_DELIVERY_WORKFLOW.md`,
earlier pending `DEPLOYMENT_CHECKLIST.md` edits, `rehearsal/web-demo.tsx`, `server/accounts.test.js`,
`scripts/WORKSPACE_UI_CHECK.md`, skill files, deployment/index files, deleted debug log, private
evidence or temporary scripts. Nothing has been staged. Proposed message:
`fix(deps): patch jsPDF and compatible vulnerable dependencies`.

### Exact dependency changes bundled into the lockfile

| Phase | Changes |
| --- | --- |
| Current jsPDF migration | jsPDF 2.5.2 → 4.2.1; DOMPurify 2.5.9 → 3.4.17; added fast-png 6.4.0, iobuffer 5.4.0, pako 2.2.0, @types/pako 2.0.4 and @types/trusted-types 2.0.7; removed atob 2.1.2 and btoa 1.2.1. |
| Earlier compatible patches | proxy-addr 2.0.7 → 2.0.8; source-map-js 1.2.1 → 1.2.2; brace-expansion 5.0.9 → 5.0.12; concurrently 9.2.4 → 9.2.5, selecting exact shell-quote 1.12.0 instead of 1.9.0. |
| Earlier compatible parent update | Firebase Admin's existing Storage ^8.1.0 permits @google-cloud/storage 8.2.0 → 8.4.0. Its supported dependency changes replace gaxios 6.7.1 with 7.3.1 and node-fetch 2.7.0 with 3.3.2. UUID 9.0.1, is-stream 2.0.1, whatwg-url 5.0.0, tr46 0.0.3 and webidl-conversions 3.0.1 disappear with that old chain. |
| Earlier deduplication | Nested gaxios 7.3.1 and node-fetch 3.3.2 copies resolve to the same versions at the root. Storage-local gcp-metadata 6.1.1, google-auth-library 9.15.1, google-logging-utils 0.0.2 and gtoken 7.1.0 are removed; supported new parent ranges reuse existing root gcp-metadata 9.0.4, google-auth-library 11.1.0 and google-logging-utils 2.0.1. Root gtoken 8.0.0 remains unchanged for its other consumer. These are parent-declared replacements/deduplication, not forced cross-major overrides. |

Verified both complete lock-entry objects and root declarations against saved inputs; removals above
are accounted for by the reviewed parent/subtree changes. No unrelated upgrades were found.
Machine-readable entry inventory: ignored `review/lock-review.json` under this task's evidence folder.

### Remaining advisories: six unique IDs, fourteen affected packages

The saved post-upgrade audit has **six unique advisory IDs: two high, three moderate and one low**.
Its **fourteen affected-package entries: ten high and four moderate** include parent propagation;
the low gRPC issue is hidden by that package's higher aggregate severity, not resolved. No critical
advisory remains in this dated audit. Affected-package counts are not unique vulnerability counts.

Current upstream advisory records and registry parent metadata were re-read for this review. Exact
installed versions and paths (arrows mean dependencies):

- **F:** firebase 12.19.0 → @firebase/firestore 4.17.2 → @grpc/grpc-js 1.9.16.
  @firebase/firestore-compat 0.4.14 also depends on that same Firestore version. Four affected packages
  are firebase, Firestore, Firestore compat and gRPC. Server Firebase Admin uses separate patched
  gRPC 1.14.5 copies; the vulnerable client subtree remains installed.
- **B:** nodemon 3.1.14 → chokidar 3.6.0 → braces 3.0.3; Tailwind 3.4.19 → chokidar 3.6.0
  and → micromatch 4.0.8 → braces 3.0.3, also Tailwind → fast-glob 3.3.3 → micromatch 4.0.8.
  Six affected packages are nodemon, chokidar, braces, Tailwind, fast-glob and micromatch.
- **P:** Tailwind 3.4.19 → postcss-nested 6.2.0 → postcss-selector-parser 6.1.4, plus Tailwind's
  direct parser dependency. Two moderate package entries: postcss-nested and selector parser;
  Tailwind is already counted as high in B.
- **R:** react-router-dom 6.30.6 → react-router 6.30.6. Two moderate package entries.

| Exact advisory | Installed path/version | Available fix and constraint | Application exposure |
| --- | --- | --- | --- |
| [GHSA-m9gg-hp2v-232j](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), high | F; gRPC 1.9.16 | Affected <1.13.6 or >=1.14.0 <1.14.5; fixed 1.13.6 / 1.14.5. Installed and latest inspected Firestore parents pin ~1.9.0; a fixed leaf cannot satisfy that range. | getAuthContext can treat unauthorized certificates as authorized when server credentials allow optional client certificates; xDS/RBAC can also be involved. This app serves Express HTTP, not a gRPC server; browser source imports Firebase app/auth. Installed vulnerable code remains a risk if usage changes. |
| [GHSA-f596-whhp-79r4](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4), low | F; gRPC 1.9.16 | Same affected and patched release lines and parent constraint as above. | gRPC method-handler errors can disclose sensitive message text to clients. No application gRPC server is hosted, but the vulnerable copy is installed. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | B; braces 3.0.3 | Affected <=3.0.3. Advisory lists no patched release; registry latest is 3.0.3. Parent-chain removal/migration or upstream remediation remains necessary. | Deep attacker-controlled brace patterns can crash build/watch tooling. Current patterns come from repository CSS/glob/watch inputs; untrusted repository/build input remains relevant. Development-only installation is not a safety determination. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate | P; parser 6.1.4 | Affected <7.1.6; fixed 7.1.6. Tailwind pins parser ^6.1.2 and nested ^6.2.0; nested 6.2.0 pins parser ^6.1.1. A parent migration or separately validated override is needed. | Long malicious CSS selectors cause quadratic parsing work during build. Current inputs are repository CSS; processing untrusted CSS remains a risk. |
| [GHSA-wrjc-x8rr-h8h6](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6), moderate | R; router 6.30.6 | Affected >=6.0.0 <7.18.0; fixed 7.18.0. DOM wrapper pins exact matching router, requiring a matching v7 pair. | Backslash-containing attacker-controlled Link/useNavigate destinations permit external redirects. Current local navigation destinations are fixed; no safety inference follows. |
| [GHSA-337j-9hxr-rhxg](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg), moderate | R; router 6.30.6 | Affected >=6.4.0 <7.18.0; fixed 7.18.0; same matching-wrapper migration. | Constructor injection via attacker-influenced SSR hydration errors. Current app uses BrowserRouter without SSR; installed affected versions remain unresolved. |

Supporting current parent constraints and migration evidence:

- [Firestore 4.18.0 metadata](https://registry.npmjs.org/@firebase/firestore/4.18.0) still declares
  gRPC ~1.9.0; [Firebase 13.0.0 metadata](https://registry.npmjs.org/firebase/13.0.0) selects that
  version. Upgrading to that latest inspected parent would not resolve gRPC and raises Firestore's
  Node floor to 24.12.0. No claim is made that merely installing the latest SDK is remediation.
- [braces 3.0.3 metadata](https://registry.npmjs.org/braces/3.0.3), the upstream-linked advisory
  above, and [nodemon 3.1.14 metadata](https://registry.npmjs.org/nodemon/3.1.14) establish the
  missing patch and continuing Chokidar ^3.5.2 dependency. Tailwind 4 cannot remove nodemon's chain.
- [Tailwind 3.4.19 metadata](https://registry.npmjs.org/tailwindcss/3.4.19) and
  [postcss-nested 6.2.0 metadata](https://registry.npmjs.org/postcss-nested/6.2.0) establish the
  incompatible parser ranges. [Nested 7.0.2](https://registry.npmjs.org/postcss-nested/7.0.2) permits
  parser ^7.0.0, which can resolve 7.1.6, but does not satisfy Tailwind's nested ^6.2.0 or its separate
  parser ^6.1.2 pin. Latest nested 9.0.0 directly requires ^7.1.6 and Node 22/24/26+, excluding local
  Node 25. A Tailwind migration entails plugin/CSS changes documented in the
  [official v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide), not a drop-in leaf patch.
- [react-router-dom 7.18.0 metadata](https://registry.npmjs.org/react-router-dom/7.18.0) declares
  exact router 7.18.0 and Node >=20. The current ^6.28.0 root cannot resolve it; a targeted major-pair
  migration and navigation regression review are needed. This is a compatibility/test requirement,
  not a claim that every declarative route must be rewritten.

### Targeted visual PDF result — release blockers found

Downloaded three PDFs through the actual App invoice dialogs and Download PDF controls with a
temporary synthetic mock API. Rendered every produced page using macOS PDFKit and visually
inspected the page images; no implementation was substituted for `exportPdf`. Broad checks were
not repeated. The first temporary harness failed before export because its mock-module filename
matched Vite's /api proxy; the corrected harness used its own mock modules and temporary listener.

| Case | Observed result |
| --- | --- |
| 120-character business name, long address and 100 note lines, Unpaid | **FAIL for complete content.** Business name clips at the right page edge without wrapping. Total PHP 1,000.00, Unpaid status, fee lines and neutral disclaimer are readable and within the page. Address and notes are omitted entirely. Name length is within the supported-onboarding 120-character bound. |
| 85-line business name plus long address/notes, Paid | **FAIL for pagination.** Output still has exactly one page. Business lines overlap dates, fees, total and disclaimer, then clip at the bottom; total cannot be accepted as reliably readable. The business name intentionally exceeds current onboarding limits to exercise overflow; long notes also require multiple pages if exported but are simply omitted. No valid multi-page export was produced. |
| Mixed accented Latin, CJK, Arabic and emoji, Unpaid | **FAIL for Unicode.** The mixed name renders as garbled/spaced glyphs. Chinese, Arabic (including shaping) and emoji are unsupported by the built-in font/encoding path. General Unicode support is not claimed. PDF amount labels use readable PHP; that does not fix names. |

The readable cases show the correct stored Paid/Unpaid status and explicitly say historical copy,
not an official receipt; no same-day/no-advance-payment claim or fabricated confirmation was added.
The overflowing case obscures the disclaimer as well as financial content, so it fails that visual
acceptance criterion despite correct underlying strings. Source inspection confirms no address/notes
export, no `addPage` and no wrapped name layout; these are pre-existing limitations, not changes
introduced by the targeted upgrade. This review does not silently add or repair those features.

Concrete release blockers: define and implement PDF wrapping/page breaks with protected totals and
disclaimer placement; decide whether addresses/notes must match the UI and export them if required;
provide an approved embedded Unicode font/shaping solution or explicit supported-character policy;
resolve the six remaining advisory IDs or obtain a documented release risk decision with the stated
exposures. Production fee/numbering/payment policy approval and physical-device acceptance remain
separate existing blockers. A dependency-only checkpoint must not be labelled PDF release-ready.

Review evidence remains ignored under `.rehearsal-runtime/dependency-security-20261017/review/`:
current upstream records/metadata, exact lock review, affected paths, synthetic inputs, three downloaded
PDFs, UI captures, PDFKit page PNGs/text and `pdf-visual/VISUAL-RESULTS.json`. Previous evidence is
preserved. Shared services, fixtures, Android state and production gates are unchanged. No staging,
commit, push or deployment occurred.

## Local PDF layout fix — 17 October 2026

Supersedes the preceding visual review's clipping/pagination/omitted-address/notes failures for the
tested inputs. Original failed PDFs and screenshots remain preserved separately. No dependency,
onboarding, service, fixture or Android change accompanies this layout follow-through.

Exact changes:

- New `src/invoicePdf.ts`: jsPDF text wrapping with measured line heights; page breaks before body
  overflow; repeated municipality/title/invoice identification and section continuation headings;
  an intact fee/total summary; reserved disclaimer/footer area on every page with page counts.
- `src/App.tsx`: delegates PDF creation to that module, passes only the matching business already
  returned in the authorized screen data, and displays a persistent export error inside the invoice
  dialog if rendering is unavailable. No new API lookup or business/payment mutation is performed.
- Business address is labelled **current authorized record**, not an invoice-time historical snapshot.
  Missing addresses/notes are explicitly unavailable/not recorded, without fabricated values. Notes
  are included as **recorded notes, not payment verification**; they never determine payment status.
- Exported amounts and statuses come from the unchanged invoice; no fee recalculation, official
  numbering, payment-policy approval or confirmation is implied. Neutral non-official wording remains.
- New `src/invoicePdf.test.ts`: six regressions inspect actual emitted PDF text coordinates/widths,
  maximum-length names and addresses, long/wrapped/unbroken notes, multiple pages, repeated context,
  grouped fees/totals, per-page disclaimers, unchanged inputs/status, missing fields, business mismatch
  and unsupported-text rejection. Existing reporting tests continue to cover unavailable versus zero.
- New `scripts/check-invoice-pdf.mjs`: repeatable actual-App mock-backed download check for long
  names/addresses/notes, multiline overflow, supported Latin text and visible unsupported-script errors.
  Uses its own temporary listener, blocks external requests and does not use existing rehearsal services.

Font decision: retain jsPDF's existing standard Helvetica and explicitly limit export to its printable
Latin-1/WinAnsi subset plus CR/LF paragraph breaks. Verified examples include Peña, Muñoz, café,
Résumé, smart quotes, an em dash, a bullet and euro. CJK, Arabic, emoji, combining marks outside that
encoding, tabs, nonbreaking spaces, soft hyphens and other unsupported/control characters cause a
field-specific error before any file is downloaded. Text is not stripped or transliterated; stored/UI
values remain intact. This is an explicit limitation, not a licensed-font addition or universal script
support. Supporting further scripts requires a separately verified font/shaping implementation.

Verification performed after the change:

- Six PDF regressions and seven relevant existing reporting tests passed; typecheck and build passed.
  Existing large-bundle warning remains. Previously completed dependency/server/general-browser
  checks are retained as dated evidence rather than relabelled as newly executed full-suite passes.
- Focused actual-UI cases passed: long 120-character name, 300-character address and 100 note lines
  exported to **three pages**; 85-line legacy/stress name plus those notes to **five pages**; the
  supported Latin/WinAnsi example to **one page**. The 85-line name deliberately exceeds onboarding
  constraints; the 120-character name/300-character address exercise those supported bounds.
- All **nine pages** were rendered with macOS PDFKit and visually inspected: no observed clipped
  text, overlapping totals or obscured disclaimers; headings repeat and financial summaries stay intact.
  Payment labels match stored Unpaid/Paid status. The Latin example renders the named glyphs correctly.
- Unsupported CJK/Arabic/emoji in the real invoice dialog produced an explicit field/codepoint error;
  no download occurred and original text remained visible. Unit cases separately reject unsupported
  notes and addresses as well as names. No characters were silently removed to make export succeed.

Commands: `node --experimental-strip-types --test src/invoicePdf.test.ts` and
`node --test server/reporting.test.js`; browser check `node scripts/check-invoice-pdf.mjs` with the
same external `PLAYWRIGHT_MODULE` / optional `CHROMIUM_EXECUTABLE` convention as the existing
workspace check. Set `PDF_EVIDENCE_DIR` to retain generated PDFs, synthetic input, screenshot and
browser results. It defaults to an ignored local runtime folder.

Ignored evidence: `.rehearsal-runtime/pdf-layout-20261017/`, including execution logs,
`rendered/browser-results.json`, three downloaded PDFs, all PDFKit page images/text and the visible
unsupported-text alert. Original dependency/advisory evidence is unchanged. Remaining six advisory
IDs, production policies, physical-device acceptance and deployment remain open; no production
readiness claim follows from these local PDF passes. No staging, commit, push or deployment occurred.
