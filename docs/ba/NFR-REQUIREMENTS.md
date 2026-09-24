# Non-functional requirements

These requirements describe both the current client baseline and the target final-course service path. The current app has synthetic/local evidence; the target requires server-backed authentication, persistence, authorization, AI governance, and staging evidence.

| ID | Area | Requirement | Measurable acceptance criteria | Current evidence/status |
|---|---|---|---|---|
| NFR-001 | Security | Protected actions fail closed when identity, role, workspace, permission, relationship, policy, or version is missing. | Negative tests show no protected success and no unauthorized dispatch for each missing boundary. | PARTIAL; JVM tests and client gates exist, server absent. |
| NFR-002 | Privacy | Development and grading use synthetic data only and local sensitive state is minimized. | Repository, test, screenshot, and demo review finds no real PHI; logout/timeout clears protected in-memory state. | PARTIAL; synthetic baseline and privacy tests exist. |
| NFR-003 | Authentication | Production credentials and provider secrets never enter the APK or source. | Secret scan and release inspection show no credentials; production uses environment-owned configuration and a real authentication flow. | PLANNED; live auth absent. |
| NFR-004 | Performance | Common lookup interactions feel responsive on a supported phone and avoid unnecessary requests. | Patient search waits 300ms before dispatch; paging is bounded; a later query cannot be replaced by an older response. | PARTIAL; state tests cover debounce/cancellation. |
| NFR-005 | Availability | Protected work reports connectivity and service unavailability honestly. | Offline/5xx/timeout states offer retry or outcome recovery; no unavailable response is shown as empty or success. | PARTIAL; client states exist, live service absent. |
| NFR-006 | Usability | Task-critical controls are readable and touchable. | Interactive targets are at least 48dp; status is communicated without color alone; forms explain unsaved/uncertain work. | PARTIAL; source intent exists, device review pending. |
| NFR-007 | Accessibility | Core flows work with large text, TalkBack, keyboard focus, contrast, and orientation changes. | Test matrix covers 200% text, screen reader labels, focus/error announcements, contrast, and at least one supported device. | NOT VERIFIED; no device run. |
| NFR-008 | Maintainability | Feature UI depends on repositories and session ports rather than direct database/provider access. | Static review shows no Android database credentials or provider calls; unit tests can use FakeBackend/repository doubles. | PARTIAL; architecture and synthetic tests exist. |
| NFR-009 | Reliability | Rotation, process death, expiry, logout, delayed responses, and unknown outcomes do not corrupt scope. | Lifecycle/epoch tests pass and no late response publishes into a new workspace. | PARTIAL; JVM suite passes, device/process evidence pending. |
| NFR-010 | Auditability | Sensitive writes, denials, AI generation, approval, and handoff produce server-owned audit evidence. | Future API integration tests prove durable audit before sensitive success and no PHI in audit metadata. | NOT STARTED; contract documented only. |
| NFR-011 | Concurrency | Mutations use strong current versions and idempotency to prevent lost updates or duplicate clinical actions. | Stale ETag returns 412; duplicate operation key returns one receipt; uncertain response is reconciled. | PARTIAL; client/fixture tests exist, backend absent. |
| NFR-012 | Network/data boundary | Android communicates with services through an API boundary and never directly with PostgreSQL. | Architecture review finds no database driver/credential in Android; service calls use declared HTTPS API contracts. | PARTIAL; client boundary exists, deployed API absent. |
| NFR-013 | Compatibility and delivery | The declared toolchain remains reproducible for the supported dev variant and the selected service path has reviewable staging/deployment evidence where feasible. | Wrapper Gradle 9.6.0, AGP 9.4.0, Kotlin 2.3.10, SDK 36, and Java target 17 execute the documented checks; staging deployment, configuration, and rollback evidence are recorded for the real API path. | PARTIAL; local evidence green, hosted CI and live service pending. |

## Final-course target interpretation

- NFR-001, NFR-003, NFR-005, NFR-010, NFR-011, and NFR-012 require real server/API evidence before they can be treated as complete.
- NFR-002, NFR-006, NFR-007, NFR-008, NFR-009, and NFR-013 retain current Android baseline evidence but need live-path, device, accessibility, or deployment evidence as applicable.
- No NFR is being marked `IMPLEMENTED` merely because its contract or client-side test exists.

## Survey support

| NFR | Survey evidence | Implication |
|---|---|---|
| NFR-001, NFR-003, NFR-012 | Q18: 60/61 (98.4%) rated role/permission access 4 or 5 | Authentication, server-side authorization, and the API boundary should remain final-MVP gates. |
| NFR-005, NFR-009 | Q14: 57/61 (93.4%) preferred some retry mechanism | Failures, retries, timeouts, and uncertain outcomes need explicit recovery behavior. |
| NFR-006, NFR-007 | Q11: error guidance/handling 13/61 (21.3%); Q14 retry preference 57/61 (93.4%) | Usability and accessibility work should make recovery understandable and actionable. |
| NFR-010, NFR-011 | Q15: 53/61 (86.9%) rated AI usefulness 4 or 5; Q17 context concern 28/61 (45.9%) and incorrect-information concern 27/61 (44.3%) | AI provenance, evaluation, human review, versioning, and safe handoff are required. |
| NFR-002, NFR-004, NFR-008, NFR-013 | No direct quantitative support beyond the survey method and product scope | These remain architecture, privacy, delivery, or baseline requirements; no survey claim is added. |
