/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/inspection.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInspection } from '../src/domain/inspection.ts';

const photo = (angle) => ({ id: angle, kind: 'PHOTO', angle });
const base = (over) => ({ phase: 'BEFORE', media: [], damages: [], noDamage: true, ...over });

test('a few photos are enough to send an inspection (not all 8)', () => {
  assert.equal(validateInspection(base({ media: [photo('FRONT'), photo('REAR'), photo('LEFT'), photo('RIGHT')] })), null);
  assert.equal(validateInspection(base({ media: [photo('FRONT')] })), null);
});

test('a video alone is enough', () => {
  assert.equal(validateInspection(base({ media: [{ id: 'v', kind: 'VIDEO' }] })), null);
});

test('no photo and no video is still refused', () => {
  assert.match(validateInspection(base({ media: [] })), /at least one photo/);
});

test('the other rules are unchanged', () => {
  assert.match(validateInspection(base({ media: [photo('FRONT')], damages: [{ id: 'd' }], noDamage: false })), /close-up/);
  assert.match(validateInspection(base({ media: [photo('FRONT')], noDamage: false })), /damages/);
});
