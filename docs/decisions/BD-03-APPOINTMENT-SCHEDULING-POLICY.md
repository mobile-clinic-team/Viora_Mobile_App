# BD-03 - Appointment and Scheduling Policy

Status: FINAL / DECIDED
Date: 2026-09-20

## Approved Mobile Run 2 amendment — 2026-09-23

The task owner's final Run 2 approval supersedes conflicting statements below
for Patient self-booking. BD-03 is closed for this scope:

- Duration is exactly 30 minutes, derived by the server; creation status is PENDING.
- PENDING, CONFIRMED, CHECKED_IN and IN_PROGRESS occupy a Doctor's time.
- CANCELLED, COMPLETED and NO_SHOW release that time. Existing persisted status names are retained.
- The complete interval must fit an ACTIVE Doctor shift at the selected ACTIVE location,
  with an ACTIVE Doctor, clinic and linked Patient. The Doctor must belong to that location.
- Patient authority comes from the authenticated user and their unique Patient link per clinic.
  Multiple clinic links are allowed; client authority selectors and status are rejected.
- PostgreSQL exclusion, existing durable operations, OCC versions and mandatory transactional audit
  govern commit. Failed mandatory audit rolls back the booking.

The implementation and evidence are documented in `../evidence/RUN-2-APPOINTMENTS-AUDIT.md`.
This amendment does not enable additional staff or clinical workflows.

## 1. Scope

BD-03 defines ordinary Appointment scheduling, availability, confirmation,
check-in, cancellation, no-show, rescheduling, capacity, concurrency,
temporary scheduling access, and the scheduling-to-clinical handoff boundary.

BD-03 does not replace:

- BD-01 authorization, relationship, field-visibility, break-glass, or audit policy;
- BD-02 Patient eligibility and lifecycle policy;
- BD-04 Encounter and clinical lifecycle policy.

If a required scheduling rule is not defined by this decision or an existing
canonical contract, implementation must fail closed rather than inventing it.

## 2. Appointment and Encounter are separate lifecycles

Appointment represents scheduling.

Encounter represents the actual clinical-care lifecycle.

Appointment must not duplicate Encounter clinical states merely for
implementation convenience.

In particular:

- `IN_PROGRESS` belongs to Encounter;
- clinical `COMPLETED` belongs to Encounter;
- Appointment must not create parallel clinical lifecycle truth.

Appointment reaches the end of its scheduling responsibility through the
canonical fulfilled/handoff state.

The exact clinical handoff boundary must remain consistent with BD-04.

## 3. Initial Appointment state

A newly created ordinary Appointment begins in `PENDING`.

`PENDING` represents an Appointment whose required acceptance/confirmation
workflow has not yet completed.

Creation must not silently imply confirmation.

## 4. Confirmation

Appointment confirmation is a separate state transition.

Logical transition:

PENDING
-> confirmed/booked state

The exact public status name must follow the canonical API/domain contract.

If the contract uses `CONFIRMED`, implementation must not independently invent
`BOOKED`.

If the contract uses `BOOKED`, implementation must not independently invent
`CONFIRMED`.

Confirmation requires all applicable:

- explicit confirmation authority;
- applicable role ceiling;
- resource authorization;
- valid state transition;
- optimistic concurrency;
- canonical participant/service policy.

BD-03 does not hard-code a participant set such as Patient + Doctor for every
service.

The required participants and acceptance semantics come from canonical
workspace/service policy.

## 5. Appointment creation authorization

Creating an Appointment requires all applicable:

- authenticated session;
- active workspace context;
- explicit appointment-create authority already defined by the canonical contract;
- authority within an applicable role ceiling;
- Patient/resource authorization;
- Patient scheduling eligibility;
- service/duration rules;
- conflict and capacity validation.

BD-03 does not grant create authority merely because a user is a Receptionist,
Doctor, Nurse, or CLINIC_ADMIN.

Role name alone is not permission.

## 6. Patient eligibility

Ordinary Appointment creation is prohibited when the Patient is:

- inactive;
- deceased;
- archived.

This preserves BD-02.

For an inactive Patient:

INACTIVE
-> authorized reactivation
-> ACTIVE
-> Appointment creation

Appointment creation must not silently reactivate the Patient.

There is no generic ordinary Appointment override for a deceased Patient.

A special post-mortem workflow, if ever required, must be defined separately.

An archived Patient must pass the authorized Patient lifecycle workflow before
ordinary new activity may occur.

## 7. Appointment duration

Appointment duration and service scheduling rules are owned by canonical
backend/workspace/service configuration.

The client must not choose an arbitrary duration.

BD-03 does not hard-code a universal duration such as 30 minutes.

If a required service duration rule is not defined, implementation must not
invent one solely to make Appointment creation succeed.

## 8. Doctor scheduling conflicts

Ordinary Doctor double-booking is rejected by default.

A Doctor conflict may be overridden only when all applicable conditions hold:

- canonical policy explicitly permits the override;
- caller has explicit override authority;
- mandatory override reason is supplied;
- applicable capacity/resource invariants remain valid;
- optimistic concurrency succeeds;
- override is audited.

CLINIC_ADMIN role alone does not confer override authority.

Doctor role alone does not confer override authority.

An override must not bypass a hard physical or safety constraint.

## 9. Patient scheduling conflicts

A Patient must not have overlapping ordinary Appointments.

Different Doctors do not make an overlapping Patient Appointment valid.

BD-03 defines no generic Patient-double-booking override.

If a legitimate special workflow is required later, it must be explicitly
defined rather than implemented as a hidden override.

## 10. Resource and location capacity

Scheduling capacity is enforced by the backend.

Applicable checks may include canonical constraints for:

- Doctor;
- location;
- room;
- equipment or other schedulable resource;
- service;
- occupancy/capacity.

Android is not the capacity or scheduling-consistency boundary.

Capacity must not be hard-coded to one Appointment per location unless the
canonical resource policy actually says so.

A capacity override is allowed only when:

- canonical policy explicitly supports it;
- explicit override authority exists;
- reason is supplied;
- audit is recorded;
- atomic concurrency controls are preserved.

A policy-level override must not violate a hard physical or safety constraint.

## 11. Availability is not reservation

An availability response is a snapshot.

Availability does not reserve or guarantee a slot.

Therefore:

availability response
!= reservation

Appointment create/reschedule must revalidate all applicable:

- Patient eligibility;
- Doctor conflict;
- Patient conflict;
- service rules;
- duration;
- resource availability;
- capacity.

The final reservation and mutation must be committed within a concurrency-safe
backend/database boundary.

If two requests race for mutually exclusive capacity:

- the request that validly commits the capacity may succeed;
- the conflicting request must fail with the canonical conflict behavior.

A check-then-insert sequence that permits both racers to observe the same free
capacity is not acceptable.

## 12. PENDING capacity semantics

Whether `PENDING` holds scheduling capacity is a canonical
workspace/service-policy decision.

BD-03 does not globally assume either:

- every PENDING Appointment holds capacity; or
- no PENDING Appointment holds capacity.

The configured behavior must be:

- deterministic;
- backend-enforced;
- concurrency-safe.

If the policy allows PENDING to hold capacity, the hold's expiry/release
semantics must also come from canonical policy.

Implementation must not invent a 15-minute, 30-minute, end-of-day, or other
hold lifetime.

Expiry and capacity release must preserve scheduling consistency atomically.

Where this policy is required but absent, the affected flow must fail closed.

## 13. Arrival and check-in

Arrival/check-in belongs to the scheduling workflow.

The exact canonical public status naming must follow the existing contract.

Implementation must not invent multiple equivalent public statuses merely
because external standards provide both concepts.

Check-in requires all applicable:

- explicit check-in authority;
- role ceiling;
- resource authorization;
- valid Appointment transition;
- optimistic concurrency;
- canonical time-window policy.

## 14. Check-in window

Check-in timing is defined by canonical workspace/service configuration.

BD-03 does not hard-code a +/-15, +/-30, +/-60 minute window.

If no applicable check-in window policy is defined, implementation must not
guess one.

## 15. Clinical start and scheduling handoff

CHECKED_IN does not transition to `Appointment.IN_PROGRESS`.

When clinical service actually begins:

- Encounter becomes the source of clinical-care lifecycle;
- Encounter may enter its canonical in-progress state;
- Appointment reaches `FULFILLED` at the canonical scheduling-to-clinical
  handoff point.

The exact relationship between:

- clinical service start;
- Encounter start;
- Appointment FULFILLED transition;

must be finalized consistently with BD-04.

Until the canonical handoff is defined sufficiently, implementation must not
invent the transition.

## 16. Clinical completion

Appointment has no generic clinical `COMPLETED` state under BD-03.

Clinical completion belongs to Encounter and BD-04.

Appointment fulfills its scheduling purpose through the canonical FULFILLED
handoff.

This prevents Appointment and Encounter from becoming competing sources of
clinical status.

## 17. Durable Doctor-Patient relationship

Booking alone does not create a durable Doctor-Patient relationship.

The following alone are insufficient:

- PENDING Appointment;
- confirmed/booked Appointment;
- arrival;
- check-in.

A durable Doctor-Patient care relationship may be created only when the
canonical clinical-start / Encounter-start handoff actually establishes that
clinical care has begun.

The exact technical handoff must remain consistent with BD-04.

An Appointment cancelled before clinical service begins does not create a
durable Doctor-Patient relationship.

This closes the corresponding deferred rule in BD-01 at the policy level:

booking/check-in alone
!= durable Doctor-Patient relationship.

## 18. Nurse temporary Appointment access

Appointment-based temporary Nurse access requires all applicable:

- Nurse explicitly attached to the relevant workflow;
- Appointment is in a state permitted by canonical policy;
- applicable explicit grant;
- applicable role ceiling;
- required Patient/resource authorization.

Temporary access must not be inferred merely because the Nurse:

- is in the same workspace;
- is in the same department;
- can see the Appointment;
- has previously participated in an unrelated workflow.

Explicit Nurse participation in an Appointment:

!= durable Nurse assignment.

Temporary Appointment access ends when:

- the applicable participation/workflow ends; or
- access is explicitly revoked;

according to canonical workflow semantics.

BD-03 does not hard-code a 24-hour or end-of-day expiry.

When the workflow transitions into Encounter-based clinical participation,
continued temporary clinical access becomes a BD-04 concern.

## 19. Rescheduling

Reschedule modifies the existing Appointment.

It must not ordinarily:

- delete the existing Appointment;
- create a replacement identity;
- discard prior scheduling history.

Rescheduling preserves:

- Appointment identity;
- scheduling history;
- version history;
- audit history.

Reschedule requires all applicable:

- authorization;
- valid state;
- optimistic concurrency;
- Patient eligibility re-check;
- Doctor conflict re-check;
- Patient conflict re-check;
- resource/capacity re-check;
- service/duration validation.

A stale ETag/version must not silently overwrite a newer scheduling change.

Old and new scheduling values must remain auditable.

## 20. Rescheduling after check-in

An Appointment that has already reached the canonical checked-in state must not
be generically rescheduled by simply changing its time.

If the visit cannot proceed:

- use the applicable controlled cancellation/exception workflow;
- preserve the original Appointment history;
- create a new Appointment later if the authorized workflow requires one.

## 21. Cancellation cutoff

Cancellation cutoff is canonical workspace/service policy.

BD-03 does not hard-code a universal 24-hour, 2-hour, or other cutoff.

Cutoff enforcement belongs on the server.

If the workflow requires a cutoff but no canonical policy defines it,
implementation must not invent one.

## 22. Cancellation reason

Whether an ordinary cancellation requires a reason is determined by canonical
cancellation policy.

BD-03 does not universally mandate a reason for every ordinary cancellation.

However, where a canonical policy requires a reason, it must be enforced.

Override or other sensitive cancellation workflows may require reasons under
their canonical policy.

Implementation must not invent such rules merely because audit would benefit
from them.

## 23. Cancellation after check-in

A checked-in Appointment is not always impossible to cancel.

If the Patient is checked in but the Encounter/clinical service has not begun,
a controlled cancellation workflow may be used when permitted.

Such cancellation requires all applicable:

- explicit authority;
- valid state;
- canonical cancellation policy;
- reason when required by that policy;
- optimistic concurrency;
- audit;
- atomic release of applicable scheduling resources.

If clinical service/Encounter is already in progress:

- Appointment must not be generically cancelled;
- clinical termination/discontinuation belongs to BD-04.

## 24. Cancellation and NO_SHOW terminal behavior

`CANCELLED` and `NO_SHOW` are terminal for ordinary/generic Appointment update.

They must not be changed directly back to confirmed/booked as though the
terminal event never occurred.

If a terminal status was entered incorrectly, the system may support a
controlled correction requiring:

- authorization;
- reason;
- preservation of history/provenance;
- audit;
- optimistic concurrency.

Correction is not ordinary reopen.

## 25. NO_SHOW

NO_SHOW means the Patient did not appear under the applicable scheduling policy.

NO_SHOW requires:

- the canonical grace/window to have elapsed;
- an authorized action;
- valid Appointment state;
- audit.

BD-03 does not hard-code a 15-minute, 30-minute, or end-of-day threshold.

BD-03 does not authorize automatic NO_SHOW unless an explicit canonical
automation policy defines that behavior.

## 26. FULFILLED / handoff

Appointment FULFILLED represents completion of the Appointment's scheduling
role and handoff into the clinical workflow.

The exact transition point must be coordinated with BD-04.

FULFILLED must not be interpreted as equivalent to clinical Encounter
completion.

The handoff must be auditable.

## 27. Terminal capacity release

When an Appointment transition makes its scheduling capacity no longer
applicable, that capacity state must be updated within the same consistency
boundary as the state transition.

For applicable future scheduling capacity:

CANCELLED / NO_SHOW
+
capacity release
-> atomic consistency boundary

Background cleanup must not be the primary correctness mechanism for releasing
capacity after a terminal transition.

## 28. Command idempotency

The following command-like Appointment mutations require idempotency:

- create;
- confirm;
- reschedule;
- check-in;
- cancel;
- no-show;
- controlled correction.

At minimum:

same operation identity + same logical intent
-> same logical result / no duplicate transition

same operation identity + materially different intent
-> reject/conflict

Idempotency does not replace optimistic concurrency.

Optimistic concurrency does not replace idempotency.

## 29. Optimistic concurrency

State-changing Appointment operations must use the canonical optimistic
concurrency mechanism where applicable.

A stale version must not overwrite newer state.

Reschedule, confirm, check-in, cancellation, no-show, correction, and other
state-sensitive operations must preserve the applicable concurrency invariant.

## 30. Appointment audit

At minimum, audit must cover:

- create;
- confirm;
- reschedule;
- check-in;
- fulfilled/handoff;
- cancel;
- no-show;
- override;
- controlled correction.

Audit context must contain sufficient information for investigation, including
as applicable:

- actor;
- timestamp;
- workspace;
- Appointment;
- Patient;
- involved scheduling resource;
- old state;
- new state;
- result;
- reason when applicable;
- relevant authorization context;
- override context when applicable.

Database timestamps are not an audit trail.

Audit does not grant authority to perform an operation.

## 31. Availability privacy

Availability visibility is not permission to inspect the Appointments that
occupy a schedule.

An availability API may expose only information necessary for authorized
scheduling, such as:

- relevant free/busy state;
- usable capacity information;
- permitted service/resource availability.

Availability must not expose another Patient's:

- name;
- identity;
- Appointment reason;
- clinical information;
- sensitive Appointment details;

merely to explain why a slot is unavailable.

Normal BD-01 authorization and field-minimization rules continue to apply.

availability visibility
!= permission to inspect occupying Appointments.

## 32. Timezone and DST

Scheduling time must be represented deterministically.

The backend must not guess the timezone of an ambiguous local timestamp.

The scheduling model must use the canonical combination of:

- actual instant represented with appropriate offset/UTC semantics; and
- explicit scheduling timezone where required.

When a named scheduling timezone is needed, canonical IANA timezone semantics
must be used.

Ambiguous or nonexistent local times caused by DST must not be silently guessed.

The canonical validation/resolution policy must determine how such input is
handled.

If that policy is not yet defined for an ambiguous case, implementation must
fail validation rather than guess.

Android is not the authoritative timezone-resolution boundary.

## 33. Relationship with BD-01

BD-03 preserves BD-01.

In particular:

- role is not permission;
- Appointment access is not clinical access;
- booking does not create a durable Doctor relationship;
- check-in does not create a durable Doctor relationship;
- temporary Nurse Appointment access is not durable Nurse assignment;
- Admin role is not scheduling override authority;
- override is not authorization bypass;
- audit is not permission;
- field visibility is still separate from resource authorization;
- break-glass does not implicitly bypass ordinary scheduling policy.

Any break-glass scheduling behavior not explicitly defined by policy remains
unavailable rather than being guessed.

## 34. Relationship with BD-02

BD-03 preserves BD-02 Patient lifecycle.

Ordinary Appointment creation is unavailable for:

- inactive Patient;
- deceased Patient;
- archived Patient.

Patient reactivation/unarchive/correction must occur through the applicable
authorized Patient workflow rather than being hidden inside Appointment
creation.

MRN, duplicate detection, Patient merge, and Patient lifecycle rules are not
redefined by BD-03.

## 35. Relationship with BD-04

BD-04 owns the Encounter and clinical lifecycle.

BD-04 must finalize, consistently with this decision:

- the exact Encounter clinical-start transition;
- the exact Appointment FULFILLED handoff point;
- temporary Nurse access after clinical handoff;
- Encounter in-progress behavior;
- clinical completion;
- clinical discontinuation/termination after care has started.

Until those details are finalized, BD-03 must not invent Encounter lifecycle
semantics.

## 36. Unresolved canonical scheduling policies

BD-03 is final for the principles defined here.

The following remain configuration/contract gaps unless already defined by the
canonical contract:

- final public naming for confirmed/booked state;
- final public naming/semantics for arrival/check-in where applicable;
- service-specific duration rules;
- check-in windows;
- cancellation cutoffs;
- cancellation reason requirements;
- Doctor conflict override policy;
- resource/capacity override policy;
- PENDING capacity semantics;
- PENDING hold expiry/release policy if PENDING reserves capacity;
- required Appointment participants and acceptance semantics;
- exact scheduling-to-Encounter handoff point, coordinated with BD-04;
- exact handling policy for ambiguous/nonexistent DST-local input.

These gaps must not be filled with arbitrary constants or newly invented
statuses.

Where a missing rule is required to safely perform an operation, that operation
must fail closed.

## 37. Required implementation behavior

Implementation of BD-03 must:

- start new ordinary Appointments in PENDING;
- require a separate canonical confirmation transition;
- keep Appointment and Encounter lifecycles separate;
- prevent ordinary scheduling for ineligible Patients defined by BD-02;
- enforce explicit scheduling authority and role ceilings;
- enforce service/duration configuration;
- reject ordinary Patient overlap;
- reject Doctor conflict by default;
- allow conflict/capacity override only through explicit approved policy;
- never infer override authority from Admin role alone;
- treat availability as a snapshot, not a reservation;
- revalidate scheduling invariants during create/reschedule;
- enforce slot/capacity concurrency atomically;
- use canonical policy for PENDING capacity semantics;
- avoid invented PENDING hold expiry;
- preserve Appointment identity and history during reschedule;
- enforce optimistic concurrency;
- enforce mutation idempotency;
- keep check-in timing configurable;
- prevent generic reschedule after check-in;
- support controlled cancellation after check-in only before clinical start and
  according to policy;
- keep CANCELLED and NO_SHOW terminal for generic updates;
- preserve controlled correction history;
- avoid hard-coded NO_SHOW grace periods;
- release applicable capacity consistently with terminal transitions;
- prevent availability APIs from exposing unrelated Patient/Appointment data;
- handle timezone/DST deterministically;
- avoid granting durable Doctor relationship from booking/check-in alone;
- keep temporary Nurse Appointment access workflow-bound;
- audit scheduling mutations and overrides;
- preserve BD-01 and BD-02;
- defer clinical lifecycle to BD-04;
- default deny operations requiring unresolved policy.

## Core invariants

availability != reservation

PENDING capacity semantics = canonical policy

reschedule preserves Appointment identity/history

availability visibility != permission to inspect occupying Appointments

booking/check-in alone != durable Doctor-Patient relationship

temporary Nurse Appointment access != durable Nurse assignment

override != bypass authorization/concurrency/audit

Appointment lifecycle != Encounter clinical lifecycle
