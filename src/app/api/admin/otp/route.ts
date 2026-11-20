import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { loadOtpSwitch, saveOtpSwitch, loadOtpHealth, recordOtpOutcome } from '@/lib/otp-settings';
import { twilioConfig, twilioHealth, twilioProblem, sendCode, checkCode } from '@/lib/twilio-verify';
import { qatarMobile, isCode } from '@/domain/otp';
import { applyChanges } from '@/lib/supabase-sync';
import { mergeLocal } from '@/lib/local-db';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import type { AuditLog } from '@/domain/types';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** Admins only. Returns who is asking, or null (local demo: everyone is the local admin). */
async function admin(req: Request): Promise<string | null> {
  if (!isServerSupabaseConfigured()) return 'local';
  const a = await verifyAdmin(req);
  return a ? a.email || a.id : null;
}

/** Everything the team needs to know about sign in by code. Never a key or a token. */
async function snapshot() {
  const [sw, health, record] = await Promise.all([loadOtpSwitch(), twilioHealth(), loadOtpHealth()]);
  const lastRefusal = record.lastRefusal ? { ...record.lastRefusal, explain: twilioProblem(record.lastRefusal.status, record.lastRefusal.code).explain } : undefined;
  // Ready to send to any Qatar number: keys right, service found, a paid (not Trial) active account
  const ready = health.problems.length === 0 && health.service === 'ok' && health.accountType !== 'Trial' && health.accountStatus !== 'suspended' && health.accountStatus !== 'closed';
  return {
    codesRequired: sw.codesRequired,
    updatedAt: sw.updatedAt,
    updatedBy: sw.updatedBy,
    envDefault: process.env.OTP_ENABLED === 'true',
    ready,
    twilio: health,
    lastRefusal,
    lastSentAt: record.lastSentAt,
  };
}

export async function GET(req: Request) {
  if (!(await admin(req))) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  return NextResponse.json(await snapshot(), noStore);
}

async function audit(by: string, action: string, details: Record<string, unknown>) {
  const log: AuditLog = {
    id: `aud-otp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actor: { type: 'STAFF', id: by, email: by, role: 'ADMIN' },
    action,
    entityType: 'SETTINGS',
    entityId: 'otp',
    details,
    createdAt: new Date().toISOString(),
  };
  try {
    if (isServerSupabaseConfigured()) await applyChanges({ auditLogs: [log] }, { admin: true });
    else mergeLocal({ auditLogs: [log] });
  } catch (err) {
    console.error('Writing the OTP audit entry failed:', err);
  }
}

/**
 * { codesRequired: boolean }            switches the code on or off for every employee
 * { action: 'test-send', phone }         sends a real code to that number (to check SMS reaches Qatar)
 * { action: 'test-check', phone, code }  checks the code received
 */
export async function POST(req: Request) {
  const by = await admin(req);
  if (!by) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  let body: { codesRequired?: unknown; action?: unknown; phone?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (typeof body.codesRequired === 'boolean') {
    if (!rateLimit(`otp-admin:${by}`, 20, 60_000)) return NextResponse.json({ error: 'Too many changes. Wait a moment.' }, { status: 429 });
    const before = (await loadOtpSwitch()).codesRequired;
    const saved = await saveOtpSwitch(body.codesRequired, by);
    if (!saved) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 503 });
    await audit(by, 'settings.otp', { before: { codesRequired: before }, after: { codesRequired: saved.codesRequired } });
    return NextResponse.json(await snapshot(), noStore);
  }

  if (body.action === 'test-send' || body.action === 'test-check') {
    // Every message costs money: a few tests at a time
    if (!rateLimit(`otp-admin-test:${by}:${clientIp(req)}`, 6, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many tests. Wait 10 minutes.' }, { status: 429 });
    }
    const phone = qatarMobile(String(body.phone || ''));
    if (!phone) return NextResponse.json({ error: 'Enter an 8-digit Qatar mobile number.' }, { status: 400 });
    const config = twilioConfig();
    if (!config) return NextResponse.json({ ok: false, error: 'The Twilio settings are missing or malformed in Netlify.' }, noStore);

    if (body.action === 'test-send') {
      const sent = await sendCode(config, phone, 'en');
      if (sent.ok) {
        await recordOtpOutcome({ sent: true });
        await audit(by, 'settings.otp.test', { phone: `***${phone.slice(-3)}`, result: 'sent' });
        return NextResponse.json({ ok: true, message: `Code sent to +974 ${phone}. Type it below to finish the test.` }, noStore);
      }
      if (sent.twilio) await recordOtpOutcome({ sent: false, twilio: sent.twilio });
      await audit(by, 'settings.otp.test', { phone: `***${phone.slice(-3)}`, result: sent.error, twilio: sent.twilio?.code });
      const why = sent.twilio ? twilioProblem(sent.twilio.status, sent.twilio.code).explain : 'Twilio could not be reached.';
      return NextResponse.json({ ok: false, error: why, code: sent.twilio?.code }, noStore);
    }

    const code = String(body.code || '').replace(/\D/g, '');
    if (!isCode(code)) return NextResponse.json({ ok: false, error: 'The code is 6 digits.' }, noStore);
    const checked = await checkCode(config, phone, code);
    if (checked.ok) return NextResponse.json({ ok: true, message: 'The code is right: sign in by SMS works end to end.' }, noStore);
    const why =
      checked.error === 'WRONG_CODE'
        ? 'That code is not right. Check the SMS and try again.'
        : checked.twilio
          ? twilioProblem(checked.twilio.status, checked.twilio.code).explain
          : 'Twilio could not be reached.';
    return NextResponse.json({ ok: false, error: why, code: checked.twilio?.code }, noStore);
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
