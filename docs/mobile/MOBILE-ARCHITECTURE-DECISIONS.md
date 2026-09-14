# Mobile architecture decision register

Status: **ARCHITECTURE DECISION REQUIRED.** This batch recommends defaults but approves none of its new mobile decisions. Existing approved Viora rules remain reference requirements, with their original provenance in R07. Owners below are review responsibilities from the source, not assignments accepted in this task.

## ADR-M01 — Mobile framework

**Final decision: TBD. Recommended default: Native Android, Kotlin and Jetpack Compose, conditional on an Android-first launch.** Android-first is an explicit assumption for a reviewable architecture, not a repository requirement. All Android-specific structures and release steps in this set are PROPOSED.

| Criterion | Native Android / Kotlin / Compose | Flutter | React Native |
|---|---|---|---|
| Current repository | No Kotlin/native source to reuse; backend concepts and HTTP contracts transfer | No Dart/widgets to reuse; contracts transfer | TypeScript is already used in backend, but no React UI or mobile components exist to reuse |
| API integration | Typed HTTP/JSON adapter; DTOs require explicit mapping | Equivalent typed HTTP/JSON adapter | Equivalent adapter; TS domain interfaces still are not approved wire schemas |
| Authentication/storage | Direct Android lifecycle/Keystore integration; still needs approved native OIDC setup | Platform plugins/native integration must be reviewed on every target | Native secure storage/OIDC integration must be reviewed on every target; JS storage alone insufficient |
| MVP complexity | One platform/toolchain if Android-only; Kotlin/Gradle learning cost is unknown | Shared Android/iOS UI, plus Dart learning and plugin maintenance | Existing language may reduce learning, but React/native build and package expertise is unverified |
| Maintainability | Clear platform ownership and standard UI/state/data separation | Shared UI can help a confirmed two-platform team | Shared UI/TS can help a team with confirmed React Native expertise |
| Future scale | Feature packaging can grow; a later iOS client is separate work | Multi-platform reach with platform-specific QA | Multi-platform reach with native integration and dependency QA |
| Course/project constraints | No Android mandate found | No prohibition or requirement found | No React/TypeScript mobile mandate found |
| Main tradeoff | Does not fulfill an unconfirmed simultaneous iOS requirement | New language and framework without existing project assets | TypeScript familiarity must not be confused with safe reuse of server code |

Reasoning: the product is a bounded clinic workflow with sensitive sessions and no existing client implementation. A single native Android client is a simple default **if** one platform is acceptable. The repository alone cannot justify the launch-platform assumption or rank team learning costs. If Android+iOS launch is required, re-evaluate Flutter versus React Native with actual team experience and a bounded OIDC/storage/accessibility integration spike. Do not choose RN merely because the backend is TypeScript, or Android merely because Android Studio is mentioned in the request.

Official technical references checked 2026-09-08: Android describes UI/data layers and optional use cases in its [architecture recommendations](https://developer.android.com/topic/architecture/recommendations); Flutter describes views/view models/repositories/services and an optional domain layer in its [architecture guide](https://docs.flutter.dev/app-architecture/guide); React Native supports TypeScript in its [TypeScript guide](https://reactnative.dev/docs/typescript), while its [security guide](https://reactnative.dev/docs/security) says ordinary Async Storage is unencrypted and unsuitable for tokens. These support technical feasibility, not a Viora product decision.

## Decision register

| ID; decision | Status | Reason/evidence | Alternatives | Impact and closure owner |
|---|---|---|---|---|
| ADR-M01 Framework: conditional Kotlin/Compose default | TBD | No target OS, course mandate or skill evidence; comparison above | Flutter; React Native; Android+iOS separate clients | Blocks scaffold/toolchain choice. Product + Architecture + mobile implementers confirm platforms, skills, deadline and supported devices |
| ADR-M02 Staff-focused launch scope | PROPOSED | R01/R04 support operational and clinical staff; smallest workflow needs receptionist and clinician | Doctor-only pilot; broader patient/admin application | Product/Clinical/A/C confirm launch roles; no patient portal or staff administration included |
| ADR-M03 Navigation: session gate, clinic context and feature destinations | PROPOSED | Multi-membership context and clinical scope require deliberate navigation | Per-role apps; unrestricted common dashboard | NM01. Mobile/UX + A review; platform navigation library/version chosen after M01 |
| ADR-M04 State: unidirectional UI state, feature-scoped ViewModels; minimal use cases | PROPOSED | Separate rendering from I/O; coordinate session and safety-sensitive workflows | Global mutable state; a use-case class for every operation | NM02. Android default uses StateFlow/coroutines with lifecycle-aware observation; no backend domain replica |
| ADR-M05 API strategy: versioned HTTPS contract; explicit DTO mapping | PROPOSED | R04 boundary; current wire drift AUD-02 | Import TS domain objects; backend internals in client | G01 must publish schemas/examples and context transport. API owners A/B/C/D; client owns mapping only |
| ADR-M06 Retry/concurrency: reads bounded, writes explicit; no automatic clinical/AI approval replay | PROPOSED client policy; reference constraints inherited | R04/R07 idempotency and OCC rules; network uncertainty | Blind retry; optimistic clinical commit | SEC07/08. API/domain owners define retryable classes, exact TTL and outcome-recovery semantics |
| ADR-M07 Authentication: external OIDC authorization code + PKCE, app-owned normalized session | PROPOSED native adaptation | R07 CIAM/MFA/15-minute/7-day boundary plus native OAuth guidance | Embedded password/WebView flow; custom password service | G02. A/Security approve client registration, redirect, audience, scopes, exchange/refresh topology and step-up proof |
| ADR-M08 Local storage: access token in memory; rotating refresh secret in OS-protected encrypted storage; no durable PHI | PROPOSED | PHI minimization, native process death and session restoration | No restoration; encrypted offline medical cache | NM03/NM04. Security/Mobile choose reviewed storage implementation, invalidation, backup and command-key recovery policy |
| ADR-M09 Offline: connection required for protected reads/mutations; no offline write queue | PROPOSED | No offline authorization/sync contract; clinical/OCC safety | Read-only encrypted offline cache; full sync | NM04. Product/Security accept offline limitations before pilot; offline is not a guarantee of access |
| ADR-M10 AI interaction: text/structured data, contextual assistant, bounded synchronous default | PROPOSED | R04/R06; current provider uses blocking response; no streaming/status API | Async job/polling; streaming | G06. D/API decide response classification, timeout/error mapping and result recovery; no provider details in UI |
| ADR-M11 Push: defer from MVP | PROPOSED mobile scope; Notification is already Post-MVP in reference | No notification contract or required workflow | Local reminders; backend push | Avoids a new domain/permission. Any later adoption needs Product/C/Security approval, generic payloads and secure deep links |
| ADR-M12 Patient and clinical form contract | TBD | Open Patient sex/status; MRN and mandatory-contact policy; all clinical strings currently required | Publish explicit allowed sets/optionality; retain current requirements with usable workflow | G01/G08. B/Product/Clinical approve fields, validation, draft correction; no fabricated values or automatic default diagnosis |
| ADR-M13 Appointment/encounter/AMENDED lifecycle completion | TBD | G03/G04/G08; states exist without complete public transitions or association discovery | Explicit independent commands; backend-orchestrated transitions | B/C/Product/Clinical define confirmation, encounter initial state, walk-ins, completion linkage, AMENDED progression and exact NO_SHOW authority |
| ADR-M14 AI review/edit/approval/handoff completion | TBD | R07 single-author review/edit/approve with step-up; G05–G07 missing | Controlled clinical DRAFT handoff; other explicitly approved target state | D/B/A/Clinical/Security decide version binding, edit/resubmit contract, handoff atomicity/state and purge order; no automatic finalization inferred |
| ADR-M15 Privacy/accessibility/time | PROPOSED controls; numeric/localization details TBD | NM05/NM06/NM08 extend R05 protection to mobile | Broader screenshots/export; managed-device policy | Product/Security/Mobile choose screenshot/app-switcher behavior, idle lock, locales, authoritative clinic time zone and device fleet |
| ADR-M16 Release/toolchain/distribution | TBD | No mobile project, signing or channel exists | Managed internal distribution; store testing; public store | Product/Operations/Security determine application ID, OS baseline, toolchain, signing custodian, artifact retention, channel and release owners |
| ADR-M17 Repository placement | PROPOSED documentation here; implementation placement TBD | Current workspace separate/empty; R08/R23 describe a single backend monorepo with only web/api/workers apps | Separate mobile repo; approved mobile folder added later to main repo | Architecture/maintainers decide ownership and contract version exchange. This batch does not alter Nx or initialize Git |

## Already approved reference boundaries, not new mobile approvals

| Decision | Status in source | Required reuse |
|---|---|---|
| DEC-001 | APPROVED in Decision Log | Provider-neutral CIAM, 15-minute access, rotating refresh with 7-day absolute lifetime, replay-family revocation, MFA and application-side revocation |
| DEC-002/003 | APPROVED | Separate staff roles, endpoint-specific default deny; medical record intermediate state IN_REVIEW |
| DEC-004/BLOCK-009 | APPROVED | Strong ETag/If-Match and scoped idempotency; opaque cursor default 20/max 100 |
| DEC-005 and follow-ups | APPROVED | Dify/Gateway isolation, tenant-only knowledge, no autonomous sensitive writes, explicit human approval, retention and safety evaluation baseline |
| DEC-007 | APPROVED | Clinical files Post-MVP |
| BLOCK-010 | APPROVED command direction | NO_SHOW is explicit and permissioned; exact public command and permission still not specified |

Approval of source rules is not certification of implementation. Clinical retention/residency/export/deletion policy, provider evidence, quotas, SLOs, backup and recovery values remain production dependencies in R07/R23. This documentation neither reopens closed source policy by stale prose nor invents missing release values.
