import { authorizeResourceAccess } from '../../../platform/authorization/src/index.ts';
import { MandatoryAuditError } from '../../../platform/audit/src/mandatory-audit.ts';
import type { RequestContext } from '../../../platform/context/src/index.ts';
import type {
  AiAuditRecord,
  AiGateway,
  AiToolDefinition,
  AiToolRequest,
  AiToolResult,
} from '../../contracts/src/index.ts';

export interface AiAuditRecorder {
  record(record: AiAuditRecord): Promise<void>;
}

// The registry is intentionally heterogeneous. Each tool still validates its
// input before execution; the erased type is limited to this runtime registry.
type RegisteredAiToolDefinition = AiToolDefinition<unknown, unknown>;

/** Erase registry generics only after retaining runtime input validation. */
export function registerAiTool<Input, Output>(tool: AiToolDefinition<Input, Output>): RegisteredAiToolDefinition {
  return { ...tool,
    execute: (input, context) => {
      if (!tool.validateInput(input)) throw new Error('INVALID_INPUT');
      return tool.execute(input, context);
    },
    authorize: ({ context, resource, toolInput }) => tool.validateInput(toolInput) &&
      (tool.authorize?.({ context, resource, toolInput }) ?? true),
  };
}

function isAuthenticated(context: RequestContext): boolean {
  return Boolean(
    context &&
    typeof context.requestId === 'string' && context.requestId.trim() &&
    typeof context.correlationId === 'string' && context.correlationId.trim() &&
    context.actor &&
    typeof context.actor.userId === 'string' && context.actor.userId.trim() &&
    typeof context.actor.subject === 'string' && context.actor.subject.trim() &&
    context.tenant &&
    typeof context.tenant.tenantId === 'string' && context.tenant.tenantId.trim() &&
    typeof context.tenant.membershipId === 'string' && context.tenant.membershipId.trim(),
  );
}

function outputSize(output: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(output)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export class DefaultAiGateway implements AiGateway {
  private readonly tools: ReadonlyMap<string, RegisteredAiToolDefinition>;
  private readonly audit: AiAuditRecorder;

  public constructor(
    definitions: readonly RegisteredAiToolDefinition[],
    audit: AiAuditRecorder,
  ) {
    this.tools = new Map(definitions.map((definition) => [definition.name, definition]));
    this.audit = audit;
  }

  public async invokeTool<Input, Output>(
    request: AiToolRequest<Input>,
    context: RequestContext,
  ): Promise<AiToolResult<Output>> {
    const deny = async (
      reason: NonNullable<AiToolResult['reason']>,
    ): Promise<AiToolResult<Output>> => {
      await this.audit.record({
        toolName: request?.toolName ?? 'unknown',
        context,
        resource: request?.resource,
        outcome: 'DENIED',
      });
      return { ok: false, toolName: request?.toolName ?? 'unknown', reason };
    };

    if (!isAuthenticated(context) || !request || typeof request.toolName !== 'string' || !request.toolName.trim()) {
      return deny('INVALID_CONTEXT');
    }

    const definition = this.tools.get(request.toolName);
    if (!definition) return deny('UNKNOWN_TOOL');
    if (!Number.isInteger(definition.maxOutputBytes) || definition.maxOutputBytes < 1) {
      return deny('OUTPUT_REJECTED');
    }
    try {
      if (!definition.validateInput(request.input)) return deny('INVALID_INPUT');
    } catch {
      return deny('INVALID_INPUT');
    }

    if (request.resource) {
      const decision = authorizeResourceAccess({
        action: definition.name,
        context,
        resource: {
          resourceId: request.resource.resourceId,
          tenantId: request.resource.tenantId,
        },
          policy: definition.authorize
          ? ({ context: requestContext, resource }) => definition.authorize!({
              context: requestContext,
              resource: { ...request.resource!, ...resource },
              toolInput: request.input,
            })
          : undefined,
      });
      if (!decision.allowed) return deny('UNAUTHORIZED');
    } else if (definition.authorize) {
      try {
        if (!definition.authorize({ context, toolInput: request.input })) return deny('UNAUTHORIZED');
      } catch {
        return deny('UNAUTHORIZED');
      }
    }

    if (definition.requiresHumanApproval && definition.access !== 'READ') {
      return deny('HUMAN_APPROVAL_REQUIRED');
    }

    let output: Output;
    try {
      output = await definition.execute(request.input, context) as Output;
    } catch (error) {
      if (error instanceof MandatoryAuditError) throw error;
      await this.audit.record({
        toolName: definition.name,
        context,
        resource: request.resource,
        outcome: 'FAILURE',
      });
      return { ok: false, toolName: definition.name, reason: 'TOOL_FAILURE' };
    }
    if (outputSize(output) > definition.maxOutputBytes) return deny('OUTPUT_REJECTED');
    await this.audit.record({
      toolName: definition.name,
      context,
      resource: request.resource,
      outcome: 'ALLOWED',
    });
    return { ok: true, toolName: definition.name, output };
  }
}
