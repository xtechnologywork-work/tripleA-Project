/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/names.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { withTitle } from '../src/domain/names.ts';

test('Al Thani in English gets Sheikh in front', () => {
  assert.equal(withTitle('Hamad Al Thani'), 'Sheikh Hamad Al Thani');
  assert.equal(withTitle('Hamad Al-Thani'), 'Sheikh Hamad Al-Thani');
  assert.equal(withTitle('hamad al thani'), 'Sheikh hamad al thani');
  assert.equal(withTitle('Hamad AlThani'), 'Sheikh Hamad AlThani');
  assert.equal(withTitle('Mohammed bin Hamad Al Thani'), 'Sheikh Mohammed bin Hamad Al Thani');
  assert.equal(withTitle('  Hamad   Al  Thani '), 'Sheikh Hamad Al Thani');
});

test('Al Thani in Arabic gets الشيخ in front', () => {
  assert.equal(withTitle('حمد آل ثاني'), 'الشيخ حمد آل ثاني');
  assert.equal(withTitle('حمد ال ثاني'), 'الشيخ حمد ال ثاني');
  assert.equal(withTitle('حمد الثاني'), 'الشيخ حمد الثاني');
  assert.equal(withTitle('محمد بن حمد آل ثاني'), 'الشيخ محمد بن حمد آل ثاني');
});

test('a name that already has a title is left alone', () => {
  assert.equal(withTitle('Sheikh Hamad Al Thani'), 'Sheikh Hamad Al Thani');
  assert.equal(withTitle('sheikh hamad al thani'), 'sheikh hamad al thani');
  assert.equal(withTitle('Sheikha Moza Al Thani'), 'Sheikha Moza Al Thani');
  assert.equal(withTitle('الشيخ حمد آل ثاني'), 'الشيخ حمد آل ثاني');
  assert.equal(withTitle('الشيخة موزة آل ثاني'), 'الشيخة موزة آل ثاني');
});

test('calling it twice never doubles the title', () => {
  for (const n of ['Hamad Al Thani', 'حمد آل ثاني']) assert.equal(withTitle(withTitle(n)), withTitle(n));
});

test('other names are not changed', () => {
  for (const n of ['Hamad Al-Sulaiti', 'Fatima Al Mansoori', 'Thani Ahmed', 'Albathani Saleh', 'Omar Hermas', 'bader', 'حمد المهندي', 'الثانية حسن', '']) {
    assert.equal(withTitle(n), n);
  }
});

import { initialOf } from '../src/domain/names.ts';

test('the avatar letter skips the title', () => {
  assert.equal(initialOf('Sheikh Hamad Al Thani'), 'H');
  assert.equal(initialOf('الشيخ حمد آل ثاني'), 'ح');
  assert.equal(initialOf('bader'), 'B');
  assert.equal(initialOf(''), '?');
});
