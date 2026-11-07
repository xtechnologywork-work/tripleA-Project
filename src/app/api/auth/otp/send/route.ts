import { NextResponse } from 'next/server';
import { LIMITS, RESEND_SECONDS, qatarMobile, type OtpError } from '@/domain/otp';
import { twilioConfig, sendCode } from '@/lib/twilio-verify';
import { underLimits, recordEvents } from '@/lib/otp-limits';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { signPendingSignup } from '@/lib/employee-session';
import { otpEnabled, devCode, findByPhone, cleanName, validName, cleanEmployeeNo, validEmployeeNo } from '@/lib/otp-auth';

const fail = (error: OtpError, status = 400) => NextResponse.json({ error }, { status });

/**
 * Step 1 of sign in and sign up: checks the details, then sends a code by SMS.
 * For sign up it also returns a signed note with the details, used in step 2.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // A first quick brake on this machine; the real limits below are kept in the database
  if (!rateLimit(`otp-send:${ip}`, 20, 60_000)) return fail('TOO_MANY', 429);

  let body: { action?: string; phone?: string; fullName?: string; employeeNo?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return fail('FAILED');
  }
  const action = body.action === 'signup' ? 'signup' : body.action === 'login' ? 'login' : null;
  if (!action) return fail('FAILED');

  const phone = qatarMobile(String(body.phone || ''));
  if (!phone) return fail('BAD_PHONE');

  const existing = await findByPhone(phone);
  let pending: string | undefined;

  if (action === 'login') {
    if (!existing) return fail('NOT_FOUND', 404);
    if (existing.status === 'SUSPENDED') return fail('SUSPENDED', 403);
  } else {
    const fullName = cleanName(body.fullName);
    const employeeNo = cleanEmployeeNo(body.employeeNo);
    if (!validName(fullName)) return fail('BAD_NAME');
    if (!validEmployeeNo(employeeNo)) return fail('BAD_EMPLOYEE_NO');
    if (existing) return fail('EXISTS', 409);
    try {
      pending = signPendingSignup({ phone, fullName, employeeNo });
    } catch {
      return fail('NOT_READY', 503);
    }
  }

  // Codes switched off: the screen goes straight to step 2
  if (!otpEnabled()) return NextResponse.json({ ok: true, skip: true, pending });

  // Every message costs money: per number, per device and for the whole site
  const allowed = await underLimits([
    { bucket: `send:phone:${phone}`, ...LIMITS.sendPerPhone },
    { bucket: `send:ip:${ip}`, ...LIMITS.sendPerDevice },
    { bucket: 'send:all', ...LIMITS.sendPerDay },
  ]);
  if (!allowed) return fail('TOO_MANY', 429);
  await recordEvents([`send:phone:${phone}`, `send:ip:${ip}`, 'send:all']);

  if (devCode()) {
    // Testing on a computer: no message is sent
    return NextResponse.json({ ok: true, pending, resendIn: RESEND_SECONDS });
  }

  const config = twilioConfig();
  if (!config) return fail('NOT_READY', 503);
  const sent = await sendCode(config, phone, body.lang === 'ar' ? 'ar' : 'en');
  if (!sent.ok) {
    const status = sent.error === 'TOO_MANY' ? 429 : sent.error === 'NOT_READY' ? 503 : 400;
    if (sent.error === 'NOT_READY' || sent.error === 'FAILED') console.error('Twilio send failed:', sent.error);
    return fail(sent.error, status);
  }
  return NextResponse.json({ ok: true, pending, resendIn: RESEND_SECONDS });
}
