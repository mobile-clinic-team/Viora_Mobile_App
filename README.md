# Viora Mobile

Android-first Kotlin/Compose foundation. One app module; synthetic login, workspace selection and a four-tab navigation shell. Clinical workflows and live authentication remain unavailable.

## Build

Use JDK 17, Android SDK platform 36 and build-tools 35.0.0. Set JAVA_HOME and ANDROID_HOME for your machine, or set sdk.dir in an untracked local.properties file. Open this root directory in Android Studio and select devDebug.

~~~powershell
.\gradlew.bat :app:lintDevDebug :app:testDevDebugUnitTest :app:assembleDevDebug
.\gradlew.bat :app:connectedDevDebugAndroidTest
~~~

The second command requires an API 26 or 36 device/emulator. The application APK is generated at app/build/outputs/apk/dev/debug/app-dev-debug.apk.

## Demo

Choose **Enter demo workspace**, then Willow Clinic or Harbor Clinic. Patients supports synthetic search/detail; Schedule shows appointments and opens the doctor directory. Appointment forms support patient/doctor pickers and synthetic create/reschedule/lifecycle actions. Clinical entry shows synthetic encounter history and existing read-only records; Assistant remains a placeholder. Account supports workspace switching and logout. A persistent banner identifies synthetic data. No request leaves the demo application graph.

## Boundaries

- AppGraph creates the transport, environment gateways, session coordinator and request/operation boundaries.
- FakeBackend exists only in devDebug. Live staging/prod builds fail explicitly until their identity/environment integration is implemented.
- Access tokens stay in memory; Keystore encrypts refresh credentials and operation metadata in noBackupFilesDir.
- No clinical payload, offline database, write queue, provider SDK or analytics SDK.
- Exact dependency locks and checksum verification are included. Updates require deliberate regeneration and review.
- No repository initialization, commit, push or backend change was performed.

See [documentation](docs/README.md), [foundation evidence](docs/FOUNDATION-IMPLEMENTATION.md) , [operational integration evidence](docs/OPERATIONAL-INTEGRATION-REPORT.md) and [clinical foundation evidence](docs/CLINICAL-FOUNDATION-REPORT.md) for scope, tests and remaining work.
