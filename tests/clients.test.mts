/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/clients.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isQid, isQidClient, clientIdLine, cleanManualClient } from '../src/domain/clients.ts';
import { qatarMobile } from '../src/domain/otp.ts';

const good = { fullName: '  Sara   Al Marri ', phone: '+974 5512 8901', qid: '29012345678', team: 'Marketing' };

test('a QID is 11 digits starting with 2 or 3', () => {
  for (const ok of ['29012345678', '30012345678', '28400000000']) assert.equal(isQid(ok), true, ok);
  for (const bad of ['2901234567', '290123456789', '19012345678', '49012345678', '2901234567a', '', undefined, null, ' 29012345678'])
    assert.equal(isQid(bad), false, String(bad));
});

test('a client added by the team is known by the QID, an employee by the employee number', () => {
  assert.equal(isQidClient({ qid: '29012345678' }), true);
  assert.equal(isQidClient({ employeeNo: '69123456', qid: '29012345678' }), false);
  assert.equal(isQidClient({ employeeNo: '69123456' }), false);
  assert.equal(isQidClient(null), false);
  assert.deepEqual(clientIdLine({ qid: '29012345678' }), { label: 'QID', value: '29012345678' });
  assert.deepEqual(clientIdLine({ employeeNo: '69123456', qid: '29012345678' }), { label: 'Employee no', value: '69123456' });
  assert.equal(clientIdLine({}), null);
});

test('the add-client form: cleaned, with the team saved as the company', () => {
  const r = cleanManualClient(good, qatarMobile);
  assert.deepEqual(r, { ok: true, client: { fullName: 'Sara Al Marri', phone: '55128901', qid: '29012345678', company: 'Marketing team' } });
  assert.equal(cleanManualClient({ ...good, team: 'Security' }, qatarMobile).client.company, 'Security team');
  assert.equal(cleanManualClient({ ...good, team: 'Other', otherTeam: ' Cleaning  company ' }, qatarMobile).client.company, 'Cleaning company');
  // spaces or dashes typed in the QID are removed
  assert.equal(cleanManualClient({ ...good, qid: '290-1234 5678' }, qatarMobile).client.qid, '29012345678');
});

test('the add-client form refuses anything wrong, with a plain reason', () => {
  const bad = [
    { fullName: 'S' },
    { phone: '44123456' }, // landline
    { phone: '5512' },
    { qid: '1234' },
    { qid: '19012345678' },
    { team: 'Cleaners' }, // not in the list
    { team: 'Other', otherTeam: '' },
  ];
  for (const b of bad) {
    const r = cleanManualClient({ ...good, ...b }, qatarMobile);
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.ok(r.error.length > 5);
  }
});
