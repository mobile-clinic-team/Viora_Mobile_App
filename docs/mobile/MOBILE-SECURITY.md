# Mobile security

Status: **REFERENCE REQUIREMENTS plus explicitly PROPOSED mobile additions**. This is an engineering specification, not compliance certification or new medical/legal policy. R05/R06/R07 remain authoritative for existing security. See [authentication](MOBILE-AUTH-SESSION.md) and [API integration](MOBILE-API-INTEGRATION.md) for missing implementations.

## Security requirements

| ID | Origin | Requirement and enforcement | Verification |
|---|---|---|---|
| SEC01 Authentication/assurance | REFERENCE REQUIREMENT; native flow NM02 PROPOSED | Backend validates issuer/subject, session, expiry, revocation and required MFA. Mobile uses approved external native OIDC flow and cannot invent actor or assurance claims | MT01/MT02/MT09; BT01 |
| SEC02 Credential storage | NEW MOBILE REQUIREMENT NM03, PROPOSED | Runtime refresh credentials only in OS-protected encrypted private storage; memory access token default. No static service/provider/client/signing secret embedded in app. No tokens in logs, routes, ordinary preferences, analytics, clipboard or backups | MT02/MT11/MT12/MT13 |
| SEC03 Transport | TLS is REFERENCE REQUIREMENT; client configuration PROPOSED | HTTPS with platform certificate/hostname validation; no trust-all fallback or release cleartext. Fixed approved API/issuer configuration. Never forward authorization to arbitrary redirected hosts. Pinning/rotation strategy, if needed, remains a decision | MT03/MT13 |
| SEC04 Tenant/session isolation | REFERENCE REQUIREMENT; client generation/reset NM02 | Backend verifies active membership and every reference's tenant. Client binds state to actor/tenant/resource and rejects late responses after switching. Clear prior clinic forms, caches, cursors, AI context and navigation | MT04/MT05; BT01/BT02 |
| SEC05 Roles/resources | REFERENCE REQUIREMENT | Endpoint-specific least privilege; resource relationship/location/clinical need-to-know. UI affordances are not enforcement. Unknown role/permission disables affected action; no administrator override assumed | MT05/MT07/MT09; BT01/BT02 |
| SEC06 PHI minimization | REFERENCE REQUIREMENT; local/offline NM03/04 | Display/send only permitted needed fields. No durable medical cache, raw prompt archive, full-state persistence, unrestricted export or screenshot analytics in proposed MVP. Missing data is not a negative clinical fact | MT04/MT07/MT08/MT11 |
| SEC07 Clinical integrity/OCC | REFERENCE REQUIREMENT | Keep exact reviewed ETag, use If-Match; stale clinical/AI approval requires refetch and new human confirmation. Finalized history remains immutable; no client rewrite or approval-by-navigation | MT06/MT07/MT09; BT03/BT04 |
| SEC08 Idempotency/unknown outcomes | REFERENCE REQUIREMENT; mobile recovery NM04 | Opaque PHI-free intent key; same payload/scope only. No general write retry queue. Do not declare success/failure of an ambiguous write without evidence; no auto-new-key duplicate | MT06/MT09/MT10; BT03/BT04 |
| SEC09 Audit/logging | REFERENCE REQUIREMENT | Backend owns immutable metadata-first audit with actor/tenant/action/resource/result/request ID. Mobile telemetry never substitutes for audit and excludes PHI, tokens, clinical text, search terms and prompts/responses | MT11; BT05 |
| SEC10 AI isolation/safety | REFERENCE REQUIREMENT | Only Viora API; no direct Dify/LLM/embedding calls or credentials. Backend context authorization, output validation, tenant-only knowledge, HUMAN review/approval, step-up and fail-closed behavior | MT08/MT09; BT04/BT06 |
| SEC11 Screen/lifecycle/device privacy | NEW MOBILE REQUIREMENT NM06, PROPOSED | Cover app-switcher snapshots immediately on background; apply approved screenshot/capture restrictions to PHI screens. No PHI in saved state/recents labels. Device compromise policy and idle lock thresholds are TBD | MT11/MT12/MT13 |
| SEC12 Build/distribution | NEW MOBILE REQUIREMENT NM07, PROPOSED | Environment separation; non-debuggable release; signing material only in controlled signing service/CI; secret scan final artifact; reviewed OS/dependency versions | MT13; release evidence |

## Sensitive information rules

Patient demographics, contact data and appointment details are sensitive. Clinical history, allergies, diagnoses, clinical notes and AI clinical drafts are highly sensitive. Use server-minimized payloads and purpose-limited screen data. A clinical screen must not render an unauthorized field because a debug or legacy response includes it. The final public response policy/presenter is G01/G09.

No logs of bearer headers, callback codes, refresh credentials, patient search queries, full request URLs containing search terms, request/response bodies, form state, clinical notes, prompts, draft content or provider messages. Safe diagnostic data is a bounded error category, duration, app version and server request ID; actor/tenant/resource identifiers require policy justification. Crash and analytics SDKs are unselected; any future SDK must have redaction/collection controls verified before PHI use. Use synthetic fixtures in tests and screenshots.

No automatic clipboard copy/share/export of clinical or AI content. If future Product requirements need them, add an explicit permission and audit/privacy design. Do not embed active HTML or execute instructions returned in AI text. Render plain text or a constrained safe rich-text subset; treat source links as untrusted and permit only approved safe navigation. Link contents never grant tool permission.

## Local storage, transport and device compromise

Under the Android proposal, protect encryption keys with Keystore and use a reviewed encrypted credential store; exact implementation and hardware-backed requirement are ADR-M08. Keystore helps resist key extraction but cannot make all operations safe on a compromised running device. See [Android Keystore security properties](https://developer.android.com/privacy-and-security/keystore).

No persistent PHI, offline clinical writes, notification previews or background autosync are proposed. Exclude sensitive app data/credentials from platform backup and device transfer. On key loss/invalidation, require new login; never silently fall back to plaintext. Development network exceptions must never reach release builds.

Treat a compromised/unlocked device as a residual risk requiring short sessions, minimum local data and backend revocation/authorization. Root/jailbreak detection, device integrity signals, managed-device enrollment and minimum OS enforcement are **ARCHITECTURE DECISION REQUIRED**; no detection result is an authorization grant and no perfect protection is claimed. Device biometrics may protect storage but do not replace server-required step-up MFA.

Screenshot/app-switcher privacy is a mobile addition, not an existing Viora control. Proposed default protects PHI surfaces and covers background previews. Exact Android APIs/platform coverage and support exceptions must be validated against ADR-M16 devices; capture restrictions cannot prevent photographing a screen. Idle lock duration, reauthentication after background and accessible recovery require Product/Security decisions, without inventing timeout numbers.

## Failure and audit policy

Unauthorized/missing tenant context, stale reviewed versions, unverified step-up, invalid AI output and missing safety dependencies fail closed for affected sensitive actions. Core manual workflows remain available only if their own authorization/integrity dependencies pass. Do not turn backend/provider failure into a weaker client-side fallback.

Audit must cover required patient/clinical access and mutations, appointment actions, AI requests/tools/drafts/review/approval/rejection, and relevant authentication events. Current generic builder and database adapter do not establish route-wide audit coverage. Define failure/transaction behavior for audit outages and prove it before release; mobile cannot fabricate an audit event or assert a clinician's approval on the server's behalf.

Reference AI retention is category-specific: conversations/messages 30 days from `last_message_at` with up to 24-hour cleanup lag; unapproved drafts 7 days; approved draft content purged after audit metadata; raw prompt/context retention zero by default; applicable metadata 90 days. These are backend policy values, not permission to store mobile copies. Clinical retention/residency/export/deletion and broader audit/backup policy remain release dependencies owned by Product/Compliance/Security. No cleanup or legal-hold mechanism is implemented here.

## Release blockers

G01/G02/G07/G08/G09 must close with real integration tests and policy evidence. Do not ship a client that compensates for missing server authorization with hidden buttons, for missing MFA with a local checkbox, for missing OCC with a client counter, or for missing audit with analytics. Full test ownership and evidence are in [MOBILE-TESTING.md](MOBILE-TESTING.md).
