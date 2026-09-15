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
| Survey form screenshot | PENDING REAL SURVEY | Capture the final form and consent text after publication. |
| Real response count | PENDING REAL SURVEY | Capture Google Forms response count and dates; do not invent a number. |
| Respondent context chart | PENDING REAL SURVEY | Export or screenshot Q01–Q03 charts. |
| Problem/findings charts | PENDING REAL SURVEY | Capture Q04–Q07 charts and actual theme counts. |
| Feature-priority chart | PENDING REAL SURVEY | Capture Q08–Q10 results using the predeclared analysis method. |
| Mobile usability chart | PENDING REAL SURVEY | Capture Q11–Q13 results. |
| AI perception chart | PENDING REAL SURVEY | Capture Q14–Q16 results and limitations. |
| Privacy/security chart | PENDING REAL SURVEY | Capture Q17–Q18 results. |
| Requirement derivation | PENDING REAL SURVEY | Update the results template and requirement decisions with actual evidence. |
| Product-scope decision | READY | Present the scope and exclusions; revise only if research supports a change. |
| Clinical/user validation | MISSING | Obtain genuine relevant feedback if available; do not claim clinician validation without it. |

No survey respondents, results, percentages, quotations, partnership, or medical validation are claimed in this repository.

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
