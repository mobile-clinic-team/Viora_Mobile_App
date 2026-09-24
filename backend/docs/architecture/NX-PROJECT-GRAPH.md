# Viora Nx Project Graph and Public Boundaries

> Decision: FOUND-001
> Status: Approved for implementation planning
> Architecture: Option 2 - domain-first modular monolith with lazy scaffolding

## 1. Scope

This document defines the initial Nx project graph, concrete dependency
constraints, public boundaries, ownership scopes, and worker entrypoint
convention. It does not create Nx projects, application code, database
migrations, API implementations, or infrastructure resources.

Each domain MUST have a public `contracts` project before another scope may
consume it. The `api`, `application`, `domain`, and `data-access` projects are
created only when required by that domain's complexity. Internal projects are
not public merely because they are under a domain directory.

## 2. Runtime Applications

```text
apps/web
  -> generated API client, public contracts, shared primitives

apps/api
  -> API adapters, application composition, platform adapters
  -> domain application entrypoints and data-access composition roots
  -> libs/ai/gateway and libs/ai/tools

apps/workers
  -> public application command entrypoints
  -> public outbox and event contracts
  -> platform messaging and observability
```

There are no `apps/ai-gateway` or `apps/tool-gateway` projects in this graph.
AI Gateway and Tool Gateway are libraries under `libs/ai/*` and run inside
`apps/api`. Extraction into applications requires a new architecture decision.

## 3. Project Naming and Tags

Projects use the following path and tag vocabulary. Each project has one exact
`boundary:*` tag, one `scope:*` tag, and at least one `type:*` tag. Nx uses the
exact boundary tag as `sourceTag`; no composite condition is left for Nx to
infer. The descriptive `type:app-api` tag is not used to grant backend
infrastructure access; that permission belongs only to
`boundary:app-api-composition-root`.

Boundary tags for runtime apps:

```text
boundary:app-web
boundary:app-api-composition-root
boundary:app-api-adapter
boundary:app-workers
```

Domain boundary tags:

```text
boundary:identity-contract, boundary:identity-api
boundary:identity-application, boundary:identity-application-entrypoint
boundary:identity-domain, boundary:identity-data-access
boundary:tenant-contract, boundary:tenant-api
boundary:tenant-application, boundary:tenant-application-entrypoint
boundary:tenant-domain, boundary:tenant-data-access
boundary:patient-contract, boundary:patient-api
boundary:patient-application, boundary:patient-application-entrypoint
boundary:patient-domain, boundary:patient-data-access
boundary:doctor-contract, boundary:doctor-api
boundary:doctor-application, boundary:doctor-application-entrypoint
boundary:doctor-domain, boundary:doctor-data-access
boundary:appointment-contract, boundary:appointment-api
boundary:appointment-application, boundary:appointment-application-entrypoint
boundary:appointment-domain, boundary:appointment-data-access
boundary:clinical-contract, boundary:clinical-api
boundary:clinical-application, boundary:clinical-application-entrypoint
boundary:clinical-domain, boundary:clinical-data-access
boundary:audit-contract, boundary:audit-api
boundary:audit-application, boundary:audit-application-entrypoint
boundary:audit-domain, boundary:audit-data-access
```

AI, platform, web, and shared boundary tags:

```text
boundary:ai-contracts, boundary:ai-gateway, boundary:ai-tools
boundary:ai-data-access
boundary:platform-context, boundary:platform-authorization
boundary:platform-audit, boundary:platform-idempotency
boundary:platform-outbox, boundary:platform-messaging
boundary:platform-observability, boundary:platform-config
boundary:platform-database-port, boundary:platform-secrets
boundary:platform-infrastructure
boundary:web-api-client, boundary:shared-util
```

```text
Scopes:
scope:api, scope:workers
scope:identity, scope:tenant, scope:patient, scope:doctor
scope:appointment, scope:clinical, scope:audit, scope:ai
scope:platform, scope:web, scope:shared

Application types:
type:app-web, type:app-api, type:app-workers

Library types:
type:api, type:application, type:application-entrypoint
type:domain, type:data-access, type:contract
type:infrastructure, type:platform-port, type:util
type:ai-gateway, type:ai-tools, type:generated-client

Platform port types:
type:platform-context, type:platform-authorization
type:platform-audit, type:platform-idempotency
type:platform-outbox, type:platform-messaging
type:platform-observability, type:platform-config
```

The following projects are public by convention:

```text
libs/<domain>/contracts
libs/<domain>/application-entrypoint
libs/platform/<public-port>
libs/shared
libs/web/api-client
```

`libs/<domain>/application` is internal. If a worker needs a command, the
command is exposed through `libs/<domain>/application-entrypoint`, which
contains only an explicit command interface and delegates to the internal
application project. Workers MUST NOT import `libs/<domain>/application`.

## 4. Domain Project Responsibilities

```text
libs/<domain>/contracts
  Public DTOs, interfaces, commands, queries, and event contracts.

libs/<domain>/api
  Transport adapters and boundary validation.

libs/<domain>/application
  Internal use cases and orchestration.

libs/<domain>/application-entrypoint
  Public worker command interface only.

libs/<domain>/domain
  Domain entities, policies, and business invariants.

libs/<domain>/data-access
  Repository implementations, ORM mapping, and persistence queries.
```

The initial domain scopes are:

```text
identity       users, memberships, authentication boundary
tenant         tenants, locations, tenant context
patient        patient identity and PHI access
doctor         doctors, departments, working shifts
appointment    scheduling, availability, status, idempotency
clinical       encounters, medical records, immutable versions, allergies
audit          audit events, redaction, security evidence
ai             Gateway, tools, RAG, drafts, evaluation boundary
```

Platform projects are:

```text
libs/platform/config
libs/platform/context
libs/platform/authorization
libs/platform/database
libs/platform/messaging
libs/platform/observability
libs/platform/secrets
```

`platform/database` exports only database client, transaction manager,
migration utilities, and repository ports. ORM entities and ORM-generated
types remain inside the owning `data-access` project.

`libs/shared` contains only stateless primitives: branded IDs, Result/error
types, context interfaces, system constants, and generic utilities. It MUST
NOT contain domain DTOs, business validation, feature configuration, or a
dependency on any domain or platform implementation.

## 5. Concrete Dependency Constraint Matrix

The rules below are the source for Nx `depConstraints`. An omitted tag is
forbidden. `scope:*` names are literal alternatives, not wildcards that Nx
must infer. Each row can therefore be transcribed as one concrete constraint.

### 5.1 Runtime app constraints

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:app-web` | `boundary:web-api-client`, `boundary:identity-contract`, `boundary:tenant-contract`, `boundary:patient-contract`, `boundary:doctor-contract`, `boundary:appointment-contract`, `boundary:clinical-contract`, `boundary:audit-contract`, `boundary:ai-contracts`, `boundary:shared-util` |
| `boundary:app-api-composition-root` | `boundary:identity-api`, `boundary:identity-application`, `boundary:identity-application-entrypoint`, `boundary:identity-domain`, `boundary:identity-data-access`, `boundary:identity-contract`, `boundary:tenant-api`, `boundary:tenant-application`, `boundary:tenant-application-entrypoint`, `boundary:tenant-domain`, `boundary:tenant-data-access`, `boundary:tenant-contract`, `boundary:patient-api`, `boundary:patient-application`, `boundary:patient-application-entrypoint`, `boundary:patient-domain`, `boundary:patient-data-access`, `boundary:patient-contract`, `boundary:doctor-api`, `boundary:doctor-application`, `boundary:doctor-application-entrypoint`, `boundary:doctor-domain`, `boundary:doctor-data-access`, `boundary:doctor-contract`, `boundary:appointment-api`, `boundary:appointment-application`, `boundary:appointment-application-entrypoint`, `boundary:appointment-domain`, `boundary:appointment-data-access`, `boundary:appointment-contract`, `boundary:clinical-api`, `boundary:clinical-application`, `boundary:clinical-application-entrypoint`, `boundary:clinical-domain`, `boundary:clinical-data-access`, `boundary:clinical-contract`, `boundary:audit-api`, `boundary:audit-application`, `boundary:audit-application-entrypoint`, `boundary:audit-domain`, `boundary:audit-data-access`, `boundary:audit-contract`, `boundary:ai-contracts`, `boundary:ai-gateway`, `boundary:ai-tools`, `boundary:ai-data-access`, `boundary:platform-context`, `boundary:platform-authorization`, `boundary:platform-audit`, `boundary:platform-idempotency`, `boundary:platform-outbox`, `boundary:platform-messaging`, `boundary:platform-observability`, `boundary:platform-config`, `boundary:platform-database-port`, `boundary:platform-secrets`, `boundary:platform-infrastructure`, `boundary:shared-util` |
| `boundary:app-api-adapter` | `boundary:identity-api`, `boundary:identity-application`, `boundary:tenant-api`, `boundary:tenant-application`, `boundary:patient-api`, `boundary:patient-application`, `boundary:doctor-api`, `boundary:doctor-application`, `boundary:appointment-api`, `boundary:appointment-application`, `boundary:clinical-api`, `boundary:clinical-application`, `boundary:audit-api`, `boundary:audit-application`, `boundary:identity-application-entrypoint`, `boundary:tenant-application-entrypoint`, `boundary:patient-application-entrypoint`, `boundary:doctor-application-entrypoint`, `boundary:appointment-application-entrypoint`, `boundary:clinical-application-entrypoint`, `boundary:audit-application-entrypoint`, `boundary:identity-contract`, `boundary:tenant-contract`, `boundary:patient-contract`, `boundary:doctor-contract`, `boundary:appointment-contract`, `boundary:clinical-contract`, `boundary:audit-contract`, `boundary:ai-gateway`, `boundary:ai-tools`, `boundary:ai-contracts`, `boundary:platform-context`, `boundary:platform-authorization`, `boundary:platform-audit`, `boundary:platform-idempotency`, `boundary:platform-outbox`, `boundary:platform-observability`, `boundary:shared-util` |
| `boundary:app-workers` | `boundary:identity-application-entrypoint`, `boundary:identity-contract`, `boundary:tenant-application-entrypoint`, `boundary:tenant-contract`, `boundary:patient-application-entrypoint`, `boundary:patient-contract`, `boundary:doctor-application-entrypoint`, `boundary:doctor-contract`, `boundary:appointment-application-entrypoint`, `boundary:appointment-contract`, `boundary:clinical-application-entrypoint`, `boundary:clinical-contract`, `boundary:audit-application-entrypoint`, `boundary:audit-contract`, `boundary:platform-outbox`, `boundary:platform-messaging`, `boundary:platform-observability`, `boundary:shared-util` |

`boundary:app-api-composition-root` is the only runtime boundary allowed to
wire data-access and platform infrastructure. This permission does not flow to
`boundary:app-api-adapter`, `boundary:app-web`, or `boundary:app-workers`.

### 5.2 Common layer constraints

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:platform-infrastructure` | `boundary:platform-database-port`, `boundary:platform-secrets`, `boundary:platform-observability`, `boundary:platform-config`, `boundary:shared-util` | No additional dependency tag is allowed. |

The scope-specific rows in Section 5.3 are mandatory overrides for domain
application projects. Nx configuration MUST enumerate every source tag and
every allowed dependency tag; it MUST NOT use a wildcard scope or a prose
exception.

### 5.3 Domain application constraints

The following are the complete cross-domain contract allowlists for the
application layer. Every other cross-domain tag is forbidden.

| Source tag | Allowed dependency tags | Explicitly forbidden |
|---|---|---|
| `boundary:identity-application` | `boundary:identity-domain`; `boundary:identity-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-config`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:tenant-application` | `boundary:tenant-domain`; `boundary:tenant-contract`; `boundary:identity-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-config`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:patient-application` | `boundary:patient-domain`; `boundary:patient-contract`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:doctor-application` | `boundary:doctor-domain`; `boundary:doctor-contract`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:appointment-application` | `boundary:appointment-domain`; `boundary:appointment-contract`; `boundary:patient-contract`; `boundary:doctor-contract`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:platform-outbox`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:clinical-application` | `boundary:clinical-domain`; `boundary:clinical-contract`; `boundary:patient-contract`; `boundary:appointment-contract`; `boundary:doctor-contract`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:audit-application` | `boundary:audit-domain`; `boundary:audit-contract`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-observability`; `boundary:shared-util` | No additional dependency tag is allowed. |

### 5.4 Domain and data-access source-tag rules

These rows make the same-domain rule concrete for Nx configuration.

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:identity-domain` | `boundary:identity-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:tenant-domain` | `boundary:tenant-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:patient-domain` | `boundary:patient-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:doctor-domain` | `boundary:doctor-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:appointment-domain` | `boundary:appointment-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:clinical-domain` | `boundary:clinical-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:audit-domain` | `boundary:audit-contract`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:identity-data-access` | `boundary:identity-domain`; `boundary:identity-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:tenant-data-access` | `boundary:tenant-domain`; `boundary:tenant-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:patient-data-access` | `boundary:patient-domain`; `boundary:patient-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:doctor-data-access` | `boundary:doctor-domain`; `boundary:doctor-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:appointment-data-access` | `boundary:appointment-domain`; `boundary:appointment-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:clinical-data-access` | `boundary:clinical-domain`; `boundary:clinical-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:audit-data-access` | `boundary:audit-domain`; `boundary:audit-contract`; `boundary:platform-database-port`; `boundary:platform-infrastructure`; `boundary:shared-util` | No additional dependency tag is allowed. |

### 5.5 Public worker entrypoint source-tag rules

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:identity-application-entrypoint` | `boundary:identity-application`; `boundary:identity-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:tenant-application-entrypoint` | `boundary:tenant-application`; `boundary:tenant-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:patient-application-entrypoint` | `boundary:patient-application`; `boundary:patient-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:doctor-application-entrypoint` | `boundary:doctor-application`; `boundary:doctor-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:appointment-application-entrypoint` | `boundary:appointment-application`; `boundary:appointment-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:platform-outbox`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:clinical-application-entrypoint` | `boundary:clinical-application`; `boundary:clinical-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:platform-idempotency`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:audit-application-entrypoint` | `boundary:audit-application`; `boundary:audit-contract`; `boundary:platform-context`; `boundary:platform-audit`; `boundary:platform-observability`; `boundary:shared-util` | No additional dependency tag is allowed. |

The `type:application` generic rule MUST be implemented as the seven explicit
scope rules above, not as one broad allowlist.

### 5.6 Domain contract source-tag rules

These seven public contract projects currently have no outgoing imports.
The rows register their existing source tags while preserving Section 5's
default-deny rule: `None` means an empty allowed-dependency set, not unrestricted
access. No new cross-project dependency is authorized.

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:appointment-contract` | None | All cross-project dependencies. |
| `boundary:audit-contract` | None | All cross-project dependencies. |
| `boundary:clinical-contract` | None | All cross-project dependencies. |
| `boundary:doctor-contract` | None | All cross-project dependencies. |
| `boundary:identity-contract` | None | All cross-project dependencies. |
| `boundary:patient-contract` | None | All cross-project dependencies. |
| `boundary:tenant-contract` | None | All cross-project dependencies. |

## 6. AI Boundaries

```text
libs/ai/contracts
  Public AI capability, tool, context, and draft contracts.

libs/ai/gateway
  Authorization-aware AI orchestration and provider-neutral gateway boundary.

libs/ai/tools
  Explicit read/summarize/draft tools using public domain contracts.

libs/ai/data-access
  Private persistence adapters implementing AI-owned repository contracts.
```

| Source tag | Allowed dependency tags | Forbidden dependency tags |
|---|---|---|
| `boundary:ai-contracts` | `boundary:shared-util`; `boundary:clinical-contract` | No additional dependency tag is allowed. |
| `boundary:ai-data-access` | `boundary:ai-contracts` | No additional dependency tag is allowed. |
| `boundary:ai-provider` | `boundary:ai-gateway` | No additional dependency tag is allowed. |
| `boundary:ai-gateway` | `boundary:ai-contracts`; `boundary:ai-tools`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:patient-contract`; `boundary:doctor-contract`; `boundary:appointment-contract`; `boundary:clinical-contract`; `boundary:audit-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |
| `boundary:ai-tools` | `boundary:ai-contracts`; `boundary:identity-contract`; `boundary:tenant-contract`; `boundary:patient-contract`; `boundary:doctor-contract`; `boundary:appointment-contract`; `boundary:clinical-contract`; `boundary:audit-contract`; `boundary:platform-context`; `boundary:platform-authorization`; `boundary:platform-audit`; `boundary:shared-util` | No additional dependency tag is allowed. |

AI write tools remain default-deny. No AI project can use model output as an
authorization decision or access a database directly.

### 6.1 Approved AI contract ownership refactor

FOUND-003-ARCH-DECISION-001 was approved by the project owner in the
FOUND-003-BOUNDARY-FIX-004 task instruction. This approval covers declaration
ownership and the two exact dependency-row changes above; it does not claim
a GitHub review or authorize additional runtime database access.

`AiDraft`, `AiDraftStatus`, and the workflow-owned `AiDraftRepository` port
are declared in `libs/ai/contracts/src/draft.ts`. `KnowledgeDocumentStatus`
is declared in `libs/ai/contracts/src/knowledge.ts`. Tools and persistence
adapters import these types through the AI contracts barrel. The former
tools paths retain type-only re-exports for consumer compatibility, with no
duplicate declarations. `AiDraft.content` continues to use the unchanged
public `ClinicalRecordCreateRequest` from `clinical-contracts`.

The direction is `ai-tools -> ai-contracts <- ai-data-access`, with a type
dependency from `ai-contracts` to `clinical-contracts`. No tools-to-adapter,
adapter-to-tools, or test-only exception is added. SQL, authorization, tenant
isolation, concurrency, workflow behavior, and all other dependency rows
remain outside this refactor.

### 6.2 AI read-tool projections

FOUND-003-BOUNDARY-FIX-011 applies the public-contract direction under the
project owner's FOUND-003 continuation instruction. `PatientSummary` lives
in `libs/patient/contracts/src/index.ts` and extends the existing identity-only
`PatientReference`. `EncounterSummary` lives in
`libs/clinical/contracts/src/index.ts` and reuses `EncounterStatus`.

These are minimal read projections for authorized application consumers, not
copies or re-exports of private entities, HTTP endpoints, or permission grants.
They omit patient contact/persistence fields and encounter appointment linkage
and persistence timestamps. Tenant and patient identity remain available for
scope checks. Existing application results structurally satisfy the projections;
application authorization and query implementations remain unchanged.

`ReadOnlyToolLoaders` and its mappers use these public types through the
already-allowed `ai-tools -> patient-contracts` and
`ai-tools -> clinical-contracts` edges. The separate AI tool output contracts
and explicit output-field mappers are preserved: narrowing a TypeScript type
does not itself remove extra runtime fields. No policy row, runtime filter,
output field, or AI tool authorization rule is changed by this batch.

## 7. Worker Public Entrypoint Convention

Worker commands use this exact convention:

```text
libs/identity/application-entrypoint       boundary:identity-application-entrypoint
libs/tenant/application-entrypoint         boundary:tenant-application-entrypoint
libs/patient/application-entrypoint       boundary:patient-application-entrypoint
libs/doctor/application-entrypoint        boundary:doctor-application-entrypoint
libs/appointment/application-entrypoint   boundary:appointment-application-entrypoint
libs/clinical/application-entrypoint      boundary:clinical-application-entrypoint
libs/audit/application-entrypoint         boundary:audit-application-entrypoint
  public: yes
  exports: explicit command interfaces and handler contracts only

libs/identity/application                 boundary:identity-application
libs/tenant/application                   boundary:tenant-application
libs/patient/application                 boundary:patient-application
libs/doctor/application                  boundary:doctor-application
libs/appointment/application              boundary:appointment-application
libs/clinical/application                 boundary:clinical-application
libs/audit/application                    boundary:audit-application
  public: no
  exports: internal use-case implementation only
```

`boundary:app-workers` may import only the seven explicit
application-entrypoint tags and the seven explicit domain contract tags listed
in Section 5.1, plus `boundary:platform-outbox`,
`boundary:platform-messaging`, `boundary:platform-observability`, and
`boundary:shared-util`. It may not import private application, domain,
data-access, ORM, or infrastructure boundaries. Cross-domain side effects use
`boundary:platform-outbox` and event contracts; internal heavy jobs use the
owning domain's explicit public application-entrypoint.

## 8. Platform and Shared Constraints

| Source tag | Allowed dependency tags |
|---|---|
| `boundary:platform-context` | `boundary:shared-util` |
| `boundary:platform-authorization` | `boundary:platform-context`, `boundary:shared-util` |
| `boundary:platform-audit` | `boundary:audit-contract`, `boundary:platform-context`, `boundary:shared-util` |
| `boundary:platform-idempotency` | `boundary:platform-context`, `boundary:shared-util` |
| `boundary:platform-outbox` | `boundary:platform-context`, `boundary:shared-util` |
| `boundary:platform-messaging` | `boundary:platform-outbox`, `boundary:shared-util` |
| `boundary:platform-observability` | `boundary:platform-context`, `boundary:shared-util` |
| `boundary:platform-config` | `boundary:shared-util` |
| `boundary:platform-database-port` | `boundary:platform-config`, `boundary:shared-util` |
| `boundary:platform-secrets` | `boundary:platform-config`, `boundary:shared-util` |
| `boundary:platform-infrastructure` | `boundary:platform-database-port`, `boundary:platform-secrets`, `boundary:platform-observability`, `boundary:platform-config`, `boundary:shared-util` |
| `boundary:web-api-client` | `boundary:identity-contract`, `boundary:tenant-contract`, `boundary:patient-contract`, `boundary:doctor-contract`, `boundary:appointment-contract`, `boundary:clinical-contract`, `boundary:audit-contract`, `boundary:ai-contracts`, `boundary:shared-util` |
| `boundary:shared-util` | `boundary:shared-util` |

Platform implementation boundaries are not exposed to web, workers, domains,
or AI. `boundary:platform-database-port` is a port, not an ORM model or table.

### 8.1 Canonical RequestContext type

FOUND-003-BOUNDARY-FIX-012 implements the Architecture Owner's approval to
place the unchanged `RequestContext` declaration in
`libs/shared/src/request-context.ts`. This is a stateless context interface
under the existing shared project, with no outgoing dependencies.

`libs/platform/context/src/index.ts` imports and type-re-exports that canonical
declaration. Both existing context factories and all runtime behavior stay in
platform-context; existing consumers keep their compatibility imports.
`libs/ai/contracts/src/index.ts` imports the type directly from shared.

The type dependencies are `ai-contracts -> shared` and
`platform-context -> shared`, both already allowed above. No project tag or
policy row changes. Actor/tenant semantics, authorization, AI public signatures,
and runtime security checks remain unchanged.

## 9. Ownership

| Scope/path | Primary owner | Required review |
|---|---|---|
| `apps/api`, identity, tenant, platform, audit | Engineer A | Security; Architecture for boundary changes |
| patient, clinical | Engineer B | Clinical; Security |
| doctor, appointment | Engineer C | Security; affected domain owner |
| ai | Engineer D | AI Safety; Security; affected domain owner |
| `apps/web`, `apps/workers`, shared | Engineer A / affected owner | Architecture for cross-domain changes |

These scopes must be represented in CODEOWNERS before skeleton creation.

## 10. FOUND-001 Acceptance Criteria

- Option 2 is the approved direction.
- Runtime apps are limited to `web`, `api`, and `workers`.
- AI Gateway and Tool Gateway are libraries under `libs/ai/*`.
- Every consumed domain has a public contracts project.
- Worker access is limited to explicit application entrypoints and event
  contracts.
- Domain application allowlists are concrete and enumerated.
- No domain, AI, web, or worker project can directly import database/data-access
  internals outside the permitted API composition root.
- `shared` is stateless and domain-free.
- CODEOWNERS covers every approved top-level app/library scope.
- No Nx project, package, source code, database, migration, API,
  authentication, or AI implementation is created by FOUND-001.

## 11. Implementation Gate

FOUND-001 is implementation-ready for creation of the Nx skeleton after the
linked Issue/PR receives Architecture approval. FOUND-002 and FOUND-003 remain
required Phase 0 tasks before protected business implementation begins.
