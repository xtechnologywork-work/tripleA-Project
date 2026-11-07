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

/**
 * Twilio Verify error codes and HTTP statuses to our errors.
 * 20404: no pending code (expired, already used, or never sent). 60202: too many wrong codes.
 * 60203: too many messages. 60410 / 60605: blocked by fraud protection or country permissions.
 * 21608 / 21211 / 60200: the number cannot receive messages or is invalid.
 */
export function twilioError(status: number, code: number | undefined): OtpError {
  if (code === 20404 || status === 404) return 'EXPIRED';
  if (code === 60202 || code === 60203 || status === 429) return 'TOO_MANY';
  if (code === 60410 || code === 60605 || code === 21408) return 'BLOCKED';
  if (code === 21608 || code === 21211 || code === 21614 || code === 60200) return 'BAD_PHONE';
  if (status === 401 || status === 403 || code === 20003) return 'NOT_READY';
  return 'FAILED';
}

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

async function readError(res: { status: number; json: () => Promise<unknown> }): Promise<OtpError> {
  let code: number | undefined;
  try {
    const body = (await res.json()) as { code?: number };
    code = typeof body?.code === 'number' ? body.code : undefined;
  } catch {
    // no body
  }
  return twilioError(res.status, code);
}

/** Sends a code by SMS. The message is in Arabic or English. */
export async function sendCode(
  config: TwilioConfig,
  last8: string,
  lang: 'ar' | 'en',
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<{ ok: true } | { ok: false; error: OtpError }> {
  try {
    const res = await request(config, 'Verifications', { To: toE164(last8), Channel: 'sms', Locale: lang }, fetcher);
    if (res.ok) return { ok: true };
    return { ok: false, error: await readError(res) };
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
): Promise<{ ok: true } | { ok: false; error: OtpError }> {
  try {
    const res = await request(config, 'VerificationCheck', { To: toE164(last8), Code: code }, fetcher);
    if (!res.ok) return { ok: false, error: await readError(res) };
    const body = (await res.json()) as { status?: string; valid?: boolean };
    if (body?.status === 'approved' && body?.valid !== false) return { ok: true };
    return { ok: false, error: 'WRONG_CODE' };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
}
