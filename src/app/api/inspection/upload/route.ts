import { NextResponse } from 'next/server';
import { createInspectionUpload } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';

const IDENTIFIER = /^[\w-]{1,80}$/;
const EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm']);

/**
 * Gives the team's phone a one-time link to upload a photo or video straight to private storage.
 * Staff only. The file name is built here, so a phone cannot write into another order's folder by choosing a path.
 */
export async function POST(req: Request) {
  if (!isServerSupabaseConfigured()) {
    // Local demo mode: photos are kept inside the saved data instead
    return NextResponse.json({ local: true });
  }
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  let body: { orderId?: string; mediaId?: string; ext?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const orderId = String(body.orderId || '');
  const mediaId = String(body.mediaId || '');
  const ext = String(body.ext || '').toLowerCase();
  if (!IDENTIFIER.test(orderId) || !IDENTIFIER.test(mediaId) || !EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const upload = await createInspectionUpload(orderId, mediaId, ext);
  if (!upload) {
    return NextResponse.json(
      { error: 'Storage is not ready. Check SUPABASE_SERVICE_ROLE_KEY and run migration_v3_inspection.sql' },
      { status: 502 }
    );
  }
  return NextResponse.json(upload);
}
