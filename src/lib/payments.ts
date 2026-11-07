/**
 * Online payments on the server: the payment records, and turning a confirmed payment into an order.
 * Kept in Supabase (table "payments"), or in the local file in demo mode. Server only.
 */
import { getServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { applyChanges, fetchSupabaseState, nextReference } from '@/lib/supabase-sync';
import { getLocalDb, mergeLocal } from '@/lib/local-db';
import { myFatoorahConfig, checkPayment } from '@/lib/myfatoorah';
import {
  buildFulfillment,
  fulfillmentIds,
  pickPackage,
  pickService,
  type PaymentIntent,
  type PaymentStatus,
} from '@/domain/payments';
import type { MockDatabase } from '@/data/mock/seed';
import type { CreditLedgerEntry, EmployeeSubscription } from '@/domain/types';

/** Online payment is on when PAYMENTS_ENABLED is "true" and MyFatoorah is set up. */
export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true' && !!myFatoorahConfig();

const onSupabase = () => isServerSupabaseConfigured() && !!getServerSupabase();

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const toRow = (p: PaymentIntent): Row => ({
  id: p.id,
  employee_id: p.employeeId,
  plan: p.plan,
  amount_minor: p.amountMinor,
  currency: p.currency,
  status: p.status,
  invoice_id: p.invoiceId || null,
  payment_id: p.paymentId || null,
  gateway: p.gateway || null,
  draft: p.draft,
  order_id: p.orderId || null,
  order_reference: p.orderReference || null,
  created_at: p.createdAt,
  paid_at: p.paidAt || null,
});

const fromRow = (r: Row): PaymentIntent => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  plan: r.plan === 'pass' ? 'pass' : 'single',
  amountMinor: Number(r.amount_minor),
  currency: 'QAR',
  status: String(r.status) as PaymentStatus,
  invoiceId: r.invoice_id ? String(r.invoice_id) : undefined,
  paymentId: r.payment_id ? String(r.payment_id) : undefined,
  gateway: r.gateway ? String(r.gateway) : undefined,
  draft: r.draft as PaymentIntent['draft'],
  orderId: r.order_id ? String(r.order_id) : undefined,
  orderReference: r.order_reference ? String(r.order_reference) : undefined,
  createdAt: String(r.created_at),
  paidAt: r.paid_at ? String(r.paid_at) : undefined,
});

const localPayments = (): PaymentIntent[] => ((getLocalDb()?.payments as PaymentIntent[]) || []).slice();

export async function savePayment(p: PaymentIntent): Promise<boolean> {
  if (onSupabase()) {
    const { error } = await getServerSupabase()!.from('payments').upsert(toRow(p), { onConflict: 'id' });
    if (error) console.error('Saving a payment failed:', error.message);
    return !error;
  }
  mergeLocal({ payments: [p] });
  return true;
}

export async function findPayment(by: { id?: string; invoiceId?: string }): Promise<PaymentIntent | null> {
  if (onSupabase()) {
    let q = getServerSupabase()!.from('payments').select('*').limit(1);
    q = by.id ? q.eq('id', by.id) : q.eq('invoice_id', by.invoiceId || '-');
    const { data } = await q;
    return data && data[0] ? fromRow(data[0] as Row) : null;
  }
  return localPayments().find((p) => (by.id ? p.id === by.id : p.invoiceId === by.invoiceId)) || null;
}

/** Moves a payment to PAID once (from PENDING, or from FAILED when the customer paid after cancelling once). Returns false if someone else already did. */
async function claimPaid(p: PaymentIntent, paymentId: string | undefined, gateway: string | undefined): Promise<boolean> {
  const paidAt = new Date().toISOString();
  if (onSupabase()) {
    const { data } = await getServerSupabase()!
      .from('payments')
      .update({ status: 'PAID', paid_at: paidAt, payment_id: paymentId || null, gateway: gateway || null })
      .eq('id', p.id)
      .in('status', ['PENDING', 'FAILED'])
      .select('id');
    return !!data && data.length > 0;
  }
  const current = localPayments().find((x) => x.id === p.id);
  if (!current || (current.status !== 'PENDING' && current.status !== 'FAILED')) return false;
  mergeLocal({ payments: [{ ...current, status: 'PAID', paidAt, paymentId, gateway }] });
  return true;
}

// ---------------------------------------------------------------------------
// Data needed to build the order
// ---------------------------------------------------------------------------
async function loadState(): Promise<MockDatabase | null> {
  if (onSupabase()) return (await fetchSupabaseState())?.db || null;
  return (getLocalDb() as unknown as MockDatabase) || null;
}

async function makeReference(db: MockDatabase, createdAt: string): Promise<string> {
  if (onSupabase()) return nextReference(getServerSupabase()!, createdAt);
  const prefix = `CB-${createdAt.substring(2, 4)}${createdAt.substring(5, 7)}${createdAt.substring(8, 10)}`;
  const last = (db.orders || [])
    .filter((o) => o.reference.startsWith(`${prefix}-`))
    .reduce((max, o) => Math.max(max, parseInt(o.reference.split('-').pop() || '0', 10) || 0), 0);
  return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Confirming a payment
// ---------------------------------------------------------------------------
export type ConfirmResult =
  | { status: 'PAID'; reference: string }
  | { status: 'PENDING' }
  | { status: 'FAILED' }
  | { status: 'ERROR'; error: string };

/**
 * Checks with MyFatoorah, and when the payment went through, makes the order (once).
 * Safe to call many times, from the return page and from the webhook.
 */
export async function confirmPayment(key: string, keyType: 'PaymentId' | 'InvoiceId'): Promise<ConfirmResult> {
  const config = myFatoorahConfig();
  if (!config) return { status: 'ERROR', error: 'NOT_READY' };

  const checked = await checkPayment(config, key, keyType);
  if (!checked.ok) {
    console.error('MyFatoorah status check failed:', checked.error);
    return { status: 'ERROR', error: 'CHECK_FAILED' };
  }
  const c = checked.check;

  // The payment must be one this app created: same reference and same invoice
  const intent = await findPayment({ id: c.customerReference });
  if (!intent || (intent.invoiceId && intent.invoiceId !== c.invoiceId)) {
    console.error('A MyFatoorah payment did not match any order waiting for payment');
    return { status: 'ERROR', error: 'UNKNOWN_PAYMENT' };
  }

  if (intent.status === 'FULFILLED' && intent.orderReference) return { status: 'PAID', reference: intent.orderReference };
  if (!c.paid) {
    // This attempt failed or was cancelled (the invoice itself stays open, so the customer can try again)
    const ended = /cancel/i.test(c.invoiceStatus) || /fail|cancel/i.test(c.attemptStatus || '');
    if (ended && intent.status === 'PENDING') await savePayment({ ...intent, status: 'FAILED' });
    return ended ? { status: 'FAILED' } : { status: 'PENDING' };
  }

  // Paid. Take the payment for this request; a second request at the same time stops here
  const claimed = intent.status === 'PENDING' || intent.status === 'FAILED' ? await claimPaid(intent, c.paymentId, c.gateway) : false;
  const fresh = (await findPayment({ id: intent.id })) || intent;
  if (fresh.status === 'FULFILLED' && fresh.orderReference) return { status: 'PAID', reference: fresh.orderReference };
  if (!claimed) {
    // Another request is making the order right now: let the screen ask again in a moment
    const since = fresh.paidAt ? Date.now() - new Date(fresh.paidAt).getTime() : Infinity;
    if (since < 60_000) return { status: 'PENDING' };
    // Older than a minute and still no order: that request stopped half way, so finish it here
  }

  try {
    const reference = await fulfill({ ...fresh, paymentId: fresh.paymentId || c.paymentId, gateway: fresh.gateway || c.gateway });
    return { status: 'PAID', reference };
  } catch (err) {
    console.error('Making the order after payment failed:', err);
    return { status: 'ERROR', error: 'ORDER_FAILED' };
  }
}

/**
 * Makes the order when the customer reaches the payment page, marked "not paid" (so the team sees it even if
 * the customer never pays). Same ids as the paid order, so it is made only once.
 */
export async function createUnpaidOrder(intent: PaymentIntent): Promise<{ id: string; reference: string } | null> {
  try {
    const db = await loadState();
    if (!db) return null;
    const ids = fulfillmentIds(intent.id);
    const existing = (db.orders || []).find((o) => o.id === ids.order);
    if (existing) return { id: existing.id, reference: existing.reference };
    const employee = (db.employees || []).find((e) => e.id === intent.employeeId);
    const service = pickService(db.services || []);
    if (!employee || !service) return null;

    const now = new Date().toISOString();
    let reference = await makeReference(db, now);
    const f = buildFulfillment({ intent, employee, service, pkg: pickPackage(db.packages || []), activePass: null, reference, now, paid: false });
    if (onSupabase()) {
      const result = await applyChanges({ orders: [f.order], orderEvents: f.events, photos: f.photos }, { admin: true });
      if (!result.ok || result.rejected.length) {
        console.error('Making the unpaid order failed:', result.error || result.rejected.join('; '));
        return null;
      }
      reference = result.referenceFixes[f.order.id] || reference;
    } else {
      mergeLocal({ orders: [f.order], orderEvents: f.events, photos: f.photos });
    }
    return { id: f.order.id, reference };
  } catch (err) {
    console.error('Making the unpaid order failed:', err);
    return null;
  }
}

/** Makes the order (and the pass) for a paid payment. The ids come from the payment, so it never doubles. */
async function fulfill(intent: PaymentIntent): Promise<string> {
  const db = await loadState();
  if (!db) throw new Error('No data');
  const ids = fulfillmentIds(intent.id);

  // The order was made when the customer reached the payment page: now it becomes paid
  const existing = (db.orders || []).find((o) => o.id === ids.order);
  if (existing) {
    if (existing.paymentStatus !== 'PAID_ONLINE') {
      const employee = (db.employees || []).find((e) => e.id === intent.employeeId);
      const service = pickService(db.services || []);
      const cancelled = existing.status === 'CANCELLED';
      let credits: CreditLedgerEntry[] = [];
      let subscriptions: EmployeeSubscription[] = [];
      if (intent.plan === 'pass' && employee && service) {
        const activePass =
          (db.subscriptions || []).find((s) => s.employeeId === employee.id && s.status === 'ACTIVE' && s.id !== ids.subscription) || null;
        const f = buildFulfillment({
          intent, employee, service, pkg: pickPackage(db.packages || []), activePass, reference: existing.reference, now: new Date().toISOString(),
        });
        subscriptions = f.subscriptions;
        // A wash the team already cancelled does not use a wash of the new pass
        credits = cancelled ? f.credits.filter((c) => c.type !== 'DEBIT') : f.credits;
      }
      const usesCredit = intent.plan === 'pass' && !cancelled;
      if (onSupabase()) {
        if (credits.length || subscriptions.length) {
          const result = await applyChanges({ credits, subscriptions }, { admin: true });
          if (!result.ok) throw new Error(result.error || 'Saving the pass failed');
          if (result.rejected.length) throw new Error(result.rejected.join('; '));
        }
        // Only the payment fields change, so work the team did on the order since is kept
        const { error } = await getServerSupabase()!
          .from('orders')
          .update({ payment_status: 'PAID_ONLINE', credits_used: usesCredit ? 1 : 0, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        mergeLocal({
          orders: [{ ...existing, paymentStatus: 'PAID_ONLINE', creditsUsed: usesCredit ? 1 : 0, updatedAt: new Date().toISOString() }],
          credits,
          subscriptions,
        });
      }
    }
    await savePayment({ ...intent, status: 'FULFILLED', orderId: existing.id, orderReference: existing.reference });
    return existing.reference;
  }

  const employee = (db.employees || []).find((e) => e.id === intent.employeeId);
  const service = pickService(db.services || []);
  if (!employee || !service) throw new Error('Employee or service missing');
  const activePass =
    (db.subscriptions || []).find((s) => s.employeeId === employee.id && s.status === 'ACTIVE' && s.id !== ids.subscription) || null;

  const now = new Date().toISOString();
  let reference = await makeReference(db, now);
  const f = buildFulfillment({ intent, employee, service, pkg: pickPackage(db.packages || []), activePass, reference, now });

  if (onSupabase()) {
    const result = await applyChanges(
      { orders: [f.order], orderEvents: f.events, photos: f.photos, credits: f.credits, subscriptions: f.subscriptions },
      { admin: true }
    );
    if (!result.ok) throw new Error(result.error || 'Saving the order failed');
    if (result.rejected.length) throw new Error(result.rejected.join('; '));
    reference = result.referenceFixes[f.order.id] || reference;
  } else {
    mergeLocal({ orders: [f.order], orderEvents: f.events, photos: f.photos, credits: f.credits, subscriptions: f.subscriptions });
  }

  await savePayment({ ...intent, status: 'FULFILLED', orderId: f.order.id, orderReference: reference });
  return reference;
}
