# BD-01 - Authorization, Relationships, and Field Visibility

Status: FINAL / DECIDED
Date: 2026-09-20

## 1. Authorization model

Authorization is not derived from a role name alone.

Normal access requires all applicable checks:

1. authenticated session;
2. active workspace membership;
3. current permission revision;
4. explicit permission in `membership_grants`;
5. the permission must be within the ceiling of at least one active role held by the member;
6. resource relationship or assignment checks where required;
7. field-level response projection.

Roles define permission ceilings. A role does not automatically grant every permission within that ceiling.

A stored grant outside every applicable role ceiling does not confer authority.

A user with multiple roles receives the union of the applicable role ceilings, but explicit grants, resource relationships, assignments, and field-level rules still apply.

If authorization cannot be established with certainty, fail closed.

Field visibility is not a substitute for resource authorization.

Possession of an allowed field classification does not authorize access to a resource that the caller is otherwise not allowed to read.

### Emergency / break-glass access

Emergency or break-glass access is a separate exceptional authorization path.

Normal access and break-glass access are not equivalent.

Break-glass must not bypass the entire authorization model unconditionally.

Break-glass access requires, at minimum:

- an authenticated session;
- an active workspace membership;
- explicit break-glass authority allowed by the caller's applicable role ceiling;
- a mandatory emergency reason;
- use only for appropriate clinical access;
- scope restricted to the Patient or resource required for the emergency;
- time-limited or workflow-bound access;
- full audit;
- support for post-event review.

If any required break-glass condition cannot be established, access must fail closed.

Break-glass does not grant unrelated administrative or clinical permissions.

Break-glass does not automatically create a durable Doctor-Patient relationship or Nurse-Patient assignment.

A durable relationship or assignment may be created only by another workflow that explicitly authorizes that state change.

The exact emergency workflow transitions, lifetime, and operational states are not defined by BD-01 unless already established by an existing contract.

Until such details are defined by the appropriate later decision or existing contract, implementation must not invent them.

## 2. CLINIC_ADMIN

A CLINIC_ADMIN with the required explicit grant may read patient demographic and contact information across the workspace.

CLINIC_ADMIN does not receive clinical access merely because the user is an administrator.

Clinical access requires an applicable clinical role, explicit grant, and all normal resource-relationship checks.

CLINIC_ADMIN also does not receive emergency or break-glass clinical authority merely because the user is an administrator.

Break-glass requires separate explicit authority and all applicable break-glass conditions defined by this decision.

A CLINIC_ADMIN may not self-grant clinical authority.

A CLINIC_ADMIN may manage another member's permissions only when the administrator has the explicit permission required to manage access.

An administrator may not grant a permission that exceeds every role ceiling applicable to the target member.

Admin role is not equivalent to clinical access.

Admin role is not equivalent to break-glass authority.

## 3. DOCTOR

A DOCTOR may normally read a patient only when:

- the required explicit grant is present; and
- a valid Doctor-Patient care relationship exists.

An explicit patient-read grant alone does not bypass the care-relationship requirement.

If the care relationship is revoked, the Doctor must no longer be able to read that patient through the normal authorization path on subsequent requests.

When normal resource access is valid, a Doctor may receive the patient fields allowed by the field-visibility policy, including clinical fields allowed by this decision.

A Doctor without the required normal relationship may use break-glass only when all emergency authorization requirements are independently satisfied.

Break-glass access must not be treated as proof of a durable care relationship.

## 4. Doctor-Patient care relationships

A qualifying appointment or encounter may automatically create a durable Doctor-Patient care relationship.

Once created, the relationship:

- does not expire merely because time passes;
- does not expire merely because the originating appointment or encounter finishes;
- has no fixed TTL under BD-01;
- remains valid until explicitly revoked.

The relationship must be persisted explicitly and scoped to the correct tenant/workspace.

Manual creation or revocation of a Doctor-Patient relationship is allowed only to a CLINIC_ADMIN with the explicit permission required to manage relationships.

The exact appointment lifecycle transition that qualifies for automatic relationship creation belongs to BD-03.

The exact encounter lifecycle transition that qualifies for automatic relationship creation belongs to BD-04.

Until BD-03 and BD-04 define those transitions, implementation must not invent qualifying statuses.

### Relationship access review

Durable Doctor-Patient relationships must support periodic access review or stale-access review.

The purpose of the review is to identify relationships that remain technically active but may no longer be operationally appropriate.

A review finding must not automatically revoke a relationship unless an approved policy explicitly defines automatic revocation behavior.

Until such a policy exists, review must surface the access for human or authorized workflow review while leaving explicit revocation as the mechanism that removes the relationship.

Break-glass usage must not itself create or extend a durable Doctor-Patient relationship.

## 5. NURSE

A NURSE with the required patient-read grant may normally read patient demographic information allowed by the field-visibility policy.

Clinical access additionally requires:

- a valid explicit durable Nurse-Patient assignment; or
- a valid temporary workflow relationship when such temporary access is permitted by the relevant appointment or encounter policy.

A durable Nurse assignment must be created explicitly in the backend.

Participation in an appointment or encounter must not automatically become a permanent Nurse assignment.

A Nurse assignment alone does not grant approval or finalization authority.

A Nurse without a normal assignment or temporary workflow relationship may use break-glass clinical access only when all emergency authorization requirements are independently satisfied.

Break-glass access must not automatically create or extend a durable Nurse assignment.

## 6. Nurse assignment management

A durable Nurse-Patient assignment may be created or revoked by:

- a CLINIC_ADMIN with the explicit permission required to manage assignments; or
- the Doctor responsible for the patient when that Doctor has the explicit permission required to manage the assignment.

A Nurse must not be able to self-assign merely because the Nurse already has workspace or clinical access.

The exact definition of temporary appointment participation belongs to BD-03.

The exact definition of temporary encounter participation belongs to BD-04.

Until those decisions define active workflow participation, temporary clinical access must fail closed.

### Assignment access review

Durable Nurse-Patient assignments must support periodic access review or stale-access review.

The purpose of the review is to detect assignments that remain active but may no longer be appropriate.

A review finding must not automatically revoke an assignment unless an approved policy explicitly defines automatic revocation behavior.

Until such a policy exists, explicit revocation remains the mechanism that removes a durable assignment.

## 7. RECEPTIONIST

Receptionist access follows the minimum-necessary principle.

A RECEPTIONIST does not receive access to information merely because the information belongs to a Patient.

Receptionist access requires all applicable conditions:

- an appropriate explicit grant;
- valid resource access;
- field policy permitting the information for the administrative or scheduling workflow.

A RECEPTIONIST may access demographic, contact, MRN, emergency-contact, and scheduling information only to the extent necessary for a legitimate administrative or scheduling workflow.

Emergency-contact information is not a general clinical entitlement for Receptionist.

A RECEPTIONIST may access emergency-contact information only when the authorized administrative workflow legitimately requires that information.

### Appointment reason

A RECEPTIONIST may see appointment-reason information only when:

- the caller is otherwise authorized to read the appointment; and
- the information is scheduling-safe or administrative in nature; and
- disclosure is necessary for the authorized workflow.

Receptionist access to an appointment reason must not be interpreted as authority to view arbitrary clinical content stored in, attached to, or represented as a reason.

The following must not be exposed to RECEPTIONIST through receptionist authority:

- clinical records;
- detailed clinical notes;
- sensitive clinical details;
- sensitive appointment notes;
- sensitive clinical content contained in an appointment reason.

If the current schema does not distinguish scheduling-safe administrative content from sensitive clinical content sufficiently to enforce this rule, the sensitive or ambiguous content must default to hidden.

BD-01 does not require inventing a new public field or permission solely to represent this distinction.

Receptionist scheduling access is not clinical access.

## 8. Field visibility

Field visibility is enforced by the backend response projection.

Resource-level authorization must succeed before field-level visibility is considered, except when a separately valid break-glass authorization path explicitly permits the resource access.

Field visibility does not independently establish resource authorization.

### MRN

MRN may be visible to:

- CLINIC_ADMIN
- DOCTOR
- NURSE
- RECEPTIONIST

The normal resource-access requirements still apply.

For RECEPTIONIST, access is additionally limited by the minimum-necessary administrative or scheduling purpose.

### Demographic and contact information

The following may be visible to all four roles when resource access is valid:

- date of birth;
- sex;
- phone;
- email;
- address.

For RECEPTIONIST, only information necessary for the authorized administrative or scheduling workflow should be projected.

### Emergency contact

Emergency-contact information may be visible to all four roles when resource access is valid.

For RECEPTIONIST, emergency-contact information may be projected only when required by a legitimate authorized administrative workflow.

This does not establish clinical access.

### Diagnosis, symptoms, and treatment plan

Under normal authorization, these may be visible to:

- DOCTOR with a valid care relationship;
- NURSE with a valid assignment or otherwise valid temporary clinical relationship.

They are not exposed through CLINIC_ADMIN or RECEPTIONIST authority alone.

A valid break-glass authorization may permit appropriate clinical access to the required Patient/resource within the narrow emergency scope.

### Detailed clinical notes

Under normal authorization, these may be visible to:

- DOCTOR with a valid care relationship;
- NURSE with a valid assignment or otherwise valid temporary clinical relationship.

They are not exposed through CLINIC_ADMIN or RECEPTIONIST authority alone.

A valid break-glass authorization may permit appropriate clinical access to the required Patient/resource within the narrow emergency scope.

### Appointment reason

Appointment-reason visibility is subject to appointment authorization and minimum-necessary field policy.

RECEPTIONIST may receive only scheduling-safe or administrative appointment-reason information required for the authorized workflow.

Sensitive clinical details, sensitive appointment notes, and clinical content embedded in a reason must not be exposed through receptionist authority.

If the system cannot reliably distinguish safe administrative content from sensitive clinical content, the ambiguous content must default to hidden.

## 9. Response projection

A field that the caller is not allowed to read must be omitted entirely from the API response.

The backend must not:

- return the forbidden field as `null`;
- return `"REDACTED"`;
- send the forbidden value to Android and rely on the UI to hide it.

Android UI hiding is not an authorization boundary.

A newly introduced field whose sensitivity or visibility has not yet been classified must default to hidden.

Break-glass authorization does not disable field-level projection globally.

Only fields required by the valid emergency scope may be exposed.

## 10. Emergency / break-glass controls

Break-glass is an exceptional access mechanism and must remain distinguishable from normal relationship-based authorization.

At minimum, a valid break-glass access must establish:

- authenticated actor identity;
- active workspace context;
- explicit break-glass authority;
- appropriate clinical use;
- mandatory emergency reason;
- target Patient or resource scope;
- time-limited or workflow-bound validity;
- authorization result;
- full audit;
- post-event review capability.

Break-glass must not:

- grant global workspace clinical access;
- grant CLINIC_ADMIN clinical access merely due to the Admin role;
- bypass role-ceiling controls without explicit approved authority;
- silently create a Doctor relationship;
- silently create a Nurse assignment;
- convert temporary emergency access into durable access;
- authorize unrelated resources;
- act as approval or finalization authority merely because emergency access was granted.

Any emergency workflow transition, expiry rule, or state not defined by an existing contract remains undecided.

Such unresolved behavior must default to deny rather than being invented during implementation.

## 11. Permission, relationship, and assignment revocation

Permission, Doctor relationship, and Nurse assignment revocations apply to subsequent requests immediately.

The system must not wait for logout before enforcing revoked authority.

Existing permission-revision and context-stale behavior must be preserved for grant-context changes.

Revocation of normal access does not itself create eligibility for break-glass.

Break-glass must independently satisfy its own authorization requirements.

Relationship and assignment review mechanisms must not be treated as automatic revocation mechanisms unless an approved later policy explicitly establishes such behavior.

## 12. Access administration

Roles define ceilings; `membership_grants` remains the source of explicit granted permissions.

A CLINIC_ADMIN may grant or revoke permissions for another member only when the administrator has the explicit access-management authority required by policy.

A grant outside every applicable role ceiling of the target member must be rejected.

Unknown or unclassified permissions default to deny.

Break-glass authority must not be inferred merely from an existing administrative or clinical role.

If the current contract does not define how break-glass authority is represented, BD-01 does not invent a new public permission name.

Until such representation is defined, implementation must fail closed.

## 13. Audit

Audit is required for authorization-state changes and sensitive access events.

Audit is evidence and accountability; an audit event does not itself grant permission.

### Authorization-state changes

The following must be audited:

- grant permission;
- revoke permission;
- create Doctor-Patient relationship;
- revoke Doctor-Patient relationship;
- create Nurse-Patient assignment;
- revoke Nurse-Patient assignment.

### Sensitive and clinical access

At minimum, the following must also be audited when supported or applicable:

- clinical-record read/access;
- clinical-record create/update when the operation is otherwise authorized and falls within the implemented scope;
- export of clinical data if the system supports export;
- download of clinical data if the system supports download;
- printing of clinical data if the system supports printing;
- break-glass access;
- failed or denied sensitive-access attempts;
- permission changes;
- relationship changes;
- assignment changes.

This audit requirement does not authorize a clinical mutation, export, download, print, or other operation that is otherwise blocked by another policy.

### Audit context

Audit records must contain sufficient context for investigation, including as applicable:

- actor;
- workspace;
- action;
- target resource and/or Patient;
- timestamp;
- relevant authorization context;
- allow/deny or equivalent result;
- break-glass reason when break-glass is used.

Audit logging should capture identifiers, decision context, and security-relevant metadata rather than unnecessary clinical content.

Plaintext sensitive clinical content must not be written into audit logs unless there is a separately established requirement demonstrating that the content itself is necessary.

### Break-glass review

Break-glass events must be identifiable for post-event review.

The system must support determining who used break-glass, for which Patient/resource, why it was invoked, when it occurred, and whether access was allowed or denied.

The exact organizational review workflow is not defined by BD-01 unless already established elsewhere.

Lack of a defined review workflow must not cause implementation to invent new clinical or administrative roles, statuses, or approval transitions.

## 14. Clinical and AI approval

A Nurse does not receive clinical or AI approval/finalization authority merely because the Nurse has a valid assignment.

A Doctor does not receive unrelated approval authority merely because the Doctor has a care relationship.

Break-glass access does not itself confer clinical finalization, clinical approval, or AI approval authority.

Approval or finalization requires all applicable conditions, including:

- explicit permission;
- applicable role ceiling;
- valid resource relationship or assignment where required;
- workflow-specific policy.

Clinical finalization and approval semantics belong to BD-04.

AI approval semantics belong to BD-05.

Audit evidence of an action does not constitute permission to perform that action.

## 15. Unresolved and deferred decisions

BD-01 is final for the authorization principles defined in this document.

The following lifecycle details remain intentionally delegated:

- BD-03: appointment transition that creates a durable Doctor relationship;
- BD-03: appointment states that permit temporary Nurse access;
- BD-04: encounter transition that creates a durable Doctor relationship;
- BD-04: encounter states that permit temporary Nurse access;
- BD-04: clinical approval and finalization rules;
- BD-05: AI approval rules.

The following break-glass implementation details remain undecided unless already defined by an existing canonical contract:

- the concrete representation of explicit break-glass authority;
- exact emergency workflow transitions;
- exact emergency-access lifetime or workflow termination rule;
- any additional emergency workflow state;
- the operational process used for post-event review.

These deferred or unresolved details do not authorize guessed permission names, roles, statuses, transitions, or lifecycle rules.

Where an unresolved detail is required to authorize access, default deny.

Where the schema cannot reliably distinguish scheduling-safe administrative appointment information from sensitive clinical appointment information, the ambiguous content must default to hidden from RECEPTIONIST.

## 16. Required implementation behavior

Implementation of BD-01 must:

- preserve explicit `membership_grants`;
- enforce role ceilings without treating roles as automatic grants;
- enforce Doctor care relationships server-side for normal access;
- enforce Nurse assignments server-side for normal access;
- keep break-glass authorization separate from normal relationship-based authorization;
- require explicit break-glass authority rather than inferring it from Admin or clinical role alone;
- require an emergency reason for break-glass;
- scope break-glass access narrowly to the required Patient/resource;
- keep break-glass temporary or workflow-bound once the necessary lifecycle contract exists;
- ensure break-glass does not create durable Doctor relationships or Nurse assignments by itself;
- support post-event review of break-glass activity;
- enforce field-level projection server-side;
- omit unauthorized fields entirely;
- apply minimum-necessary projection for RECEPTIONIST;
- prevent sensitive clinical appointment information from being exposed as ordinary scheduling reason data;
- prevent CLINIC_ADMIN self-escalation to clinical authority;
- prevent grants outside target role ceilings;
- preserve tenant/workspace isolation;
- preserve permission-revision checks;
- apply revocations on subsequent requests;
- support periodic or stale-access review for durable Doctor relationships and Nurse assignments;
- avoid automatically revoking relationships or assignments solely because a review marks them stale unless a later approved policy defines that behavior;
- audit grant, relationship, and assignment changes;
- audit sensitive clinical access where applicable;
- audit break-glass use;
- audit denied sensitive-access attempts;
- avoid unnecessary plaintext sensitive clinical content in audit logs;
- default deny unknown permissions, unknown fields, unresolved relationships, and unresolved break-glass behavior;
- keep BD-02, BD-03, BD-04, and BD-05 behavior fail closed where those decisions remain unresolved.

No Android-side hiding may substitute for backend authorization.

Normal access is not break-glass access.

Admin role is not clinical access.

Field visibility is not resource authorization.

Receptionist scheduling access is not clinical access.

Break-glass is not a durable Doctor relationship or Nurse assignment.

Audit is not permission.

## Changes from previous BD-01

1. Added emergency/break-glass authorization policy.
2. Tightened Receptionist access using minimum-necessary rules.
3. Expanded audit requirements for sensitive/clinical access.
4. Added periodic/stale relationship access review requirement.