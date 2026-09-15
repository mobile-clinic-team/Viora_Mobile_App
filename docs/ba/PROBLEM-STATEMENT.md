# Problem statement

## Problem context

Small clinic teams coordinate patient information, doctor availability, appointments, check-in, encounter context, and clinical documentation under time pressure. The work is distributed across people and steps. A staff member may need to find the right patient, confirm the right clinic workspace, coordinate a doctor and time, and open the correct clinical context without exposing information from another workspace.

The repository documents Viora as a mobile workflow/support tool for this coordination problem. The problem statement is a product hypothesis until real user research is collected.

## Who experiences the problem

The intended users are the project’s documented clinic roles:

- Receptionists coordinating patient demographics, scheduling, rescheduling, cancellation, and check-in.
- Doctors working with authorized patients, appointments, encounters, records, and reviewed assistance.
- Nurses supporting authorized patient, appointment, encounter, and permitted clinical workflows.
- Clinic administrators using authorized operational and workspace information without an automatic clinical override.

Patients and super administrators are not target personas for the smallest staff-facing MVP. A patient shell exists in preserved worktree code and requires an explicit scope decision before inclusion.

## Existing workflow pain points to validate

The following are hypotheses for the survey, not measured findings:

1. Finding the correct patient and confirming identity can take too many steps.
2. Scheduling requires coordination between patient, doctor, location, and appointment state.
3. Workspace or role mistakes can expose the wrong operational or clinical context.
4. Staff need clear distinction between empty data, unavailable data, permission denial, and a failed request.
5. Clinical users need the correct encounter and record context before documenting or reviewing information.
6. Any AI assistance must remain advisory, attributable, reviewable, and safe to decline.

## Why mobile is useful

Clinic staff may need to check a schedule, locate a patient, confirm an appointment, or review a context while moving between rooms or desks. A phone can reduce workstation dependency and provide one focused flow with explicit state and context. It is useful only when connectivity, screen readability, privacy, authentication, and access boundaries are reliable.

## What Viora aims to improve

Viora aims to improve workflow visibility and reduce avoidable coordination steps by providing:

- One role-aware mobile entry point.
- Explicit workspace selection and context indicators.
- Patient and doctor lookup using minimized information.
- Appointment scheduling and state transitions with clear conflict handling.
- Clinical context navigation that carries identifiers rather than sensitive content in routes.
- Advisory AI support that requires human review and preserves manual work when unavailable.
- Clear loading, empty, denied, failed, stale, and uncertain-outcome states.

These are intended improvements. Their practical value requires real survey and usability evidence.

## What Viora does not claim to solve

Viora does not claim to be a hospital information system, electronic health record replacement, billing system, laboratory system, prescribing system, inventory system, patient self-service portal, or autonomous medical decision-maker. It does not claim regulatory compliance, clinical efficacy, diagnostic accuracy, or production readiness from the current repository.

## Clinical and safety limitations

Clinical truth, role grants, workspace isolation, record completeness, audit, retention, and assurance must be enforced by a future server. The current FakeBackend and synthetic AI are development fixtures only. No real patient or PHI data may be used for development, survey responses, screenshots, or demonstrations. A clinician must review any AI-generated content; AI approval and clinical finalization remain separate actions.

