import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseDraftContent, validateDraftGenerate } from './ai-draft-generation.ts';

test('draft generation accepts only canonical target/instruction, never actor or tenant', () => {
  const body = { targetRecordId:randomUUID(),targetVersionToken:'"v9007199254740993"',instruction:null };
  assert.deepEqual(validateDraftGenerate(body),body);
  for (const key of ['tenantId','patientId','encounterId','createdBy','content','sources']) {
    assert.throws(()=>validateDraftGenerate({...body,[key]:'forged'}),/VALIDATION_ERROR/);
  }
});
test('draft generation rejects malformed/weak target tokens and oversized instruction', () => {
  const body = {targetRecordId:randomUUID(),targetVersionToken:'"v1"',instruction:null};
  for (const targetVersionToken of ['W/"1"','1','""','"a\nb"','"'+'a'.repeat(128)+'"']) {
    assert.throws(()=>validateDraftGenerate({...body,targetVersionToken}),/VALIDATION_ERROR/);
  }
  assert.throws(()=>validateDraftGenerate({...body,instruction:'x'.repeat(2001)}),/VALIDATION_ERROR/);
});
test('provider content must be exact bounded four-field ClinicalContent', () => {
  const content={diagnosis:'synthetic',symptoms:'synthetic',clinicalNotes:'synthetic',treatmentPlan:'synthetic'};
  assert.deepEqual(parseDraftContent(JSON.stringify(content)),content);
  for (const value of ['not json','[]','null',JSON.stringify({...content,sourceId:randomUUID()}),
    JSON.stringify({...content,diagnosis:''}),JSON.stringify({...content,clinicalNotes:'x'.repeat(16001)})]) {
    assert.throws(()=>parseDraftContent(value),/AI_OUTPUT_REJECTED/);
  }
});
