# Requirements traceability matrix

The matrix connects current product hypotheses and repository evidence to future service work. `PENDING REAL EVIDENCE` means survey or external validation has not yet occurred.

| User problem | Survey evidence | Requirement | User story | Android screen | Repository/domain component | Future backend/API | Test/evidence | Rubric |
|---|---|---|---|---|---|---|---|---|
| Staff may spend too long locating the correct patient. | `SURVEY-Q04–Q07` — PENDING REAL EVIDENCE | FR-005, FR-006 | US-003 | Patients list/detail; patient picker | `HttpPatientDirectory`, `Patient`, `PatientViewModels`, `ReadState` | `GET /v1/patients` P01; `GET /v1/patients/{id}` P03 | `PatientDirectoryTest`, `OperationalHttpTest` | 2.1, 2.3, 2.4, 2.6 |
| Scheduling requires coordination of patient, doctor, location, and time. | `SURVEY-Q04`, `SURVEY-Q08–Q10` — PENDING REAL EVIDENCE | FR-008–FR-011 | US-004, US-005 | Schedule, doctor directory, appointment form/detail | `HttpDoctorDirectory`, `HttpAppointmentRepository`, `Scheduling`, `AppointmentFormViewModel` | D01–D03, AP01–AP11 | `OperationalHttpTest`, `OperationalStateTest`, `AppointmentLifecycleTest`, `SchedulingTest` | 2.1, 2.3, 2.4, 2.6 |
| Users may confuse empty data with denial or failure. | `SURVEY-Q06`, `SURVEY-Q10`, `SURVEY-Q13` — PENDING REAL EVIDENCE | FR-018 | US-008 | Patients, Schedule, Clinical, Assistant state panes | `ReadState`, `ClinicalState`, `AssistantState`, `ApiResult` | API error envelope and documented 401/403/404/409/412/503 mapping | `OperationalStateTest`, `ClinicalStateTest`, `AssistantStateTest` | 2.1, 2.3, 2.4 |
| Workspace or role mistakes can expose the wrong context. | `SURVEY-Q13`, `SURVEY-Q17` — PENDING REAL EVIDENCE | FR-004, FR-017, NFR-001 | US-002, US-009 | Role/workspace selection; guarded shells | `SessionCoordinator`, `Authorization`, `AuthenticatedRequestExecutor`, `WorkspaceContext` | `GET /v1/workspaces`; `GET /v1/workspaces/{id}` W01; server authorization | `SessionCoordinatorTest`, `ClinicalContextTest`, `AssuranceHandoffBoundaryTest` | 2.1, 2.4, 2.6 |
| Clinical users need the correct encounter and record context. | `SURVEY-Q04`, `SURVEY-Q08` — PENDING REAL EVIDENCE | FR-012, FR-013 | US-006 | Clinical entry, encounter, record | `ClinicalReader`, `ClinicalReadRepository`, `ClinicalState`, domain lifecycle | CL02, CL06, CL07, CL08, CL09, CL11, CL12, CL14 | `ClinicalRepositoryTest`, `ClinicalContextTest` | 2.1, 2.3, 2.4, 2.6 |
| AI assistance may be useful but must remain reviewable and bounded. | `SURVEY-Q14–Q16` — PENDING REAL EVIDENCE | FR-014–FR-017 | US-007, US-010 | Assistant conversation, draft review | `AssistantRepository`, `AssistantViewModel`, `SyntheticAssistantBackend`, `HttpClinicalHandoff` | AI01–AI13; server provider gateway and audit are future | `AssistantContractTest`, `AssistantStateTest`, `AssuranceHandoffBoundaryTest` | 2.1, 2.4, 2.5, 2.6 |
| Mobile use can expose information in shared spaces or during interruption. | `SURVEY-Q11–Q13`, `SURVEY-Q17–Q18` — PENDING REAL EVIDENCE | FR-020, NFR-002, NFR-006/007 | US-009 | App shell, privacy cover, account/logout | `PrivacyController`, `KeystoreSecureStore`, `SessionCoordinator` | Auth revoke/logout A03/A04; server retention and audit | `PrivacyControllerTest`, `OperationCoordinatorTest` | 2.1, 2.3, 2.4 |
| A timeout after Save can cause duplicate work or uncertainty. | `SURVEY-Q06`, `SURVEY-Q10` — PENDING REAL EVIDENCE | FR-019, NFR-005/NFR-011 | US-005, US-008 | Outcome recovery and appointment submission | `OperationCoordinator`, `OperationReceipt`, `ApiClient` | OP01–OP03; idempotency and transaction boundary | `OperationalHttpTest`, `OperationalStateTest`, `OperationCoordinatorTest` | 2.1, 2.4, 2.6 |

## Coverage notes

- Current Android screens and repository components are based on the inspected source tree.
- Future API routes are taken from `docs/API-SPEC.md`; they are not evidence of a deployed service.
- Survey cells are intentionally pending until genuine responses exist.
- No traceability row claims production database, authentication, AI, audit, or clinical validation evidence.
