/**
 * Twilio Verify: sends the code and checks it. Twilio makes the code, ends it after 10 minutes and stops it
 * after too many wrong tries, so this app never stores a code. Server only.
 *
 * The network call is passed in, so tests run without sending any message.
 */
import type { OtpError } from '../domain/otp';

const toE164 = (last8: string) => `+974${last8}`;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Reads the settings from the environment. Null when they are not all set. */
export function twilioConfig(env: Record<string, string | undefined> = process.env): TwilioConfig | null {
  const accountSid = (env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (env.TWILIO_AUTH_TOKEN || '').trim();
  const serviceSid = (env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || authToken.length < 16 || !/^VA[0-9a-f]{32}$/i.test(serviceSid)) return null;
  return { accountSid, authToken, serviceSid };
}

/** What went wrong at Twilio, in words the team can act on. Never shown to employees. */
export type TwilioProblemKind = 'TRIAL' | 'BLOCKED' | 'ACCOUNT' | 'BAD_NUMBER' | 'LIMIT' | 'EXPIRED' | 'OTHER';

export interface TwilioProblem {
  kind: TwilioProblemKind;
  /** True when the problem is on the Twilio account side: every employee is affected, the team must act */
  accountSide: boolean;
  /** What it means and what to do, for the admin screen */
  explain: string;
}

/** Twilio error numbers explained. Sources: Twilio error dictionary (21608, 21408, 60410, 60605, 60238, 20003, ...). */
export function twilioProblem(status: number, code: number | undefined): TwilioProblem {
  switch (code) {
    case 21608:
      return {
        kind: 'TRIAL',
        accountSide: true,
        explain: 'The Twilio account is still a Trial account: it can only send to numbers verified by hand in Twilio. Upgrade the account (Twilio Console > Upgrade, add balance).',
      };
    case 21408:
    case 60605:
      return {
        kind: 'BLOCKED',
        accountSide: true,
        explain: 'Sending SMS to Qatar is not allowed on this Twilio account. Turn on Qatar in Twilio Console > Messaging > Settings > Geo permissions (and in the Verify service settings).',
      };
    case 60410:
    case 60238:
      return {
        kind: 'BLOCKED',
        accountSide: true,
        explain: 'Twilio Fraud Guard blocked the message. In Twilio Console > Verify > the service > Fraud Guard, allow Qatar numbers, or ask Twilio support to unblock the prefix.',
      };
    case 20003:
      return { kind: 'ACCOUNT', accountSide: true, explain: 'Twilio refused the Account SID / Auth Token. Check both in Netlify, from the same Twilio account.' };
    case 20404:
      return { kind: 'EXPIRED', accountSide: false, explain: 'No code is waiting for this number (expired, already used, or never sent).' };
    case 60202:
    case 60203:
      return { kind: 'LIMIT', accountSide: false, explain: 'Too many codes or wrong tries for this number. Wait 10 minutes.' };
    case 21211:
    case 21614:
    case 60200:
      return { kind: 'BAD_NUMBER', accountSide: false, explain: 'Twilio says this number cannot receive SMS (not a valid mobile).' };
  }
  if (status === 401 || status === 403) return { kind: 'ACCOUNT', accountSide: true, explain: 'Twilio refused the account settings. Check the Twilio keys in Netlify.' };
  if (status === 429) return { kind: 'LIMIT', accountSide: false, explain: 'Twilio is limiting messages. Wait a few minutes.' };
  return { kind: 'OTHER', accountSide: false, explain: `Twilio answered HTTP ${status}${code ? `, error ${code}` : ''}.` };
}

/**
 * Twilio Verify error codes and HTTP statuses to what the employee is told.
 * Only a number that is really wrong is blamed on the person; anything on the Twilio account side
 * (trial account, country or fraud block, wrong keys) is "SMS unavailable", so nobody retypes a correct number.
 */
export function twilioError(status: number, code: number | undefined): OtpError {
  if (code === 20404 || (status === 404 && code === undefined)) return 'EXPIRED';
  if (code === 60202 || code === 60203) return 'TOO_MANY';
  if (code === 21211 || code === 21614 || code === 60200) return 'BAD_PHONE';
  if (twilioProblem(status, code).accountSide) return 'SMS_UNAVAILABLE';
  if (status === 429) return 'TOO_MANY';
  return 'FAILED';
}

/** Twilio's refusal (HTTP status and Twilio error number only, never a secret), for the log, the admin screen and support. */
export interface TwilioRefusal {
  status: number;
  code?: number;
}

export type TwilioResult = { ok: true } | { ok: false; error: OtpError; twilio?: TwilioRefusal };

function request(config: TwilioConfig, path: string, fields: Record<string, string>, fetcher: Fetcher) {
  const basic = typeof btoa === 'function' ? btoa(`${config.accountSid}:${config.authToken}`) : Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  return fetcher(`https://verify.twilio.com/v2/Services/${config.serviceSid}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function readRefusal(res: { status: number; json: () => Promise<unknown> }): Promise<TwilioRefusal> {
  let code: number | undefined;
  try {
    const body = (await res.json()) as { code?: number };
    code = typeof body?.code === 'number' ? body.code : undefined;
  } catch {
    // no body
  }
  console.error(`Twilio Verify refused: HTTP ${res.status}${code ? `, Twilio error ${code}` : ''}`);
  return { status: res.status, code };
}

/** Sends a code by SMS. The message is in Arabic or English. */
export async function sendCode(
  config: TwilioConfig,
  last8: string,
  lang: 'ar' | 'en',
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<TwilioResult> {
  try {
    const res = await request(config, 'Verifications', { To: toE164(last8), Channel: 'sms', Locale: lang }, fetcher);
    if (res.ok) return { ok: true };
    const twilio = await readRefusal(res);
    let error = twilioError(twilio.status, twilio.code);
    // When sending, "not found" means the Verify service itself is missing: an account problem, not an old code
    if (error === 'EXPIRED') error = 'SMS_UNAVAILABLE';
    return { ok: false, error, twilio };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
}

/** Checks the code the person typed. */
export async function checkCode(
  config: TwilioConfig,
  last8: string,
  code: string,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<TwilioResult> {
  try {
    const res = await request(config, 'VerificationCheck', { To: toE164(last8), Code: code }, fetcher);
    if (!res.ok) {
      const twilio = await readRefusal(res);
      return { ok: false, error: twilioError(twilio.status, twilio.code), twilio };
    }
    const body = (await res.json()) as { status?: string; valid?: boolean };
    if (body?.status === 'approved' && body?.valid !== false) return { ok: true };
    return { ok: false, error: 'WRONG_CODE' };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
}

export interface TwilioHealth {
  /** Settings missing or malformed (names only, never values) */
  problems: string[];
  /** The Verify service answered */
  service: 'ok' | 'missing' | 'refused' | 'unreachable' | 'not checked';
  /** "Trial" or "Full", as Twilio says */
  accountType?: string;
  /** "active", "suspended" or "closed" */
  accountStatus?: string;
}

/** Asks Twilio about the account and the Verify service, without sending any message. */
export async function twilioHealth(
  env: Record<string, string | undefined> = process.env,
  get: (url: string, headers: Record<string, string>) => Promise<{ status: number; json: () => Promise<unknown> }> = (url, headers) =>
    fetch(url, { headers, cache: 'no-store' })
): Promise<TwilioHealth> {
  const accountSid = (env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (env.TWILIO_AUTH_TOKEN || '').trim();
  const serviceSid = (env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  const problems: string[] = [];
  if (!accountSid) problems.push('TWILIO_ACCOUNT_SID is missing');
  else if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) problems.push(`TWILIO_ACCOUNT_SID does not look right (expected AC + 32 characters, got ${accountSid.length} characters)`);
  if (!authToken) problems.push('TWILIO_AUTH_TOKEN is missing');
  else if (authToken.length < 16) problems.push('TWILIO_AUTH_TOKEN is too short');
  if (!serviceSid) problems.push('TWILIO_VERIFY_SERVICE_SID is missing');
  else if (!/^VA[0-9a-f]{32}$/i.test(serviceSid)) problems.push(`TWILIO_VERIFY_SERVICE_SID does not look right (expected VA + 32 characters, got ${serviceSid.length} characters)`);
  if (problems.length) return { problems, service: 'not checked' };

  const basic = typeof btoa === 'function' ? btoa(`${accountSid}:${authToken}`) : Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const headers = { Authorization: `Basic ${basic}` };
  const health: TwilioHealth = { problems, service: 'unreachable' };
  try {
    const [svc, acc] = await Promise.all([
      get(`https://verify.twilio.com/v2/Services/${serviceSid}`, headers),
      get(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, headers),
    ]);
    health.service = svc.status === 200 ? 'ok' : svc.status === 404 ? 'missing' : svc.status === 401 || svc.status === 403 ? 'refused' : 'unreachable';
    if (acc.status === 200) {
      const a = (await acc.json().catch(() => ({}))) as { type?: string; status?: string };
      health.accountType = a.type ? String(a.type) : undefined;
      health.accountStatus = a.status ? String(a.status) : undefined;
    }
  } catch {
    health.service = 'unreachable';
  }
  return health;
}
