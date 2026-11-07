import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { getQrStats } from '@/lib/qr-events';

/** How the QR code is doing. Admins only. */
export async function GET(req: Request) {
  if (isServerSupabaseConfigured()) {
    const admin = await verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  }
  return NextResponse.json(await getQrStats(), { headers: { 'Cache-Control': 'no-store' } });
}
