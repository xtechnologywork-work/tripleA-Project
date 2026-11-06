import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';

// Tells the dashboard whether the signed-in user is a real admin.
export async function GET(req: Request) {
  if (!isServerSupabaseConfigured()) {
    // Local demo mode has no accounts
    return NextResponse.json({ admin: true, local: true });
  }
  const admin = await verifyAdmin(req);
  if (!admin) {
    return NextResponse.json({ admin: false }, { status: 401 });
  }
  return NextResponse.json({ admin: true, email: admin.email });
}
