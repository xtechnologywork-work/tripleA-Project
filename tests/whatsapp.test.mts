/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/whatsapp.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WA_TEMPLATES,
  WA_STAGES,
  readWaTemplates,
  cleanWaTemplates,
  fillWaTemplate,
  waNumber,
  waLink,
  waStagesReached,
} from '../src/domain/whatsapp.ts';

const details = { name: ' Sara ', reference: 'CB-261121-0007', parkingBay: '525', floor: 'B2', readyBay: '574', service: 'Signature' };

test('every step has a default message in Arabic and English with the order number', () => {
  for (const s of WA_STAGES) {
    const t = DEFAULT_WA_TEMPLATES[s];
    assert.match(t, /\{reference\}/, s);
    assert.match(t, /[؀-ۿ]/, `${s} has Arabic`);
    assert.match(t, /Hello/, `${s} has English`);
  }
  assert.match(DEFAULT_WA_TEMPLATES.READY, /\{floor\}/);
  assert.match(DEFAULT_WA_TEMPLATES.READY, /\{ready_bay\}/);
});

test('the order details go in; unknown words stay as typed', () => {
  assert.equal(fillWaTemplate('Hi {name}, {reference} at {parking_bay}', details), 'Hi Sara, CB-261121-0007 at 525');
  assert.equal(fillWaTemplate('{floor} / {ready_bay} / {service}', details), 'B2 / 574 / Signature');
  assert.equal(fillWaTemplate('{name} {unknown}', details), 'Sara {unknown}');
  // before the car is ready, the ready bay falls back to the parking bay
  assert.equal(fillWaTemplate('{ready_bay}', { ...details, readyBay: undefined }), '525');
  // a $ in a name is not read as a special pattern
  assert.equal(fillWaTemplate('{name}', { ...details, name: 'A$&B' }), 'A$&B');
});

test('Qatar numbers get 974; anything unusable gives no link', () => {
  assert.equal(waNumber('+974 5512 8901'), '97455128901');
  assert.equal(waNumber('55128901'), '97455128901');
  assert.equal(waNumber('0097455128901'), '97455128901');
  assert.equal(waNumber(''), null);
  assert.equal(waNumber('12345'), null);
  assert.equal(waNumber(undefined), null);
  const link = waLink('+974 5512 8901', 'مرحباً Sara\nline 2 & more?');
  assert.ok(link.startsWith('https://wa.me/97455128901?text='));
  assert.equal(decodeURIComponent(link.split('text=')[1]), 'مرحباً Sara\nline 2 & more?');
  assert.equal(waLink(null, 'x'), null);
});

test('a button opens only once the order reached its step', () => {
  assert.deepEqual(waStagesReached({ status: 'NEW' }, false), { INSPECTION: false, ASSIGNED: false, WASHING: false, READY: false });
  assert.deepEqual(waStagesReached({ status: 'ASSIGNED' }, true), { INSPECTION: true, ASSIGNED: true, WASHING: false, READY: false });
  assert.deepEqual(waStagesReached({ status: 'IN_PROGRESS' }, true), { INSPECTION: true, ASSIGNED: true, WASHING: true, READY: false });
  assert.deepEqual(waStagesReached({ status: 'RETURNED_TO_PARKING' }, true), { INSPECTION: true, ASSIGNED: true, WASHING: true, READY: true });
  // an order with an issue keeps the step it had reached
  assert.equal(waStagesReached({ status: 'ISSUE_REPORTED', statusBeforeIssue: 'IN_PROGRESS' }, true).WASHING, true);
  assert.equal(waStagesReached({ status: 'CANCELLED' }, false).ASSIGNED, false);
});

test('saving: only the steps sent change; empty, too long or not text is refused', () => {
  const r = cleanWaTemplates({ ASSIGNED: '  New text {name}\r\nline  ' }, DEFAULT_WA_TEMPLATES);
  assert.equal(r.ok, true);
  assert.equal(r.templates.ASSIGNED, 'New text {name}\nline');
  assert.equal(r.templates.READY, DEFAULT_WA_TEMPLATES.READY);
  assert.equal(cleanWaTemplates({ READY: '   ' }, DEFAULT_WA_TEMPLATES).ok, false);
  assert.equal(cleanWaTemplates({ READY: 'x'.repeat(1001) }, DEFAULT_WA_TEMPLATES).ok, false);
  assert.equal(cleanWaTemplates({ READY: 5 }, DEFAULT_WA_TEMPLATES).ok, false);
  assert.equal(cleanWaTemplates({}, DEFAULT_WA_TEMPLATES).ok, false);
  assert.equal(cleanWaTemplates(null, DEFAULT_WA_TEMPLATES).ok, false);
});

test('a damaged saved file falls back to the defaults, step by step', () => {
  assert.deepEqual(readWaTemplates(null), DEFAULT_WA_TEMPLATES);
  const t = readWaTemplates({ ASSIGNED: 'Saved', READY: '', WASHING: 42 });
  assert.equal(t.ASSIGNED, 'Saved');
  assert.equal(t.READY, DEFAULT_WA_TEMPLATES.READY);
  assert.equal(t.WASHING, DEFAULT_WA_TEMPLATES.WASHING);
});
