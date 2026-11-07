import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { deviceOf, isBot, recordQrEvent } from '@/lib/qr-events';

/**
 * The address inside the printed QR code. It never changes: it counts the scan and sends the person on to the
 * customer page. Where it sends them can change later without reprinting the code.
 */
export async function GET(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  if (!isBot(ua) && rateLimit(`qr:${clientIp(req)}`, 60, 60_000)) {
    await recordQrEvent('scan', deviceOf(ua));
  }

  // The public address of the site, also behind a proxy
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const base = configured || (forwardedHost ? `${proto}://${forwardedHost}` : new URL(req.url).origin);

  // 307: a temporary redirect, so phones never remember it and every scan comes back here
  const res = NextResponse.redirect(`${base}/?src=qr`, 307);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
