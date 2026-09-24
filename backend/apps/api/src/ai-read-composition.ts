import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { uuid } from '../../../libs/platform/context/src/read-page.ts';
import { buildAuditEvent, buildAuditEventInput } from '../../../libs/platform/audit/src/index.ts';
import { MandatoryAuditError } from '../../../libs/platform/audit/src/mandatory-audit.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/index.ts';
import { getPatient } from '../../../libs/patient/application-entrypoint/src/index.ts';
import { PostgresIdempotencyStore } from '../../../libs/platform/idempotency/src/postgres-idempotency-store.ts';
import { readPatientEncounters } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { DefaultAiGateway, registerAiTool } from '../../../libs/ai/gateway/src/index.ts';
import { createReadOnlyPatientTool, createReadOnlyRecentEncountersTool } from '../../../libs/ai/tools/src/read-only-tools.ts';
import { TenantScopedKnowledgeSearch, type KnowledgeSearchRequest } from '../../../libs/ai/tools/src/index.ts';
import { PostgresKnowledgeChunkRepository, type KnowledgeChunk } from '../../../libs/ai/data-access/src/index.ts';
import type { AiToolRequest } from '../../../libs/ai/contracts/src/index.ts';
import { createPatientAuthorization } from './patient-authorization.ts';
import { createDomainReadRuntime, createDomainReadDependencies } from './domain-read-composition.ts';
import type { AuthenticatedSessionIdentity } from './auth-composition.ts';
import { summarizeAuthorizedContext, type SummaryConfiguration } from './ai-summary.ts';
import type { PatientToolOutput, EncounterToolOutput } from '../../../libs/ai/tools/src/read-only-tools.ts';
import type { AiToolResult } from '../../../libs/ai/contracts/src/index.ts';

/** Server composition dependency, never populated from HTTP/model input.
 * Missing canonical AI grants or provider assurances must return false.
 * Domain authorization is independently enforced even when this policy allows.
 */
export interface AiReadPolicy {
  allows(context: RequestContext, capability: 'READ' | 'RETRIEVE'): boolean;
  canReadDocument(context: RequestContext, document: Pick<KnowledgeChunk, 'documentId' | 'tenantId' | 'metadata'>): boolean | Promise<boolean>;
}

/** Embeddings stay replaceable behind the approved provider boundary. */
export interface KnowledgeQueryEmbedding {
  embed(input: { readonly query: string; readonly context: RequestContext }): Promise<readonly number[]>;
}

export interface AiReadRequestIdentity {
  readonly context: RequestContext;
  readonly identity: AuthenticatedSessionIdentity;
  readonly permissions: ReadonlySet<string>;
}

/** Instantiate on the shared database; bind each call to the result of the
 * authenticated workspace/session and permission-revision preflight.
 * This does not enable HTTP routes or assign new AI permissions.
 */
export function createAiReadRuntime(database: TransactionalDatabase, options: {
  readonly cursorKey: string | undefined;
  readonly policy?: AiReadPolicy;
  readonly embeddings?: KnowledgeQueryEmbedding;
  readonly summary?: SummaryConfiguration;
}) {
  const reads = createDomainReadRuntime(database, options.cursorKey);
  const patients = new PostgresPatientRepository(database);
  const idempotency = new PostgresIdempotencyStore(database);
  const chunks = new PostgresKnowledgeChunkRepository(database);
  const audits = new PostgresAuditEventRepository(database);

  function bind(input: AiReadRequestIdentity) {
    const { context, identity, permissions } = input;
    if (!context.actor || !context.tenant || !context.tenant.permissionRevision ||
        identity.userId !== context.actor.userId || identity.subject.subject !== context.actor.subject ||
        !identity.sessionId || Date.parse(identity.accessExpiresAt) <= Date.now() ||
        Date.parse(identity.expiresAt) <= Date.now() ||
        !Number.isFinite(Date.parse(identity.accessExpiresAt)) || !Number.isFinite(Date.parse(identity.expiresAt))) {
      throw new Error('UNAUTHENTICATED');
    }
    const audit = async (action: string, resourceType: string, resourceId: string,
      outcome: 'ALLOWED' | 'DENIED' | 'FAILURE', metadata: Readonly<Record<string, string | number | boolean | null>> = {}) => {
      const event = buildAuditEvent(buildAuditEventInput(context, {
        id: randomUUID(), sessionId: identity.sessionId, action, resourceType, resourceId,
        result: outcome === 'ALLOWED' ? 'SUCCESS' : outcome,
        metadata: { ...metadata, membershipId: context.tenant!.membershipId,
          permissionRevision: context.tenant!.permissionRevision, policy: 'BD-05' },
      }));
      try {
        const result = await audits.append(event);
        if (result.kind !== 'APPENDED') throw new MandatoryAuditError();
      } catch { throw new MandatoryAuditError(); }
    };
    const patientDependencies = { patients, idempotency,
      authorization: createPatientAuthorization(permissions, reads.careAccess) };
    const clinical = createDomainReadDependencies(reads, permissions).clinical;
    const loaders = {
      getPatient: async ({ patientId }: { patientId: string }) => getPatient(patientDependencies, context, uuid(patientId)),
      listEncounters: async ({ patientId, limit }: { patientId: string; limit: number }) => {
        // Establish Patient authorization before any Clinical lookup, then reuse
        // the same clinical service and relationship policy as ordinary reads.
        await getPatient(patientDependencies, context, uuid(patientId));
        return (await readPatientEncounters(clinical, context, patientId, { limit })).data;
      },
    };
    const gateway = new DefaultAiGateway([
      registerAiTool(createReadOnlyPatientTool(loaders)), registerAiTool(createReadOnlyRecentEncountersTool(loaders)),
    ], { record: record => audit(record.toolName, 'PATIENT', record.resource?.resourceId ?? context.tenant!.tenantId, record.outcome) });

    const search = new TenantScopedKnowledgeSearch({
      search: async ({ query, tenantId, limit }) => {
        if (!options.embeddings || !options.policy) throw new Error('FEATURE_UNAVAILABLE');
        const embedding = await options.embeddings.embed({ query, context });
        const candidates = await chunks.searchByEmbedding({ tenantId, embedding, limit });
        const allowed = [];
        for (const row of candidates) {
          if (row.tenantId !== tenantId || row.status !== 'APPROVED' || !await options.policy.canReadDocument(context, row)) continue;
          allowed.push({ documentId: row.documentId, chunkId: row.id, tenantId: row.tenantId,
            status: row.status, title: row.title, source: row.source, snippet: row.content });
        }
        return allowed;
      },
    }, { canSearch: () => Boolean(options.policy?.allows(context, 'RETRIEVE')) }, {
      record: record => audit('search_knowledge', 'KNOWLEDGE', context.tenant!.tenantId, record.outcome,
        { queryLength: record.queryLength, resultCount: record.resultCount,
          sources: JSON.stringify(record.sources ?? []) }),
    });

    const bound = {
      async invokeTool(request: AiToolRequest) {
        if (!options.policy?.allows(context, 'READ')) {
          await audit('ai.read', 'AI', context.tenant!.tenantId, 'DENIED');
          return { ok: false as const, toolName: request.toolName, reason: 'UNAUTHORIZED' as const };
        }
        // Resource identity is derived from validated tool input, not caller-supplied
        // tenant/actor fields. Gateway still rejects mismatched explicit resources.
        const patientId = request.input && typeof request.input === 'object' && 'patientId' in request.input
          ? request.input.patientId : undefined;
        return gateway.invokeTool({ ...request, resource: request.resource ??
          (typeof patientId === 'string' ? { resourceType: 'patient', resourceId: patientId.trim(), tenantId: context.tenant!.tenantId } : undefined) }, context);
      },
      searchKnowledge(request: KnowledgeSearchRequest) { return search.search(context, request); },
    };
    return { ...bound,
      summarize(request: { readonly patientId: string; readonly query: string }) {
        return summarizeAuthorizedContext({ ...request, context,
          configuration: options.summary && { ...options.summary,
            allows: current => permissions.has('assistant.use') && options.summary!.allows(current) },
          reads: {
            patient: patientId => bound.invokeTool({ toolName: 'get_patient', input: { patientId } }) as Promise<AiToolResult<PatientToolOutput>>,
            encounters: patientId => bound.invokeTool({ toolName: 'get_recent_encounters', input: { patientId, limit: 5 } }) as Promise<AiToolResult<readonly EncounterToolOutput[]>>,
            knowledge: query => bound.searchKnowledge({ query, limit: 5 }),
          },
          audit: (action, outcome, metadata) => audit(action, 'PATIENT', request.patientId, outcome, metadata),
        });
      },
    };
  }
  return { bind };
}
