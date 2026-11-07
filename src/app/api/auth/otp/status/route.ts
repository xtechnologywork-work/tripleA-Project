import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { otpEnabled } from '@/lib/otp-auth';

/**
 * Is sign in by code ready? Answers only yes or no for each part, never a value.
 * It asks Twilio about the Verify service without sending any message.
 */
export async function GET(req: Request) {
  if (!rateLimit(`otp-status:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429 });
  }
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const serviceSid = (process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();

  const problems: string[] = [];
  if (!accountSid) problems.push('TWILIO_ACCOUNT_SID is missing');
  else if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) problems.push(`TWILIO_ACCOUNT_SID does not look right (starts with ${accountSid.slice(0, 2)}, ${accountSid.length} characters, expected AC and 34)`);
  if (!authToken) problems.push('TWILIO_AUTH_TOKEN is missing');
  else if (authToken.length < 16) problems.push(`TWILIO_AUTH_TOKEN is too short (${authToken.length} characters, expected 32)`);
  if (!serviceSid) problems.push('TWILIO_VERIFY_SERVICE_SID is missing');
  else if (!/^VA[0-9a-f]{32}$/i.test(serviceSid)) problems.push(`TWILIO_VERIFY_SERVICE_SID does not look right (starts with ${serviceSid.slice(0, 2)}, ${serviceSid.length} characters, expected VA and 34)`);

  let twilio = 'not checked';
  if (problems.length === 0) {
    try {
      const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
        cache: 'no-store',
      });
      twilio =
        res.status === 200
          ? 'ok'
          : res.status === 401
            ? 'Twilio refused the Account SID and Auth Token (check both, from the same Twilio account)'
            : res.status === 404
              ? 'Twilio has no Verify service with this Service SID in this account'
              : `Twilio answered ${res.status}`;
    } catch {
      twilio = 'Twilio could not be reached';
    }
  }

  return NextResponse.json(
    { codesRequired: otpEnabled(), ready: problems.length === 0 && twilio === 'ok', problems, twilio },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
