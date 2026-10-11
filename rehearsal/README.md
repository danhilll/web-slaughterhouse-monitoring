# Isolated mobile emulator rehearsal

Uses only `demo-mobile-rehearsal`: Auth `127.0.0.1:9199`, Firestore `127.0.0.1:8180`, real mobile Express router `127.0.0.1:5002`. Never start `server/index.js`, `npm run dev`, production seeding/inspection/deployment scripts or the ordinary Android debug application for this rehearsal.

The harness rejects missing emulator hosts, non-loopback hosts, conflicting project IDs and credential environment variables before Admin initialization or writes. HTTP, fetch and socket destinations are restricted to loopback. Admin uses an ephemeral synthetic key and explicit demo project/database host; no real credential discovery, tokens or keys in logs.

The launcher uses the installed **firebase-tools 15.33.0 Auth emulator** implementation directly, with a separate empty CLI config directory and single-project error mode. It does not execute the CLI entry point, login, update checks, remote discovery or downloads. This internal API is version checked and needs review before upgrades. Firestore runs the public **1.22.0** emulator jar with its own deny-all rules, never deployed rules. Emulator checks do not validate production signatures, IAM or index requirements.

Prerequisites: Node >=22, compatible Java, installed web dependencies and firebase-tools 15.33.0, Android SDK/Gradle cache. Tool downloads are a separate prerequisite using no project credentials. Public jar: https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar . SHA256: `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`.

## Exact PowerShell commands

Use clean terminals without `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_TOKEN`, `FIREBASE_CONFIG`, `FIREBASE_PRIVATE_KEY` or `FIREBASE_CLIENT_EMAIL`. Project variables must be absent or equal the demo ID. Both emulator host variables are mandatory in each harness terminal. The downloaded jar below is ignored local runtime output. No persistence/export is enabled.

Terminal 1, leave running:

```powershell
Set-Location D:\PC\Documents\GitHub\web-slaughterhouse-monitoring
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9199'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8180'
$env:FIREBASE_TOOLS_PATH='C:\Users\Acer\AppData\Roaming\npm\node_modules\firebase-tools'
$env:FIRESTORE_EMULATOR_JAR='C:\Users\Acer\AndroidStudioProjects\Capsto-Project\.rehearsal-runtime\cloud-firestore-emulator-v1.22.0.jar'
npm.cmd run rehearsal:emulators
```

Wait for Firestore startup confirmation. Terminal 2:

```powershell
Set-Location D:\PC\Documents\GitHub\web-slaughterhouse-monitoring
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9199'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8180'
npm.cmd run test:server
npm.cmd run test:rehearsal:safety
npm.cmd run rehearsal:verify
```

Verification seeds synthetic fixtures, signs into local Auth with REST, verifies real emulator tokens through Admin and calls the actual router over HTTP. Its API uses a temporary port and closes afterward. Never run verification during device testing: both reset only the dedicated demo fixture dataset. Start the standalone API after verification in Terminal 2 and leave running:

```powershell
npm.cmd run rehearsal:serve
```

Standalone `/rehearsal/health` and the synthetic schema-error control exist only in this harness, never in the production server. All `/api/mobile` mutations remain denied.

Terminal 3, Android build and device check:

```powershell
Set-Location C:\Users\Acer\AndroidStudioProjects\Capsto-Project
.\gradlew.bat :app:testDebugUnitTest :app:compileDebugKotlin :app:testRehearsalUnitTest :app:assembleRehearsal :app:assembleRehearsalAndroidTest -PrehearsalDeviceTests=true --gradle-user-home C:\Users\Acer\.gradle --offline
$env:ANDROID_USER_HOME='C:\Users\Acer\.android'
& 'C:\Users\Acer\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices -l
# Requires a running Android virtual device:
.\gradlew.bat :app:connectedRehearsalAndroidTest -PrehearsalDeviceTests=true --gradle-user-home C:\Users\Acer\.gradle --offline
```

Manual installation, targeting only the rehearsal application:

```powershell
& 'C:\Users\Acer\AppData\Local\Android\Sdk\platform-tools\adb.exe' install -r app\build\outputs\apk\rehearsal\app-rehearsal.apk
& 'C:\Users\Acer\AppData\Local\Android\Sdk\platform-tools\adb.exe' shell am start -n com.slaughterhouse.app.rehearsal/com.slaughterhouse.app.MainActivity
```

Android emulator `10.0.2.2` maps to the host loopback interface. Rehearsal fixes Auth to `10.0.2.2:9199`, Firestore to `10.0.2.2:8180` and API to `http://10.0.2.2:5002`. This targets a standard Android virtual device, not a physical phone. No LAN exposure, production origin or `adb reverse` is needed. Missing host services fail locally.

The separate debuggable build has application ID `com.slaughterhouse.app.rehearsal`, synthetic variant-specific Firebase resources, an Application that checks demo configuration before initializing Firebase/selecting both emulators, disabled analytics and no Firebase initialization provider. It ignores API origin property overrides. Production `app/google-services.json` stays unchanged. Device test code exists only in `src/androidTestRehearsal`; `-PrehearsalDeviceTests=true` selects the test build type. Ordinary debug/release builds are not rehearsal targets.

Select Vendor, then `alice@rehearsal.example.test`, `bob@rehearsal.example.test` or `empty@rehearsal.example.test`, with exact **public synthetic fixture password** `Synthetic-only-42!`. Alice has 23 invoices (20 then 3), Bob one of his own, Empty zero. The UI test covers login, canonical details/status/total, pagination, schema error versus empty, recovery, logout and Alice -> Bob -> Empty switching.

On 2026-10-11 the API's **14 emulator checks passed**. A subsequent Android run passed **both instrumentation tests**, including the complete login/details/pagination/error/recovery/logout/Alice -> Bob -> Empty flow on Android 17/API 37 (`emulator-5554`, `sdk_gphone16k_x86_64`). The first offline attempt needed uncached test-runner dependencies; acquire them once by omitting `--offline`, then rerun offline. Espresso was updated to test-only 3.7.0 for the API 37 input manager change, the legacy package assertion now uses the build's application ID, and login waits for screen/keyboard stability before clicking Sign In.

The original Pixel_10_Pro AVD could not boot on C: because its userdata required about 12 GB and only 3.2 GB was free. A separate `Mobile_Rehearsal` AVD was created from the installed image/configuration under this web repository's ignored `.rehearsal-runtime/avd` on D:, preserving the original configuration and avoiding any existing account-data copy. Reboot this existing machine-local rehearsal AVD with:

```powershell
$env:ANDROID_AVD_HOME='D:\PC\Documents\GitHub\web-slaughterhouse-monitoring\.rehearsal-runtime\avd'
$env:ANDROID_USER_HOME='C:\Users\Acer\.android'
& 'C:\Users\Acer\AppData\Local\Android\Sdk\emulator\emulator.exe' -avd Mobile_Rehearsal -no-window -no-snapshot -no-boot-anim -no-audio
# In the Android test terminal, after ADB lists device and boot_completed is 1:
$env:ANDROID_SERIAL='emulator-5554'
.\gradlew.bat :app:connectedRehearsalAndroidTest -PrehearsalDeviceTests=true --gradle-user-home C:\Users\Acer\.gradle --offline
```

The AVD is local generated state, not a committed device definition. Test artifacts are in Android `app/build/reports/androidTests/connected/rehearsal/index.html` and `app/build/outputs/androidTest-results/connected/rehearsal`. Stop API/launcher with Ctrl+C after testing. Stop the owned rehearsal device using `adb -s emulator-5554 emu kill` after confirming its AVD name is `Mobile_Rehearsal`; do not stop another user's device. Production Firebase configuration and live data were unchanged.

Keep jar/runtime directories, logs, APKs, build output, `.env`, service accounts and `local.properties` out of commits. Source/test/report changes are prepared separately in both repositories; no commit, push, provisioning, deployment or billing enablement is part of these commands.
