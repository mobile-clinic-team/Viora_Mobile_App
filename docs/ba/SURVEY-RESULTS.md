# Viora survey results

## 1. Survey objective

The survey explored workflow difficulties around clinic services, priorities for a clinic-support mobile application, expectations for error recovery and authorization, and perceptions of AI summarization. It was used to test and refine the Viora product hypothesis, not to validate a clinical intervention.

## 2. Method

The questionnaire was published through Google Forms and completed voluntarily using convenience sampling. The form stated an expected completion time of 3–5 minutes and did not request names, phone numbers, patient records, or health information. The survey is exploratory and must not be interpreted as a statistically representative or clinically validated study.

## 3. Sample size and respondent context

The evidence package contains **61 recorded responses**, supported by SURVEY-E02 and the question charts indexed in [`SURVEY-EVIDENCE-INDEX.md`](SURVEY-EVIDENCE-INDEX.md). The Q1 consent chart explicitly shows 60 responses. Therefore, the repository can demonstrate 60 explicit consent responses, while the quantitative charts supplied for Q4, Q7, Q11, Q14, Q15, Q17, and Q18 use a denominator of 61. No raw export proves consent for the 61st response, so 61 is not described as 61 consented respondents.

SURVEY-E03 shows mixed respondent contexts, including students, people who have used clinic services, administrative/reception respondents, nursing/medical respondents, and technology workers. The screenshot does not expose a complete numeric breakdown for every category, so no additional demographic percentages are claimed here.

The Q1 consent chart displays 60 responses because it is a separate question result. It is retained as the explicit-consent evidence and is not silently treated as 61.

## 4. Key quantitative results

### Q4 — Difficulties observed in clinic services

- Difficulty following appointments or schedules: **31/61 respondents (50.8%)**.
- Waiting-time concern: **31/61 respondents (50.8%)**.
- Difficulty retrieving previously provided information: **23/61 respondents (37.7%)**.
- Difficulty knowing the current process or status: **20/61 respondents (32.8%)**.

### Q7 — Most important problem for a clinic-support application

- Patient lookup/search: **16/61 respondents (26.2%)**.
- Appointment management: **16/61 respondents (26.2%)**.
- Authorized clinical-history/record access: **7/61 respondents (11.5%)**.
- Reducing repetitive entry: **7/61 respondents (11.5%)**.

### Q11 — Top features for the first Viora version

- Patient search: **28/61 respondents (45.9%)**.
- Clinical record viewing: **26/61 respondents (42.6%)**.
- Doctor/schedule viewing: **24/61 respondents (39.3%)**.
- Login/authorization: **23/61 respondents (37.7%)**.
- Patient detail: **23/61 respondents (37.7%)**.
- Appointment management: **21/61 respondents (34.4%)**.
- Patient check-in: **16/61 respondents (26.2%)**.
- Visit progress tracking: **15/61 respondents (24.6%)**.
- AI summarization/draft support: **13/61 respondents (21.3%)**.
- Error guidance/handling: **13/61 respondents (21.3%)**.

### Q14 — Expected behavior when data cannot load

- Error message with retry button: **40/61 respondents (65.6%)**.
- Automatic retry while informing the user: **17/61 respondents (27.9%)**.
- Only displaying an error: **4/61 respondents (approximately 6.6%)**.

Therefore, **57/61 respondents (93.4%)** preferred some retry mechanism.

### Q15 — Usefulness of AI summarization

- Rating 3/5: **8/61 respondents (13.1%)**.
- Rating 4/5: **16/61 respondents (26.2%)**.
- Rating 5/5: **37/61 respondents (60.7%)**.

Ratings 4 or 5 total **53/61 respondents (86.9%)**. The approximate mean is **4.48/5**.

### Q17 — AI concerns

- Insufficient context: **28/61 respondents (45.9%)**.
- Incorrect information: **27/61 respondents (44.3%)**.

The chart also displays concerns about privacy, over-reliance, opacity, and AI making autonomous decisions. These responses support bounded context, provenance, safe failure, and human review requirements.

### Q18 — Importance of role/permission access

- Rating 3/5: **1/61 respondents (1.6%)**.
- Rating 4/5: **12/61 respondents (19.7%)**.
- Rating 5/5: **48/61 respondents (78.7%)**.

Ratings 4 or 5 total **60/61 respondents (98.4%)**. The approximate mean is **4.77/5**.

## 5. Functional implications

The results support prioritizing patient search, clinical record viewing, doctor/schedule information, appointments, authentication, and patient detail in the first real vertical slice. The appointment and clinical workflows should use server-backed data and explicit status/error states. The final MVP scope therefore retains real API, persistent database CRUD, authentication, and server-side authorization as required work.

## 6. AI findings

AI summarization received a positive usefulness signal, with 53/61 respondents rating it 4 or 5. It was less selected as a first-version feature than patient search, record viewing, scheduling, login/authorization, and appointments. This supports one focused real AI use case rather than an expansive assistant. Q17 concerns require bounded context, provenance, limitations, safe refusal, evaluation, and human review before a draft can affect a clinical record.

## 7. Security findings

Authorization is a strong expectation: 60/61 respondents rated role/permission access 4 or 5. This supports keeping authentication and server-side RBAC as final-MVP requirements. The survey does not prove security effectiveness; implementation and security tests remain necessary.

## 8. UX and error-handling findings

The 93.4% preference for a retry mechanism supports explicit loading, error, retry, unavailable, and uncertain-outcome states. Automatic retry must still inform the user and must not duplicate a write operation.

## 9. Limitations

- This was exploratory convenience sampling.
- The consent evidence is 60 responses; substantive question charts show 61 recorded responses. The quantitative percentages below preserve the denominator displayed by each supplied chart.
- The sample is mixed; it is not claimed to represent clinic staff or medical professionals.
- No clinical validation, clinician sign-off, clinic partnership, or medical efficacy conclusion is claimed.
- Percentages describe this response set and do not establish population-level inference.
- Q19 has 21 free-text responses visible in the screenshot, but raw response text is not present in the repository. Qualitative analysis is therefore pending.
- The survey captured product perceptions, not observed workflow performance or security behavior.

## 10. Conclusion

The survey strengthens the case for a focused clinic workflow centered on patient lookup, records, scheduling, appointments, recoverable errors, and authorization. It also supports a bounded, human-reviewed AI feature while showing why real AI safety controls are necessary. The evidence improves criterion 2.1 readiness, but it does not replace implementation, security, API, database, AI evaluation, or deployment evidence.
