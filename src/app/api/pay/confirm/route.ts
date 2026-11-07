import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { confirmPayment, findPayment } from '@/lib/payments';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/**
 * Step 2 of paying: the customer is back from MyFatoorah. Asks MyFatoorah directly whether the payment went
 * through, and makes the order if it did. Nothing the browser says about the payment is trusted.
 */
export async function POST(req: Request) {
  if (!rateLimit(`pay-confirm:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ status: 'ERROR', error: 'TOO_MANY' }, { status: 429 });
  }
  let body: { paymentId?: string; paymentRef?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'ERROR', error: 'BAD_REQUEST' }, { status: 400 });
  }

  const paymentId = String(body.paymentId || '').trim();
  if (/^[\w-]{6,80}$/.test(paymentId)) {
    return NextResponse.json(await confirmPayment(paymentId, 'PaymentId'), noStore);
  }

  // No payment id (the page was closed, or the customer came back another way): use our own reference
  const ref = String(body.paymentRef || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const intent = await findPayment({ id: ref });
    if (intent?.status === 'FULFILLED' && intent.orderReference) {
      return NextResponse.json({ status: 'PAID', reference: intent.orderReference }, noStore);
    }
    if (intent?.invoiceId) return NextResponse.json(await confirmPayment(intent.invoiceId, 'InvoiceId'), noStore);
    if (intent?.status === 'FAILED') return NextResponse.json({ status: 'FAILED' }, noStore);
  }
  return NextResponse.json({ status: 'ERROR', error: 'BAD_REQUEST' }, { status: 400 });
}
