import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { confirmPayment } from '@/lib/payments';
import { webhookSignatureString } from '@/lib/myfatoorah';

/**
 * MyFatoorah tells us about a payment here, so the order is made even if the customer closed the page before
 * coming back. The signature is checked, then the payment is confirmed with MyFatoorah again before anything is made.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let payload: { Event?: { Name?: string; Code?: number }; Data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const secret = (process.env.MYFATOORAH_WEBHOOK_SECRET || '').trim();
  if (!secret) return NextResponse.json({ ok: false, error: 'Webhook secret is not set' }, { status: 503 });

  const data = (payload.Data || {}) as Parameters<typeof webhookSignatureString>[0];
  const given = req.headers.get('myfatoorah-signature') || '';
  const expected = crypto.createHmac('sha256', secret).update(webhookSignatureString(data), 'utf8').digest('base64');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.error('A MyFatoorah webhook with a wrong signature was ignored');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Payment events only (code 1)
  const invoiceId = (data as { Invoice?: { Id?: unknown } }).Invoice?.Id;
  if (payload.Event?.Code === 1 && invoiceId) {
    const result = await confirmPayment(String(invoiceId), 'InvoiceId');
    return NextResponse.json({ ok: true, status: result.status });
  }
  return NextResponse.json({ ok: true });
}
