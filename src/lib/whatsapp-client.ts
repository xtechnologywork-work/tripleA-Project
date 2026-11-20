'use client';
/**
 * The WhatsApp message texts on the dashboard: read once, shared by the order panel and the Settings card,
 * and updated everywhere straight after the team saves.
 */
import { useEffect, useState } from 'react';
import { getSupabase } from './supabase';
import { DEFAULT_WA_TEMPLATES, readWaTemplates, type WaTemplates } from '@/domain/whatsapp';

let current: WaTemplates = { ...DEFAULT_WA_TEMPLATES };
let loaded: Promise<void> | null = null;
const listeners = new Set<(t: WaTemplates) => void>();

export async function adminAuthHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** Puts new texts in place for every screen that shows them. */
export function setWaTemplates(t: WaTemplates) {
  current = readWaTemplates(t);
  listeners.forEach((l) => l(current));
}

function loadOnce(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const res = await fetch('/api/admin/whatsapp', { headers: await adminAuthHeaders(), cache: 'no-store' });
        if (res.ok) setWaTemplates((await res.json()).templates);
        else loaded = null; // try again next time (for example, before sign in finished)
      } catch {
        loaded = null;
      }
    })();
  }
  return loaded ?? Promise.resolve();
}

/** The texts to use. The defaults until the saved ones arrive. */
export function useWaTemplates(): WaTemplates {
  const [t, setT] = useState<WaTemplates>(current);
  useEffect(() => {
    listeners.add(setT);
    void loadOnce();
    return () => {
      listeners.delete(setT);
    };
  }, []);
  return t;
}
