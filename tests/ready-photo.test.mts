/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/ready-photo.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsReadyPhoto, customerPhotos, readyPhotoOf } from '../src/domain/ready-photo.ts';

test('marking a car ready at its bay needs the photo, from any earlier step', () => {
  for (const from of ['IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'ISSUE_REPORTED']) assert.equal(needsReadyPhoto(from, 'RETURNED_TO_PARKING'), true, from);
  // other moves do not
  assert.equal(needsReadyPhoto('NEW', 'ASSIGNED'), false);
  assert.equal(needsReadyPhoto('ASSIGNED', 'IN_PROGRESS'), false);
  assert.equal(needsReadyPhoto('RETURNED_TO_PARKING', 'RETURNED_TO_PARKING'), false);
  assert.equal(needsReadyPhoto('RETURNED_TO_PARKING', 'ISSUE_REPORTED'), false);
});

test("the customer's photo and the ready photo are never mixed up", () => {
  const photos = [
    { id: 'r1', kind: 'AFTER', createdAt: '2026-11-21T10:00:00Z' },
    { id: 'c1', kind: 'BEFORE', createdAt: '2026-11-21T08:00:00Z' },
    { id: 'r2', kind: 'AFTER', createdAt: '2026-11-21T11:00:00Z' },
    { id: 'old', createdAt: '2026-11-01T08:00:00Z' }, // an old photo without a kind is the customer's
    { id: 'i1', kind: 'ISSUE', createdAt: '2026-11-21T09:00:00Z' },
  ];
  assert.deepEqual(customerPhotos(photos).map((p) => p.id), ['c1', 'old']);
  assert.equal(readyPhotoOf(photos).id, 'r2'); // the newest one (a retake)
  // a customer who sent no photo: the ready photo is not shown as their plate photo
  assert.deepEqual(customerPhotos([{ id: 'r1', kind: 'AFTER' }]), []);
  assert.equal(readyPhotoOf([{ id: 'c1', kind: 'BEFORE' }]), undefined);
  assert.equal(readyPhotoOf([]), undefined);
});
