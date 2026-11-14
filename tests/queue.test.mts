/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/queue.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveVipOrder, queueRank, sortQueue } from '../src/domain/queue.ts';
import { buildTowerBoard } from '../src/domain/bays.ts';

const VIP = new Set(['vip1', 'vip2']);
let n = 0;
const order = (employeeId, status, queued) => ({ id: `o${++n}`, reference: `CB-${n}`, employeeId, status, queued, bayCodeSnapshot: String(n), createdAt: new Date(queued).toISOString(), updatedAt: new Date(queued).toISOString() });
const ids = (list) => list.map((o) => o.id);
const when = (o) => o.queued;

test('an active VIP order goes to the very top, even when it is older', () => {
  const normalNew = order('e1', 'NEW', 3000);
  const vipOld = order('vip1', 'NEW', 1000);
  const normalOld = order('e2', 'ASSIGNED', 2000);
  const sorted = sortQueue([normalNew, vipOld, normalOld], VIP, when);
  assert.deepEqual(ids(sorted), [vipOld.id, normalNew.id, normalOld.id]);
});

test('a VIP stays on top while the wash is going, whatever the stage', () => {
  for (const status of ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'ISSUE_REPORTED']) {
    assert.equal(queueRank(order('vip1', status, 1), VIP), 0, status);
  }
});

test('when the VIP order is done it joins the normal order again', () => {
  const done = order('vip1', 'RETURNED_TO_PARKING', 1000);
  const cancelled = order('vip1', 'CANCELLED', 1500);
  const normalNew = order('e1', 'NEW', 2000);
  assert.equal(isActiveVipOrder(done, VIP), false);
  assert.equal(isActiveVipOrder(cancelled, VIP), false);
  assert.deepEqual(ids(sortQueue([done, cancelled, normalNew], VIP, when)), [normalNew.id, cancelled.id, done.id]);
});

test('a postponed order, even a VIP one, waits at the bottom', () => {
  const delayedVip = order('vip1', 'DELAYED', 9000);
  const normal = order('e1', 'NEW', 1000);
  assert.deepEqual(ids(sortQueue([delayedVip, normal], VIP, when)), [normal.id, delayedVip.id]);
});

test('several VIP orders: newest first among themselves, all above the rest', () => {
  const a = order('vip1', 'NEW', 1000);
  const b = order('vip2', 'NEW', 2000);
  const c = order('e1', 'NEW', 3000);
  assert.deepEqual(ids(sortQueue([c, a, b], VIP, when)), [b.id, a.id, c.id]);
});

test('without any VIP the order is the usual newest first', () => {
  const a = order('e1', 'NEW', 1000);
  const b = order('e2', 'NEW', 2000);
  assert.deepEqual(ids(sortQueue([a, b], new Set(), when)), [b.id, a.id]);
});

test('the tower board puts VIP cars first and marks them', () => {
  const NOW = Date.parse('2026-11-14T12:00:00Z');
  const older = order('e1', 'NEW', NOW - 60 * 60000);
  const vip = order('vip1', 'NEW', NOW - 5 * 60000);
  const b = buildTowerBoard([older, vip], new Map(), NOW, new Set(), VIP);
  assert.deepEqual(b.toPickUp.map((c) => c.order.id), [vip.id, older.id]);
  assert.equal(b.toPickUp[0].vip, true);
  assert.equal(b.toPickUp[1].vip, undefined);
});
