import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDraftHumanCommand } from './ai-draft-review.ts';

test('human draft commands reject caller identity, provenance, status and target changes',()=>{
  assert.deepEqual(validateDraftHumanCommand('draft.review',{}),{});
  for(const key of ['reviewedBy','approvedBy','tenantId','role','version','status']) {
    assert.throws(()=>validateDraftHumanCommand('draft.review',{[key]:'forged'}),/VALIDATION_ERROR/);
  }
  const content={diagnosis:'a',symptoms:'b',clinicalNotes:'c',treatmentPlan:'d'};
  assert.deepEqual(validateDraftHumanCommand('draft.edit',{content}),{content});
  assert.throws(()=>validateDraftHumanCommand('draft.edit',{content,targetRecordId:'forged'}),/VALIDATION_ERROR/);
});
test('rejection is bounded and fails closed when reason retention is unavailable',()=>{
  assert.deepEqual(validateDraftHumanCommand('draft.reject',{reason:null}),{reason:null});
  assert.throws(()=>validateDraftHumanCommand('draft.reject',{reason:'x'.repeat(2001)}),/VALIDATION_ERROR/);
  assert.throws(()=>validateDraftHumanCommand('draft.reject',{reason:'sensitive'}),/FEATURE_UNAVAILABLE/);
});
test('approval requires only exact target identity/token and excludes model approval identity',()=>{
  const body={targetRecordId:'target',targetVersionToken:'"v1"'};
  assert.deepEqual(validateDraftHumanCommand('draft.approve',body),body);
  assert.throws(()=>validateDraftHumanCommand('draft.approve',{...body,approvedBy:'provider'}),/VALIDATION_ERROR/);
});
