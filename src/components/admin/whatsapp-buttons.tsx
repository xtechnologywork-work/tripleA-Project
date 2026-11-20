'use client';

import React, { useEffect, useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import type { Employee, Order } from '@/domain/types';
import { WA_STAGES, WA_STAGE_LABEL, fillWaTemplate, waLink, waStagesReached, type WaStage } from '@/domain/whatsapp';
import { useWaTemplates } from '@/lib/whatsapp-client';

const SENT_KEY = 'triplea_wa_opened';

/** Which messages were already opened on this computer, per order (a reminder for the team, not a record). */
function readOpened(): Record<string, WaStage[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function markOpened(orderId: string, stage: WaStage): Record<string, WaStage[]> {
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
  return all;
}

/**
 * One WhatsApp button per step of the order. A button opens once the order reached that step; pressing it opens
 * the customer's WhatsApp chat with the message from Settings, filled in with this order's details.
 */
export function WhatsAppButtons({ order, client, inspectionSubmitted }: { order: Order; client: Employee | null | undefined; inspectionSubmitted: boolean }) {
  const templates = useWaTemplates();
  const [opened, setOpened] = useState<Record<string, WaStage[]>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the per-computer reminder after mount
    setOpened(readOpened());
  }, []);

  if (order.status === 'CANCELLED') return null;

  const reached = waStagesReached(order, inspectionSubmitted);
  // The newest step reached is the one to send now
  const latest = [...WA_STAGES].reverse().find((s) => reached[s]);
  const phone = client?.phone;
  const ready = order.status === 'RETURNED_TO_PARKING' ? order.returnConfirmation : undefined;

  const open = (stage: WaStage) => {
    const message = fillWaTemplate(templates[stage], {
      name: client?.fullName || '',
      reference: order.reference,
      parkingBay: order.bayCodeSnapshot,
      floor: ready?.floor || '',
      readyBay: ready?.bayCode || '',
      service: order.serviceSnapshot?.name || '',
    });
    // A phone opens the WhatsApp app; a computer opens WhatsApp Web straight on the chat, always in the same tab
    // (WhatsApp Web refuses to run in two tabs at once)
    const onPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const link = waLink(phone, message, onPhone ? 'app' : 'web');
    if (!link) return;
    const tab = window.open(link, onPhone ? '_blank' : 'triplea_whatsapp');
    if (tab) tab.opener = null;
    setOpened(markOpened(order.id, stage));
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
                onClick={() => open(s)}
                disabled={!can}
                title={can ? `Open WhatsApp with the "${WA_STAGE_LABEL[s]}" message` : 'Opens when the order reaches this step'}
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
      <p className="text-xs text-dim leading-relaxed">
        Opens WhatsApp with the message written in. Check it and press Send there. The messages are edited in Settings.
      </p>
    </div>
  );
}
