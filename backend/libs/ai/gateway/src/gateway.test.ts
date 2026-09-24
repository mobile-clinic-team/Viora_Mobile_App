import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedRequestContext, createUnauthenticatedRequestContext } from '../../../platform/context/src/index.ts';
import { DefaultAiGateway, registerAiTool, type AiAuditRecorder } from './index.ts';
import type { AiToolDefinition } from '../../contracts/src/index.ts';

const context = createAuthenticatedRequestContext({
  requestId: 'request-ai', correlationId: 'correlation-ai', userId: 'user-a', subject: 'subject-a',
  tenantId: 'tenant-a', membershipId: 'membership-a',
  permissionRevision: '"1"',
});

const readTool: AiToolDefinition<{ readonly value: string }, { readonly value: string }> = {
  name: 'read_test', purpose: 'synthetic read', access: 'READ', requiresHumanApproval: false,
  maxOutputBytes: 100, validateInput: (input): input is { readonly value: string } =>
    Boolean(input && typeof input === 'object' && typeof (input as { value?: unknown }).value === 'string'),
  authorize: ({ context: requestContext }) => requestContext.tenant?.tenantId === 'tenant-a',
  execute: async (input) => input,
};

test('AI gateway propagates mandatory audit failure without retry or disclosure', async () => {
  const failure = new Error('audit unavailable');
  let calls = 0;
  const gateway = new DefaultAiGateway([registerAiTool(readTool)], {
    async record() { calls++; throw failure; },
  });
  await assert.rejects(gateway.invokeTool({ toolName: 'read_test', input: { value: 'private' } }, context), error => error === failure);
  assert.equal(calls, 1);
});

test('registered typed tools retain validation when called through erased registry', async () => {
  const registered = registerAiTool(readTool);
  assert.throws(() => registered.execute({ invalid: true }, context), /INVALID_INPUT/);
});

function makeGateway(
  definitions: readonly AiToolDefinition<unknown, unknown>[] = [readTool as unknown as AiToolDefinition<unknown, unknown>],
) {
  const records: unknown[] = [];
  const audit: AiAuditRecorder = { async record(record) { records.push(record); } };
  return { gateway: new DefaultAiGateway(definitions, audit), records };
}

test('AI gateway fails closed without authenticated context', async () => {
  const { gateway } = makeGateway();
  assert.deepEqual(await gateway.invokeTool({ toolName: 'read_test', input: { value: 'x' } }, createUnauthenticatedRequestContext('r', 'c')), {
    ok: false, toolName: 'read_test', reason: 'INVALID_CONTEXT',
  });
});

test('AI gateway fails closed for malformed runtime context without throwing', async () => {
  const { gateway } = makeGateway();
  const malformed = { ...context, actor: { userId: 42, subject: 'subject-a' } } as unknown as typeof context;
  await assert.doesNotReject(async () => {
    assert.equal((await gateway.invokeTool({ toolName: 'read_test', input: { value: 'x' } }, malformed)).reason, 'INVALID_CONTEXT');
  });
});

test('AI gateway denies unknown tools and invalid input', async () => {
  const { gateway } = makeGateway();
  assert.equal((await gateway.invokeTool({ toolName: 'unknown', input: {} }, context)).reason, 'UNKNOWN_TOOL');
  assert.equal((await gateway.invokeTool({ toolName: 'read_test', input: {} }, context)).reason, 'INVALID_INPUT');
});

test('AI gateway enforces explicit tenant/resource authorization', async () => {
  const { gateway } = makeGateway();
  const result = await gateway.invokeTool({ toolName: 'read_test', input: { value: 'x' }, resource: {
    resourceId: 'patient-b', resourceType: 'patient', tenantId: 'tenant-b',
  } }, context);
  assert.deepEqual(result, { ok: false, toolName: 'read_test', reason: 'UNAUTHORIZED' });
});

test('AI gateway returns bounded output and records allowed access', async () => {
  const { gateway, records } = makeGateway();
  const result = await gateway.invokeTool({ toolName: 'read_test', input: { value: 'x' } }, context);
  assert.deepEqual(result, { ok: true, toolName: 'read_test', output: { value: 'x' } });
  assert.equal((records.at(-1) as { outcome: string }).outcome, 'ALLOWED');
});

test('AI gateway rejects output exceeding the configured bound', async () => {
  const largeTool: AiToolDefinition<null, string> = {
    name: 'large_test', purpose: 'synthetic large output', access: 'READ', requiresHumanApproval: false,
    validateInput: (input): input is null => input === null,
    maxOutputBytes: 2, execute: async () => 'too large',
  };
  const { gateway } = makeGateway([largeTool as unknown as AiToolDefinition<unknown, unknown>]);
  assert.equal((await gateway.invokeTool({ toolName: 'large_test', input: null }, context)).reason, 'OUTPUT_REJECTED');
});

test('AI gateway fails closed when input validation or authorization throws', async () => {
  const throwingTool: AiToolDefinition<{ readonly value: string }, { readonly value: string }> = {
    ...readTool,
    name: 'throwing_test',
    validateInput: (_input): _input is { readonly value: string } => { throw new Error('untrusted validator'); },
    authorize: () => { throw new Error('untrusted policy'); },
  };
  const { gateway } = makeGateway([throwingTool as unknown as AiToolDefinition<unknown, unknown>]);
  assert.equal((await gateway.invokeTool({ toolName: 'throwing_test', input: { value: 'x' } }, context)).reason, 'INVALID_INPUT');
});
