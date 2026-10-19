# Owner-approved authentication and activation policy

Local implementation based on web commit `7d118982ab5594111aef29af6460815d103ee5d4`.
This records the owner's 18 October 2026 decision and supersedes the earlier unresolved
email-verification/activation policy decision in `FIRST_PRODUCTION_RELEASE.md`.
No deployment, account migration, IAM change or gate enablement is included.

## Policy compared with implementation

| Requirement | Before | Local change / retained control |
| --- | --- | --- |
| Web administrators approve businesses and every mobile membership | Business registration and staff/inspector activation were administrator-only; vendor creation immediately made its membership active. | Administrator business registration remains the ownership approval action. Every new mobile account, including vendors, is pending. Explicit administrator activation opens matching pending records; vendor activation rechecks the active same-scope business and matching assignments transactionally. |
| Mailbox ownership plus approval are required for access | Token verification checked signature/project/revocation, but did not require `email_verified`. | Every protected web/mobile/animal/operations request now requires signed `email_verified === true`, before membership or data reads. Mobile access still requires live active membership, matching role/scope claims and existing business/function checks. Web administrators still require their configured allowlist; a mobile role never grants web access. |
| Approval cannot verify a mailbox | Activation already read Auth without updating it. | Preserved and tested for vendors too. New identities explicitly start `emailVerified: false`. No existing identity is rewritten and no administrative route accepts `emailVerified` or user passwords. |
| Official user-owned recovery from web and mobile | Web already used `sendPasswordResetEmail`; Android municipal login has no supported reset/verification controls. | Web recovery retained and tested, including unknown-account-safe notice, throttling and signed-in email fallback. Web adds verification/resend and reload/forced-token refresh outside the protected workspace. Android now has the compatible local implementation at 387fbaa plus 16 tested overlays; authenticated production acceptance remains outstanding. |

Existing active/pending/inactive memberships, passwords, verification flags, custom claims,
records and audit evidence are not migrated or overwritten. There is no grandfather exemption:
existing unverified accounts, including allowlisted web administrators, will be denied protected
access by this candidate until Firebase reports a verified email in a fresh ID token. Existing
active membership status remains intact; this code neither silently approves nor revokes it.
A pending or inactive membership remains denied even after mailbox verification.

Administrators have no password-entry/read/reset-link facility. New-account provisioning retains
its existing random, undisclosed bootstrap credential solely for the user-owned Firebase setup
email flow. It is never returned in directory/API responses or logs. Users choose their own
password through Firebase. Invitation/reset requests do not administratively change verification
or approval, and no assumption is made about verification until Firebase supplies the signed claim.
Firebase's own disabled-account and recovery restrictions remain in force; recovery does not
reactivate an inactive/disabled account or bypass administrator review.

## Exact API contract shared with Android

After `verifyIdToken(token, true)` validates the credential, a missing/false/non-boolean
`email_verified` claim returns:

```http
HTTP/1.1 403 Forbidden
Cache-Control: no-store
Content-Type: application/json
```

```json
{"code":"EMAIL_VERIFICATION_REQUIRED","message":"Verify your email address before accessing this service."}
```

This applies to otherwise supported protected requests under `/api/`, `/api/mobile`,
`/api/mobile/animals` and `/api/mobile/operations`, including settings and read paths. The
terminal read-only mobile router still returns 405 for unsupported write methods; this never
permits writes or falls through to the administrator router. Static login assets and public
health readiness remain unauthenticated and carry no protected account/application data.

Missing, invalid, expired, revoked or disabled credentials retain 401 behavior. Authentication
service/permission failures retain safe 503 behavior. Verification is not a feature flag and
cannot be bypassed by the manifest, body fields, client checks, role claims or administrator approval.

Once verified, existing endpoint-specific role/scope/membership denials remain 403 and normal
capability/policy pauses remain 503. Protected profiles and data are not exposed in the verification
response. No server verification/reset endpoint and no additional runtime IAM permission is added.
The existing `/api/accounts/settings` response adds `canActivateAccounts`; the legacy
`staffInspectorAvailable` field remains for compatibility. The new UI uses the general activation
capability for vendor, staff and inspector accounts. POST `/:uid/activate` still accepts only `{}`.

Client sequence:

1. Normal Firebase sign-in may establish only a Firebase identity for verification/recovery; it
   does not grant application access. Show verification-required without opening protected screens.
2. Use Firebase `sendEmailVerification(user)`; handle throttling/failure and avoid claiming delivery.
3. After the user completes the official email action, call `reload(user)` and then
   `user.getIdToken(true)`. A reloaded local profile alone is insufficient.
4. Repeat normal server authorization with the fresh token. Verified pending/inactive/wrong-role/
   wrong-scope accounts remain denied. Preserve 401/403/503 distinctions and fail closed.
5. Recovery uses Firebase `sendPasswordResetEmail(auth, email)` outside the workspace. A successful
   SDK request or password change does not grant membership, reset roles or substitute for an
   observed verified claim. Use the same neutral notice for unknown accounts.

Android source compatibility was reviewed against HEAD
`387fbaa80f5f6a9585b2395b41b489ea34241a05` plus 16 uncommitted email-access overlays.
All three HTTP clients preserve the exact verification code/message. The shared pre-access UI uses
Firebase verification/resend, reload, forced ID-token refresh and official reset emails before
normal role/profile/scope authorization. Optional 403/503 fallbacks explicitly exclude this
verification error. These local changes supersede the earlier statement that Android implementation
was pending. The retained 113-test debug/release baseline and three variant compilations passed; after the
separately fixed pre-access cancellation edge, 114 debug and six focused release email-access tests,
release assembly and lint passed. The earlier 113 full-release result is retained, not a claimed
new 114-test full-release run. These checks do not prove real delivery, effective server IAM or
production account/role acceptance. Later rehearsal
assembly/installation evidence is separate and does not identify a signed production artifact.
No Android source, build, service or device action was performed by this backend review. Final
Android source is the 16-file manifest source-manifest-bcc1753c4194.json referenced in the checkpoint,
not the earlier validation.json hash map. The owner now reports the signed production APK verified
against that source. Signing is no longer a preparation blocker; attach the exact signed artifact
attestation before deployment. The old unsigned APK hash is not the signed artifact identity.

Official APIs: [Firebase web user management](https://firebase.google.com/docs/auth/web/manage-users),
[reload/sendEmailVerification](https://firebase.google.com/docs/reference/js/auth),
[User.getIdToken](https://firebase.google.com/docs/reference/js/auth.user).
No custom email action handler, password collection by administrators, private reset-link handoff,
provider setting change or new live verification fixture is introduced.

## Evidence and outstanding acceptance

Focused isolated tests cover all protected boundaries rejecting missing/false/truthy substitute
claims before data access, preservation of 401/503 and role/scope protections, independent vendor
approval, untouched Auth identity during activation, verification UI/request/token refresh,
recovery responses and session-race protection. Existing verified-caller mocks were updated only
in local test code; shared emulator/service fixtures were not changed.

Passing mocks/unit tests do not prove mailbox delivery, Firebase authorized-domain/provider/API-key
configuration, physical-device behavior, authenticated production role acceptance, runtime
permissions or device-update continuity. Those remain release acceptance gaps along with the unexplained inspector login incident,
authenticated verification/recovery integration, four residual dependency advisories, artifact distribution/update acceptance and the retained historical security/tracking/PDF/Unicode/Auth-hash evidence limits.
All production gates and manifest/IAM proposals remain unchanged and review-only.


## First production release checkpoint — 19 October 2026

`FIRST_PRODUCTION_ANDROID_CHECKPOINT.md` is the current focused source/configuration review.
Its approved-active/unverified/pending matrix and deployment/rollback constraints supersede older
pending implementation observations. Production Android uses one approved HTTPS API origin for
all clients; the preserved local split-port rehearsal adapters are not a production topology or
an additional release requirement. No new rehearsal work is part of this checkpoint.
