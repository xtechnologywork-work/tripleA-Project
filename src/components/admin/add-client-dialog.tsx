'use client';

import React, { useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { CLIENT_TEAMS, cleanManualClient, type ManualClient } from '@/domain/clients';
import { qatarMobile } from '@/domain/otp';
import type { Employee } from '@/domain/types';

const input = 'w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-[#0071e3] tabular-nums';

/**
 * The team adds a client who has no Ministry employee number (marketing, security, ...): name, Qatar mobile, QID, team.
 * Two steps: fill in, then check the summary and confirm, so a wrong number is not saved by mistake.
 */
export function AddClientDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (employee: Employee) => void }) {
  const [form, setForm] = useState({ fullName: '', phone: '', qid: '', team: 'Marketing', otherTeam: '' });
  const [review, setReview] = useState<ManualClient | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setError('');
  };

  const next = () => {
    const checked = cleanManualClient(form, qatarMobile);
    if (!checked.ok) return setError(checked.error);
    setReview(checked.client);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const sb = getSupabase();
      const session = sb ? (await sb.auth.getSession()).data.session : null;
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.employee) {
        setError(String(data.error || 'Could not add the client. Try again.'));
        setReview(null);
        return;
      }
      onAdded(data.employee as Employee);
    } catch {
      setError('Could not add the client. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        className="w-full max-w-[460px] max-h-[92dvh] overflow-y-auto bg-tile rounded-3xl p-5 md:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-sm text-dim">Clients without an employee number</span>
            <h4 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{review ? 'Check and confirm' : 'Add client'}</h4>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition cursor-pointer flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!review ? (
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-body block mb-1.5" htmlFor="ac-name">Full name</label>
              <input id="ac-name" type="text" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} className={input} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-body block mb-1.5" htmlFor="ac-phone">Qatar mobile</label>
                <input
                  id="ac-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="55128901"
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value.replace(/[^\d+ ]/g, '') })}
                  className={input}
                />
              </div>
              <div>
                <label className="text-body block mb-1.5" htmlFor="ac-qid">QID</label>
                <input
                  id="ac-qid"
                  inputMode="numeric"
                  placeholder="11 digits"
                  maxLength={11}
                  value={form.qid}
                  onChange={(e) => set({ qid: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  className={input}
                />
              </div>
            </div>
            <div>
              <span className="text-body block mb-1.5">Team</span>
              <div className="flex flex-wrap gap-2">
                {CLIENT_TEAMS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ team: t })}
                    className={`px-4 py-2 rounded-full text-sm transition cursor-pointer ${form.team === t ? 'bg-ink text-canvas font-semibold' : 'bg-fill text-body hover:bg-fill-strong'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {form.team === 'Other' && (
                <input
                  type="text"
                  placeholder="Team or company name"
                  value={form.otherTeam}
                  onChange={(e) => set({ otherTeam: e.target.value })}
                  className={`${input} mt-3`}
                />
              )}
            </div>
            <p className="text-xs text-dim leading-relaxed">
              The client signs in on the app with this mobile number, without creating an account. Saved with the QID, no employee number.
            </p>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2 rounded-2xl bg-raised p-4">
              <dt className="text-xs text-dim">Full name</dt>
              <dd className="mt-1 text-ink font-semibold">{review.fullName}</dd>
            </div>
            <div className="rounded-2xl bg-raised p-4">
              <dt className="text-xs text-dim">Qatar mobile</dt>
              <dd className="mt-1 text-ink text-[17px] font-semibold tabular-nums" dir="ltr">
                +974 {review.phone.slice(0, 4)} {review.phone.slice(4)}
              </dd>
            </div>
            <div className="rounded-2xl bg-raised p-4">
              <dt className="text-xs text-dim">QID</dt>
              <dd className="mt-1 text-ink text-[17px] font-semibold tabular-nums">{review.qid}</dd>
            </div>
            <div className="col-span-2 rounded-2xl bg-raised p-4">
              <dt className="text-xs text-dim">Team</dt>
              <dd className="mt-1 text-ink">{review.company}</dd>
            </div>
          </dl>
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={review ? () => setReview(null) : onClose}
            className="flex-1 py-3 rounded-full bg-fill hover:bg-fill-strong text-ink text-sm font-semibold transition cursor-pointer"
          >
            {review ? 'Back' : 'Cancel'}
          </button>
          <button
            onClick={review ? save : next}
            disabled={busy}
            className="flex-1 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {review ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {review ? (busy ? 'Adding...' : 'Confirm and add') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
