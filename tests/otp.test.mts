/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/otp.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { qatarMobile, isCode, LIMITS, isMinistryEmployeeNo } from '../src/domain/otp.ts';
import { twilioConfig, twilioError, twilioProblem, twilioHealth, sendCode, checkCode } from '../src/lib/twilio-verify.ts';

const CONFIG = { accountSid: 'AC' + 'a'.repeat(32), authToken: 'x'.repeat(32), serviceSid: 'VA' + 'b'.repeat(32) };

/** A pretend Twilio: records the request and answers with what the test asks for. No message is sent. */
function fakeTwilio(status, body) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init, fields: Object.fromEntries(new URLSearchParams(init.body)) });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetcher, calls };
}

test('only real Qatar mobile numbers are accepted', () => {
  assert.equal(qatarMobile('55128901'), '55128901');
  assert.equal(qatarMobile('+974 5512 8901'), '55128901');
  assert.equal(qatarMobile('0097455128901'), '55128901');
  assert.equal(qatarMobile('974 3312 4455'), '33124455');
  assert.equal(qatarMobile('66123456'), '66123456');
  assert.equal(qatarMobile('77123456'), '77123456');
  assert.equal(qatarMobile('44123456'), null); // landline
  assert.equal(qatarMobile('5512890'), null); // too short
  assert.equal(qatarMobile('551289012'), null); // too long
  assert.equal(qatarMobile('+212 612345678'), null); // not Qatar
  assert.equal(qatarMobile(''), null);
});

test('a code is exactly six digits', () => {
  assert.equal(isCode('123456'), true);
  assert.equal(isCode('12345'), false);
  assert.equal(isCode('1234567'), false);
  assert.equal(isCode('12a456'), false);
});

test('the limits stay low', () => {
  assert.ok(LIMITS.sendPerPhone.max <= 5);
  assert.ok(LIMITS.checkPerPhone.max <= 10);
});

test('settings are read only when all three are present and well formed', () => {
  assert.equal(twilioConfig({}), null);
  assert.equal(twilioConfig({ TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'x'.repeat(32), TWILIO_VERIFY_SERVICE_SID: CONFIG.serviceSid }), null);
  const ok = twilioConfig({ TWILIO_ACCOUNT_SID: CONFIG.accountSid, TWILIO_AUTH_TOKEN: CONFIG.authToken, TWILIO_VERIFY_SERVICE_SID: ` ${CONFIG.serviceSid} ` });
  assert.equal(ok.serviceSid, CONFIG.serviceSid);
});

test('sending a code calls Twilio Verify with the number, SMS and the language', async () => {
  const { fetcher, calls } = fakeTwilio(201, { status: 'pending' });
  const res = await sendCode(CONFIG, '55128901', 'ar', fetcher);
  assert.deepEqual(res, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://verify.twilio.com/v2/Services/${CONFIG.serviceSid}/Verifications`);
  assert.deepEqual(calls[0].fields, { To: '+97455128901', Channel: 'sms', Locale: 'ar' });
  assert.equal(calls[0].init.headers.Authorization, 'Basic ' + Buffer.from(`${CONFIG.accountSid}:${CONFIG.authToken}`).toString('base64'));
});

test('a right code is approved, a wrong one is refused', async () => {
  const right = fakeTwilio(200, { status: 'approved', valid: true });
  assert.deepEqual(await checkCode(CONFIG, '55128901', '123456', right.fetcher), { ok: true });
  assert.deepEqual(right.calls[0].fields, { To: '+97455128901', Code: '123456' });
  const wrong = fakeTwilio(200, { status: 'pending', valid: false });
  assert.deepEqual(await checkCode(CONFIG, '55128901', '000000', wrong.fetcher), { ok: false, error: 'WRONG_CODE' });
});

test('Twilio errors become short answers the screen can explain', async () => {
  assert.equal(twilioError(404, 20404), 'EXPIRED');
  assert.equal(twilioError(429, 60203), 'TOO_MANY');
  assert.equal(twilioError(429, 60202), 'TOO_MANY');
  assert.equal(twilioError(400, 60200), 'BAD_PHONE');
  assert.equal(twilioError(400, 21211), 'BAD_PHONE');
  assert.equal(twilioError(500, undefined), 'FAILED');
  const expired = fakeTwilio(404, { code: 20404 });
  assert.deepEqual(await checkCode(CONFIG, '55128901', '123456', expired.fetcher), { ok: false, error: 'EXPIRED', twilio: { status: 404, code: 20404 } });
});

test('a problem on the Twilio account is never blamed on the employee number', async () => {
  // 21608: trial account (the bug seen on a real phone: a right number was told it was not valid)
  for (const [status, code] of [[400, 21608], [403, 21408], [403, 60605], [403, 60410], [403, 60238], [401, 20003], [401, undefined], [403, undefined]]) {
    assert.equal(twilioError(status, code), 'SMS_UNAVAILABLE', String(code ?? status));
    assert.equal(twilioProblem(status, code).accountSide, true, String(code ?? status));
  }
  assert.equal(twilioProblem(400, 21608).kind, 'TRIAL');
  assert.match(twilioProblem(400, 21608).explain, /Trial/);
  assert.equal(twilioProblem(400, 21211).accountSide, false);
  // sending: the refusal comes back with the Twilio number, for the admin screen
  const trial = fakeTwilio(400, { code: 21608, message: 'unverified' });
  assert.deepEqual(await sendCode(CONFIG, '51704550', 'en', trial.fetcher), { ok: false, error: 'SMS_UNAVAILABLE', twilio: { status: 400, code: 21608 } });
  // sending to a Verify service that does not exist is an account problem, not an "expired code"
  const noService = fakeTwilio(404, { code: 20404 });
  assert.equal((await sendCode(CONFIG, '51704550', 'en', noService.fetcher)).error, 'SMS_UNAVAILABLE');
});

test('the health check reads the account type without sending anything, and never needs a value shown', async () => {
  const env = { TWILIO_ACCOUNT_SID: CONFIG.accountSid, TWILIO_AUTH_TOKEN: CONFIG.authToken, TWILIO_VERIFY_SERVICE_SID: CONFIG.serviceSid };
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    return url.includes('/Accounts/') ? { status: 200, json: async () => ({ type: 'Trial', status: 'active' }) } : { status: 200, json: async () => ({}) };
  };
  const h = await twilioHealth(env, get);
  assert.deepEqual(h, { problems: [], service: 'ok', accountType: 'Trial', accountStatus: 'active' });
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => !u.includes('Verifications')));
  const missing = await twilioHealth({}, get);
  assert.equal(missing.service, 'not checked');
  assert.equal(missing.problems.length, 3);
  const wrongService = await twilioHealth(env, async (url) => ({ status: url.includes('/Accounts/') ? 200 : 404, json: async () => ({ type: 'Full' }) }));
  assert.equal(wrongService.service, 'missing');
});

test('no network never breaks the sign in, it just says it failed', async () => {
  const broken = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(await sendCode(CONFIG, '55128901', 'en', broken), { ok: false, error: 'FAILED' });
  assert.deepEqual(await checkCode(CONFIG, '55128901', '123456', broken), { ok: false, error: 'FAILED' });
});

test('the sign-up note cannot be changed or reused for another number, and it expires', async () => {
  process.env.SESSION_SECRET = 'test-secret-'.repeat(4);
  const s = await import('../src/lib/employee-session.ts');
  const note = s.signPendingSignup({ phone: '55128901', fullName: 'Sara', employeeNo: 'E-1' });
  assert.deepEqual(s.verifyPendingSignup(note), { phone: '55128901', fullName: 'Sara', employeeNo: 'E-1' });
  // changing the details breaks the signature
  const [data, exp, sig] = note.split('.');
  const forged = Buffer.from(JSON.stringify({ phone: '55128901', fullName: 'Someone else', employeeNo: 'E-1', kind: 'signup' })).toString('base64url');
  assert.equal(s.verifyPendingSignup(`${forged}.${exp}.${sig}`), null);
  assert.equal(s.verifyPendingSignup(`${data}.${Number(exp) + 1000}.${sig}`), null);
  // expired
  const old = s.signPendingSignup({ phone: '55128901', fullName: 'Sara', employeeNo: 'E-1' }, -1);
  assert.equal(s.verifyPendingSignup(old), null);
  // a session token is not a sign-up note
  assert.equal(s.verifyPendingSignup(s.signEmployeeToken('emp-1')), null);
  assert.equal(s.verifyPendingSignup(''), null);
});

test('only Ministry employee numbers can sign up: 8 digits starting with 69 or 46', () => {
  for (const ok of ['69123456', '46123456', '69000000', '46999999']) assert.equal(isMinistryEmployeeNo(ok), true, ok);
  const bad = [
    '4632432', // 7 digits
    '691234567', // 9 digits
    '12345678', // wrong start
    '59123456',
    '96123456',
    '64123456',
    '6912345a',
    '69 12345',
    '69-12345',
    ' 69123456',
    '69123456\n',
    '',
    undefined,
    null,
  ];
  for (const b of bad) assert.equal(isMinistryEmployeeNo(b), false, String(b));
});
