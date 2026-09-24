import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresPatientRepository } from './index.ts';

test('directory SQL uses tenant-scoped parameterized name/id keysets and no OFFSET', async () => {
  const calls: { sql: string; values: readonly unknown[] | undefined }[] = [];
  const repository = new PostgresPatientRepository({ async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } });
  const input = { tenantId: 'tenant-a', q: "An%'; --", limit: 21 };
  await repository.searchDirectory(input);
  await repository.searchDirectory({ ...input, after: { fullName: 'Anna', patientId: '00000000-0000-0000-0000-000000000001' } });
  for (const { sql } of calls) {
    assert.match(sql, /WHERE tenant_id=\$1/);
    assert.match(sql, /strpos\(lower\(full_name\),lower\(\$2\)\)>0/);
    assert.match(sql, /\(full_name, id\) > \(\$3::text, \$4::uuid\)/);
    assert.match(sql, /ORDER BY full_name ASC, id ASC LIMIT \$5/);
    assert.doesNotMatch(sql, /OFFSET|COUNT\(/i);
    assert.ok(!sql.includes(input.q));
    assert.ok(!sql.includes(input.tenantId));
  }
  assert.deepEqual(calls[0].values, [input.tenantId, input.q, null, null, 21]);
  assert.deepEqual(calls[1].values, [input.tenantId, input.q, 'Anna', '00000000-0000-0000-0000-000000000001', 21]);
});
test('P03 findById binds both tenant and patient identity', async () => {
  const repository = new PostgresPatientRepository({ async query(sql, values) {
    assert.match(sql, /WHERE tenant_id=\$1 AND id=\$2/);
    assert.deepEqual(values, ['tenant-a', 'patient-a']);
    return { rows: [] };
  } });
  assert.equal(await repository.findById({ tenantId: 'tenant-a', patientId: 'patient-a' }), null);
});
