/**
 * Paying online before an order exists (MyFatoorah).
 *
 * The order is made only after the payment is confirmed with MyFatoorah by our server. Every id is derived from
 * the payment, so confirming the same payment twice (the return page and the webhook) can never make two orders.
 *
 * Only types are imported, so this file can be tested on its own.
 */
import type {
  CreditLedgerEntry,
  Employee,
  EmployeeSubscription,
  Order,
  OrderEvent,
  OrderPhoto,
  Service,
  SubscriptionPackage,
} from './types';

export type PayPlan = 'single' | 'pass';

/** What the customer filled in before paying. */
export interface PaymentDraft {
  bay: string;
  notes?: string;
  plate?: string;
  make?: string;
  model?: string;
  color?: string;
  /** "storage:<path>" for a photo kept in private storage, or a data link in local demo mode */
  photo?: string;
  lang: 'ar' | 'en';
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'FAILED';

export interface PaymentIntent {
  id: string;
  employeeId: string;
  plan: PayPlan;
  amountMinor: number;
  currency: 'QAR';
  status: PaymentStatus;
  invoiceId?: string;
  paymentId?: string;
  gateway?: string;
  draft: PaymentDraft;
  orderId?: string;
  orderReference?: string;
  createdAt: string;
  paidAt?: string;
}

const MAX_PHOTO_CHARS = 4_200_000;

/** Checks and cleans what the customer sent. Never trusts a price from the browser. */
export function cleanDraft(
  input: Record<string, unknown>,
  totalBays: number
): { ok: true; draft: PaymentDraft } | { ok: false; error: string } {
  const bayNumber = parseInt(String(input.bay ?? '').replace(/\D/g, ''), 10);
  if (!Number.isInteger(bayNumber) || bayNumber < 1 || bayNumber > totalBays) return { ok: false, error: 'BAD_BAY' };
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const notes = text(input.notes, 500);
  const plate = text(input.plate, 20);
  const photo = typeof input.photo === 'string' ? input.photo : '';
  if (photo && (!/^data:image\/(?:jpeg|jpg|png|webp|heic);base64,/i.test(photo) || photo.length > MAX_PHOTO_CHARS)) {
    return { ok: false, error: 'BAD_PHOTO' };
  }
  return {
    ok: true,
    draft: {
      bay: String(bayNumber),
      notes: notes || undefined,
      plate: plate || undefined,
      make: text(input.make, 40) || undefined,
      model: text(input.model, 40) || undefined,
      color: text(input.color, 40) || undefined,
      photo: photo || undefined,
      lang: input.lang === 'ar' ? 'ar' : 'en',
    },
  };
}

/** The wash service and the pass package the price comes from. */
export function pickService(services: Service[]): Service | null {
  return [...services].filter((s) => s.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0] || null;
}

export function pickPackage(packages: SubscriptionPackage[]): SubscriptionPackage | null {
  const active = packages.filter((p) => p.active !== false);
  return active.find((p) => p.id === 'pkg-executive') || active.find((p) => p.price?.amountMinor === 14000) || active[0] || null;
}

/** What the customer pays, from the saved prices. */
export function priceFor(plan: PayPlan, service: Service | null, pkg: SubscriptionPackage | null): number | null {
  if (plan === 'single') return service?.price?.amountMinor ?? null;
  return pkg?.price?.amountMinor ?? null;
}

/** Ids made from the payment: the same payment always gives the same order. */
export function fulfillmentIds(intentId: string) {
  return {
    order: `ord-pay-${intentId}`,
    event: `evt-pay-${intentId}`,
    photo: `pht-pay-${intentId}`,
    subscription: `sub-pay-${intentId}`,
    grant: `crd-pay-${intentId}-grant`,
    debit: `crd-pay-${intentId}-debit`,
  };
}

export interface Fulfillment {
  order: Order;
  events: OrderEvent[];
  photos: OrderPhoto[];
  credits: CreditLedgerEntry[];
  subscriptions: EmployeeSubscription[];
}

/**
 * Everything to save once a payment is confirmed.
 * - single: a paid 20 QAR wash.
 * - pass: the pass (8 washes) and its first wash, paid with one of them.
 * If the employee already has an active pass (bought twice at the same time), the washes are added to it.
 */
export function buildFulfillment(args: {
  intent: PaymentIntent;
  employee: Employee;
  service: Service;
  pkg: SubscriptionPackage | null;
  activePass: EmployeeSubscription | null;
  reference: string;
  now: string;
  /** false: the order is made when the customer reaches the payment page, marked not paid, with no pass yet */
  paid?: boolean;
}): Fulfillment {
  const { intent, employee, service, pkg, activePass, reference, now } = args;
  const paid = args.paid !== false;
  const ids = fulfillmentIds(intent.id);
  const d = intent.draft;
  const isPass = intent.plan === 'pass';

  const subscriptions: EmployeeSubscription[] = [];
  const credits: CreditLedgerEntry[] = [];
  let passId = activePass?.id;

  if (isPass && paid) {
    if (!pkg) throw new Error('No pass package');
    const washes = pkg.paidWashes + pkg.bonusWashes;
    if (!activePass) {
      passId = ids.subscription;
      const days = pkg.validityDays ?? 60;
      subscriptions.push({
        id: ids.subscription,
        employeeId: employee.id,
        packageId: pkg.id,
        packageSnapshot: pkg,
        status: 'ACTIVE',
        activatedAt: now,
        expiresAt: new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
        activatedBy: 'online-payment',
      });
    }
    credits.push({
      id: ids.grant,
      employeeId: employee.id,
      subscriptionId: passId,
      type: 'GRANT',
      delta: washes,
      reason: `Wash pass paid online (${washes} washes)`,
      actorId: 'system',
      createdAt: now,
    });
    credits.push({
      id: ids.debit,
      employeeId: employee.id,
      orderId: ids.order,
      type: 'DEBIT',
      delta: -1,
      reason: `First wash of the pass, order ${reference}`,
      actorId: 'system',
      createdAt: now,
    });
  }

  const order: Order = {
    id: ids.order,
    reference,
    employeeId: employee.id,
    bayId: `bay-${d.bay}`,
    bayCodeSnapshot: d.bay,
    zoneCodeSnapshot: 'P',
    vehicleSnapshot: {
      id: `veh-pay-${intent.id}`,
      employeeId: employee.id,
      plateNumber: d.plate || 'Photo Verified',
      plateType: 'Private',
      make: d.make || 'Vehicle',
      model: d.model || '',
      color: d.color || '',
      isDefault: true,
    },
    serviceId: service.id,
    serviceSnapshot: service,
    paymentMode: isPass ? 'CREDIT' : 'ONE_TIME',
    priceSnapshot: { amountMinor: intent.amountMinor, currency: 'QAR' },
    creditsUsed: isPass && paid ? 1 : 0,
    paymentStatus: paid ? 'PAID_ONLINE' : 'UNPAID',
    instructions: d.notes,
    status: 'NEW',
    idempotencyKey: `pay:${intent.id}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const events: OrderEvent[] = [
    {
      id: ids.event,
      orderId: ids.order,
      to: 'NEW',
      type: 'CREATED',
      actor: { type: 'EMPLOYEE', id: employee.id, name: employee.fullName },
      payload: { paidOnline: paid, awaitingPayment: !paid, paymentId: intent.paymentId, invoiceId: intent.invoiceId },
      createdAt: now,
    },
  ];

  const photos: OrderPhoto[] = d.photo
    ? [{ id: ids.photo, orderId: ids.order, kind: 'BEFORE', blobKey: d.photo, uploadedBy: employee.fullName || employee.id, createdAt: now }]
    : [];

  return { order, events, photos, credits, subscriptions };
}
