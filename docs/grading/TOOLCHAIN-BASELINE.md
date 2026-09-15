# Toolchain baseline

Audit date: 2026-09-15. The checked-in build configuration is authoritative for current work. Historical reports retain the versions they actually recorded and are labeled historical below.

## Authoritative current configuration

| Component | Source of truth | Current value |
|---|---|---|
| Gradle wrapper | `gradle/wrapper/gradle-wrapper.properties` | Gradle `9.6.0` binary distribution with a pinned SHA-256 checksum |
| Settings | `settings.gradle.kts` | Root `VioraMobile`; single `:app` module; Google Maven and Maven Central; project repositories rejected |
| Android Gradle Plugin | `gradle/libs.versions.toml` | `9.4.0` |
| Kotlin | `gradle/libs.versions.toml` | `2.3.10` |
| Compose BOM | `gradle/libs.versions.toml` | `2025.12.00` |
| Android SDK | `app/build.gradle.kts` | compile/target `36`; min `26` |
| Java compatibility | `app/build.gradle.kts` | Java source/target `17`; Kotlin JVM target `17` |
| JDK observed on audit machine | `java -version`, environment | JBR/JDK `21.0.11` at `JAVA_HOME=C:\Users\LAPTOP\.jdks\jbr-21.0.11`; runtime observed, while project target remains 17 |

The project has not been downgraded or upgraded in Phase 1A. The wrapper and catalog values were read directly from the repository. The JDK observation is environment evidence, not a project pin.

## Documentation reconciliation

| Document | Older statement | Phase 1A handling |
|---|---|---|
| `docs/ARCHITECTURE.md` | Gradle `8.13`, AGP `8.13.2` | Updated the current foundation table to Gradle `9.6.0` and AGP `9.4.0`; Kotlin and JVM target remain `2.3.10` and `17`. |
| `docs/FOUNDATION-IMPLEMENTATION.md` | Historical build with Gradle `8.13`, AGP `8.13.2` | Labeled historical; retained factual execution values. |
| `docs/OPERATIONAL-INTEGRATION-REPORT.md` | Historical validation with Gradle `8.13`, AGP `8.13.2` | Labeled historical; retained factual execution values. |
| `docs/GRADLE-REPRODUCIBILITY-REPORT.md` | Historical reproducibility work with Gradle `8.13`, AGP `8.13.2` | Labeled historical and excluded from current verification claims. |
| `docs/mobile/*` | Proposed migration documents from an earlier audit | Added current-state notes where “no Android source” wording could be read as current; original proposed/history content is retained. |

No evidence supports changing the checked-in wrapper or plugin versions merely to match historical reports.

## Version risks

- AGP `9.4.0` and Gradle `9.6.0` are configured, but this environment could not complete configuration because the plugin was unavailable offline and network access was restricted.
- The project targets Java 17. Running with JDK 21 was observed here; clean CI should use Java 17 unless the owner deliberately changes the target.
- Historical reports must not be cited as current same-revision build evidence.
