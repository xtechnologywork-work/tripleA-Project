/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/reference-retry.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isReferenceClash, bumpReference, retryJump, saveOrdersWithRetry } from '../src/lib/reference-retry.ts';

test('only a duplicate order number counts as a clash', () => {
  assert.equal(isReferenceClash({ code: '23505', message: 'duplicate key value violates unique constraint "orders_reference_key"' }), true);
  assert.equal(isReferenceClash({ code: '23505', message: 'duplicate key', details: 'Key (reference)=(CB-261115-0007) already exists.' }), true);
  // another unique rule, or another kind of error, is not retried
  assert.equal(isReferenceClash({ code: '23505', message: 'duplicate key value violates unique constraint "payments_pkey"' }), false);
  assert.equal(isReferenceClash({ code: '23503', message: 'foreign key violation on reference' }), false);
  assert.equal(isReferenceClash(null), false);
  assert.equal(isReferenceClash(undefined), false);
});

test('an order number moves forward and keeps its shape', () => {
  assert.equal(bumpReference('CB-261115-0007', 3), 'CB-261115-0010');
  assert.equal(bumpReference('CB-261115-0099', 1), 'CB-261115-0100');
  assert.equal(bumpReference('CB-261115-0007', 0), 'CB-261115-0007');
  assert.equal(bumpReference('CB-261115-9999', 1), 'CB-261115-10000');
  assert.equal(bumpReference('not-a-number', 5), 'not-a-number');
});

test('the retry jump grows with the attempt and differs per order', () => {
  const zero = () => 0;
  assert.equal(retryJump(1, 0, zero), 1);
  assert.equal(retryJump(2, 0, zero), 2);
  assert.equal(retryJump(1, 3, zero), 4);
  const almost = () => 0.999;
  assert.equal(retryJump(1, 0, almost), 8);
  assert.equal(retryJump(20, 0, almost), 7 * 0 + 20 + 511); // the range stops growing at 512
});

test('100 phones saving at the same moment with the same order number: every order is saved, all numbers different', async () => {
  const db = []; // what the database holds: { id, reference }
  const upsert = async (rows) => {
    await new Promise((r) => setTimeout(r, Math.random() * 5)); // the network
    for (const r of rows) if (db.some((d) => d.reference === r.reference && d.id !== r.id)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_reference_key"' } };
    for (const r of rows) db.push({ id: r.id, reference: r.reference });
    return { error: null };
  };
  const freshReference = async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 5));
    const last = db.reduce((m, d) => Math.max(m, parseInt(d.reference.split('-')[2], 10)), 0);
    return 'CB-261115-' + String(last + 1).padStart(4, '0');
  };
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      saveOrdersWithRetry({ upsert, freshReference, rows: [{ id: 'o' + i, reference: 'CB-261115-0001', created_at: '2026-11-15T09:00:00Z' }], isNew: () => true, onFixed: () => {} })
    )
  );
  assert.equal(results.length, 100);
  assert.equal(db.length, 100);
  assert.equal(new Set(db.map((d) => d.reference)).size, 100);
});

test('another kind of error is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    saveOrdersWithRetry({ upsert: async () => (calls++, { error: { code: '23503', message: 'foreign key violation' } }), freshReference: async () => 'CB-261115-0001', rows: [{ id: 'a', reference: 'x', created_at: '' }], isNew: () => true, onFixed: () => {} }),
    /foreign key/
  );
  assert.equal(calls, 1);
});
