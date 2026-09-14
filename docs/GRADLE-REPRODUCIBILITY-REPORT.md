# Member A — Gradle Reproducibility Report

Completed: 2026-09-12. Scope: restore verified devDebug dependency resolution; no feature work.

## 1. Root Cause

**Classification: VERIFICATION — project-owned incomplete checksum metadata.**

The initial `:app:assembleDevDebug --stacktrace` succeeded with 39 tasks up to date. Refreshing dependency resolution then failed in root `classpath` verification for three artifacts from Maven Central (`MavenRepo`). An isolated, initially empty Gradle user home reproduced exactly those three failures. Its downloaded artifacts matched independent HTTPS downloads, ruling out a corrupt local artifact as the explanation for these failures.

After those entries were repaired, the connected-device task exposed one further missing entry in `:app:_internal-unified-test-platform-core`. Every report stated **“Checksums are missing from verification metadata”**. None reported a checksum mismatch or signature failure.

| Missing artifact | Existing dependency path |
| --- | --- |
| `com.google.guava:guava-parent:33.3.1-jre` / `guava-parent-33.3.1-jre.pom` | AGP 8.13.2 → Android tools common/sdk-common 31.13.2 → Guava 33.3.1-jre → parent POM |
| `org.jetbrains.kotlinx:kotlinx-coroutines-bom:1.8.0` / `kotlinx-coroutines-bom-1.8.0.pom` | Kotlin plugin/compiler-runner 2.3.10 → coroutines-core-jvm 1.8.0 → imported BOM |
| `org.junit:junit-bom:5.10.2` / `junit-bom-5.10.2.module` | AGP 8.13.2 → commons-io 2.16.1 → commons-parent 69 → imported BOM |
| `org.junit:junit-bom:5.9.2` / `junit-bom-5.9.2.module` | UTP core 0.0.9-alpha03 → gRPC 1.57.2 → animal-sniffer 1.23 → mojo-parent 74 → imported BOM |

These metadata dependencies already belonged to the pinned build/test toolchain. No new application dependency was introduced. The successful forced rebuild demonstrates compatibility of the existing Gradle 8.13, AGP 8.13.2, Kotlin 2.3.10, JBR 21.0.11, JVM target 17 and compile SDK 36 for this variant.

The earlier offline plugin-resolution failure is historical cache-resolution evidence. This batch does not claim to reconstruct the exact state of that earlier cache. The verification defect was independently reproduced with refreshed and empty caches.

## 2. Files Changed

Maintained project files:

- [gradle/verification-metadata.xml](/C:/Users/LAPTOP/Viora-Mobile-App/gradle/verification-metadata.xml): four SHA-256 artifact entries added.
- [docs/GRADLE-REPRODUCIBILITY-REPORT.md](/C:/Users/LAPTOP/Viora-Mobile-App/docs/GRADLE-REPRODUCIBILITY-REPORT.md): this build-validation report added.

Generated diagnostic evidence is inventoried in [gradle-repro-evidence-files.txt](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-evidence-files.txt). Gradle also generated its normal reports, outputs and caches, including the isolated `.tools/gradle-repro-fresh-home`. No existing cache was deleted. No other maintained configuration, lockfile, source, test or product document was edited.

## 3. Fix Applied

Added only the four missing checksums after checking their existing dependency paths and published artifacts. Existing checksum entries were preserved. No versions, repositories, wrapper settings, build properties, dependency locks, production guards or application behavior changed.

The first three additions repaired fresh build resolution. The fourth repaired Android test-platform resolution. No further change was required.

## 4. Dependency Verification

Verification remains enabled in its existing strict mode. Metadata verification remains `true`; signature verification remains `false`, as before. No trusted-artifact exclusions or bypass flags were added. The wrapper distribution checksum remains unchanged.

Exact SHA-256 additions:

```text
guava-parent-33.3.1-jre.pom
55441db27e8869dfefe053059bdf478bdc7e95585642bf391f0023345fd56287

kotlinx-coroutines-bom-1.8.0.pom
1239e9dbe1397cd5971342956b2511bc3ace7b641842e4372a088dcfa8b9ad55

junit-bom-5.10.2.module
de23b114b3e4119a8fe6eb17bed5a3852816698bace67071579d6d927ebb080a

junit-bom-5.9.2.module
ab137ba5a8e32c9b066bf9126a1c76dd5614b724ba5c0b02549772b5e9f4cf1f
```

Both JUnit artifacts and the coroutines BOM matched Maven Central's published SHA-256 sidecars and cached bytes. Guava's SHA-256 sidecar returned HTTP 404; its bytes matched independent HTTPS downloads from both Maven Central hosts and its published SHA-1. The verification entry uses the computed SHA-256, not SHA-1. These checks establish repository provenance; no new publisher-signature verification is claimed.

Exact source URLs and dependency paths: [provenance record](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-provenance.txt).

## 5. New Validation

All results below were produced in this Member A batch. The final continuation ran only the remaining connected-device validation; the other completed results were preserved.

| Validation | New result |
| --- | --- |
| Initial cached `:app:assembleDevDebug --stacktrace` | PASS, 13s, 39 tasks up to date; insufficient alone to prove fresh resolution |
| Pre-fix refreshed assemble / isolated-cache `help` | Both failed on the same three missing root-classpath checksums |
| Isolated-cache `:app:assembleDevDebug --rerun-tasks --info --stacktrace` | **PASS, 3m 7s, all 39 actionable tasks executed** |
| Final-metadata `:app:assembleDevDebug --offline` | PASS, 2s, 39 tasks up to date; completed before the final continuation |
| `:app:lintDevDebug` | **PASS, 0 errors, 31 warnings**, 1m 32s |
| Already-running final-metadata offline lint | PASS, 38s, 0 errors, 31 warnings; completed before API 36 execution |
| JVM tests | Not rerun; checksum-only change did not require repeating the suite |
| API 26 Android tests | Not rerun; no API 26-specific change or failure justified a repeat |
| First Gradle-connected API 36 attempt | Failed before device tests: missing `junit-bom-5.9.2.module` checksum; fixed as documented above |
| Final `:app:connectedDevDebugAndroidTest` | **PASS, API 36 / Android 16, 17/17 tests, 0 failures, 0 skipped; BUILD SUCCESSFUL in 1m 58s** |

Lint warnings comprise 11 existing `ComposableNaming`, 2 `AndroidGradlePluginVersion`, 10 `GradleDependency`, and 8 `NewerVersionAvailable` notices. The historical lint checkpoint had 20 warnings; refreshed online dependency-version notices account for the additional 11. Warnings were not repaired in this batch.

Final connected command, using the isolated dependency cache and the existing pinned wrapper distribution:

```powershell
$env:GRADLE_USER_HOME='C:\Users\LAPTOP\.gradle'
$env:ANDROID_SERIAL='emulator-5556'
.\gradlew.bat -g .tools/gradle-repro-fresh-home :app:connectedDevDebugAndroidTest --stacktrace
```

Gradle completed 71 actionable tasks: the connected test task executed, and 70 prerequisite tasks were up to date against the validated build outputs. The devDebug app APK had been newly rebuilt with all assembly tasks forced to execute. The unchanged instrumentation APK was validated as up to date by Gradle; it was not presented as a newly recompiled test binary.

Artifacts used by the successful run:

```text
app-dev-debug.apk SHA256
31ae73dd9546fc83dc85dc60f9b56dd755106b1cabd3c885e031ef1978abf334

app-dev-debug-androidTest.apk SHA256
234246d845278df2e72f8ec79af3d3ff49012ca8cc5dad8a39840c3d84145108
```

Evidence:

- [Forced fresh-cache build log](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-fresh-assemble.log)
- [Lint results](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-lint-results.xml)
- [Final Gradle-connected API 36 log](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-api36-connected-final.log)
- [API 36 Gradle XML results](</C:/Users/LAPTOP/Viora-Mobile-App/app/build/outputs/androidTest-results/connected/debug/flavors/dev/TEST-VioraFoundation36(AVD) - 16-_app-dev.xml>)
- [Final APK hash record](/C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/gradle-repro-apk-final.json)

No additional validation was run after API 36 passed.

## 6. Historical Evidence

Preserved, not relabeled as new test executions:

- Previous JVM: **95/95 PASS**.
- Previous API 26: **17/17 PASS**.
- Previous API 36: **17/17 PASS**, direct AndroidJUnitRunner against the earlier verified APK.

The earlier app APK SHA-256 was `b7db2f02ae00258de528b905472b5d90591aadaa52e081390cbfbb702724f0d6`. It differs from this batch's rebuilt app. Historical device passes alone were not used to certify the new APK; the new Gradle-connected API 36 run provides that evidence.

## 7. Environment Limitations

No remaining network, sandbox or emulator blocker was observed in the successful build, lint and connected API 36 validation. Official Google Maven and Maven Central repositories resolved without replacements or TLS bypasses.

Fresh dependency resolution was exercised using an initially empty Gradle dependency cache. The installed pinned Gradle distribution, JDK, Android SDK and running API 36 emulator were reused. This is not a claim of bare-machine SDK provisioning or bit-for-bit reproducible APK output. Other variants and production readiness were not validated.

## 8. Regression Assessment

No functional behavior outside build verification changed. All 17 API 36 tests passed against the newly rebuilt app. No regression was detected within this validation scope. No Git initialization, branch, commit, push or PR operation was performed.

## 9. Clinical / AI Impact

Clinical, AI, Patients, Doctors, Appointments, Scheduling, session/security and navigation code were not modified. Clinical mutations remain outside this batch; AI remains unimplemented.

## 10. Senior Engineering Verdict

**GRADLE REPRODUCIBILITY RESTORED** for the validated devDebug build, lint and API 36 Gradle-connected test path, with dependency verification intact.

VERDICT: GRADLE REPRODUCIBILITY RESTORED
NEXT BATCH: Member A — enforce verified devDebug builds in CI with an empty dependency cache.
