import { strict as assert } from 'node:assert';
import test from 'node:test';
import { AppointmentSchedulingConflictError as CompatibilityError } from './index.ts';
import { AppointmentSchedulingConflictError as CanonicalError } from '../../domain/src/repository-ports.ts';

test('preserves AppointmentSchedulingConflictError constructor identity through the compatibility export', () => {
  assert.strictEqual(CompatibilityError, CanonicalError);

  const error = new CanonicalError();
  assert.ok(error instanceof CompatibilityError);
  assert.ok(error instanceof CanonicalError);
  assert.equal(error.name, 'AppointmentSchedulingConflictError');
  assert.equal(error.message, 'appointment scheduling conflict');
});
