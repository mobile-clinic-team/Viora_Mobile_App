# BD-02 - Patient Identity, Lifecycle, Mutation, and Record Safety

Status: FINAL / DECIDED
Date: 2026-09-20

## 1. Scope

BD-02 defines Patient identity, demographics, MRN behavior, duplicate handling,
record lifecycle, mutation safety, concurrency, audit, and merge principles.

BD-02 does not override BD-01 authorization.

Every Patient operation remains subject to all applicable:

- authenticated-session requirements;
- workspace/tenant isolation;
- explicit grants;
- role ceilings;
- resource authorization;
- relationship/assignment requirements;
- field-level read/update policy;
- audit requirements.

If an operation requires a business rule that remains unresolved, implementation
must fail closed rather than inventing the missing rule.

## 2. Patient creation - minimum data

A Patient requires:

- full name;
- date of birth;
- sex.

Phone and email are optional.

Contact information must not be made mandatory merely to satisfy an
implementation convenience.

## 3. Sex values

The approved Patient sex values are:

- `MALE`
- `FEMALE`
- `OTHER`
- `UNKNOWN`

Implementation must not add additional public values without an approved
contract change.

## 4. Initial record state

A newly created Patient record is active.

Patient state concepts must not be collapsed into one enum containing
`ACTIVE`, `INACTIVE`, `DECEASED`, and `ARCHIVED`.

The concepts are separate:

- `active` represents whether the Patient record is currently used in ordinary
  operational workflows;
- `deceased` / `deceasedAt` represents death information independently of
  `active`;
- archive / `archivedAt` represents record lifecycle separately from both
  `active` and deceased state.

Deceased does not replace active/inactive.

Archive is not a clinical state.

## 5. MRN ownership and creation

MRN is a business identifier and is scoped for uniqueness to the workspace.

Patient creation supports two business intents:

1. caller supplies an MRN; or
2. caller omits MRN and the backend owns MRN generation.

However, the canonical backend MRN allocation algorithm and format are not yet
defined.

Therefore:

- implementation must not invent a UUID-based MRN;
- implementation must not invent a random numeric format;
- implementation must not invent a prefix, sequence, regex, casing, or length;
- automatic MRN generation remains fail closed until the canonical allocation
  rule is defined.

This does not change the decision that the backend owns automatic generation
when MRN is omitted.

## 6. Manual MRN normalization and uniqueness

A manually supplied MRN must be:

- trimmed;
- canonically normalized according to the canonical contract;
- normalized according to the approved casing rule;
- validated against format and length requirements only when those rules are
  defined by the canonical contract;
- unique within the workspace using the canonical MRN representation.

Implementation must not invent MRN regex, casing, format, or length rules when
the canonical contract does not define them.

Inactive or archived Patient records do not release an MRN for reuse.

A duplicate MRN in the same workspace causes conflict.

The backend must not:

- silently choose another MRN;
- allow the duplicate because the other record is inactive or archived;
- automatically merge Patient records.

## 7. MRN mutation

After Patient creation, MRN may be changed only by a `CLINIC_ADMIN` with the
appropriate explicit authority.

Admin role alone is insufficient.

MRN mutation remains subject to:

- authorization;
- role ceiling;
- workspace uniqueness;
- optimistic concurrency;
- audit.

A Patient MRN change must not destroy the previous identifier history required
for traceability.

## 8. Full-name validation

Patient names must:

- be Unicode-capable;
- be trimmed;
- not be empty;
- not consist only of whitespace;
- respect a reasonable maximum length defined by the canonical contract.

BD-02 does not impose a hard minimum of two Unicode code points.

BD-02 does not require a Western-style first-name / last-name decomposition.

If the canonical contract does not define the exact maximum length,
implementation must not invent a new numeric limit solely for BD-02.

## 9. Date-of-birth validation

Date of birth must:

- be a valid calendar date;
- not be later than the current date.

BD-02 does not impose a hard-coded maximum age such as 120 years.

Unusually old dates may later trigger warning or verification behavior if an
approved policy defines that behavior, but must not be rejected solely because
an arbitrary maximum age was invented.

## 10. Duplicate candidate detection

`full name + date of birth` is a duplicate signal, not a unique Patient key.

Phone and email may also contribute duplicate signals.

Phone and email are not hard uniqueness constraints because legitimate Patients
may share contact information.

BD-02 does not define a scoring algorithm or matching-confidence formula unless
one already exists in the canonical contract.

Implementation must not invent one solely to satisfy this decision.

When a duplicate candidate is detected:

1. candidate information appropriate to the caller's authorization is surfaced;
2. the caller must explicitly confirm the intent to create a separate Patient;
3. the confirmation must be bound to the duplicate candidate/context being
   overridden;
4. the actor must be authorized;
5. the override/create decision must be audited.

Duplicate detection must not replace MRN uniqueness enforcement.

## 11. Duplicate override

A duplicate warning may be overridden by an appropriately authorized actor.

It is not restricted to `CLINIC_ADMIN` merely because it is an override; normal
grant, role-ceiling, resource, and workflow authorization apply.

Duplicate override does not bypass MRN uniqueness.

A duplicate override does not authorize Patient merge.

A duplicate override does not authorize fields or operations otherwise denied
by BD-01 or BD-02.

## 12. Demographic and contact updates

Demographic/contact mutation requires all applicable:

- explicit Patient update authority already defined by the contract;
- permission within an applicable role ceiling;
- resource authorization;
- field-level update policy;
- concurrency controls;
- audit where required.

Possession of `patient.update` does not mean every Patient field may be changed.

Field-level update policy remains authoritative.

## 13. Doctor demographic/contact updates

A Doctor may update allowed Patient demographic/contact fields only when all
applicable conditions are satisfied, including:

- explicit Patient update authority;
- Doctor role ceiling permitting that authority;
- valid Doctor-Patient care relationship;
- field-level update policy permitting that field;
- optimistic concurrency requirements.

Important identity-related changes must be auditable.

A care relationship does not itself grant unrestricted Patient mutation.

## 14. Active to inactive

Changing a Patient from active to inactive may be performed by:

- `CLINIC_ADMIN`; or
- `RECEPTIONIST`;

only when the caller has the explicit authority required by the canonical
contract and that authority is within the caller's role ceiling.

The transition must be audited.

Role name alone does not authorize the transition.

## 15. Inactive Patient scheduling

An inactive Patient cannot receive a new ordinary appointment.

To create a new appointment:

INACTIVE
-> authorized reactivation
-> ACTIVE
-> appointment creation

No generic appointment operation may silently reactivate the Patient.

## 16. Reactivation

Inactive-to-active reactivation may be performed by:

- `CLINIC_ADMIN`; or
- `RECEPTIONIST`;

only with the appropriate explicit authority within role ceiling.

Reactivation must be audited.

## 17. Deceased Patient scheduling

A Patient recorded as deceased cannot receive a new ordinary appointment.

There is no generic Admin or Doctor override for ordinary appointment creation.

If a post-mortem or other special workflow is required in the future, it must
be modeled as a separate explicitly approved workflow rather than disguised as
an ordinary appointment.

## 18. Recording deceased information

Deceased information may be recorded through either of the following authorized
paths.

### Doctor path

Requires:

- valid Doctor-Patient care relationship;
- appropriate explicit authority;
- appropriate supporting information/source;
- audit.

### CLINIC_ADMIN path

Requires:

- appropriate explicit authority;
- verified authoritative source or documentation;
- audit.

`CLINIC_ADMIN` must not make an independent clinical determination merely
because the user is an administrator.

BD-02 does not invent new public permission names for these operations.

If the current contract does not define the required authority sufficiently,
the operation remains unavailable until that authority is defined.

## 19. Deceased correction

Incorrect deceased information must be correctable.

Correction requires:

- appropriate authorization;
- preservation of the previous history;
- correction actor;
- timestamp;
- reason;
- audit.

The correction must not silently overwrite history as though the previous value
never existed.

## 20. Archive semantics

Archiving is a record-lifecycle operation.

An archived Patient:

- is hidden from ordinary/default operational lists and workflows;
- retains Patient data;
- retains clinical data;
- retains historical data;
- remains readable when the caller has appropriate authority;
- is blocked from ordinary business mutations that would create new activity.

Archive does not make historical errors impossible to correct.

Controlled correction or amendment remains possible when appropriately
authorized and audited.

Archive is not:

- inactive;
- deceased;
- delete.

Archive must not delete clinical data.

## 21. Archive authority

Archiving a Patient is restricted to `CLINIC_ADMIN` with the appropriate
explicit authority.

The operation must be audited.

Generic Patient update authority alone does not automatically imply archive
authority.

## 22. Unarchive authority

Unarchiving a Patient is restricted to `CLINIC_ADMIN` with the appropriate
explicit authority.

The operation must be audited.

Unarchive does not bypass any other Patient authorization rule.

## 23. No hard delete

Ordinary Patient lifecycle management does not hard-delete Patient records.

History and provenance must be retained.

Any future exceptional deletion/retention policy is outside BD-02 and must not
be invented by implementation.

## 24. Create idempotency

Patient creation must be idempotent at the API/business-operation level.

Retrying the same logical create request must not create a second Patient.

At minimum:

same idempotency identity + same logical request
-> same logical result

same idempotency identity + materially different request
-> reject/conflict

The existing idempotency contract and canonical error behavior should be reused.

BD-02 does not authorize weakening existing idempotency protections.

## 25. Three independent duplicate protections

The following controls are independent:

1. idempotency;
2. duplicate detection;
3. MRN uniqueness.

They solve different problems.

idempotency != duplicate detection
duplicate detection != MRN uniqueness
idempotency != MRN uniqueness

Passing one control does not bypass another.

Examples:

- a new idempotency key does not authorize reuse of an existing MRN;
- a duplicate-warning override does not authorize a duplicate MRN;
- MRN uniqueness does not prove two records are not the same human;
- idempotent replay does not replace Patient matching.

## 26. Optimistic concurrency

Patient updates require optimistic concurrency using the canonical version/ETag
contract.

A mutation must operate against the expected current version.

A stale version must be rejected.

BD-02 does not permit last-write-wins behavior for Patient mutation.

The existing strong ETag / `If-Match` conventions should be reused where
applicable.

## 27. Mutation audit

At minimum, the following Patient operations must be audited:

- Patient create;
- identity changes;
- demographic changes;
- contact changes;
- MRN changes;
- active-to-inactive transition;
- inactive-to-active transition;
- recording deceased information;
- correction of deceased information;
- archive;
- unarchive;
- duplicate-warning override.

Audit records should contain sufficient investigation context, including as
applicable:

- actor;
- workspace;
- Patient;
- action;
- timestamp;
- authorization context;
- before/after reference or other suitable change reference;
- reason where the operation requires one;
- result.

Database `created_at` / `updated_at` timestamps are not a substitute for an
audit trail.

Audit logging must remain consistent with BD-01 and must not unnecessarily copy
plaintext sensitive clinical content.

## 28. No automatic Patient merge

Duplicate confidence, however high, does not authorize automatic Patient merge.

Patient merge must be a separate workflow with its own approved policy.

A future merge requires at least:

- explicit workflow;
- authorization;
- human or otherwise approved verification policy;
- concurrency protection;
- audit;
- provenance preservation.

BD-02 does not enable merge merely because duplicate candidates were detected.

## 29. Future merge provenance

If Patient merge is implemented later, it must preserve provenance.

The future policy must preserve concepts equivalent to:

- surviving Patient identity;
- subsumed/source Patient identity;
- merge history;
- provenance;
- reference/redirect semantics.

The source Patient must not simply be hard-deleted.

Clinical information must not be copied into a survivor and then have the
source silently destroyed.

The exact public merge API, statuses, reference semantics, and permissions are
not defined by BD-02 unless already defined elsewhere.

Until such a merge contract exists, merge remains unavailable.

## 30. Automatic MRN allocation gap

The business decision is final:

MRN provided
-> validate/manual path

MRN omitted
-> backend owns generation

The allocation algorithm itself remains unresolved.

Therefore automatic generation cannot be implemented by guessing.

Until a canonical allocator is approved:

MRN omitted
-> automatic-allocation path remains fail closed

This is a known contract gap, not authorization for the client to invent an MRN
format.

## 31. Relationship with BD-01

BD-02 does not weaken BD-01.

In particular:

- role is not permission;
- grant is not unrestricted field-update authority;
- field policy remains applicable;
- Doctor mutation still requires care relationship where specified;
- Receptionist authority remains minimum necessary;
- Admin role does not create clinical authority;
- break-glass is not ordinary Patient mutation authority;
- audit is not permission.

Break-glass must not be used to bypass Patient registration, MRN uniqueness,
duplicate controls, archive policy, or ordinary lifecycle mutation rules unless
a later explicit emergency policy authorizes a specific operation.

## 32. Relationship with BD-03 and BD-04

BD-03 must honor these Patient eligibility rules for scheduling, including:

- inactive Patient cannot receive new ordinary appointment until authorized
  reactivation;
- deceased Patient cannot receive ordinary new appointment;
- archived Patient cannot receive ordinary new business activity.

BD-04 must preserve controlled correction/amendment ability and historical
traceability where clinical records relate to Patient corrections.

Neither BD-03 nor BD-04 may silently redefine the Patient lifecycle established
here.

## 33. Unresolved decisions

BD-02 is final for the principles defined in this document.

The following remain unresolved unless an existing canonical contract already
defines them:

- exact backend-generated MRN allocation format and algorithm;
- exact MRN normalization/casing/length/format rules where not already defined;
- exact full-name maximum length where not already defined;
- duplicate-matching scoring or confidence algorithm;
- public Patient merge workflow and its exact permissions/statuses/API;
- any exceptional retention/deletion workflow;
- any post-mortem workflow.

An unresolved item must not be guessed.

Where an unresolved item is required for a mutation, the affected path must fail
closed.

## 34. Required implementation behavior

Implementation of BD-02 must:

- require full name, DOB, and sex for Patient creation;
- keep phone/email optional;
- use the approved sex values;
- keep active, deceased, and archive concepts separate;
- maintain workspace-scoped MRN uniqueness;
- permit manual MRN according to canonical normalization rules;
- keep backend-generated MRN unavailable until the allocator contract is
  defined;
- never reuse MRNs merely because a record is inactive or archived;
- detect duplicate candidates without treating name+DOB, phone, or email as
  unique identifiers;
- require explicit authorized confirmation for duplicate override;
- bind duplicate override to the relevant candidate/context;
- audit duplicate override;
- preserve field-level update authorization;
- require Doctor care relationship for Doctor Patient updates where defined;
- audit lifecycle and important identity changes;
- prevent ordinary appointment creation for inactive, deceased, or archived
  Patients as defined above;
- preserve deceased correction history;
- keep archive distinct from deletion and inactive state;
- permit controlled corrections to archived records when properly authorized;
- prohibit hard delete through ordinary Patient lifecycle operations;
- enforce create idempotency;
- enforce optimistic concurrency for Patient updates;
- never auto-merge duplicate Patients;
- preserve provenance if a future merge workflow is approved;
- preserve BD-01 authorization and audit rules;
- default deny any operation requiring an unresolved contract detail.

## Changes locked by BD-02

1. Defined Patient creation minimum fields and separate Patient state concepts.
2. Defined workspace-scoped MRN behavior while leaving the allocator format
   explicitly unresolved.
3. Defined duplicate detection and explicit override behavior.
4. Defined field-level Patient update authorization.
5. Defined inactive/reactivation behavior and scheduling restrictions.
6. Defined deceased recording and correction behavior.
7. Defined archive/unarchive semantics without hard deletion.
8. Required Patient-create idempotency and optimistic concurrency for updates.
9. Expanded Patient mutation audit requirements.
10. Prohibited automatic Patient merge and required provenance preservation for
    any future merge workflow.
11. Established that idempotency, duplicate detection, and MRN uniqueness are
    independent controls.