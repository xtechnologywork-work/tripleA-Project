/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/orderflow.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCustomerMove, getAllowedTransitions, isValidStaffTransition, getNextStaffStatuses } from '../src/domain/status-machine.ts';
import { reorderTimes } from '../src/domain/analytics.ts';

const order = (status, employeeId = 'e1') => ({ id: 'o1', employeeId, status });
const me = { type: 'EMPLOYEE', id: 'e1' };
const other = { type: 'EMPLOYEE', id: 'e2' };
const staff = { type: 'STAFF', id: 's1', role: 'SUPERADMIN' };

test('a customer can postpone a new or assigned order, and re-order it', () => {
  assert.equal(isCustomerMove('NEW', 'DELAYED'), true);
  assert.equal(isCustomerMove('ASSIGNED', 'DELAYED'), true);
  assert.equal(isCustomerMove('DELAYED', 'NEW'), true);
  assert.equal(isCustomerMove('DELAYED', 'CANCELLED'), true);
  assert.equal(isCustomerMove('NEW', 'CANCELLED'), true);
});

test('a customer cannot postpone once the wash started, or jump to other statuses', () => {
  for (const from of ['IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'RETURNED_TO_PARKING', 'CANCELLED', 'ISSUE_REPORTED']) {
    assert.equal(isCustomerMove(from, 'DELAYED'), false, from);
  }
  assert.equal(isCustomerMove('DELAYED', 'ASSIGNED'), false);
  assert.equal(isCustomerMove('DELAYED', 'IN_PROGRESS'), false);
  assert.equal(isCustomerMove('ASSIGNED', 'CANCELLED'), false);
});

test('the owner sees postpone and re-order as allowed, another customer sees nothing', () => {
  assert.deepEqual(getAllowedTransitions(order('NEW'), me).sort(), ['CANCELLED', 'DELAYED']);
  assert.deepEqual(getAllowedTransitions(order('ASSIGNED'), me), ['DELAYED']);
  assert.deepEqual(getAllowedTransitions(order('DELAYED'), me).sort(), ['CANCELLED', 'NEW']);
  assert.deepEqual(getAllowedTransitions(order('NEW'), other), []);
  assert.deepEqual(getAllowedTransitions(order('DELAYED'), other), []);
});

test('staff cannot work a postponed order: only cancel it', () => {
  assert.equal(isValidStaffTransition('DELAYED', 'ASSIGNED'), false);
  assert.equal(isValidStaffTransition('DELAYED', 'IN_PROGRESS'), false);
  assert.equal(isValidStaffTransition('DELAYED', 'NEW'), false);
  assert.equal(isValidStaffTransition('DELAYED', 'CANCELLED'), true);
  assert.deepEqual(getNextStaffStatuses('DELAYED'), ['CANCELLED']);
  assert.deepEqual(getAllowedTransitions(order('DELAYED'), staff), ['CANCELLED']);
});

test('the latest re-order time of each order', () => {
  const ev = (id, orderId, type, iso) => ({ id, orderId, type, createdAt: iso, actor: { type: 'EMPLOYEE', id: 'e1' } });
  const map = reorderTimes([
    ev('1', 'a', 'DELAYED', '2026-11-07T10:00:00Z'),
    ev('2', 'a', 'REORDERED', '2026-11-07T10:30:00Z'),
    ev('3', 'a', 'REORDERED', '2026-11-07T12:00:00Z'),
    ev('4', 'b', 'CREATED', '2026-11-07T09:00:00Z'),
  ]);
  assert.equal(map.get('a'), Date.parse('2026-11-07T12:00:00Z'));
  assert.equal(map.has('b'), false);
});
