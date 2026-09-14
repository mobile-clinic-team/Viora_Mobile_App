# Current and proposed mobile project structure

Status: **PROPOSED only; no source, Gradle or Android Studio files created.** Framework/placement are ADR-M01/ADR-M17 in [the decision register](MOBILE-ARCHITECTURE-DECISIONS.md).

## CURRENTLY EXISTS

```text
C:/Users/LAPTOP/Viora-Mobile-App/
  docs/mobile/                    This documentation set only

C:/Users/LAPTOP/Viora/             Separate source-of-reference repository
  apps/api/src/                   Identity, tenant, patient handler functions
  apps/web/project.json           Web metadata scaffold only
  apps/workers/project.json       Worker metadata scaffold only
  libs/{identity,tenant,patient,doctor,appointment,clinical}/
  libs/ai/{contracts,gateway,tools,provider,data-access}/
  libs/audit/
  libs/platform/
  libs/shared/
  libs/web/api-client/project.json Metadata only; no generated client
  database/migrations/            Backend schema, never mobile source
  docs/                          Preserved reference architecture
  package.json, nx.json           Backend toolchain, unchanged
```

No Android manifest, Kotlin source, Compose UI, Gradle wrapper, Flutter project, React Native project, mobile dependency manifest, mobile CI, executable API schema or local mobile database exists in the output workspace. It is not initialized as a Git repository.

## PROPOSED — conditional native Android project

The following is a design tree, not a list of files created. Final root placement, namespace/application ID, SDK levels and versions require decisions. `approved_namespace` is an illustrative placeholder, not a selected package name.

```text
<approved-mobile-root>/
  docs/mobile/
  settings.gradle.kts             Future Gradle settings
  build.gradle.kts                Future root build conventions
  gradle.properties              Non-secret build settings only
  gradle/libs.versions.toml        Reviewed/pinned compatible toolchain
  gradle/wrapper/                  Future verified Gradle wrapper
  gradlew, gradlew.bat             Future wrapper launchers
  app/
    build.gradle.kts              One application module initially
    src/main/
      AndroidManifest.xml         Network/native callback/privacy config
      kotlin/<approved_namespace>/
        app/                      Composition root and navigation
        core/
          session/                Session/tenant coordination
          network/                HTTP/errors/headers/serialization
          security/               Secure credentials and privacy adapters
          model/                  Shared client primitives only
          ui/                     Small accessible shared controls
        feature/
          auth/
          clinic/
          patient/
          doctor/
          appointment/
          clinical/
          assistant/
          account/
      res/                        Localized text, system config, approved assets
    src/test/                     Local unit/state/API contract tests
    src/androidTest/              Device UI/navigation/lifecycle tests
  <future-ci-location>/            Only after release/ownership decision
```

Each feature may contain `ui/`, `state/` and `data/` packages as needed, plus a workflow coordinator only when it coordinates several API calls safely. Do not generate empty parallel layers for every endpoint. Clinical and AI have distinct models/states; shared UI does not erase their approval boundaries.

HTTP DTOs belong next to their client API adapters or in a generated client package after G01 supplies an approved schema. They do not live under backend `libs/*`, copy migrations, or expose server factory inputs. Store ETags with the resource representation and idempotency keys with the specific user intent, under current session/tenant scope.

## Build and IDE responsibilities

The future Android project opens from its approved Gradle root in Android Studio. Choose compatible Android Gradle Plugin/Gradle/JDK/Kotlin/Compose and SDK versions at implementation time; document them in versioned build configuration. Local SDK paths and signing credentials stay outside tracked configuration. No install, project creation, dependency download, Git initialization or CI change is authorized by this documentation task.

If Flutter is selected, replace the proposed tree with Dart feature packages, platform shells and Flutter tests. If React Native is selected, replace it with typed client/features, reviewed native integrations and Android/iOS builds. In both cases preserve the same API/session/security boundaries, explicitly revise this proposed structure, and do not treat existing TypeScript backend packages as a mobile runtime dependency.
