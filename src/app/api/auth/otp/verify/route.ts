import { NextResponse } from 'next/server';
import { LIMITS, isCode, qatarMobile, type OtpError } from '@/domain/otp';
import { twilioConfig, checkCode } from '@/lib/twilio-verify';
import { underLimits, recordEvents } from '@/lib/otp-limits';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { signEmployeeToken, verifyPendingSignup } from '@/lib/employee-session';
import { deviceOf, recordQrEvent } from '@/lib/qr-events';
import { otpEnabled, devCode, findByPhone, createAccount } from '@/lib/otp-auth';

const fail = (error: OtpError, status = 400) => NextResponse.json({ error }, { status });

/**
 * Step 2 of sign in and sign up: checks the code, then signs the person in (and creates the account on sign up).
 * No account is created and no session is given before the code is right.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`otp-verify:${ip}`, 30, 60_000)) return fail('TOO_MANY', 429);

  let body: { action?: string; phone?: string; code?: string; pending?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return fail('FAILED');
  }
  const action = body.action === 'signup' ? 'signup' : body.action === 'login' ? 'login' : null;
  if (!action) return fail('FAILED');
  const phone = qatarMobile(String(body.phone || ''));
  if (!phone) return fail('BAD_PHONE');

  // ---- the code ----
  if (otpEnabled()) {
    const code = String(body.code || '').replace(/\D/g, '');
    if (!isCode(code)) return fail('WRONG_CODE');
    const allowed = await underLimits([{ bucket: `check:phone:${phone}`, ...LIMITS.checkPerPhone }]);
    if (!allowed) return fail('TOO_MANY', 429);
    await recordEvents([`check:phone:${phone}`]);

    const dev = devCode();
    if (dev) {
      if (code !== dev) return fail('WRONG_CODE');
    } else {
      const config = twilioConfig();
      if (!config) return fail('NOT_READY', 503);
      const checked = await checkCode(config, phone, code);
      if (!checked.ok) {
        const status = checked.error === 'TOO_MANY' ? 429 : checked.error === 'NOT_READY' ? 503 : 400;
        return fail(checked.error, status);
      }
    }
  }

  const ua = req.headers.get('user-agent') || '';
  const existing = await findByPhone(phone);

  // ---- sign in ----
  if (action === 'login') {
    if (!existing) return fail('NOT_FOUND', 404);
    if (existing.status === 'SUSPENDED') return fail('SUSPENDED', 403);
    if (body.source === 'qr') await recordQrEvent('login', deviceOf(ua));
    return NextResponse.json({ employee: existing, token: signEmployeeToken(existing.id) });
  }

  // ---- sign up: the details come from the signed note made in step 1, for this same number ----
  const pending = verifyPendingSignup(body.pending);
  if (!pending || pending.phone !== phone) return fail('EXPIRED');
  if (existing) return fail('EXISTS', 409);
  const employee = await createAccount(phone, pending.fullName, pending.employeeNo);
  if (!employee) return fail('FAILED', 500);
  if (body.source === 'qr') await recordQrEvent('signup', deviceOf(ua));
  return NextResponse.json({ employee, token: signEmployeeToken(employee.id), isNew: true });
}
