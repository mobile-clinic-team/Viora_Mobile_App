# Focused user stories

These stories describe the target final-course MVP. Current synthetic/local behavior is evidence for the client foundation only. Stories that require authentication, persistence, a live API, or real AI remain incomplete until those services are implemented and verified.

## Survey support

| Stories | Survey evidence |
|---|---|
| US-003 | Q7 patient lookup 16/61 (26.2%); Q11 patient search 28/61 (45.9%) and patient detail 23/61 (37.7%). |
| US-004, US-005 | Q4 schedule difficulty 31/61 (50.8%); Q7 appointment management 16/61 (26.2%); Q11 appointment management 21/61 (34.4%); Q14 retry mechanism 57/61 (93.4%). |
| US-006 | Q11 clinical record viewing 26/61 (42.6%). |
| US-007, US-010 | Q15 AI usefulness rating 4 or 5 from 53/61 (86.9%); Q17 insufficient context 28/61 (45.9%) and incorrect information 27/61 (44.3%). |
| US-002, US-009, US-011 | Q11 login/authorization 23/61 (37.7%); Q18 authorization importance rated 4 or 5 by 60/61 (98.4%). |
| US-001, US-008, US-012 | Q14 retry preference and Q18 authorization support the broader safety, recovery, and evidence stories. |

## US-001 — Start securely

As a clinic staff member, I want the app to start in a neutral state so that protected information is not exposed during restore.

**Requirements:** FR-001, FR-020, NFR-002

- **Given** the app process starts or resumes after expiry
- **When** identity and workspace context are not ready
- **Then** the app shows a neutral or selection state and opens no protected content.

## US-002 — Select the correct workspace

As a clinic staff member with more than one membership, I want to choose my role and clinic so that my work is scoped correctly.

**Requirements:** FR-004, FR-017, NFR-001

- **Given** memberships are returned for the signed-in user
- **When** I choose a role and workspace
- **Then** the app validates the context before opening protected navigation and rejects stale or unauthorized choices.

## US-003 — Find a patient

As a receptionist, doctor, or nurse, I want to search authorized patients so that I can open the correct workflow.

**Requirements:** FR-005, FR-006

- **Given** I have patient-read access in the active workspace
- **When** I enter a valid search and select a result
- **Then** the app displays only the authorized patient projection and carries an identifier into the next flow.

## US-004 — Coordinate an appointment

As a receptionist, I want to coordinate a patient, doctor, location, and time so that the visit is scheduled without guessing about availability.

**Requirements:** FR-008–FR-011, FR-018

- **Given** the selected references are authorized and scheduling policy is available
- **When** I submit a reviewed appointment request
- **Then** the app sends one bounded command and displays the actual receipt or a truthful conflict/error state.

## US-005 — Recover an uncertain save

As a scheduling user, I want to check the outcome after a timeout so that I do not create a duplicate appointment.

**Requirements:** FR-011, FR-019, NFR-005, NFR-011

- **Given** a request may have reached the service but its response was lost
- **When** I choose Check outcome
- **Then** the app reconciles the original operation and does not automatically submit a new command.

## US-006 — Open clinical context

As a doctor or nurse, I want to open an authorized encounter and record so that I can work with the correct patient context.

**Requirements:** FR-012, FR-013, FR-017

- **Given** the patient, encounter, workspace, relationship, and grant are valid
- **When** I open clinical context
- **Then** the app shows the permitted current record or a distinct denied, missing, stale, or unavailable state.

## US-007 — Ask bounded assistance

As an authorized clinician, I want to ask an advisory assistant about a fixed context so that I can receive support without changing the patient or workspace binding.

**Requirements:** FR-014, FR-017, NFR-001, NFR-010

- **Given** assistant policy and context access are valid
- **When** I send a bounded question
- **Then** a real backend-mediated model returns a bounded, provenance-aware advisory response where required, with documented prompt/model behavior and limitations, and it is never presented as an autonomous clinical decision.

## US-008 — See clear states

As any app user, I want clear loading, empty, failure, denied, stale, and unavailable states so that I know whether retrying or changing context is appropriate.

**Requirements:** FR-018, FR-019

- **Given** a read or command returns a non-success condition
- **When** the app maps the result
- **Then** the message and action match the actual condition and do not imply data absence when the request failed.

## US-009 — Protect information on interruption

As a clinic staff member, I want the app to cover and clear sensitive state when I background or log out so that another person cannot continue my session.

**Requirements:** FR-020, NFR-002, NFR-006

- **Given** protected screens are open
- **When** the app times out, scope changes, or logout completes
- **Then** the old protected shell and workspace cannot be restored without fresh validation.

## US-010 — Review an AI draft before handoff

As a doctor with approval permission, I want to inspect and edit an AI draft before a bound approval so that I remain responsible for the clinical content.

**Requirements:** FR-015, FR-016, FR-017, NFR-010, NFR-011

- **Given** an existing DRAFT target and current versions
- **When** I review and edit the real model-generated draft, request assurance, and approve
- **Then** approval requires fresh assurance and exact version matching; stale or failed handoff leaves the record unchanged.

## US-011 — Use an operational admin view safely

As a clinic administrator, I want to see only explicit administrative information so that my role does not silently grant clinical access.

**Requirements:** FR-004, FR-017, NFR-001

- **Given** I have an administrative membership
- **When** I open an administrative area
- **Then** each area is individually permission-gated and clinical actions remain unavailable without explicit grants.

## US-012 — Validate the product direction

As a project team member, I want to collect anonymous workflow feedback so that requirements reflect real users rather than assumptions.

**Requirements:** FR-005–FR-020 and BA evidence requirements

- **Given** the approved survey form and consent text
- **When** real respondents complete it
- **Then** the report records actual counts, limitations, charts, and requirement decisions without fabricated evidence.
