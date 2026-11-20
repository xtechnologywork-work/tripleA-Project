import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { loadWaTemplates, saveWaTemplates } from '@/lib/whatsapp-settings';
import { cleanWaTemplates, DEFAULT_WA_TEMPLATES } from '@/domain/whatsapp';
import { applyChanges } from '@/lib/supabase-sync';
import { mergeLocal } from '@/lib/local-db';
import { rateLimit } from '@/lib/rate-limit';
import type { AuditLog } from '@/domain/types';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function admin(req: Request): Promise<string | null> {
  if (!isServerSupabaseConfigured()) return 'local';
  const a = await verifyAdmin(req);
  return a ? a.email || a.id : null;
}

/** The WhatsApp message texts, and the defaults (for "Reset"). Admins only. */
export async function GET(req: Request) {
  if (!(await admin(req))) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { templates, saved } = await loadWaTemplates();
  return NextResponse.json({ templates, defaults: DEFAULT_WA_TEMPLATES, saved }, noStore);
}

/** Saves one or more texts: { INSPECTION?, ASSIGNED?, WASHING?, READY? }. Admins only. */
export async function POST(req: Request) {
  const by = await admin(req);
  if (!by) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!rateLimit(`wa-admin:${by}`, 30, 60_000)) return NextResponse.json({ error: 'Too many changes. Wait a moment.' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const { templates: before } = await loadWaTemplates();
  const checked = cleanWaTemplates(body, before);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!(await saveWaTemplates(checked.templates))) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 503 });

  const changed = Object.keys(checked.templates).filter((k) => checked.templates[k as keyof typeof before] !== before[k as keyof typeof before]);
  const log: AuditLog = {
    id: `aud-wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actor: { type: 'STAFF', id: by, email: by, role: 'ADMIN' },
    action: 'settings.whatsapp',
    entityType: 'SETTINGS',
    entityId: 'whatsapp',
    details: { changed },
    createdAt: new Date().toISOString(),
  };
  try {
    if (isServerSupabaseConfigured()) await applyChanges({ auditLogs: [log] }, { admin: true });
    else mergeLocal({ auditLogs: [log] });
  } catch (err) {
    console.error('Writing the WhatsApp audit entry failed:', err);
  }
  return NextResponse.json({ templates: checked.templates, defaults: DEFAULT_WA_TEMPLATES, saved: true }, noStore);
}
