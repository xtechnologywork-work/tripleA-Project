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

test('a new car waiting on a bay where a washed car was left: the washed one is probably collected', () => {
  const washed = returned('1232', 'B3', 120);
  const fresh = order({ bayCodeSnapshot: '1232', createdAt: iso(10 * MIN) });
  const b = buildTowerBoard([washed, fresh], new Map(), NOW);
  assert.equal(b.ready[0].probablyGone, true);
  assert.equal(b.toPickUp[0].washedHere, true);
  assert.equal(b.ready[0].conflict, false);
});

test('a waiting car that was there first and a washed car on the same number: one number is wrong', () => {
  const waiting = order({ bayCodeSnapshot: '1232', createdAt: iso(300 * MIN) });
  const washed = returned('1232', 'B3', 20);
  const b = buildTowerBoard([waiting, washed], new Map(), NOW);
  assert.equal(b.ready[0].conflict, true);
  assert.equal(b.toPickUp[0].conflict, true);
  assert.equal(b.ready[0].probablyGone, undefined);
});

test('a car with the team leaves its bay free for a new car', () => {
  const away = order({ status: 'IN_PROGRESS', bayCodeSnapshot: '12' });
  const fresh = order({ bayCodeSnapshot: '12' });
  const b = buildTowerBoard([away, fresh], new Map(), NOW);
  assert.equal(b.toPickUp[0].conflict, false);
  assert.equal(b.withTeam.length, 1);
});

test('a car the team marked as collected leaves the ready list', () => {
  const washed = returned('88', 'B3', 5);
  const b = buildTowerBoard([washed], new Map(), NOW, new Set([washed.id]));
  assert.equal(b.ready.length, 0);
});
