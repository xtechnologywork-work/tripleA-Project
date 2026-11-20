'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

const card = 'rounded-3xl bg-tile';

interface OtpSnapshot {
  codesRequired: boolean;
  updatedAt?: string;
  updatedBy?: string;
  envDefault: boolean;
  ready: boolean;
  twilio: { problems: string[]; service: string; accountType?: string; accountStatus?: string };
  lastRefusal?: { status: number; code?: number; kind: string; accountSide: boolean; at: string; explain: string };
  lastSentAt?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { timeZone: 'Asia/Qatar', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const SERVICE_TEXT: Record<string, string> = {
  ok: 'found',
  missing: 'not found in this account (check TWILIO_VERIFY_SERVICE_SID)',
  refused: 'refused the keys (check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)',
  unreachable: 'could not be reached',
  'not checked': 'not checked (settings missing)',
};

/**
 * Settings: sign in by SMS code. The switch (on/off for every employee, straight away, no redeploy),
 * what Twilio says about the account, the last refusal, and a test code to the team's own phone.
 */
export function OtpSettings() {
  const [snap, setSnap] = useState<OtpSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [testStep, setTestStep] = useState<'idle' | 'sent'>('idle');
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/otp', { headers: await authHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      setSnap((await res.json()) as OtpSnapshot);
    } catch {
      setError('Could not read the SMS code settings. Check your connection.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once, then keep the health fresh
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const toggle = async () => {
    if (!snap || busy) return;
    const next = !snap.codesRequired;
    if (next && !snap.ready && !window.confirm('Twilio is not ready (see the status below). If you switch codes on now, employees may not be able to sign in. Switch on anyway?')) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const { res, data } = await post({ codesRequired: next });
      if (!res.ok) {
        setError(String(data.error || 'Could not save. Try again.'));
        return;
      }
      setSnap(data as OtpSnapshot);
      setSaved(next ? 'SMS codes are on: employees type the code they receive.' : 'SMS codes are off: employees sign in with their mobile number only.');
      setTimeout(() => setSaved(''), 5000);
    } catch {
      setError('Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (busy) return;
    setBusy(true);
    setTestResult(null);
    try {
      const { res, data } = testStep === 'idle' ? await post({ action: 'test-send', phone }) : await post({ action: 'test-check', phone, code });
      if (!res.ok) {
        setTestResult({ ok: false, text: String(data.error || 'The test could not run.') });
        return;
      }
      const text = String(data.ok ? data.message : `${data.error}${data.code ? ` (Twilio error ${data.code})` : ''}`);
      setTestResult({ ok: !!data.ok, text });
      if (testStep === 'idle' && data.ok) setTestStep('sent');
      else if (testStep === 'sent' && data.ok) {
        setTestStep('idle');
        setCode('');
      }
      void load();
    } catch {
      setTestResult({ ok: false, text: 'The test could not run. Check your connection.' });
    } finally {
      setBusy(false);
    }
  };

  const on = snap?.codesRequired === true;
  const r = snap?.lastRefusal;
  // A refusal on the account side, newer than the last code that went out: every employee is affected now
  const alarm = !!r && r.accountSide && (!snap?.lastSentAt || new Date(r.at) > new Date(snap.lastSentAt));
  const t = snap?.twilio;

  return (
    <section className={`${card} p-5 md:p-7 space-y-5`}>
      <div className="flex items-start gap-4">
        <span
          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
            !snap ? 'bg-fill text-muted' : on && snap.ready ? 'bg-emerald-400/15 text-emerald-300' : on ? 'bg-rose-400/15 text-rose-300' : 'bg-amber-400/15 text-amber-300'
          }`}
        >
          <MessageSquare className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-[19px] font-semibold text-ink tracking-tight">
            {!snap ? 'Loading...' : on ? 'SMS codes are on' : 'SMS codes are off'}
          </h3>
          <p className="text-sm text-muted leading-relaxed">
            {!snap
              ? ''
              : on
                ? 'Employees receive a 6-digit code by SMS to sign in or create an account.'
                : 'Employees sign in with their mobile number only, without a code. Switch on once the test below works.'}
          </p>
          {snap?.updatedAt && (
            <p className="text-xs text-dim pt-1">
              Changed {when(snap.updatedAt)} by {snap.updatedBy}
            </p>
          )}
        </div>
      </div>

      {alarm && r && (
        <div role="alert" className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> SMS is not reaching employees (Twilio error {r.code ?? r.status}, {when(r.at)})
          </p>
          <p className="text-sm text-body leading-relaxed">{r.explain}</p>
          {on && <p className="text-sm text-body leading-relaxed">Until it is fixed, switch codes off so employees can still sign in.</p>}
        </div>
      )}

      <button
        onClick={toggle}
        disabled={!snap || busy}
        className={`w-full py-3.5 rounded-full text-[15px] font-semibold transition active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          on ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'
        }`}
      >
        {on ? 'Switch SMS codes off' : 'Switch SMS codes on'}
      </button>
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

      {/* What Twilio says */}
      {t && (
        <div className="rounded-2xl bg-fill p-4 space-y-2 text-sm">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-muted" /> Twilio status:{' '}
            <span className={snap?.ready ? 'text-emerald-300' : 'text-amber-300'}>{snap?.ready ? 'ready for any Qatar number' : 'not ready'}</span>
          </p>
          {t.problems.map((p) => (
            <p key={p} className="text-amber-300">
              {p}
            </p>
          ))}
          <p className="text-body">Verify service: {SERVICE_TEXT[t.service] || t.service}</p>
          {t.accountType && (
            <p className={t.accountType === 'Trial' ? 'text-amber-300' : 'text-body'}>
              Account: {t.accountType}
              {t.accountStatus ? `, ${t.accountStatus}` : ''}
              {t.accountType === 'Trial' && ' (a Trial account only sends to numbers verified by hand. Upgrade it in the Twilio Console and add balance.)'}
            </p>
          )}
          {snap?.lastSentAt && <p className="text-dim">Last code sent: {when(snap.lastSentAt)}</p>}
          {r && !alarm && <p className="text-dim">Last refusal: Twilio error {r.code ?? r.status} ({when(r.at)})</p>}
        </div>
      )}

      {/* Test on the team's own phone */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink flex items-center gap-2">
          <Send className="h-4 w-4 text-muted" /> Test with your phone
        </p>
        <p className="text-sm text-muted leading-relaxed">Sends a real code (it costs one SMS). It works even when codes are off for employees.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          {testStep === 'idle' ? (
            <input
              inputMode="numeric"
              placeholder="Qatar mobile, e.g. 55128901"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
              className="w-full rounded-2xl bg-fill px-4 py-3.5 text-[16px] text-ink tabular-nums outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          ) : (
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code from the SMS"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-2xl bg-fill px-4 py-3.5 text-[16px] text-ink tabular-nums tracking-widest outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          )}
          <button
            onClick={test}
            disabled={busy || (testStep === 'idle' ? phone.replace(/\D/g, '').length < 8 : code.length !== 6)}
            className="px-6 py-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testStep === 'idle' ? 'Send test code' : 'Check code'}
          </button>
        </div>
        {testStep === 'sent' && (
          <button
            onClick={() => {
              setTestStep('idle');
              setCode('');
              setTestResult(null);
            }}
            className="text-xs text-muted hover:text-ink cursor-pointer"
          >
            Use another number
          </button>
        )}
        {testResult && (
          <p role="status" className={`text-sm leading-relaxed ${testResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {testResult.text}
          </p>
        )}
      </div>
    </section>
  );
}
