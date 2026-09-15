# Business-analysis evidence checklist

Criterion focus: **2.1 Idea and problem analysis**. Statuses are deliberately conservative.

| Evidence item | Status | What must eventually be shown |
|---|---|---|
| Problem statement | READY | [PROBLEM-STATEMENT.md](PROBLEM-STATEMENT.md), with claims labeled as hypotheses until validated. |
| Target users | READY | [PERSONAS.md](PERSONAS.md), tied to actual project roles and permissions. |
| User journeys | READY | [USER-JOURNEYS.md](USER-JOURNEYS.md), showing current synthetic flows and planned production boundaries. |
| Achievable product scope | READY | [SCOPE.md](SCOPE.md), including MoSCoW priorities and exclusions. |
| Functional requirements | READY | [REQUIREMENTS.md](REQUIREMENTS.md), with stable IDs and honest implementation status. |
| Non-functional requirements | READY | [NFR-REQUIREMENTS.md](NFR-REQUIREMENTS.md), with measurable acceptance criteria. |
| Requirements traceability | READY | [TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md), linked to screens, components, tests, and future API. |
| Survey objective and method | READY | [SURVEY-PLAN.md](SURVEY-PLAN.md), including consent, recruitment, analysis, and limitations. |
| Google Form questionnaire | READY | [SURVEY-QUESTIONS.md](SURVEY-QUESTIONS.md), ready to transfer to Google Forms. |
| Survey form screenshot | READY | SURVEY-E01 indexes the published Google Forms title, purpose, consent, time, and no-PHI instructions. |
| Real response count | READY | SURVEY-E02 and the question charts show 61 recorded responses; Q1 visibly shows 60 explicit consent responses. The repository distinguishes recorded responses from consented responses. |
| Respondent context chart | READY | SURVEY-E03 records the visible mixed respondent contexts without inventing a complete demographic breakdown. |
| Problem/findings charts | READY | SURVEY-E04 and SURVEY-E05 support Q4 and Q7 quantitative findings; Q19 qualitative analysis remains pending. |
| Feature-priority chart | READY | SURVEY-E06 records Q11 feature priorities with counts and percentages. |
| Mobile usability chart | READY | SURVEY-E07 records Q14 retry/error expectations. |
| AI perception chart | READY | SURVEY-E08 and SURVEY-E09 record Q15 usefulness and Q17 concerns. |
| Privacy/security chart | READY | SURVEY-E10 records Q18 authorization importance. |
| Requirement derivation | READY | SURVEY-RESULTS.md, SURVEY-FINDINGS.md, and the traceability matrix connect findings to requirements. |
| Product-scope decision | READY | Present the scope and exclusions; revise only if research supports a change. |
| Raw CSV/Sheet export | PENDING OPTIONAL | Preserve a sanitized aggregate export if it is available; do not add raw identifiers or PHI. |
| Q19 qualitative analysis | PENDING RAW RESPONSES | Obtain the raw text or a sanitized export before clustering or quoting free-text answers. |
| Clinical/user validation | OPTIONAL / NOT CLAIMED | Not required to close criterion 2.1 unless the project claims clinical validation. No clinician validation is claimed. |

The repository now claims only the verified 61-response survey evidence and indexed screenshots. It claims no quotations, clinic partnership, clinician validation, or medical validation.

## Final-course MVP evidence dependencies

These items are required for the broader final submission but are not claimed as current evidence:

| Evidence item | Status | Required proof |
|---|---|---|
| Real REST API | MISSING | Deployed or reviewable service, executable contract, authentication, authorization, and error mapping. |
| Persistent database and CRUD | MISSING | Schema/migrations plus real create, read, update, and delete tests for the selected resources. |
| Production authentication | MISSING | Real non-PHI environment showing login, token/session handling, refresh, revoke, and failure behavior. |
| Workspace/role enforcement | MISSING | Server-side isolation and denied-action tests across at least two synthetic workspaces or equivalent fixtures. |
| Real AI integration | MISSING | Provider-mediated use case, prompt/model documentation, evaluation, provenance, limitations, and human review evidence. |
| Testing and deployment | PENDING IMPLEMENTATION | Same-revision client/service tests, staging or deployment evidence where feasible, and disclosed limitations. |

`FakeBackend` and `SyntheticAssistantBackend` may continue to support previews and tests, but they cannot satisfy these final-course implementation evidence items.
