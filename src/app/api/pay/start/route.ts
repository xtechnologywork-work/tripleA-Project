import { NextResponse } from 'next/server';
import { verifyEmployeeToken } from '@/lib/employee-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { myFatoorahConfig, createPaymentPage } from '@/lib/myfatoorah';
import { paymentsEnabled, savePayment } from '@/lib/payments';
import { fetchSupabaseState, storePaymentPhoto } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getLocalDb } from '@/lib/local-db';
import { cleanDraft, pickPackage, pickService, priceFor, type PayPlan, type PaymentIntent } from '@/domain/payments';
import { TOTAL_BAYS, type MockDatabase } from '@/data/mock/seed';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The public address, for MyFatoorah to send the customer back to. */
function siteUrl(req: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

/**
 * Step 1 of paying: checks the order details, saves them as waiting for payment, and returns the MyFatoorah page.
 * No order exists until the payment is confirmed.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) return fail('PAYMENTS_OFF', 503);
  if (!rateLimit(`pay-start:${clientIp(req)}`, 10, 60_000)) return fail('TOO_MANY', 429);

  const employeeId = verifyEmployeeToken(req.headers.get('x-employee-token'));
  if (!employeeId) return fail('SIGN_IN', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST');
  }
  const plan: PayPlan | null = body.plan === 'pass' ? 'pass' : body.plan === 'single' ? 'single' : null;
  if (!plan) return fail('BAD_REQUEST');
  const cleaned = cleanDraft(body, TOTAL_BAYS);
  if (!cleaned.ok) return fail(cleaned.error);

  const db: MockDatabase | null = isServerSupabaseConfigured()
    ? (await fetchSupabaseState())?.db || null
    : ((getLocalDb() as unknown as MockDatabase) || null);
  if (!db) return fail('NOT_READY', 503);

  const employee = (db.employees || []).find((e) => e.id === employeeId);
  if (!employee || employee.status === 'SUSPENDED') return fail('SIGN_IN', 401);
  if (plan === 'pass' && (db.subscriptions || []).some((s) => s.employeeId === employeeId && s.status === 'ACTIVE')) {
    return fail('HAS_PASS', 409);
  }

  // The price always comes from the saved prices, never from the browser
  const amountMinor = priceFor(plan, pickService(db.services || []), pickPackage(db.packages || []));
  if (!amountMinor || amountMinor <= 0) return fail('NOT_READY', 503);

  const id = crypto.randomUUID();
  const draft = cleaned.draft;

  // The photo waits in private storage, not in the payment record
  if (draft.photo && isServerSupabaseConfigured()) {
    const stored = await storePaymentPhoto(id, draft.photo);
    draft.photo = stored || undefined;
  }

  const intent: PaymentIntent = { id, employeeId, plan, amountMinor, currency: 'QAR', status: 'PENDING', draft, createdAt: new Date().toISOString() };
  if (!(await savePayment(intent))) return fail('NOT_READY', 503);

  const config = myFatoorahConfig()!;
  const phone = (employee.phone || '').replace(/\D/g, '').slice(-8);
  const page = await createPaymentPage(config, {
    amount: amountMinor / 100,
    reference: id,
    customerName: employee.fullName,
    mobile: phone,
    itemName: plan === 'pass' ? 'TripleA wash pass, 8 washes' : 'TripleA car wash',
    callbackUrl: `${siteUrl(req)}/pay/return`,
    lang: draft.lang,
    userField: employeeId,
  });
  if (!page.ok) {
    console.error('MyFatoorah payment page failed:', page.error);
    await savePayment({ ...intent, status: 'FAILED' });
    return fail('GATEWAY', 502);
  }
  await savePayment({ ...intent, invoiceId: page.page.invoiceId });
  return NextResponse.json({ url: page.page.url, paymentRef: id });
}
