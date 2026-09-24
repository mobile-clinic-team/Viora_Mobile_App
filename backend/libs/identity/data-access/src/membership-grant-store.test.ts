import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PostgresMembershipGrantStore,
  type MembershipGrantQueryClient,
  type MembershipGrantQueryResult,
} from './index.ts';

class RecordingGrantClient implements MembershipGrantQueryClient {
  private readonly rows: readonly { readonly permission: string }[];

  public readonly calls: {
    readonly text: string;
    readonly values: readonly unknown[] | undefined;
  }[] = [];

  public constructor(
    rows: readonly { readonly permission: string }[],
  ) {
    this.rows = rows;
  }

  public async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<MembershipGrantQueryResult<Row>> {
    this.calls.push({ text, values });
    return { rows: this.rows as unknown as readonly Row[] };
  }
}

test('grant reader uses a read-only query scoped by tenant and membership parameters', async () => {
  const database = new RecordingGrantClient([]);
  const store = new PostgresMembershipGrantStore(database);
  const tenantId = "tenant-a' OR true --";
  const membershipId = "membership-a' OR true --";

  await store.listPermissions({ tenantId, membershipId });

  assert.equal(database.calls.length, 1);
  const call = database.calls[0]!;
  assert.equal(
    call.text.replace(/\s+/g, ' ').trim(),
    'SELECT permission FROM membership_grants WHERE tenant_id = $1 AND membership_id = $2 ORDER BY permission ASC',
  );
  assert.deepEqual(call.values, [tenantId, membershipId]);
  assert.equal(call.text.includes(tenantId), false);
  assert.equal(call.text.includes(membershipId), false);
  assert.doesNotMatch(call.text, /\b(role|INSERT|UPDATE|DELETE|permission_revision)\b/i);
});

test('grant reader preserves permission order from the database result', async () => {
  const database = new RecordingGrantClient([
    { permission: 'patient.read' },
    { permission: 'patient.create' },
    { permission: 'patient.update' },
  ]);
  const store = new PostgresMembershipGrantStore(database);

  assert.deepEqual(
    await store.listPermissions({ tenantId: 'tenant-a', membershipId: 'membership-a' }),
    ['patient.read', 'patient.create', 'patient.update'],
  );
});

test('grant reader passes the tenant scope on every call for the same membership', async () => {
  const database = new RecordingGrantClient([]);
  const store = new PostgresMembershipGrantStore(database);

  await store.listPermissions({ tenantId: 'tenant-a', membershipId: 'membership-a' });
  await store.listPermissions({ tenantId: 'tenant-b', membershipId: 'membership-a' });

  assert.deepEqual(database.calls.map((call) => call.values), [
    ['tenant-a', 'membership-a'],
    ['tenant-b', 'membership-a'],
  ]);
  for (const call of database.calls) {
    assert.match(call.text, /WHERE tenant_id = \$1\s+AND membership_id = \$2/);
  }
});

test('grant reader returns no permissions for empty rows', async () => {
  const store = new PostgresMembershipGrantStore(new RecordingGrantClient([]));

  assert.deepEqual(
    await store.listPermissions({ tenantId: 'tenant-a', membershipId: 'membership-a' }),
    [],
  );
});

test('grant reader propagates database failures without granting permissions', async () => {
  const failure = new Error('database unavailable');
  const store = new PostgresMembershipGrantStore({
    async query() {
      throw failure;
    },
  });

  await assert.rejects(
    store.listPermissions({ tenantId: 'tenant-a', membershipId: 'membership-a' }),
    (error: unknown) => error === failure,
  );
});
