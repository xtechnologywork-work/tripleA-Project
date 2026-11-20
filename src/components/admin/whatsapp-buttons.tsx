'use client';

import React, { useEffect, useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import type { Employee, Order } from '@/domain/types';
import { WA_STAGES, WA_STAGE_LABEL, fillWaTemplate, waLink, waStagesReached, type WaStage, type WaTemplates } from '@/domain/whatsapp';
import { useWaTemplates } from '@/lib/whatsapp-client';
import { openWhatsApp, waResultText } from '@/lib/wa-open';

const SENT_KEY = 'triplea_wa_opened';
const CHANGED = 'triplea-wa-opened';

/** Which messages were already opened on this computer, per order (a reminder for the team, not a record). */
function readOpened(): Record<string, WaStage[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** Notes that a message was opened for an order (also used by "Mark ready at bay", which opens the Ready message). */
export function markWaOpened(orderId: string, stage: WaStage): void {
  const all = readOpened();
  const list = new Set(all[orderId] || []);
  list.add(stage);
  all[orderId] = [...list];
  // Keep the newest 300 orders only
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete all[k];
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(all));
  } catch {
    // Private window: the reminder is simply not kept
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The message for one step, filled in with the order's details. `ready` gives the place when it was just typed. */
export function waMessageFor(
  templates: WaTemplates,
  stage: WaStage,
  order: Order,
  client: Employee | null | undefined,
  ready?: { floor?: string; bayCode?: string }
): string {
  const place = ready || (order.status === 'RETURNED_TO_PARKING' ? order.returnConfirmation : undefined);
  return fillWaTemplate(templates[stage], {
    name: client?.fullName || '',
    reference: order.reference,
    parkingBay: order.bayCodeSnapshot,
    floor: place?.floor || '',
    readyBay: place?.bayCode || '',
    service: order.serviceSnapshot?.name || '',
  });
}

/**
 * One WhatsApp button per step of the order. A button opens once the order reached that step; pressing it opens
 * the customer's WhatsApp chat with the message from Settings, filled in with this order's details.
 * "Ready at bay" also brings the photo of the clean car (see openWhatsApp).
 */
export function WhatsAppButtons({
  order,
  client,
  inspectionSubmitted,
  readyPhoto,
}: {
  order: Order;
  client: Employee | null | undefined;
  inspectionSubmitted: boolean;
  /** The photo of the clean car at its bay, once taken */
  readyPhoto?: string;
}) {
  const templates = useWaTemplates();
  const [opened, setOpened] = useState<Record<string, WaStage[]>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setOpened(readOpened());
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, []);

  // A new order on screen: the last note was about another one
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the note when another order is opened
    setNote(null);
  }, [order.id]);

  if (order.status === 'CANCELLED') return null;

  const reached = waStagesReached(order, inspectionSubmitted);
  // The newest step reached is the one to send now
  const latest = [...WA_STAGES].reverse().find((s) => reached[s]);
  const phone = client?.phone;

  const open = async (stage: WaStage) => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = stage === 'READY' ? readyPhoto : undefined;
      const result = await openWhatsApp({ phone, message: waMessageFor(templates, stage, order, client), photo });
      if (result.ok) markWaOpened(order.id, stage);
      setNote({ ok: result.ok, text: waResultText(result, !!photo) });
    } finally {
      setBusy(false);
    }
  };

  const sentHere = opened[order.id] || [];

  return (
    <div className="rounded-3xl bg-tile p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink tracking-tight flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-300" /> WhatsApp the customer
        </h3>
        <span className="text-xs text-dim tabular-nums" dir="ltr">
          {phone || 'No mobile number'}
        </span>
      </div>

      {!waLink(phone, 'x') ? (
        <p className="text-sm text-muted">This customer has no usable mobile number, so WhatsApp cannot be opened.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {WA_STAGES.map((s) => {
            const can = reached[s];
            const isLatest = s === latest;
            const was = sentHere.includes(s);
            return (
              <button
                key={s}
                onClick={() => void open(s)}
                disabled={!can || busy}
                title={
                  !can
                    ? 'Opens when the order reaches this step'
                    : s === 'READY' && readyPhoto
                      ? 'Open WhatsApp with the Ready message and the photo of the clean car'
                      : `Open WhatsApp with the "${WA_STAGE_LABEL[s]}" message`
                }
                className={`relative px-3 py-3 rounded-2xl text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:cursor-not-allowed ${
                  !can
                    ? 'bg-fill text-dim opacity-50'
                    : isLatest && !was
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                }`}
              >
                {was && <Check className="h-4 w-4 flex-shrink-0" aria-label="opened" />}
                <span className="truncate">{WA_STAGE_LABEL[s]}</span>
              </button>
            );
          })}
        </div>
      )}
      {note && (
        <p role="status" className={`text-sm leading-relaxed ${note.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
          {note.text}
        </p>
      )}
      <p className="text-xs text-dim leading-relaxed">
        Opens WhatsApp with the message written in. Check it and press Send there. &quot;Ready at bay&quot; also brings the photo of the clean car. The
        messages are edited in Settings.
      </p>
    </div>
  );
}
