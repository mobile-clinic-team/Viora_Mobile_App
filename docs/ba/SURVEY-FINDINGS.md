# Evidence-based survey findings

The findings below describe an exploratory convenience sample whose substantive question charts show 61 recorded responses. The Q1 chart explicitly shows 60 consent responses, so the repository does not claim 61 consented respondents. The findings show associations and priorities within this response set; they do not prove causation, clinical validity, or population-level prevalence.

## FINDING-01 — Appointment tracking and waiting are significant reported pain points

- **Supporting question:** Q4, SURVEY-E04.
- **Evidence:** Difficulty following appointments/schedules: **31/61 (50.8%)**. Waiting-time concern: **31/61 (50.8%)**.
- **Interpretation:** These were the two most frequently reported Q4 difficulties in the supplied evidence.
- **Requirement impact:** Supports FR-008 through FR-011 and NFR-005/NFR-009.
- **Product decision:** Keep doctor/schedule and appointment state management in the final real vertical slice, with visible current status and recovery behavior.
- **Grading relevance:** Supports idea/problem analysis, UI/UX, Android completeness, and Database/API workflow evidence.

## FINDING-02 — Patient search and clinical-record access are highly prioritized

- **Supporting question:** Q11, with Q7 context; SURVEY-E05 and SURVEY-E06.
- **Evidence:** Patient search: **28/61 (45.9%)** in Q11. Clinical-record viewing: **26/61 (42.6%)**. Patient lookup/search was also selected by **16/61 (26.2%)** in Q7.
- **Interpretation:** Finding the correct patient and accessing authorized records are prominent first-version expectations.
- **Requirement impact:** Supports FR-005, FR-006, and FR-012.
- **Product decision:** Prioritize a narrow authenticated patient-to-record path over broad hospital features.
- **Grading relevance:** Supports criterion 2.1 and the Android/API criteria through a concrete product rationale.

## FINDING-03 — Doctor schedule and appointment workflow are core MVP capabilities

- **Supporting question:** Q4, Q7, Q11; SURVEY-E04 through SURVEY-E06.
- **Evidence:** Doctor/schedule viewing: **24/61 (39.3%)**. Appointment management: **21/61 (34.4%)** in Q11 and **16/61 (26.2%)** in Q7. Schedule difficulty was reported by **31/61 (50.8%)** in Q4.
- **Interpretation:** Scheduling is both a reported problem area and a desired feature area.
- **Requirement impact:** Supports FR-008 through FR-011.
- **Product decision:** Include real appointment CRUD and server-side conflict/state rules in the selected demonstration path.
- **Grading relevance:** Directly supports criteria 2.1, 2.3, 2.4, and 2.6.

## FINDING-04 — Users strongly prefer recoverable error handling with retry

- **Supporting question:** Q14, SURVEY-E07.
- **Evidence:** Error plus retry: **40/61 (65.6%)**. Automatic retry with notification: **17/61 (27.9%)**. Some retry mechanism was preferred by **57/61 (93.4%)**.
- **Interpretation:** Users generally expect the application to help them recover when data cannot load.
- **Requirement impact:** Supports FR-018, FR-019, NFR-005, and NFR-009.
- **Product decision:** Provide truthful retry and outcome-recovery states; never retry a write blindly or turn failure into empty data.
- **Grading relevance:** Supports UI/UX, Android reliability, API error handling, and testing evidence.

## FINDING-05 — AI summarization is valued but is not the highest-priority core feature

- **Supporting question:** Q11 and Q15; SURVEY-E06 and SURVEY-E08.
- **Evidence:** AI summarization/draft support was selected by **13/61 (21.3%)** in Q11. Usefulness ratings of 4 or 5 totaled **53/61 (86.9%)**, with an approximate mean of **4.48/5** in Q15.
- **Interpretation:** Respondents see value in summarization, but they prioritize core information and workflow access first.
- **Requirement impact:** Supports FR-014 and FR-015 while confirming that AI should remain a focused feature.
- **Product decision:** Build one useful real summarization/draft workflow after the core authenticated workflow is reliable.
- **Grading relevance:** Supports AI integration prioritization without overstating it as the primary user problem.

## FINDING-06 — AI safety concerns justify human-in-the-loop review

- **Supporting question:** Q17 and Q15; SURVEY-E08 and SURVEY-E09.
- **Evidence:** Insufficient context was selected by **28/61 (45.9%)**. Incorrect information was selected by **27/61 (44.3%)**. The chart also shows privacy, over-reliance, opacity, and autonomous-decision concerns.
- **Interpretation:** Positive usefulness ratings coexist with substantial concerns about correctness and context.
- **Requirement impact:** Supports FR-015, FR-016, FR-017, and NFR-010.
- **Product decision:** Require bounded context, provenance, limitations, evaluation, human review, and explicit acceptance before AI output can be handed off to a clinical draft.
- **Grading relevance:** Directly supports criterion 2.5 and the testing/safety evidence required for 2.6.

## FINDING-07 — Authorization/RBAC is a strong user expectation

- **Supporting question:** Q18, SURVEY-E10.
- **Evidence:** Authorization importance rated 4 or 5 by **60/61 (98.4%)**, including 5/5 from **48/61 (78.7%)**. The approximate mean was **4.77/5**.
- **Interpretation:** Role and permission controls are a dominant expectation in this response set.
- **Requirement impact:** Supports FR-003, FR-004, FR-017, NFR-001, NFR-003, and NFR-012.
- **Product decision:** Treat authentication and server-side workspace/RBAC enforcement as final-MVP requirements; client checks remain defense-in-depth only.
- **Grading relevance:** Supports problem analysis, security architecture, Database/API, and testing evidence.

## Q19 status

Q19 shows 21 free-text responses in SURVEY-E11, but raw response text is not present in the repository. **QUALITATIVE ANALYSIS PENDING RAW RESPONSES.** No themes, quotations, or counts are inferred from the aggregate chart.
