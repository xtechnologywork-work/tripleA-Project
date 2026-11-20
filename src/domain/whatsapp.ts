/**
 * WhatsApp messages the team sends to a customer at each step of an order, from the dashboard.
 * The team presses a button; WhatsApp opens on the customer's chat with the message already written, and the team
 * presses Send. Nothing is sent by the app itself. The texts are edited in Settings.
 * Pure rules, no imports, so they can be tested on their own.
 */

export const WA_STAGES = ['INSPECTION', 'ASSIGNED', 'WASHING', 'READY'] as const;
export type WaStage = (typeof WA_STAGES)[number];

export type WaTemplates = Record<WaStage, string>;

export const WA_STAGE_LABEL: Record<WaStage, string> = {
  INSPECTION: 'Inspection done',
  ASSIGNED: 'Team assigned',
  WASHING: 'Wash started',
  READY: 'Ready at bay',
};

/** The words that are replaced by the order's details. */
export const WA_PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: '{name}', meaning: "Customer's name" },
  { key: '{reference}', meaning: 'Order number' },
  { key: '{parking_bay}', meaning: 'Bay where the customer parked' },
  { key: '{floor}', meaning: 'Floor where the clean car was left' },
  { key: '{ready_bay}', meaning: 'Bay where the clean car was left' },
  { key: '{service}', meaning: 'The wash ordered' },
];

/** Arabic first, then English: the team does not know which one each customer reads. */
export const DEFAULT_WA_TEMPLATES: WaTemplates = {
  INSPECTION:
    'مرحباً {name}،\nتم فحص سيارتك قبل الغسيل وتوثيق حالتها بالصور (الطلب {reference}). سنبدأ العمل عليها قريباً.\n\nHello {name},\nYour car has been inspected and photographed before the wash (order {reference}). We will start shortly.\n\nTripleA',
  ASSIGNED:
    'مرحباً {name}،\nتم تعيين فريق TripleA لسيارتك في الموقف {parking_bay} (الطلب {reference}).\n\nHello {name},\nA TripleA team has been assigned to your car at bay {parking_bay} (order {reference}).\n\nTripleA',
  WASHING:
    'مرحباً {name}،\nبدأنا الآن غسيل سيارتك (الطلب {reference}). سنخبرك فور انتهائنا.\n\nHello {name},\nWe have started washing your car (order {reference}). We will let you know as soon as it is ready.\n\nTripleA',
  READY:
    'مرحباً {name}،\nسيارتك نظيفة وجاهزة. تجدها في الطابق {floor}، الموقف {ready_bay} (الطلب {reference}). شكراً لاختيارك TripleA.\n\nHello {name},\nYour car is clean and ready. You will find it on floor {floor}, bay {ready_bay} (order {reference}). Thank you for choosing TripleA.',
};

export const WA_MAX_LENGTH = 1000;

/** Saved texts, with the default for any that is missing or damaged. */
export function readWaTemplates(raw: unknown): WaTemplates {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_WA_TEMPLATES };
  for (const s of WA_STAGES) {
    const v = src[s];
    if (typeof v === 'string' && v.trim() && v.length <= WA_MAX_LENGTH) out[s] = v;
  }
  return out;
}

/** Checks texts sent by the team. Only the stages sent are changed. */
export function cleanWaTemplates(input: unknown, current: WaTemplates): { ok: true; templates: WaTemplates } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Nothing to save.' };
  const src = input as Record<string, unknown>;
  const next = { ...current };
  let changed = 0;
  for (const s of WA_STAGES) {
    if (!(s in src)) continue;
    const v = src[s];
    if (typeof v !== 'string') return { ok: false, error: `The "${WA_STAGE_LABEL[s]}" message is not text.` };
    const text = v.replace(/\r\n/g, '\n').trim();
    if (!text) return { ok: false, error: `The "${WA_STAGE_LABEL[s]}" message is empty.` };
    if (text.length > WA_MAX_LENGTH) return { ok: false, error: `The "${WA_STAGE_LABEL[s]}" message is longer than ${WA_MAX_LENGTH} characters.` };
    next[s] = text;
    changed += 1;
  }
  if (!changed) return { ok: false, error: 'Nothing to save.' };
  return { ok: true, templates: next };
}

export interface WaOrderDetails {
  name: string;
  reference: string;
  parkingBay: string;
  /** Known once the car is ready */
  floor?: string;
  readyBay?: string;
  service?: string;
}

/** The message with the order's details in place of {name}, {reference}, ... An unknown {word} is left as it is. */
export function fillWaTemplate(template: string, d: WaOrderDetails): string {
  const values: Record<string, string> = {
    name: d.name.trim(),
    reference: d.reference,
    parking_bay: d.parkingBay,
    floor: d.floor || '',
    ready_bay: d.readyBay || d.parkingBay,
    service: d.service || '',
  };
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key] : whole));
}

/** The number in the form wa.me needs (country code, digits only). A Qatar number of 8 digits gets 974. Null when unusable. */
export function waNumber(phone: string | undefined | null): string | null {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `974${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** The link that opens the customer's WhatsApp chat with the message written in. */
export function waLink(phone: string | undefined | null, message: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}

/** Which step the order has reached, for each message. The inspection counts once it was sent (not skipped). */
export function waStagesReached(order: { status: string; statusBeforeIssue?: string }, inspectionSubmitted: boolean): Record<WaStage, boolean> {
  const st = order.status === 'ISSUE_REPORTED' ? order.statusBeforeIssue || 'NEW' : order.status;
  const step =
    st === 'ASSIGNED' ? 1 : st === 'IN_PROGRESS' || st === 'QUALITY_CHECK' ? 2 : st === 'COMPLETED' ? 2 : st === 'RETURNED_TO_PARKING' ? 3 : 0;
  return { INSPECTION: inspectionSubmitted, ASSIGNED: step >= 1, WASHING: step >= 2, READY: step >= 3 };
}
