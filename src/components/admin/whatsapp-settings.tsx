'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, RotateCcw } from 'lucide-react';
import {
  DEFAULT_WA_TEMPLATES,
  WA_MAX_LENGTH,
  WA_PLACEHOLDERS,
  WA_STAGES,
  WA_STAGE_LABEL,
  fillWaTemplate,
  type WaStage,
  type WaTemplates,
} from '@/domain/whatsapp';
import { adminAuthHeaders, setWaTemplates } from '@/lib/whatsapp-client';

const card = 'rounded-3xl bg-tile';

/** What the preview fills in, so the team sees the message as the customer will. */
const SAMPLE = { name: 'Sara Al Marri', reference: 'CB-261121-0007', parkingBay: '525', floor: 'B2', readyBay: '574', service: 'Signature Exterior' };

const STAGE_HINT: Record<WaStage, string> = {
  INSPECTION: 'After the pre-wash inspection is sent',
  ASSIGNED: 'After "Assign team"',
  WASHING: 'After "Start wash"',
  READY: 'After "Mark ready at bay"',
};

/**
 * Settings: the WhatsApp message for each step of an order. On an order, the team presses "WhatsApp" and the
 * customer's chat opens with this text written in, with the order's details in place of {name}, {reference}, ...
 */
export function WhatsAppSettings() {
  const [saved, setSaved] = useState<WaTemplates | null>(null);
  const [draft, setDraft] = useState<WaTemplates>({ ...DEFAULT_WA_TEMPLATES });
  const [stage, setStage] = useState<WaStage>('INSPECTION');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp', { headers: await adminAuthHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      const data = await res.json();
      setSaved(data.templates);
      setDraft(data.templates);
    } catch {
      setError('Could not read the WhatsApp messages. Check your connection.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved messages once
    void load();
  }, [load]);

  const changedStages = saved ? WA_STAGES.filter((s) => draft[s] !== saved[s]) : [];
  const text = draft[stage];

  const insert = (key: string) => {
    const el = box.current;
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const next = text.slice(0, start) + key + text.slice(end);
    if (next.length > WA_MAX_LENGTH) return;
    setDraft({ ...draft, [stage]: next });
    setDone('');
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + key.length, start + key.length);
    });
  };

  const save = async () => {
    if (!changedStages.length || busy) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const body = Object.fromEntries(changedStages.map((s) => [s, draft[s]]));
      const res = await fetch('/api/admin/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data.error || 'Could not save. Try again.'));
        return;
      }
      setSaved(data.templates);
      setDraft(data.templates);
      setWaTemplates(data.templates);
      setDone(changedStages.length === 1 ? 'Message saved.' : `${changedStages.length} messages saved.`);
      setTimeout(() => setDone(''), 4000);
    } catch {
      setError('Could not save. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} p-5 md:p-7 space-y-5`}>
      <div className="flex items-start gap-4">
        <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-400/15 text-emerald-300">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-[19px] font-semibold text-ink tracking-tight">WhatsApp messages</h3>
          <p className="text-sm text-muted leading-relaxed">
            On each order, a WhatsApp button opens the customer&apos;s chat with this message already written. You check it and press Send.
          </p>
        </div>
      </div>

      {/* The four steps */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Order step">
        {WA_STAGES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={stage === s}
            onClick={() => setStage(s)}
            className={`px-4 py-2 rounded-full text-sm transition cursor-pointer ${stage === s ? 'bg-ink text-canvas font-semibold' : 'bg-fill text-body hover:bg-fill-strong'}`}
          >
            {WA_STAGE_LABEL[s]}
            {changedStages.includes(s) && <span className="ms-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" aria-label="not saved" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-dim -mt-2">{STAGE_HINT[stage]}</p>

      <div className="space-y-2">
        <textarea
          ref={box}
          dir="auto"
          rows={9}
          value={text}
          maxLength={WA_MAX_LENGTH}
          onChange={(e) => {
            setDraft({ ...draft, [stage]: e.target.value });
            setDone('');
          }}
          disabled={!saved}
          className="w-full rounded-2xl bg-fill px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none focus:ring-2 focus:ring-[#0071e3] resize-y disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3 text-xs text-dim">
          <span className="tabular-nums">
            {text.length} / {WA_MAX_LENGTH}
          </span>
          <button
            onClick={() => {
              setDraft({ ...draft, [stage]: DEFAULT_WA_TEMPLATES[stage] });
              setDone('');
            }}
            disabled={text === DEFAULT_WA_TEMPLATES[stage]}
            className="inline-flex items-center gap-1 hover:text-ink cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Default text
          </button>
        </div>
      </div>

      {/* The order details that can go in */}
      <div className="space-y-2">
        <p className="text-xs text-dim">Tap to add an order detail where the cursor is:</p>
        <div className="flex flex-wrap gap-2">
          {WA_PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => insert(p.key)}
              title={p.meaning}
              className="px-3 py-1.5 rounded-full bg-fill hover:bg-fill-strong text-xs text-body font-mono cursor-pointer"
            >
              {p.key} <span className="font-sans text-dim">{p.meaning}</span>
            </button>
          ))}
        </div>
      </div>

      {/* What the customer receives */}
      <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/20 p-4 space-y-1.5">
        <p className="text-xs text-emerald-300/80">Preview with an example order</p>
        <p dir="auto" className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {fillWaTemplate(text, SAMPLE)}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => saved && setDraft(saved)}
          disabled={!changedStages.length || busy}
          className="px-5 py-3.5 rounded-full bg-fill hover:bg-fill-strong text-ink text-[15px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Undo changes
        </button>
        <button
          onClick={save}
          disabled={!changedStages.length || busy}
          className="flex-1 py-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold transition active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Saving...' : changedStages.length > 1 ? `Save ${changedStages.length} messages` : 'Save message'}
        </button>
      </div>
    </section>
  );
}
