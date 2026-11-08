import { NextResponse } from 'next/server';
import { verifyEmployeeToken } from '@/lib/employee-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { myFatoorahConfig, createPaymentPage } from '@/lib/myfatoorah';
import { paymentsEnabled, savePayment, createUnpaidOrder, loadForPayment } from '@/lib/payments';
import { storePaymentPhoto } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { cleanDraft, pickPackage, pickService, priceFor, type PayPlan, type PaymentIntent } from '@/domain/payments';
import { TOTAL_BAYS } from '@/data/mock/seed';

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
 * The order is made now, marked not paid, and turns paid when the payment is confirmed.
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

  const id = crypto.randomUUID();
  const draft = cleaned.draft;

  // The photo goes to private storage while the small reads run, so neither waits for the other.
  // (The photo waits in storage, not in the payment record.)
  const [data, storedPhoto] = await Promise.all([
    loadForPayment(employeeId),
    draft.photo && isServerSupabaseConfigured() ? storePaymentPhoto(id, draft.photo) : Promise.resolve(null),
  ]);
  if (!data) return fail('NOT_READY', 503);
  if (draft.photo && isServerSupabaseConfigured()) draft.photo = storedPhoto || undefined;

  const employee = data.employee;
  if (!employee || employee.status === 'SUSPENDED') return fail('SIGN_IN', 401);
  if (plan === 'pass' && data.activeSubscriptions.length > 0) return fail('HAS_PASS', 409);

  // The price always comes from the saved prices, never from the browser
  const amountMinor = priceFor(plan, pickService(data.services), pickPackage(data.packages));
  if (!amountMinor || amountMinor <= 0) return fail('NOT_READY', 503);

  const intent: PaymentIntent = { id, employeeId, plan, amountMinor, currency: 'QAR', status: 'PENDING', draft, createdAt: new Date().toISOString() };

  // Saving the payment and asking MyFatoorah for the page do not depend on each other: do both at once
  const config = myFatoorahConfig()!;
  const phone = (employee.phone || '').replace(/\D/g, '').slice(-8);
  const [saved, page] = await Promise.all([
    savePayment(intent),
    createPaymentPage(config, {
      amount: amountMinor / 100,
      reference: id,
      customerName: employee.fullName,
      mobile: phone,
      itemName: plan === 'pass' ? 'TripleA wash pass, 8 washes' : 'TripleA car wash',
      callbackUrl: `${siteUrl(req)}/pay/return`,
      lang: draft.lang,
      userField: employeeId,
    }),
  ]);
  if (!saved) return fail('NOT_READY', 503);
  if (!page.ok) {
    console.error('MyFatoorah payment page failed:', page.error);
    await savePayment({ ...intent, status: 'FAILED' });
    return fail('GATEWAY', 502);
  }

  // The team sees the order right away, marked not paid; it turns paid when MyFatoorah confirms.
  // The order and the invoice number are saved at the same time.
  await Promise.all([createUnpaidOrder(intent, data), savePayment({ ...intent, invoiceId: page.page.invoiceId })]);
  return NextResponse.json({ url: page.page.url, paymentRef: id });
}
