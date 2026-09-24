# BD-04 - Encounter and Clinical Lifecycle Policy

Status: FINAL / DECIDED
Date: 2026-09-20

## 1. Scope

BD-04 defines:

- Encounter lifecycle;
- the canonical clinical-start boundary;
- Doctor and Nurse clinical participation;
- durable Doctor-Patient relationship creation;
- temporary Nurse clinical access;
- Encounter completion and discontinuation;
- clinical artifact authoring and lifecycle;
- finalization, approval, cosign, correction, amendment, and invalidation;
- clinical order/request separation of responsibilities;
- result correction and provenance;
- late entry/addendum behavior;
- clinical mutation concurrency and idempotency;
- clinical audit;
- break-glass mutation boundaries;
- the handoff boundary to BD-05 AI policy.

BD-04 does not override:

- BD-01 authorization, relationship, field visibility, break-glass, or audit policy;
- BD-02 Patient lifecycle and Patient mutation policy;
- BD-03 Appointment and scheduling policy.

BD-05 owns AI-specific generation, review, approval, and AI artifact policy.

If a required clinical rule is unresolved and no canonical contract already
defines it, implementation must fail closed rather than inventing it.

## 2. Appointment and Encounter remain separate

Appointment represents scheduling.

Encounter represents the actual healthcare interaction and clinical-care
lifecycle.

Appointment state must not be used as a substitute for Encounter clinical
state.

In particular:

- Appointment CHECKED_IN does not prove care started;
- opening a Patient record does not prove care started;
- Appointment must not contain a duplicate clinical IN_PROGRESS lifecycle;
- Encounter is the source of truth for actual clinical-care lifecycle.

## 3. Encounter pre-start state

An Encounter may exist before clinical service actually begins.

The canonical pre-start business state is PLANNED or the equivalent canonical
pre-start state defined by the domain contract.

A PLANNED Encounter:

- does not prove that clinical service has started;
- does not by itself create a durable Doctor-Patient relationship;
- does not by itself authorize unrestricted clinical access;
- remains subject to normal participation, grant, role-ceiling, resource, and
  field-level authorization.

If an external interoperability model uses a different canonical literal,
implementation must map deliberately rather than invent duplicate public states.

## 4. Encounter creation/initiation authorization

Creating or initiating an Encounter requires all applicable:

- authenticated session;
- active workspace context;
- explicit Encounter-create/initiate authority;
- authority within an applicable role ceiling;
- Patient/resource authorization;
- applicable participation or workflow relationship;
- valid Patient lifecycle state;
- valid clinical workflow.

Doctor or Nurse role alone does not grant Encounter-create authority.

CLINIC_ADMIN role alone does not grant clinical Encounter-create authority.

## 5. Canonical clinical-start boundary

The canonical event proving that clinical service has started is:

Encounter
PLANNED / canonical pre-start state
-> IN_PROGRESS

Encounter IN_PROGRESS is the clinical-start boundary.

The following are not equivalent to clinical start:

- Appointment booking;
- Appointment confirmation;
- Patient arrival;
- Appointment check-in;
- opening the Patient record;
- listing a Doctor on an Appointment or Encounter without qualifying
  participation.

## 6. Starting an Encounter

Transitioning an Encounter to IN_PROGRESS requires all applicable:

- explicit clinical-start authority;
- authority within an applicable role ceiling;
- valid Encounter participation;
- Patient/resource authorization;
- valid lifecycle transition;
- optimistic concurrency;
- audit.

Receptionist role does not imply clinical-start authority.

CLINIC_ADMIN role does not imply clinical-start authority.

A stale Encounter version must not be allowed to perform a clinical-start
transition over newer state.

## 7. Appointment-to-Encounter handoff

Encounter IN_PROGRESS establishes the canonical clinical-start boundary.

Appointment FULFILLED represents completion of the scheduling role and handoff
to the clinical workflow under BD-03.

The Appointment FULFILLED transition must be coordinated with the clinical-start
boundary.

Implementation must not:

- treat CHECKED_IN as IN_PROGRESS;
- leave Appointment as a competing source of clinical state;
- interpret FULFILLED as clinical completion.

If the existing canonical contract does not define the exact transactional
sequencing between Encounter IN_PROGRESS and Appointment FULFILLED, that
sequencing must not be invented.

The system must nevertheless preserve a deterministic, auditable handoff and
must not expose contradictory scheduling and clinical state.

## 8. Durable Doctor-Patient relationship creation

A durable Doctor-Patient relationship is not created by:

- Appointment PENDING;
- Appointment confirmed/booked;
- arrival;
- check-in;
- PLANNED Encounter;
- merely listing a Doctor reference.

A durable Doctor-Patient care relationship may be created when:

- Encounter transitions to IN_PROGRESS; and
- the Doctor is a canonical qualifying clinical participant for that Encounter.

This is the clinical-start condition deferred by BD-01 and BD-03.

The relationship remains workspace-scoped and subject to BD-01.

## 9. Qualifying Doctor participation

A Doctor reference alone is insufficient.

Doctor listed
!= qualifying Doctor participation

The Doctor must satisfy the canonical participation/responsibility policy for
the Encounter.

Implementation must not create durable clinical access merely because:

- an Admin entered the Doctor's name;
- the Doctor was attached to scheduling;
- the Doctor exists in the same workspace;
- the Doctor opened the Patient record.

If exact qualifying participant/responsibility semantics are not already
canonical, implementation must not invent them.

## 10. Durable relationship after Encounter completion

Encounter completion does not automatically revoke a durable Doctor-Patient
relationship.

Encounter COMPLETED
!= durable relationship revoked

Under BD-01, a durable Doctor relationship remains until explicit authorized
revocation.

Periodic or stale-access review may identify access that should be reviewed,
but review itself is not automatic revocation.

## 11. Nurse temporary clinical access

Temporary Nurse clinical access requires all applicable:

- Nurse explicitly attached to the Encounter or relevant clinical workflow;
- applicable explicit grant;
- authority within Nurse role ceiling;
- Patient/resource authorization;
- Encounter state permitted by canonical policy;
- required participation relationship.

The following are insufficient by themselves:

- same workspace;
- same department;
- Patient check-in;
- viewing the Patient record;
- previous participation in another workflow.

Temporary Encounter access
!= durable Nurse assignment

## 12. Ending Nurse temporary clinical access

Temporary Nurse clinical access ends according to the canonical participation
and workflow lifecycle, including as applicable:

- the Nurse's participation ends;
- the relevant clinical workflow ends;
- the Encounter reaches the applicable terminal state;
- access is explicitly revoked.

BD-04 does not hard-code a 24-hour, end-of-day, or other arbitrary expiration.

Temporary access must not silently become a durable Nurse assignment.

If durable access is still required, an explicit durable assignment workflow
under BD-01 must be used.

## 13. Encounter completion

Encounter completion represents completion of the Encounter/care-episode
lifecycle.

Completing an Encounter requires all applicable:

- explicit Encounter-completion authority;
- authority within an applicable role ceiling;
- valid clinical participation;
- valid Encounter transition;
- canonical completion preconditions;
- optimistic concurrency;
- audit.

Encounter must not be auto-completed merely because the scheduled Appointment
duration elapsed.

Receptionist role does not imply Encounter-completion authority.

CLINIC_ADMIN role alone does not imply Encounter-completion authority.

## 14. Encounter completion and clinical artifacts are separate

Encounter COMPLETED
!= automatically every clinical artifact FINAL

Encounter lifecycle and clinical artifact lifecycle are separate.

A canonical Encounter completion policy may require specific artifacts or
clinical preconditions to be satisfied before completion.

For example, canonical policy may reject completion when a required artifact is
missing or in an unacceptable state.

However, Encounter completion must not automatically:

- sign a clinical note;
- attest a document;
- finalize a result;
- approve an order;
- finalize an AI-generated draft;

unless an explicit canonical artifact policy specifically defines such behavior.

## 15. Encounter discontinuation

If an Encounter has started but care cannot be completed, the system must use
the canonical discontinuation/termination state rather than pretending the
Encounter completed.

Conceptually:

IN_PROGRESS
-> DISCONTINUED / canonical termination state

Discontinued
!= completed

Discontinuation must preserve:

- reason when required by policy;
- lifecycle history;
- provenance;
- audit.

The Encounter must not be hard-deleted or left indefinitely IN_PROGRESS merely
to avoid representing the termination.

## 16. Encounter termination authority

Encounter discontinuation/termination requires all applicable:

- explicit clinical-termination authority;
- authority within an applicable role ceiling;
- valid clinical participation;
- Patient/resource authorization;
- valid lifecycle transition;
- required reason/policy;
- optimistic concurrency;
- audit.

CLINIC_ADMIN role alone does not confer this authority.

Any Doctor in the workspace does not automatically have this authority.

## 17. Completed Encounter correction/reopen

A COMPLETED Encounter must not be generically changed back to IN_PROGRESS.

If completion was recorded incorrectly, any correction/reopen must use a
controlled workflow requiring all applicable:

- explicit authority;
- valid correction/reopen policy;
- reason;
- preservation of previous state/history;
- provenance;
- optimistic concurrency;
- audit.

Correction/reopen must not make the original completion event disappear.

## 18. Clinical artifact initial state

A newly authored clinical artifact begins in a DRAFT/internal pre-final state.

DRAFT here is a business-domain concept.

If interoperability mapping uses a standard such as FHIR and that standard uses
another canonical literal such as a preliminary/pre-final state, implementation
must use the approved mapping.

BD-04 must not invent external-standard status literals.

Clinical artifact lifecycle
!= Encounter lifecycle

## 19. Clinical artifact creation authorization

Creating a clinical note or other clinical artifact requires all applicable:

- explicit artifact/note-create authority;
- authority within an applicable role ceiling;
- Patient authorization;
- valid Encounter relationship or participation where required;
- artifact-specific policy;
- field-level policy.

Doctor or Nurse role alone does not authorize creation of every type of
clinical artifact.

Generic patient.update authority does not authorize clinical content mutation.

## 20. Clinical mutation authority

Diagnosis, symptoms, treatment plan, clinical notes, clinical results, and
other clinical content must use clinical-specific mutation authority.

patient.update
!= clinical mutation authority

Clinical mutation requires all applicable:

- clinical-specific permission;
- role ceiling;
- valid relationship or participation;
- Patient/resource authorization;
- artifact/field policy;
- lifecycle-state policy;
- concurrency controls;
- audit where required.

Administrative Patient mutation authority must not become an indirect route to
editing clinical content.

## 21. Clinical artifact finalization

Clinical artifact finalization requires all applicable:

- explicit finalization/approval authority;
- applicable professional requirements;
- valid relationship/participation;
- valid artifact state;
- artifact-specific policy;
- optimistic concurrency;
- audit.

Author
!= automatically finalizer

Being the author alone does not guarantee authority to finalize.

Being a Doctor elsewhere in the workspace does not guarantee authority to
finalize.

CLINIC_ADMIN role does not imply clinical finalization authority.

## 22. Nurse-authored artifacts and cosign

A Nurse-authored artifact is not automatically FINAL.

Whether a Nurse-authored artifact:

- may be self-finalized;
- requires review;
- requires cosign;
- requires another professional approval;

depends on the canonical policy for:

- artifact/document type;
- author/professional role;
- workflow;
- explicit finalization authority.

BD-04 does not impose either of these universal rules:

- every Nurse note must receive Doctor cosign;
- every Nurse note may always be finalized independently.

## 23. Cosign and approval policy

Cosign is not universally required.

Cosign/attestation requirements come from canonical artifact/professional
policy.

If self-attestation is allowed by policy, author and approver may be the same
person.

If independent approval is required, separation of duties must be enforced:

author
!= approver

for that workflow.

The system must not infer independent approval simply from a second timestamp or
audit record.

## 24. Finalization concurrency

Finalization requires optimistic concurrency.

Conceptually:

Finalize(version N)
-> succeeds only if the current version is still N

If the artifact has changed since the caller's version:

-> reject/conflict

The system must not finalize a stale representation over a newer clinical
change.

## 25. FINAL content is not an editable draft

FINAL
!= editable draft

Once a clinical artifact is FINAL, generic editing is prohibited.

Post-final changes must use the applicable controlled mechanism, such as:

- amendment;
- correction;
- addendum;
- canonical versioning workflow.

The original finalized history must remain traceable.

## 26. Amendment and correction

Amendment/correction must preserve the previous finalized version and
provenance.

Conceptually:

FINAL v1
-> controlled amendment/correction
-> linked v2/current corrected representation

The previous version must not be silently replaced or hard-deleted.

Amendment
!= overwrite

A correction/amendment requires all applicable:

- explicit authority;
- appropriate artifact state;
- reason when required;
- preserved previous version/history;
- provenance;
- actor;
- timestamp;
- optimistic concurrency;
- audit.

## 27. entered-in-error / canonical invalidation

If a clinical artifact was created against the wrong Patient, wrong Encounter,
or otherwise should not have existed as that record under canonical policy, it
must not be hard-deleted to hide the error.

Use:

entered-in-error / canonical invalidation state

with all applicable:

- reason;
- provenance/history;
- audit;
- preservation of original record identity.

The system must not edit Patient or Encounter references merely to conceal that
the artifact was entered against the wrong context.

## 28. Invalidation authority

Marking a clinical artifact entered-in-error or otherwise invalid requires all
applicable:

- explicit correction/invalidation authority;
- professional/participation requirements;
- Patient/resource authorization;
- reason;
- valid artifact state;
- optimistic concurrency;
- audit.

Authoring an artifact does not automatically grant unrestricted invalidation
authority for that artifact.

## 29. entered-in-error is not amendment

entered-in-error
!= amendment

Use amendment/correction when:

- the record legitimately belongs in the medical record; but
- its content needs correction.

Use entered-in-error/canonical invalidation when:

- the record itself should not have existed in that Patient/Encounter context
  under the canonical policy.

The two mechanisms must not be substituted for each other merely for
implementation convenience.

## 30. Clinical orders and requests

Creating/authorship of a clinical order or request does not automatically mean
that it is approved, authorized for execution, or performed.

order authored
!= order approved/executable

Order/request workflows must distinguish, according to canonical
order-specific policy:

- authoring/entry;
- proposal or planning where applicable;
- approval/authorization;
- execution/performance;
- completion/result linkage.

A Doctor authoring an order does not by itself bypass any required approval,
authorization, professional, or execution policy.

Encounter IN_PROGRESS does not by itself make every authored order executable.

## 31. FINAL result correction

A FINAL clinical result must not be directly overwritten.

If a final result requires change, use the applicable artifact-specific:

- correction;
- amendment;
- versioning;
- provenance;
- audit.

Corrected result
!= overwritten result

Previous final values must remain traceable according to authorization and
retention policy.

## 32. Corrected result consumption

For ordinary current-state consumption, the system should expose the canonical
current result according to authorization and artifact policy.

Authorized provenance/history workflows must retain the ability to inspect:

- previous version(s);
- correction relationship;
- actor;
- timestamp;
- reason where applicable.

Previous and corrected versions must not both be presented as independently
current when the canonical lifecycle identifies one current interpretation.

The old result must not be deleted merely because a corrected result exists.

## 33. Late entry and addendum

A late entry/addendum after Encounter completion is allowed only through a
controlled workflow.

It requires all applicable:

- explicit authority;
- artifact/workflow policy;
- actual recording/authoring time;
- relevant effective/event time where needed;
- author;
- reason or context where required;
- provenance;
- audit;
- optimistic concurrency where applicable.

Late entry
!= backdating

Encounter completion must not make legitimate controlled late documentation
impossible.

## 34. No false backdating

The system must preserve the actual time at which a clinical entry was authored
or recorded.

If an event occurred earlier than the documentation time, the model may record
both concepts separately when supported:

- effective/event time;
- actual recording/authoring time.

Implementation must not change the actual recording timestamp to make the entry
appear to have been documented earlier.

Doctor, Nurse, or Admin role does not authorize falsifying provenance
timestamps.

## 35. Clinical read/access audit

Sensitive clinical read/access events must be audited according to BD-01 and
the applicable canonical audit policy.

Clinical read audit may include, as applicable:

- actor;
- workspace;
- Patient;
- Encounter;
- resource/artifact;
- timestamp;
- authorization context;
- allow/deny result;
- break-glass context when applicable.

Audit event
!= permission

The existence of an audit trail does not make an otherwise unauthorized read
permitted.

## 36. Clinical artifact audit

At minimum, sensitive clinical artifact lifecycle actions must be auditable,
including as applicable:

- create;
- update while pre-final;
- finalize;
- approve;
- cosign/attest;
- amend;
- correct;
- append/addendum;
- entered-in-error/invalidate;
- void or equivalent canonical action;
- failed/denied sensitive mutation.

Audit context should include as applicable:

- actor;
- timestamp;
- workspace;
- Patient;
- Encounter;
- artifact;
- old state;
- new state;
- result;
- reason;
- authorization context;
- approval/cosign context.

Database created_at or updated_at values are not substitutes for an audit trail.

Audit does not authorize the underlying action.

## 37. Break-glass boundary

Break-glass clinical access does not automatically grant mutation or
finalization authority.

break-glass access
!= edit
!= finalize
!= approve
!= void

Only a specific operation explicitly permitted by an approved emergency policy
may be performed through that emergency path.

If an emergency mutation/finalization policy is not defined, the operation must
remain denied.

Break-glass must not silently bypass:

- role ceiling;
- professional requirements;
- artifact lifecycle;
- concurrency;
- provenance;
- audit.

## 38. Clinical mutation idempotency

Command-like Encounter and clinical-artifact mutations require idempotency
where replay could otherwise duplicate a state transition or action.

This includes applicable operations such as:

- Encounter start;
- Encounter completion;
- Encounter discontinuation;
- controlled Encounter correction/reopen;
- clinical artifact finalization;
- amendment/correction;
- invalidation;
- late-entry/addendum submission;
- approval/cosign where implemented as commands.

At minimum:

same operation identity + same logical intent
-> same logical result / no duplicate application

same operation identity + materially different intent
-> reject/conflict

idempotency
!= optimistic concurrency

Both controls remain necessary where applicable.

## 39. Optimistic concurrency

State-sensitive Encounter and clinical-artifact mutations must enforce the
canonical optimistic-concurrency contract.

A stale resource version must not overwrite newer clinical state.

Optimistic concurrency applies where applicable to:

- Encounter start;
- completion;
- discontinuation;
- controlled reopen/correction;
- artifact update;
- finalization;
- approval/cosign;
- amendment/correction;
- invalidation;
- result correction;
- late entry/addendum.

Idempotency does not make stale writes acceptable.

## 40. AI-generated clinical content

AI output may be recorded as a technical source, generating system, or
provenance agent where the canonical model permits it.

AI provenance/source
!= responsible clinical author/attester

Until BD-05 defines the human-review and approval workflow, AI must not be
treated as:

- responsible human clinical author;
- independent clinical approver;
- clinical attester;
- finalizer.

AI-generated content remains draft/advisory for clinical responsibility
purposes until the applicable human workflow authorizes otherwise.

AI confidence does not substitute for human authorization.

## 41. Encounter completion and AI

Encounter COMPLETED does not:

- approve AI output;
- finalize AI output;
- attest AI output;
- convert AI draft content into responsible human-authored clinical truth.

Encounter COMPLETED
!= AI approved
!= AI FINAL

AI review/approval is owned by BD-05.

Any AI approval workflow must independently enforce the applicable:

- explicit authority;
- relationship/participation;
- artifact state;
- concurrency;
- provenance;
- audit.

## 42. Relationship with BD-01

BD-04 preserves BD-01.

In particular:

- role is not permission;
- grant is not unrestricted clinical mutation authority;
- field visibility remains separate from resource authorization;
- durable Doctor relationship is created only through the qualifying
  clinical-start rule defined here;
- durable Doctor relationship persists until explicit revoke;
- Nurse temporary participation does not become durable assignment;
- audit is not permission;
- break-glass does not automatically grant clinical mutation/finalization;
- clinical finalization requires its own authority.

## 43. Relationship with BD-02

BD-04 does not redefine Patient lifecycle.

Patient identity, demographics, MRN, duplicate handling, active/inactive,
deceased, archive, correction, and Patient mutation rules remain governed by
BD-02.

Generic patient.update must not be used as clinical-record mutation authority.

Clinical corrections must preserve Patient and clinical provenance rather than
silently rewriting Patient history.

## 44. Relationship with BD-03

BD-04 preserves the Appointment/Encounter separation defined by BD-03.

Appointment is scheduling.

Encounter is clinical-care lifecycle.

Appointment CHECKED_IN does not mean Encounter IN_PROGRESS.

Encounter IN_PROGRESS is the canonical clinical-start boundary.

Appointment FULFILLED represents scheduling handoff and must remain
deterministically coordinated with the clinical-start boundary.

Encounter completion is not Appointment completion and is not equivalent to
Appointment FULFILLED.

## 45. Relationship with BD-05

BD-05 owns AI-specific rules including:

- AI generation;
- AI artifact lifecycle where different from ordinary clinical artifacts;
- human review;
- approval/rejection;
- AI-specific authorization;
- AI-specific audit/provenance;
- AI safety controls;
- whether and how approved AI content becomes part of clinical documentation.

BD-04 establishes only these boundaries:

- AI can be a technical source/provenance agent;
- AI is not automatically the responsible human clinical author;
- AI is not an independent approver/attester/finalizer;
- Encounter completion does not approve AI output;
- AI confidence does not replace authorization or human approval.

## 46. Unresolved canonical clinical policies

BD-04 is final for the principles defined in this document.

The following remain canonical configuration/contract gaps unless already
defined elsewhere:

- exact public literal for the Encounter pre-start state if not PLANNED;
- exact qualifying Doctor participation/responsibility semantics;
- exact transactional sequencing of Encounter IN_PROGRESS and Appointment
  FULFILLED if not already canonical;
- artifact-specific professional requirements;
- artifact-specific finalization rules;
- artifact-specific cosign/attestation requirements;
- workflows requiring independent approval;
- exact Encounter completion preconditions;
- exact artifact-specific amendment/correction states;
- exact invalidation state names where not already canonical;
- order/request-specific approval and execution policy;
- exact temporary Nurse participation termination semantics where not already
  canonical;
- any emergency mutation authority;
- AI review/approval rules delegated to BD-05.

These gaps must not be filled by arbitrary implementation choices.

Where a missing rule is required for a sensitive clinical operation, that
operation must fail closed.

## 47. Required implementation behavior

Implementation of BD-04 must:

- allow Encounter to exist in a pre-start state without treating care as begun;
- use Encounter IN_PROGRESS as the canonical clinical-start boundary;
- prevent Appointment CHECKED_IN from being interpreted as clinical start;
- require explicit authority for Encounter creation and start;
- create durable Doctor relationship only from qualifying Doctor participation
  at clinical start;
- avoid treating a mere Doctor reference as qualifying participation;
- preserve durable Doctor relationship after Encounter completion until
  explicit revoke;
- make Nurse clinical access explicit and workflow-bound;
- prevent temporary Nurse access from becoming durable assignment;
- require explicit authority and concurrency for Encounter completion;
- keep Encounter completion separate from clinical artifact finalization;
- use discontinuation rather than fake completion when care stops early;
- prohibit generic reopen of completed Encounters;
- start clinical artifacts in a pre-final/DRAFT business state;
- require clinical-specific mutation authority;
- prohibit patient.update from authorizing clinical mutation;
- enforce artifact-specific finalization and approval;
- avoid assuming authors can always finalize their own artifacts;
- apply cosign only when canonical policy requires it;
- preserve separation of duties when independent approval is required;
- enforce optimistic concurrency for finalization and other sensitive
  mutations;
- prohibit generic edits to FINAL artifacts;
- preserve prior finalized versions during amendment/correction;
- distinguish entered-in-error from amendment;
- prohibit hard deletion to conceal clinical-entry errors;
- distinguish order authoring from approval/execution;
- prohibit direct overwrite of FINAL results;
- preserve corrected-result history and provenance;
- support controlled late entry/addendum without false backdating;
- audit sensitive clinical reads and lifecycle mutations;
- preserve the rule that audit is not authorization;
- preserve break-glass mutation boundaries;
- enforce command idempotency where replay can duplicate sensitive actions;
- preserve the distinction between idempotency and optimistic concurrency;
- treat AI as technical source/provenance only unless BD-05 authorizes a human
  review path;
- prohibit Encounter completion from auto-approving AI output;
- preserve BD-01, BD-02, and BD-03;
- default deny operations requiring unresolved clinical policy.

## Core invariants

PLANNED Encounter != clinical service started

Encounter IN_PROGRESS = canonical clinical-start boundary

Doctor listed != qualifying Doctor participation

Encounter COMPLETED != automatically every clinical artifact FINAL

Clinical artifact lifecycle != Encounter lifecycle

Author != automatically finalizer

FINAL != editable draft

Amendment != overwrite

patient.update != clinical mutation authority

entered-in-error != amendment

discontinued != completed

order authored != order approved/executable

corrected result != overwritten result

idempotency != optimistic concurrency

cosign != universally required

late entry != backdating

Encounter COMPLETED != durable relationship revoked

break-glass access != mutation/finalization authority

AI provenance/source != responsible clinical author/attester