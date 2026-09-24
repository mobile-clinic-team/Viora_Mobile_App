# BD-05 - AI Governance, Human Review, and Clinical Safety Policy

Status: FINAL / DECIDED
Date: 2026-09-20

## 1. Scope

BD-05 defines the governance and safety boundary for AI-assisted workflows,
including:

- AI-generated clinical drafts and recommendations;
- human review and approval;
- authorization and data minimization;
- provider/model governance;
- model/version change control;
- provider data use and retention;
- provenance;
- logging and audit;
- regeneration/versioning;
- idempotency and optimistic concurrency;
- retrieval/RAG authorization;
- grounding and citations;
- prompt-injection boundaries;
- tool/action authorization;
- rejection and correction;
- failure and fallback behavior.

BD-05 preserves BD-01 through BD-04.

AI must not create a new authorization path around existing Patient,
Appointment, Encounter, clinical-artifact, or field-level policy.

If a required AI safety or governance dependency is unresolved, the affected
AI capability must fail closed rather than inventing policy.

Core non-AI workflows should remain available when they can continue safely
without AI.

## 2. AI-generated clinical content starts as draft/advisory

AI-generated clinical content begins as DRAFT/advisory content.

It is not approved clinical truth merely because generation succeeded.

AI confidence does not transform an output into FINAL or approved content.

AI confidence
!= clinical authority

## 3. AI identity and clinical responsibility

AI may be represented as:

- technical source;
- generating system;
- provenance agent.

AI must not be treated as:

- responsible human clinical author;
- independent clinical approver;
- clinical attester;
- finalizer.

AI source
!= responsible human author/finalizer

Technical provenance must not be confused with professional responsibility.

## 4. AI input authorization

AI may receive only data that the effective caller/workflow is authorized to
use for the requested AI task.

AI invocation must preserve:

- workspace isolation;
- resource authorization;
- role ceilings;
- explicit grants;
- relationship/participation rules;
- field-level visibility;
- workflow-specific authorization.

AI invocation
!= authorization bypass

## 5. AI data minimization

Even where the caller is authorized to access a broader Patient record, AI input
should be limited to the fields and context required for the approved AI task.

The system must not send the entire chart merely because additional context
might be useful.

This is a Viora safety/privacy architecture rule.

It must not be interpreted as a claim that one legal minimum-necessary rule
applies identically to every healthcare use case.

## 6. AI service credentials do not expand authority

Technical credentials used by an AI service, backend worker, provider adapter,
or other service component do not create broader clinical authority.

Conceptually:

effective AI data scope
<= authorized caller/workflow scope

AI service account
!= authorization bypass

A service account's technical database or API access must not be used to expose
Patient data that the originating authorized workflow could not obtain.

## 7. Human review and approval

AI-generated clinical content may become accepted/final clinical content only
through the applicable human review and approval workflow.

Approval requires all applicable:

- explicit AI/clinical approval authority;
- authority within role ceiling;
- professional requirements;
- valid Patient/Encounter relationship or participation;
- artifact-specific authority;
- valid artifact state;
- review of the exact output being approved;
- optimistic concurrency;
- provenance;
- audit.

AI confidence does not substitute for any of these requirements.

## 8. Who may approve AI-generated content

The approver must satisfy the canonical AI/clinical approval policy.

Approval is not granted merely because the caller is:

- any Doctor in the workspace;
- the user who initiated the prompt;
- CLINIC_ADMIN;
- the author of another related artifact.

Role name alone does not confer AI clinical approval authority.

## 9. Approval binds to the exact AI output/version

Human review and approval must bind to the exact AI artifact/version being
reviewed.

The implementation must use a canonical immutable version identifier, digest,
or equivalent version-binding mechanism.

Conceptually:

reviewedVersion = v7
approvedVersion = v7

Approval must not be applied to an unspecified or subsequently changed output.

## 10. Output change invalidates prior review for the new version

If AI content changes after review, the prior review/approval does not apply to
the changed version.

Example:

AI output v1
-> reviewed

regeneration or edit
-> AI output v2

approval(v1)
!= approval(v2)

reviewed version
!= any later version

The changed output must undergo the applicable review/approval process.

## 11. AI recommendations do not perform clinical mutations

AI generation or recommendation does not itself authorize a clinical action.

Examples:

AI suggests diagnosis
!= diagnosis changed

AI drafts order
!= executable order

AI drafts note
!= finalized note

AI recommendation
!= clinical mutation

Any resulting clinical mutation must use the applicable authorized server-side
workflow defined by BD-01 through BD-04.

## 12. AI failure and core workflow

When the AI provider/model is unavailable or generation fails:

- the AI capability must report the canonical unavailable/error behavior;
- it must not fabricate an output;
- it must not create a placeholder pretending to be a clinical result;
- it must not silently use an unapproved provider/model;
- core non-AI clinical workflow should continue when it can do so safely.

AI failure
!= permission to silently switch to an unapproved model/provider

## 13. Approved provider and model configuration

Clinical AI requests may use only provider and model/version combinations in
the canonical approved configuration.

An API being reachable does not make a model approved.

approved model
!= any available model

The Android client must not independently choose an unapproved provider/model.

## 14. Provider/model/version change control

A provider, model, or model-version change is not a harmless implementation
detail.

Changes must follow the canonical:

- change-control process;
- approval process;
- revalidation process;
- safety/governance review;

before use in the applicable production clinical workflow.

model/version change
!= harmless implementation detail

Silent model drift or silent clinical deployment of a newly selected model is
not permitted.

## 15. Provider training use

Production Patient/clinical input and output must not be made available for
provider model training by default.

Provider processing
!= permission to train

Any such use would require a separately approved legal, contractual, privacy,
security, and governance basis.

The normal production clinical path must not infer training permission merely
because a provider processes the request.

## 16. Provider retention and data handling

Provider retention, use, disclosure, deletion/return, and security behavior must
conform to an approved provider/privacy/security contract and canonical
configuration.

If required production assurances about relevant handling cannot be verified,
the affected production AI path must fail closed.

Implementation must not invent a retention period such as 30 days.

## 17. Sensitive logging

Application, operational, and audit logs must not routinely contain complete raw
prompts, raw Patient records, or raw clinical output merely for debugging.

Logs should minimize plaintext sensitive clinical information.

Audit/security metadata should remain distinct from clinical payload storage.

If raw clinical content must be retained under a canonical policy, appropriate
controls must govern:

- purpose;
- authorization;
- access;
- encryption/security handling;
- retention;
- deletion;
- audit.

provenance
!= raw PHI logging

## 18. AI generation provenance

AI generation provenance must bind the output to sufficient execution context,
including as applicable:

- AI artifact/output identity;
- output/generation version;
- provider;
- model/version;
- prompt/template identity and version;
- relevant input/reference identity or digest;
- generation timestamp;
- initiating actor;
- initiating workflow;
- applicable configuration/policy version.

Stable references and digests should be preferred over copying unnecessary raw
clinical content into provenance records.

## 19. Human edits preserve AI provenance

Human editing of an AI-generated draft must not erase the fact that AI
participated in the generation process.

Conceptually:

AI draft v1
-> human review/edit
-> derived artifact v2

History must preserve appropriate provenance for both stages.

human edit
!= erase AI provenance

The system must not overwrite AI provenance and then represent the original AI
generation as if it had been entirely human-authored.

## 20. Regeneration creates a new generation/version

Regeneration must produce a new generation/version.

It must not silently overwrite a previous generation.

Previous generations must remain traceable according to retention and
authorization policy, especially when previously:

- reviewed;
- approved;
- rejected;
- referenced;
- used downstream.

## 21. AI idempotency and optimistic concurrency

AI command safety requires both controls where applicable.

Generation and other replay-sensitive commands must use idempotency.

Review, edit, approval, rejection, and version-sensitive transitions must use
optimistic concurrency.

At minimum:

same operation identity + same logical intent
-> no duplicate application

same operation identity + materially different payload
-> reject/conflict

stale artifact/version
-> reject/conflict

idempotency
!= optimistic concurrency

Neither control replaces the other.

## 22. AI audit

AI-related audit must cover applicable events such as:

- invoke/generate;
- generation success;
- generation failure;
- provider/model identity;
- artifact/version;
- review;
- approval;
- rejection;
- regeneration;
- human edit/handoff where applicable;
- sensitive tool/action request;
- relevant authorization failure;
- timestamp;
- actor/workflow;
- result.

Audit must provide sufficient investigation context without routinely duplicating
raw PHI.

Audit metadata
!= raw prompt dump

Audit metadata
!= raw clinical output dump

Audit
!= authorization

## 23. RAG/retrieval authorization boundary

Retrieval used by AI must preserve the caller/workflow authorization boundary.

RAG retrieval
!= authorization expansion

Retrieval must not expose resources or fields merely because the AI service has
broader technical credentials.

Authorization and field-level visibility must be enforced outside the model.

A summary of unauthorized material is still unauthorized disclosure.

## 24. Retrieval and evidence provenance

Grounded AI generation must retain traceability to the sources actually used by
the retrieval/generation pipeline.

Appropriate provenance may include:

- source/resource identity;
- source version;
- relevant reference;
- digest where useful;
- retrieval/generation linkage.

The system need not copy full source content into the audit trail merely for
traceability.

## 25. Retrieved and user content are untrusted data

Retrieved documents, Patient free text, user-provided text, external content,
and similar data must be treated as untrusted content with respect to system
policy.

retrieved/user content
!= system instruction
!= authorization policy
!= permission escalation
!= executable command

A string such as:

"ignore previous instructions"

inside retrieved or clinical content must not:

- replace higher-level system policy;
- grant access;
- broaden retrieval scope;
- enable a tool;
- authorize a clinical mutation;
- alter the approved provider/model policy.

retrieved content
!= trusted instruction

## 26. Grounded claims and uncertainty

When a workflow requires evidence-grounded output, a claim that lacks sufficient
grounding must not be presented as though it were grounded fact.

The canonical UX/policy may:

- identify it as unsupported;
- identify uncertainty;
- omit it from the grounded result;
- require additional evidence.

AI confidence
!= evidence

General model confidence does not create a source that was never retrieved or
validated.

## 27. Citation and reference integrity

AI must not fabricate a citation, Patient-record reference, guideline reference,
or evidence attribution.

A citation/reference must correspond to a source actually used by the approved
pipeline.

citation
!= invented attribution

The existence of a plausible external source does not authorize the system to
claim that source supported a particular generation if it was not actually
used.

## 28. High-risk or urgent AI output

AI identification of an urgent or high-risk clinical issue does not authorize
the model to perform an intervention.

The applicable behavior is:

AI detects/recommends
-> canonical escalation workflow
-> authorized human/workflow handling

If the required escalation workflow has not been canonically defined, the AI
system must not invent an automated clinical action.

AI must not independently:

- create an executable order;
- change treatment;
- finalize a diagnosis;
- notify arbitrary staff;
- perform another sensitive clinical mutation.

## 29. AI tool proposals are not authorization

A model's decision to invoke or propose a tool does not authorize that action.

AI tool proposal
!= authorized clinical action

Every sensitive server-side action must independently enforce all applicable:

- authenticated caller/workflow identity;
- workspace;
- explicit grant;
- role ceiling;
- Patient/resource authorization;
- relationship/participation;
- artifact/field policy;
- state/lifecycle requirements;
- optimistic concurrency;
- idempotency;
- human authorization where required;
- audit.

The model must not be the component that decides whether these controls may be
bypassed.

## 30. Rejected AI output

Human rejection of an AI generation must preserve the relevant generation and
review history.

Rejected output must retain according to applicable policy:

- generation/version identity;
- rejection state;
- reason when applicable;
- provenance;
- audit.

Rejected AI output must not become current approved clinical truth.

rejected AI output
!= erased history

The system must not automatically regenerate repeatedly until an output happens
to receive approval unless a separately approved workflow defines that behavior.

## 31. Correction after AI approval

If previously approved AI-derived clinical content is later discovered to be
incorrect, correction must use the applicable BD-04 clinical artifact workflow.

This may include:

- amendment;
- correction;
- invalidation/entered-in-error where appropriate;
- versioning.

The system must preserve:

- original AI generation;
- human review;
- approval event;
- previous clinical version;
- correction/amendment;
- provenance;
- audit.

Corrected AI-derived output
!= overwritten history

## 32. Production fail-closed behavior

If a required safety, provider, authorization, retention, provenance, model,
configuration, or governance dependency is not verified, the affected AI
capability must fail closed.

The system must not:

- enable first and validate later;
- silently use an unapproved model;
- silently change provider;
- fabricate a fallback result;
- weaken authorization;
- ignore provenance requirements.

Where the underlying non-AI clinical workflow can safely continue, the AI
failure must not unnecessarily block that core workflow.

## 33. Relationship with BD-01

BD-05 preserves BD-01.

In particular:

- role is not permission;
- AI service credentials do not expand caller authority;
- RAG does not expand authorization;
- field visibility still applies before AI receives data;
- relationship/assignment rules still apply;
- break-glass does not automatically grant AI mutation/approval authority;
- audit is not permission.

AI must not be used as an indirect mechanism to reveal fields that the user
could not otherwise access.

## 34. Relationship with BD-02

BD-05 does not redefine Patient identity, lifecycle, MRN, duplicate handling,
archive behavior, or Patient mutation policy.

AI must not:

- create Patient records outside authorized Patient workflows;
- invent MRNs;
- bypass duplicate protections;
- bypass optimistic concurrency;
- alter Patient lifecycle merely by recommendation.

AI recommendation
!= Patient mutation

## 35. Relationship with BD-03

BD-05 does not redefine Appointment or scheduling policy.

AI must not:

- reserve capacity merely by suggesting a slot;
- bypass conflict/capacity rules;
- override Patient scheduling eligibility;
- invent scheduling policy;
- transform recommendation into a booked Appointment without an authorized
  scheduling command.

AI suggestion
!= Appointment reservation

## 36. Relationship with BD-04

BD-04 remains authoritative for clinical artifacts and Encounter lifecycle.

AI-generated clinical content remains subject to:

- clinical-specific mutation authority;
- artifact lifecycle;
- finalization policy;
- cosign/attestation policy;
- amendment/correction;
- entered-in-error/invalidation;
- order approval/execution rules;
- Encounter participation;
- professional requirements;
- clinical audit.

AI output may be a technical source/provenance agent.

It is not automatically the responsible clinical author, attester, approver, or
finalizer.

Encounter COMPLETED does not approve AI content.

## 37. Unresolved canonical AI policies

BD-05 is final for the principles defined here.

The following remain configuration/contract gaps unless already defined in the
canonical system:

- approved production provider(s);
- approved model(s) and exact model/version policy;
- provider/model revalidation process;
- provider retention and data-handling contract details;
- exact prompt/template versioning implementation;
- exact digest/version-binding representation;
- task-specific AI input schemas;
- task-specific grounding requirements;
- artifact-specific AI approval requirements;
- independent-review requirements where applicable;
- AI rejection reason requirements;
- exact high-risk/urgent escalation workflow;
- any approved clinical-action automation;
- any provider fallback policy;
- exact retention duration for AI generations and provenance where not already
  governed elsewhere.

Implementation must not fill these gaps by guessing.

Where a gap is necessary for a production AI capability, that capability must
remain unavailable until the required canonical rule is established.

## 38. Required implementation behavior

Implementation of BD-05 must preserve these principles:

AI output != approved clinical truth

AI confidence != clinical authority

AI source != responsible human author/finalizer

AI service account != authorization bypass

reviewed version != any later version

AI recommendation != clinical mutation

AI failure != permission to silently switch to an unapproved model/provider

approved model != any available model

model/version change != harmless implementation detail

provider processing != permission to train

provenance != raw PHI logging

human edit != erase AI provenance

idempotency != optimistic concurrency

RAG retrieval != authorization expansion

retrieved content != trusted instruction

AI confidence != evidence

citation != invented attribution

AI tool proposal != authorized clinical action

rejected/corrected AI output != erased history

## Core invariants

AI output != approved clinical truth

AI confidence != clinical authority

AI source != responsible human author/finalizer

AI service account != authorization bypass

reviewed version != any later version

AI recommendation != clinical mutation

AI failure != permission to silently switch to an unapproved model/provider

approved model != any available model

model/version change != harmless implementation detail

provider processing != permission to train

provenance != raw PHI logging

human edit != erase AI provenance

idempotency != optimistic concurrency

RAG retrieval != authorization expansion

retrieved content != trusted instruction

AI confidence != evidence

citation != invented attribution

AI tool proposal != authorized clinical action

rejected/corrected AI output != erased history