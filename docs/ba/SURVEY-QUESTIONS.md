# Google Forms questionnaire

Estimated completion time: 3–5 minutes. Do not enter patient names, identifiers, diagnoses, or confidential workplace information.

## Opening consent text

This anonymous university survey asks about appointment and patient-workflow experiences and expectations for a mobile clinic support tool. Participation is voluntary and takes about 3–5 minutes. Please do not include patient or confidential workplace information. Results will be summarized in aggregate for product analysis. By continuing, you confirm that you understand this purpose and choose to participate.

## Section 1 — Respondent context

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q01 | Which best describes your experience with healthcare or appointment workflows? (Clinic/reception staff; nurse/clinical staff; doctor/medical student; healthcare administration student; patient/visitor; other; none) | Multiple choice | Separate direct workflow experience from general opinion. | FR-001–FR-012, scope |
| SURVEY-Q02 | How often do you interact with appointment or patient-service workflows? (Daily; weekly; monthly; less often; never) | Multiple choice | Measure familiarity. | Persona confidence, evidence quality |
| SURVEY-Q03 | In what setting have you seen these workflows? (Small clinic; hospital; school/training; personal appointments; other; none) | Checkboxes | Identify context and avoid overgeneralizing. | Problem statement, scope |

## Section 2 — Current problems

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q04 | Which activities are hardest to coordinate? Select up to three: finding the correct patient; checking doctor availability; booking/rescheduling; check-in; finding encounter/record context; sharing updates; handling connection problems; none. | Checkboxes, max 3 | Identify workflow friction without assuming one answer. | FR-005, FR-008–FR-013 |
| SURVEY-Q05 | How difficult is it to complete the hardest activity you selected? (1 Very easy, 2, 3, 4, 5 Very difficult) | Likert scale | Measure perceived difficulty. | Problem statement, priority |
| SURVEY-Q06 | What usually causes delay or rework? Select all: repeated data entry; unclear status; unavailable information; permission/access issue; scheduling conflict; incorrect context; slow connection; other; not sure. | Checkboxes | Identify causes that map to product states and safety controls. | FR-018–FR-020, NFR-005 |
| SURVEY-Q07 | Optional: describe one workflow step that takes longer or causes confusion. Do not include patient or confidential information. | Optional paragraph | Collect neutral qualitative examples. | Problem statement, derived requirements |

## Section 3 — Desired features

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q08 | Rank the features that would be most useful: patient search/detail; doctor/schedule lookup; appointment management; encounter/record context; clear error/retry; privacy/session controls; advisory AI assistance. | Ranking | Prioritize value rather than asking for approval of every feature. | FR-005–FR-020, MoSCoW |
| SURVEY-Q09 | Which information would be most useful on an appointment screen? Select up to three: patient identity; doctor; location; time; appointment status; conflict explanation; check-in status; other. | Checkboxes, max 3 | Validate screen information hierarchy. | FR-009–FR-011, UI scope |
| SURVEY-Q10 | If a request times out after you press Save, what would you prefer? (Wait; check outcome; start over; ask a supervisor; not sure) | Multiple choice | Validate uncertainty/recovery design. | FR-019, NFR-005/NFR-011 |

## Section 4 — Mobile usability

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q11 | Which mobile constraints matter most? Select up to three: small screen; typing effort; poor connection; privacy in shared spaces; notifications; readability; one-handed use; learning time; none. | Checkboxes, max 3 | Prioritize mobile design constraints. | NFR-004–NFR-007 |
| SURVEY-Q12 | How important are the following for a clinic mobile tool? Large readable text; clear status messages; large touch targets; fast search; ability to retry safely; visible current workspace. | Linear scale 1–5 grid | Measure usability needs across concrete qualities. | NFR-004–NFR-007, FR-018 |
| SURVEY-Q13 | Which situations should the app handle clearly? Select all: no results; no permission; no connection; data changed; expired session; unknown save result; none. | Checkboxes | Validate explicit state coverage. | FR-004, FR-018–FR-020 |

## Section 5 — AI feature perception

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q14 | How comfortable would you be with an assistant that provides advisory summaries or draft text for a qualified human to review? (1 Not comfortable, 2, 3, 4, 5 Very comfortable) | Likert scale | Measure acceptance without implying correctness. | FR-014–FR-016, AI scope |
| SURVEY-Q15 | What would you require before trusting such assistance? Select all: human review; source/provenance; visible uncertainty; privacy explanation; ability to edit; ability to reject; audit trail; organization approval; I would not use it. | Checkboxes | Identify trust controls and refusal conditions. | FR-015–FR-017, NFR-001/NFR-010 |
| SURVEY-Q16 | Which risks concern you most? Select up to three: incorrect content; missing context; privacy leakage; wrong patient/workspace; overreliance; unclear responsibility; delay; none; other. | Checkboxes, max 3 | Capture perceived safety risks. | Problem limitations, FR-017, AI policy |

## Section 6 — Privacy and security expectations

| ID | Question | Type | Purpose | Informs |
|---|---|---|---|---|
| SURVEY-Q17 | How important are these controls? Separate login; role-based access; workspace indicator; automatic privacy cover; logout clears data; audit of sensitive actions. | Linear scale 1–5 grid | Validate security expectations in understandable terms. | FR-004, FR-017, FR-020, NFR-001/NFR-002 |
| SURVEY-Q18 | Which data should a mobile tool avoid storing locally unless necessary? Select all: patient demographics; clinical notes; appointment details; AI conversation text; authentication tokens; none; not sure. | Checkboxes | Inform privacy/storage priorities. | NFR-002/NFR-003/NFR-012 |
| SURVEY-Q19 | Optional: What would make you stop using a clinic mobile tool? Do not include confidential information. | Optional paragraph | Collect negative requirements and trust barriers. | Scope, NFRs, derived requirements |

No responses are included in this file. Results remain **PENDING REAL EVIDENCE**.

