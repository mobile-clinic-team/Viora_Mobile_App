# Dependency verification review

Audit date: 2026-09-16  
Branch: `chore/android-baseline-stabilization`  
Working tree: preserved and dirty; metadata was not staged or committed.

## Result

**OWNER REVIEW REQUIRED**

The current metadata allows the recovered Gradle 9.6.0 / AGP 9.4.0 build to verify resolved artifacts. It must not be committed blindly because the working-tree diff contains approximately 1,232 added lines and 581 removed lines, including 131 added and 59 removed component entries.

## Before versus current

The HEAD version already had dependency verification enabled with:

```xml
<verify-metadata>true</verify-metadata>
<verify-signatures>false</verify-signatures>
```

The current file keeps that policy. The recovery process first encountered missing verification entries for the Guava parent POM and JUnit BOM modules. Legitimate Gradle resolution then wrote additional hashes for the current dependency graph. The diff includes current AGP 9.4.0, Gradle 9.6.0, Android tooling, Kotlin, AndroidX, Guava, JUnit, and transitive entries. Older 9.3.2/8.13.2-era entries also appear in the rewrite and some component entries are removed or reordered.

`git diff --ignore-space-at-eol` remained 1,232 added and 581 removed lines, so this is not only a line-ending or whitespace change.

## Classification

| Change observed | Classification | Evidence and decision |
|---|---|---|
| Hashes for Guava parent and JUnit BOM artifacts that blocked legitimate configuration | A — required checksum | Identified by the actual Gradle dependency-verification failure during recovery; retained for owner review. |
| AGP 9.4.0, Gradle 9.6.0, and current Android tooling artifacts | A — required checksum | Consistent with the authoritative wrapper/catalog and successful local test/lint/assembly tasks. |
| AndroidX/Kotlin/JUnit/transitive module entries resolved during current Gradle execution | A — likely required checksum | Supported by successful dependency resolution, but exact graph membership should be confirmed by the owner before commit. |
| Reordered component blocks and rewritten artifact lists | B — formatting/order or writer rewrite | Gradle verification metadata generation changed placement and representation; not independently hand-normalized. |
| Removed older entries, including some 9.3.2/8.13.2-era artifacts | C — possibly stale component removal | Plausible result of the writer using the current graph, but not safely distinguishable from intentional historical retention using this dirty baseline alone. |
| Dependency version change | D — not established | No version change was made in Phase 1C; current declared versions remain authoritative. |
| Repository-related change | E — not established | `settings.gradle.kts` repositories remain `google()` and `mavenCentral()`; no repository was added. |
| Unexpected/unjustified change | F — unresolved owner-review question | The size and mixed historical entries prevent a complete minimality claim. Do not commit until reviewed. |

## Policy checks

The current XML contains no `trusted-key`, `trusted-artifact`, `ignored-artifact`, or `ignored-key` entries. Verification remains enabled through `verify-metadata=true`. No wildcard trust, ignored artifact, disabled verification mode, dependency version change, or repository change was found.

No SHA-256 values were invented manually in this phase. The existing values have Gradle-generated or download-verification origins; their artifact-to-cache provenance should be reviewed before committing.

## Recommended commit decision

Keep `gradle/verification-metadata.xml` out of the baseline commits. Create a separate metadata commit only after an owner confirms the current dependency graph, removes only demonstrably stale entries if desired, and reruns the full verification commands from a clean checkout. Do not replace the file with a guessed minimal subset and do not weaken verification to avoid the review.
