/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/bays.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTowerBoard, findBay, READY_WINDOW_MS } from '../src/domain/bays.ts';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const MIN = 60000;
let n = 0;
const order = (over) => ({ id: `o${++n}`, reference: `CB-${n}`, bayCodeSnapshot: '10', status: 'NEW', createdAt: iso(10 * MIN), updatedAt: iso(10 * MIN), ...over });
const returned = (bay, floor, minAgo, over = {}) =>
  order({ status: 'RETURNED_TO_PARKING', returnConfirmation: { bayCode: bay, floor, confirmedAt: iso(minAgo * MIN) }, ...over });

test('each car is in exactly one place', () => {
  const b = buildTowerBoard(
    [
      order({ status: 'NEW' }),
      order({ status: 'ASSIGNED', bayCodeSnapshot: '11' }),
      order({ status: 'IN_PROGRESS' }),
      order({ status: 'QUALITY_CHECK' }),
      order({ status: 'COMPLETED' }),
      order({ status: 'ISSUE_REPORTED' }),
      returned('88', 'B3', 30),
      order({ status: 'DELAYED' }),
      order({ status: 'CANCELLED' }),
    ],
    new Map(),
    NOW
  );
  assert.equal(b.toPickUp.length, 2);
  assert.equal(b.withTeam.length, 4);
  assert.equal(b.ready.length, 1);
  assert.equal(b.postponed, 1);
});

test('the longest waiting car comes first, and a re-ordered car waits from its return', () => {
  const old = order({ createdAt: iso(60 * MIN) });
  const fresh = order({ createdAt: iso(5 * MIN) });
  const back = order({ createdAt: iso(300 * MIN) });
  const b = buildTowerBoard([fresh, back, old], new Map([[back.id, NOW - 1 * MIN]]), NOW);
  assert.deepEqual(b.toPickUp.map((c) => c.order.id), [old.id, fresh.id, back.id]);
});

test('a ready car shows the return floor and bay, B3 when only the bay was saved', () => {
  const a = returned('88', 'B3', 5);
  const noFloor = returned('99', undefined, 6);
  const b = buildTowerBoard([a, noFloor], new Map(), NOW);
  const byBay = Object.fromEntries(b.ready.map((c) => [c.bay, c.floor]));
  assert.equal(byBay['88'], 'B3');
  assert.equal(byBay['99'], 'B3');
});

test('a ready car older than a day leaves the board', () => {
  const b = buildTowerBoard([returned('88', 'B3', 5), returned('99', 'B3', READY_WINDOW_MS / MIN + 1)], new Map(), NOW);
  assert.deepEqual(b.ready.map((c) => c.bay), ['88']);
});

test('two cars on the same bay number are marked, in each place', () => {
  const b = buildTowerBoard(
    [order({ bayCodeSnapshot: '5' }), order({ bayCodeSnapshot: '5' }), order({ bayCodeSnapshot: '6' }), returned('70', 'B3', 5), returned('70', 'B3', 9), returned('70', 'B2', 9)],
    new Map(),
    NOW
  );
  assert.deepEqual(b.toPickUp.map((c) => c.conflict), [true, true, false]);
  assert.deepEqual(b.ready.filter((c) => c.floor === 'B3').map((c) => c.conflict), [true, true]);
  assert.equal(b.ready.find((c) => c.floor === 'B2').conflict, false);
});

test('a bay number answers what is there', () => {
  const b = buildTowerBoard([order({ bayCodeSnapshot: '5' }), returned('5', 'B3', 5), order({ bayCodeSnapshot: '9' })], new Map(), NOW);
  const f = findBay(b, 5);
  assert.equal(f.waiting.length, 1);
  assert.equal(f.ready.length, 1);
  assert.deepEqual(findBay(b, 700), { waiting: [], ready: [] });
});
