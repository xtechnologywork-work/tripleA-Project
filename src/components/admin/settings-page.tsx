'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Power } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { clockLabel, type OrderingView } from '@/domain/ordering';
import { OtpSettings } from './otp-settings';
import { WhatsAppSettings } from './whatsapp-settings';

const card = 'rounded-3xl bg-tile';

const REASON_TEXT = (o: OrderingView): { title: string; body: string } => {
  switch (o.reason) {
    case 'OPEN':
      return { title: 'Orders are open', body: `Employees can order now. Orders close at ${clockLabel(o.closesAt, 'en')}.` };
    case 'PAUSED':
      return { title: 'Orders are closed', body: 'The switch is off, so no employee can order. Press "Open orders" to let everyone order during the hours below.' };
    case 'BEFORE_OPENING':
      return { title: 'Orders are closed for now', body: `The switch is on, but it is before opening time. Orders open at ${clockLabel(o.opensAt, 'en')}.` };
    default:
      return { title: 'Orders are closed for now', body: `The switch is on, but today's closing time has passed. Orders open again at ${clockLabel(o.opensAt, 'en')}.` };
  }
};

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/**
 * Settings: when employees may place orders. A switch (open / closed) and the daily hours, in Doha time.
 * Orders are accepted only when the switch is on and the time is inside the hours. At first the switch is off.
 */
export function SettingsPage({ onChanged }: { onChanged?: () => void }) {
  const [view, setView] = useState<OrderingView | null>(null);
  const [opensAt, setOpensAt] = useState('07:00');
  const [closesAt, setClosesAt] = useState('15:15');
  // True once the team starts typing in the hours boxes: then the saved hours no longer overwrite what they type
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ordering', { cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      const v = (await res.json()) as OrderingView;
      setView(v);
      // The hours boxes follow the saved hours until the team starts typing in them
      if (!touched.current) {
        setOpensAt(v.opensAt);
        setClosesAt(v.closesAt);
      }
    } catch {
      setError('Could not read the ordering hours. Check your connection.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once, then keep the status fresh (it changes at the opening and closing times)
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async (body: Record<string, unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/admin/ordering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data.error || 'Could not save. Try again.'));
        return;
      }
      const v = data as OrderingView;
      setView(v);
      setOpensAt(v.opensAt);
      setClosesAt(v.closesAt);
      touched.current = false;
      setSaved(done);
      setTimeout(() => setSaved(''), 4000);
      onChanged?.();
    } catch {
      setError('Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  // The times just have to be different: a closing time earlier than the opening time means it closes after midnight
  const hoursValid = /^\d\d:\d\d$/.test(opensAt) && /^\d\d:\d\d$/.test(closesAt) && opensAt !== closesAt;
  const pastMidnight = hoursValid && closesAt < opensAt;
  const hoursChanged = !!view && (opensAt !== view.opensAt || closesAt !== view.closesAt);
  const text = view ? REASON_TEXT(view) : null;
  const on = view?.open === true;

  return (
    <div className="max-w-[760px] space-y-4">
      {/* The switch */}
      <section className={`${card} p-5 md:p-7 space-y-5`}>
        <div className="flex items-start gap-4">
          <span
            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
              view?.accepting ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
            }`}
          >
            <Power className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-[19px] font-semibold text-ink tracking-tight">{text ? text.title : 'Loading...'}</h3>
            <p className="text-sm text-muted leading-relaxed">{text ? text.body : ''}</p>
            {view && (
              <p className="text-xs text-dim tabular-nums pt-1">
                Doha time now {clockLabel(view.dohaNow, 'en')} · hours {clockLabel(view.opensAt, 'en')} to {clockLabel(view.closesAt, 'en')}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => send({ open: !on }, on ? 'Orders are closed for everyone.' : 'Orders are open: everyone can order during the hours.')}
          disabled={!view || busy}
          className={`w-full py-3.5 rounded-full text-[15px] font-semibold transition active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            on ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'
          }`}
        >
          {on ? 'Close orders' : 'Open orders'}
        </button>
        <p className="text-xs text-dim leading-relaxed">
          Closing stops new orders for every employee straight away. Orders already placed carry on. Buying a pass is still possible, because it is not an order.
        </p>
      </section>

      {/* The hours */}
      <section className={`${card} p-5 md:p-7 space-y-5`}>
        <div className="flex items-center gap-2.5">
          <Clock className="h-5 w-5 text-muted" />
          <h3 className="text-[17px] font-semibold text-ink tracking-tight">Ordering hours</h3>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Every day, in Doha time. Outside these hours nobody can order, even when the switch is on.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-2">
            <span className="text-sm text-body">Opens at</span>
            <input
              type="time"
              value={opensAt}
              onChange={(e) => {
                setOpensAt(e.target.value);
                touched.current = true;
                setSaved('');
              }}
              className="w-full rounded-2xl bg-fill px-4 py-3.5 text-[17px] text-ink tabular-nums outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-body">Closes at</span>
            <input
              type="time"
              value={closesAt}
              onChange={(e) => {
                setClosesAt(e.target.value);
                touched.current = true;
                setSaved('');
              }}
              className="w-full rounded-2xl bg-fill px-4 py-3.5 text-[17px] text-ink tabular-nums outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </label>
        </div>

        {!hoursValid && <p className="text-sm text-amber-300">The opening and closing times cannot be the same.</p>}
        {pastMidnight && (
          <p className="text-sm text-body leading-relaxed">
            Closes after midnight: orders are open from {clockLabel(opensAt, 'en')} until {clockLabel(closesAt, 'en')} the next day.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-300">
            <Check className="h-4 w-4" /> {saved}
          </p>
        )}

        <button
          onClick={() => send({ opensAt, closesAt }, 'The hours are saved.')}
          disabled={!view || busy || !hoursValid || !hoursChanged}
          className="w-full py-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold transition active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save the hours
        </button>
      </section>

      {/* WhatsApp message for each step of an order */}
      <WhatsAppSettings />

      {/* Sign in by SMS code */}
      <OtpSettings />
    </div>
  );
}
