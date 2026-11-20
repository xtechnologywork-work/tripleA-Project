import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { codesRequired } from '@/lib/otp-settings';
import { twilioHealth } from '@/lib/twilio-verify';

/**
 * Is sign in by code ready? Public, so it answers only yes or no: no account details, no values.
 * It asks Twilio about the Verify service without sending any message. The full picture is in the admin Settings.
 */
export async function GET(req: Request) {
  if (!rateLimit(`otp-status:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429 });
  }
  const [required, health] = await Promise.all([codesRequired(), twilioHealth()]);
  const ready = health.problems.length === 0 && health.service === 'ok' && health.accountType !== 'Trial' && health.accountStatus !== 'suspended';
  return NextResponse.json({ codesRequired: required, ready }, { headers: { 'Cache-Control': 'no-store' } });
}
