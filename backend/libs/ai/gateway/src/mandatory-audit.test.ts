import assert from 'node:assert/strict';
import test from 'node:test';
import { MandatoryAuditError } from '../../../platform/audit/src/mandatory-audit.ts';
import { DefaultAiGateway, registerAiTool } from './index.ts';
import { DefaultAiProviderCompletionPort } from './provider-completion.ts';
import { TenantScopedKnowledgeSearch } from '../../tools/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../platform/context/src/index.ts';

const context = createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: 'u', subject: 's', tenantId: 't', membershipId: 'm', permissionRevision: '"1"' });
for (const mode of ['success', 'invalid', 'oversized', 'failure'] as const) {
  test(`completion mandatory audit failure propagates once on ${mode}`, async () => {
    let calls = 0;
    const failure = new MandatoryAuditError();
    const port = new DefaultAiProviderCompletionPort({ async complete() {
      if (mode === 'failure') throw new Error('private provider error');
      return { text: mode === 'invalid' ? '' : mode === 'oversized' ? 'x'.repeat(30) : 'private', providerRequestId: null, providerConversationId: null };
    } }, { async record() { calls++; throw failure; } }, { maxPromptCharacters: 20, maxOutputBytes: 20 });
    await assert.rejects(port.complete({ prompt: 'synthetic' }, context), error => error === failure);
    assert.equal(calls, 1);
  });
}
for (const boundary of ['tool', 'retrieval', 'provider'] as const) {
  test(`nested mandatory audit failure escapes ${boundary} error conversion`, async () => {
    const failure = new MandatoryAuditError();
    let records = 0;
    const audit = { async record() { records++; } };
    const fail = async (): Promise<never> => { throw failure; };
    const operation = boundary === 'tool'
      ? new DefaultAiGateway([registerAiTool({ name: 'test', purpose: 'synthetic', access: 'READ', requiresHumanApproval: false, maxOutputBytes: 10, validateInput: (value): value is null => value === null, execute: fail })], audit).invokeTool({ toolName: 'test', input: null }, context)
      : boundary === 'retrieval'
        ? new TenantScopedKnowledgeSearch({ search: fail }, { canSearch: () => true }, audit).search(context, { query: 'synthetic' })
        : new DefaultAiProviderCompletionPort({ complete: fail }, audit, { maxPromptCharacters: 20, maxOutputBytes: 20 }).complete({ prompt: 'synthetic' }, context);
    await assert.rejects(operation, error => error === failure);
    assert.equal(records, 0);
  });
}
