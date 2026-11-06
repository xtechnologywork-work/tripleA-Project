import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase, hasServiceKey } from './supabase-server';
import { MockDatabase, TOTAL_BAYS } from '../data/mock/seed';
import { isValidStaffTransition } from '../domain/status-machine';
import {
  Employee,
  Vehicle,
  Order,
  Service,
  SubscriptionPackage,
  EmployeeSubscription,
  CreditLedgerEntry,
  FieldTeamMember,
  ParkingZone,
  OrderPhoto,
  OrderEvent,
  OrderStatus,
  Issue,
  AuditLog,
} from '../domain/types';

const PHOTO_BUCKET = 'order-photos';

type Row = Record<string, unknown>;

// -----------------------------------------------------------------------------
// Schema detection: the new columns exist only after migration_v2_dashboard.sql.
// Until then the app keeps working on the old columns.
// -----------------------------------------------------------------------------
let schemaV2: { ready: boolean; checkedAt: number } = { ready: false, checkedAt: 0 };

export async function isSchemaV2(sb: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  if (now - schemaV2.checkedAt < 30_000) return schemaV2.ready;
  const probe = await sb.from('orders').select('cancellation').limit(1);
  const ledgerProbe = await sb.from('credit_ledger').select('type').limit(1);
  const issuesProbe = await sb.from('issues').select('id').limit(1);
  schemaV2 = { ready: !probe.error && !ledgerProbe.error && !issuesProbe.error, checkedAt: now };
  return schemaV2.ready;
}

export function mapEmployeeRow(e: Row): Employee {
  return {
    id: String(e.id),
    employeeNo: e.employee_no ? String(e.employee_no) : undefined,
    fullName: String(e.full_name || ''),
    email: e.email ? String(e.email) : '',
    phone: e.phone ? String(e.phone) : '',
    qid: e.qid ? String(e.qid) : undefined,
    company: e.company ? String(e.company) : undefined,
    status: (e.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
    createdAt: e.created_at ? String(e.created_at) : new Date().toISOString(),
  };
}

/** Find an employee by their 8-digit Qatar mobile number. */
export async function findEmployeeByPhone(last8: string): Promise<Employee | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  const spaced = `${last8.slice(0, 4)} ${last8.slice(4)}`;
  const { data } = await sb
    .from('employees')
    .select('*')
    .or(`phone.ilike.%${last8}%,phone.ilike.%${spaced}%`)
    .limit(20);
  const hit = (data || []).find((r: Row) => String(r.phone || '').replace(/\D/g, '').endsWith(last8));
  return hit ? mapEmployeeRow(hit) : null;
}

export async function createEmployee(employee: Employee): Promise<{ ok: boolean; error?: string }> {
  const sb = getServerSupabase();
  if (!sb) return { ok: false, error: 'Supabase is not configured' };
  const { error } = await sb.from('employees').insert({
    id: employee.id,
    employee_no: employee.employeeNo || null,
    full_name: employee.fullName,
    email: employee.email || null,
    phone: employee.phone || null,
    qid: employee.qid || null,
    company: employee.company || 'Ministry of Commerce and Industry - State of Qatar',
    status: 'ACTIVE',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// -----------------------------------------------------------------------------
// READ: the whole operational state, assembled from the tables
// -----------------------------------------------------------------------------
export async function fetchSupabaseState(): Promise<{ db: MockDatabase; version: number } | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  try {
    const [
      empsRes,
      vehsRes,
      ordsRes,
      srvsRes,
      pkgsRes,
      subsRes,
      creditsRes,
      membersRes,
      zonesRes,
      photosRes,
      eventsRes,
      issuesRes,
      auditRes,
    ] = await Promise.all([
      sb.from('employees').select('*').order('created_at', { ascending: false }),
      sb.from('vehicles').select('*'),
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('services').select('*'),
      sb.from('subscription_packages').select('*'),
      sb.from('employee_subscriptions').select('*'),
      sb.from('credit_ledger').select('*').order('created_at', { ascending: true }),
      sb.from('field_team_members').select('*'),
      sb.from('parking_zones').select('*'),
      sb.from('order_photos').select('*'),
      sb.from('order_events').select('*').order('created_at', { ascending: true }),
      sb.from('issues').select('*').order('created_at', { ascending: false }),
      sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300),
    ]);

    if (empsRes.error) {
      console.warn('Supabase fetch error:', empsRes.error.message);
      return null;
    }

    const employees: Employee[] = (empsRes.data || []).map((e: Row) => ({
      id: String(e.id),
      employeeNo: e.employee_no ? String(e.employee_no) : undefined,
      fullName: String(e.full_name || ''),
      email: e.email ? String(e.email) : '',
      phone: e.phone ? String(e.phone) : '',
      qid: e.qid ? String(e.qid) : undefined,
      company: e.company ? String(e.company) : undefined,
      status: (e.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
      createdAt: e.created_at ? String(e.created_at) : new Date().toISOString(),
    }));

    const vehicles: Vehicle[] = (vehsRes.data || []).map((v: Row) => ({
      id: String(v.id),
      employeeId: String(v.employee_id),
      plateNumber: String(v.plate_number),
      plateType: String(v.plate_type || 'Private'),
      make: String(v.make || 'Porsche'),
      model: String(v.model || 'Panamera'),
      color: String(v.color || 'Jet Black Metallic'),
      isDefault: Boolean(v.is_default ?? true),
    }));

    const orders: Order[] = (ordsRes.data || []).map((o: Row) => ({
      id: String(o.id),
      reference: String(o.reference),
      employeeId: String(o.employee_id),
      bayId: String(o.bay_id),
      zoneCodeSnapshot: String(o.zone_code_snapshot || 'P'),
      bayCodeSnapshot: String(o.bay_code_snapshot || '1'),
      vehicleSnapshot: o.vehicle_snapshot as Vehicle,
      serviceId: String(o.service_id || 'srv-exterior'),
      serviceSnapshot: o.service_snapshot as Service,
      paymentMode: (o.payment_mode === 'CREDIT' ? 'CREDIT' : 'ONE_TIME') as 'CREDIT' | 'ONE_TIME',
      priceSnapshot: o.price_snapshot as { amountMinor: number; currency: 'QAR' },
      creditsUsed: Number(o.credits_used || 0),
      paymentStatus: (o.payment_status || 'NOT_APPLICABLE') as Order['paymentStatus'],
      instructions: o.instructions ? String(o.instructions) : undefined,
      status: (o.status || 'NEW') as Order['status'],
      statusBeforeIssue: o.status_before_issue ? (String(o.status_before_issue) as OrderStatus) : undefined,
      assignment: o.assignment ? (o.assignment as Order['assignment']) : undefined,
      qualityCheck: o.quality_check ? (o.quality_check as Order['qualityCheck']) : undefined,
      returnConfirmation: o.return_confirmation ? (o.return_confirmation as Order['returnConfirmation']) : undefined,
      cancellation: o.cancellation ? (o.cancellation as Order['cancellation']) : undefined,
      idempotencyKey: o.idempotency_key ? String(o.idempotency_key) : `idem-${o.id}`,
      version: Number(o.version || 1),
      createdAt: String(o.created_at || new Date().toISOString()),
      updatedAt: String(o.updated_at || new Date().toISOString()),
    }));

    const services: Service[] = (srvsRes.data || []).map((s: Row) => ({
      id: String(s.id),
      name: String(s.name || ''),
      description: String(s.description || ''),
      durationMin: Number(s.duration_min || 35),
      price: { amountMinor: Number(s.price_minor || 2000), currency: 'QAR' },
      creditCost: Number(s.credit_cost || 1),
      active: Boolean(s.active ?? true),
      sortOrder: Number(s.sort_order || 1),
    }));

    const packages: SubscriptionPackage[] = (pkgsRes.data || []).map((p: Row) => ({
      id: String(p.id),
      name: String(p.name || ''),
      paidWashes: Number(p.paid_washes || 6),
      bonusWashes: Number(p.bonus_washes || 2),
      price: { amountMinor: Number(p.price_minor || 14000), currency: 'QAR' },
      validityDays: Number(p.validity_days || 60),
      eligibleServiceIds: (p.eligible_service_ids as string[]) || ['srv-exterior'],
      active: Boolean(p.active ?? true),
    }));

    const subscriptions: EmployeeSubscription[] = (subsRes.data || []).map((sub: Row) => ({
      id: String(sub.id),
      employeeId: String(sub.employee_id),
      packageId: String(sub.package_id),
      packageSnapshot: sub.package_snapshot as SubscriptionPackage,
      status: (sub.status || 'ACTIVE') as EmployeeSubscription['status'],
      activatedAt: String(sub.activated_at || new Date().toISOString()),
      expiresAt: sub.expires_at ? String(sub.expires_at) : undefined,
      activatedBy: sub.activated_by ? String(sub.activated_by) : undefined,
    }));

    const credits: CreditLedgerEntry[] = (creditsRes.data || []).map((c: Row) => {
      const details = (c.details as Record<string, unknown> | null) || {};
      return {
        id: String(c.id),
        employeeId: String(c.employee_id),
        subscriptionId: c.subscription_id ? String(c.subscription_id) : undefined,
        orderId: c.order_id ? String(c.order_id) : undefined,
        type: (c.type || (Number(c.amount ?? c.delta ?? 0) < 0 ? 'DEBIT' : 'GRANT')) as CreditLedgerEntry['type'],
        delta: Number(c.amount ?? c.delta ?? 0),
        reason: c.reason ? String(c.reason) : details.reason ? String(details.reason) : undefined,
        actorId: String(c.actor_id || details.actorId || 'system'),
        createdAt: String(c.created_at || new Date().toISOString()),
      };
    });

    const fieldMembers: FieldTeamMember[] = (membersRes.data || []).map((m: Row) => ({
      id: String(m.id),
      displayName: String(m.display_name),
      active: Boolean(m.active ?? true),
    }));

    const zones: ParkingZone[] = (zonesRes.data || []).map((z: Row) => ({
      id: String(z.id),
      code: String(z.code),
      name: String(z.name),
      level: z.level ? String(z.level) : undefined,
      active: Boolean(z.active ?? true),
    }));

    // Photos live in a private bucket: hand out short-lived signed links, never public ones
    const storagePaths = (photosRes.data || [])
      .map((p: Row) => String(p.storage_path || ''))
      .filter((x: string) => x.startsWith('storage:'))
      .map((x: string) => x.slice('storage:'.length));
    const signed = new Map<string, string>();
    if (storagePaths.length > 0) {
      const { data: links } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(storagePaths, 3600);
      for (const l of links || []) if (l.path && l.signedUrl) signed.set(l.path, l.signedUrl);
    }

    const photos: OrderPhoto[] = (photosRes.data || []).map((p: Row) => {
      const raw = String(p.storage_path || p.blobKey || '');
      return {
        id: String(p.id),
        orderId: String(p.order_id),
        kind: (p.kind || 'BEFORE') as OrderPhoto['kind'],
        blobKey: raw.startsWith('storage:') ? signed.get(raw.slice('storage:'.length)) || '' : raw,
        uploadedBy: String(p.uploaded_by || 'staff'),
        createdAt: String(p.captured_at || p.createdAt || new Date().toISOString()),
      };
    });

    const orderEvents: OrderEvent[] = (eventsRes.data || []).map((ev: Row) => ({
      id: String(ev.id),
      orderId: String(ev.order_id),
      from: ev.from_status ? (ev.from_status as OrderStatus) : undefined,
      to: ev.to_status ? (ev.to_status as OrderStatus) : undefined,
      type: (ev.type || 'STATUS_CHANGED') as OrderEvent['type'],
      actor: {
        type: (ev.actor_type || 'STAFF') as 'EMPLOYEE' | 'STAFF',
        id: String(ev.actor_id || 'staff-admin-1'),
        name: ev.actor_name ? String(ev.actor_name) : undefined,
      },
      payload: (ev.payload as Record<string, unknown>) || undefined,
      createdAt: String(ev.created_at || new Date().toISOString()),
    }));

    const issues: Issue[] = (issuesRes.data || []).map((i: Row) => ({
      id: String(i.id),
      orderId: i.order_id ? String(i.order_id) : undefined,
      category: (i.category || 'OTHER') as Issue['category'],
      severity: (i.severity || 'MEDIUM') as Issue['severity'],
      description: String(i.description || ''),
      status: (i.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN') as Issue['status'],
      createdBy: String(i.created_by || 'staff'),
      createdAt: String(i.created_at || new Date().toISOString()),
      resolvedAt: i.resolved_at ? String(i.resolved_at) : undefined,
    }));

    const auditLogs: AuditLog[] = (auditRes.data || []).map((a: Row) => ({
      id: String(a.id),
      actor: (a.actor as AuditLog['actor']) || { type: 'STAFF', id: 'system' },
      action: String(a.action || ''),
      entityType: String(a.entity_type || ''),
      entityId: String(a.entity_id || ''),
      details: (a.details as Record<string, unknown>) || undefined,
      createdAt: String(a.created_at || new Date().toISOString()),
    }));

    // Bays are plain numbers 1 to 1288; the app creates them on demand, so they are not sent
    const bays: MockDatabase['bays'] = [];
    const qrTokens: MockDatabase['qrTokens'] = [];
    const targetZones = zones.length > 0 ? zones : [{ id: 'zone-main', code: 'P', name: 'Tower Parking', active: true }];

    const db: MockDatabase = {
      schemaVersion: 1,
      zones: targetZones,
      bays,
      qrTokens,
      services: services.length > 0 ? services : [
        {
          id: 'srv-exterior',
          name: 'Signature Exterior Hydro-Wash',
          description: 'Touchless high-pressure pre-wash, luxury foam treatment, microfibre hand wash, and tire gloss dressing.',
          durationMin: 35,
          price: { amountMinor: 2000, currency: 'QAR' },
          creditCost: 1,
          active: true,
          sortOrder: 1,
        },
      ],
      packages,
      staff: [
        {
          id: 'staff-admin-1',
          fullName: 'Tariq Al-Mansoor',
          email: 'operations.head@triplea.qa',
          role: 'SUPERADMIN',
          status: 'ACTIVE',
        },
      ],
      fieldMembers: fieldMembers.length > 0 ? fieldMembers : [
        { id: 'cleaner-1', displayName: 'Rashid Khan (Lead Tech)', active: true },
        { id: 'cleaner-2', displayName: 'Bilal Ahmed (Detailer)', active: true },
      ],
      fieldTeams: [
        {
          id: 'team-alpha',
          name: 'Alpha Response Crew (P1)',
          memberIds: (fieldMembers.length > 0 ? fieldMembers : [{ id: 'cleaner-1', displayName: 'Rashid Khan', active: true }]).map((m) => m.id),
        },
      ],
      employees,
      vehicles,
      subscriptions,
      credits,
      orders,
      photos,
      orderEvents,
      issues,
      auditLogs,
      settings: {
        referencePrefix: 'CB',
        timezone: 'Asia/Qatar',
        operatingHours: {
          start: '07:00',
          end: '22:00',
          days: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
        },
        employeeCancelWindow: 'NEW_ONLY',
        qcChecklistItems: ['Surface Dry', 'Glass Cleared', 'Tires Dressed'],
        demo: {
          latencyMs: 150,
          failureRate: 0,
        },
      },
    };

    return { db, version: Date.now() };
  } catch (err) {
    console.error('fetchSupabaseState error:', err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// WRITE: each change is saved on its own. Nothing replaces the whole database.
// -----------------------------------------------------------------------------
export interface SyncChanges {
  employees?: Employee[];
  vehicles?: Vehicle[];
  orders?: Order[];
  subscriptions?: EmployeeSubscription[];
  credits?: CreditLedgerEntry[];
  photos?: OrderPhoto[];
  orderEvents?: OrderEvent[];
  issues?: Issue[];
  auditLogs?: AuditLog[];
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** orders whose reference was already taken on another device and got a new one */
  referenceFixes: Record<string, string>;
  /** photos moved to Storage: id -> public url */
  photoUrls: Record<string, string>;
  rejected: string[];
}

function datePrefix(iso: string): string {
  return `CB-${iso.substring(2, 4)}${iso.substring(5, 7)}${iso.substring(8, 10)}`;
}

async function nextReference(sb: SupabaseClient, createdAt: string): Promise<string> {
  const prefix = datePrefix(createdAt);
  const { data } = await sb
    .from('orders')
    .select('reference')
    .like('reference', `${prefix}-%`)
    .order('reference', { ascending: false })
    .limit(1);
  const last = data && data[0] ? parseInt(String(data[0].reference).split('-').pop() || '0', 10) : 0;
  return `${prefix}-${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0')}`;
}

async function ensurePhotoBucket(sb: SupabaseClient): Promise<boolean> {
  if (!hasServiceKey()) return false;
  const { error } = await sb.storage.createBucket(PHOTO_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    console.warn('Photo bucket unavailable:', error.message);
    return false;
  }
  return true;
}

async function uploadPhoto(sb: SupabaseClient, photo: OrderPhoto): Promise<string | null> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(photo.blobKey);
  if (!match) return null;
  if (!(await ensurePhotoBucket(sb))) return null;
  const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
  const path = `${photo.orderId}/${photo.id}.${ext}`;
  const { error } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(path, Buffer.from(match[2], 'base64'), { contentType: match[1], upsert: true });
  if (error) {
    console.warn('Photo upload failed:', error.message);
    return null;
  }
  const { data: link } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return link ? `storage:${path}|${link.signedUrl}` : null;
}

/**
 * Applies a set of changed rows. `isAdmin` decides what is allowed:
 * - anyone can create a NEW order, cancel their own NEW order, and save profile data
 * - only an admin can move an order through its stages, adjust credits, or cancel a pass
 * Every admin stage change must follow the status rules.
 */
export interface Identity {
  admin: boolean;
  employeeId?: string;
}

export async function applyChanges(input: SyncChanges, identity: Identity): Promise<ApplyResult> {
  const result: ApplyResult = { ok: true, referenceFixes: {}, photoUrls: {}, rejected: [] };
  const sb = getServerSupabase();
  if (!sb) return { ...result, ok: false, error: 'Supabase is not configured' };
  const isAdmin = identity.admin;
  let changes = input;

  try {
    const v2 = await isSchemaV2(sb);

    // An employee's changes are checked row by row against their own account. One bad row refuses the whole batch.
    if (!isAdmin) {
      if (!identity.employeeId) return { ...result, ok: false, error: 'Sign in first' };
      const checked = await validateEmployeeBatch(sb, input, identity.employeeId);
      if (checked.errors.length > 0) return { ...result, rejected: checked.errors };
      changes = checked.fixed;
    }

    // ---- employees and vehicles: profile data, open to the customer flow ----
    if (changes.employees?.length) {
      const rows = changes.employees.map((e) => ({
        id: e.id,
        employee_no: e.employeeNo || null,
        full_name: e.fullName,
        email: e.email || null,
        phone: e.phone || null,
        qid: e.qid || null,
        company: e.company || 'Ministry of Commerce and Industry - State of Qatar',
        status: e.status || 'ACTIVE',
      }));
      const { error } = await sb.from('employees').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`employees: ${error.message}`);
    }

    if (changes.vehicles?.length) {
      const rows = changes.vehicles.map((v) => ({
        id: v.id,
        employee_id: v.employeeId,
        plate_number: v.plateNumber,
        plate_type: v.plateType || 'Private',
        make: v.make || null,
        model: v.model || null,
        color: v.color || null,
        is_default: v.isDefault ?? true,
      }));
      const { error } = await sb.from('vehicles').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`vehicles: ${error.message}`);
    }

    // ---- orders ----
    if (changes.orders?.length) {
      const ids = changes.orders.map((o) => o.id);
      const { data: existingRows } = await sb.from('orders').select('id,status,status_before_issue,reference').in('id', ids);
      const existing = new Map<string, Row>((existingRows || []).map((r: Row) => [String(r.id), r]));

      const accepted: Order[] = [];
      for (const order of changes.orders) {
        const current = existing.get(order.id);

        if (!current) {
          // A brand-new order must start as NEW (an admin may also create one)
          if (order.status !== 'NEW' && !isAdmin) {
            result.rejected.push(`${order.reference}: a new order must start as NEW`);
            continue;
          }
          // The reference is unique; two devices can pick the same number at the same time
          const { data: clash } = await sb.from('orders').select('id').eq('reference', order.reference).limit(1);
          if (clash && clash.length > 0) {
            const fresh = await nextReference(sb, order.createdAt);
            result.referenceFixes[order.id] = fresh;
            order.reference = fresh;
          }
          accepted.push(order);
          continue;
        }

        const from = String(current.status) as OrderStatus;
        if (order.status !== from) {
          const customerCancel = from === 'NEW' && order.status === 'CANCELLED';
          const statusBefore = current.status_before_issue ? (String(current.status_before_issue) as OrderStatus) : undefined;
          if (!isAdmin && !customerCancel) {
            result.rejected.push(`${order.reference}: ${from} -> ${order.status} needs an admin`);
            continue;
          }
          if (isAdmin && !isValidStaffTransition(from, order.status, statusBefore)) {
            result.rejected.push(`${order.reference}: ${from} -> ${order.status} is not allowed`);
            continue;
          }
        } else if (!isAdmin) {
          // Same status from a non-admin: nothing to save for this order
          continue;
        }
        accepted.push(order);
      }

      if (accepted.length > 0) {
        const rows = accepted.map((o) => {
          const base: Row = {
            id: o.id,
            reference: o.reference,
            employee_id: o.employeeId,
            bay_id: o.bayId,
            zone_code_snapshot: o.zoneCodeSnapshot,
            bay_code_snapshot: o.bayCodeSnapshot,
            vehicle_snapshot: o.vehicleSnapshot,
            service_id: o.serviceId,
            service_snapshot: o.serviceSnapshot,
            payment_mode: o.paymentMode,
            price_snapshot: o.priceSnapshot,
            credits_used: o.creditsUsed || 0,
            payment_status: o.paymentStatus || 'NOT_APPLICABLE',
            instructions: o.instructions || null,
            status: o.status,
            assignment: o.assignment || null,
            quality_check: o.qualityCheck || null,
            return_confirmation: o.returnConfirmation || null,
            idempotency_key: o.idempotencyKey || null,
            created_at: o.createdAt,
            updated_at: o.updatedAt,
          };
          if (v2) {
            base.cancellation = o.cancellation || null;
            base.status_before_issue = o.statusBeforeIssue || null;
            base.version = o.version || 1;
          }
          return base;
        });
        const { error } = await sb.from('orders').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`orders: ${error.message}`);
      }
    }

    // ---- subscriptions: a cancel is admin-only ----
    if (changes.subscriptions?.length) {
      const rows = changes.subscriptions
        .filter((s) => {
          if (s.status === 'CANCELLED' && !isAdmin) {
            result.rejected.push(`subscription ${s.id}: cancel needs an admin`);
            return false;
          }
          return true;
        })
        .map((s) => ({
          id: s.id,
          employee_id: s.employeeId,
          package_id: s.packageId,
          package_snapshot: s.packageSnapshot,
          status: s.status,
          activated_at: s.activatedAt,
          expires_at: s.expiresAt || null,
          activated_by: s.activatedBy || null,
        }));
      if (rows.length) {
        const { error } = await sb.from('employee_subscriptions').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`subscriptions: ${error.message}`);
      }
    }

    // ---- credit ledger: grants and adjustments are admin-only ----
    if (changes.credits?.length) {
      const rows = changes.credits
        .filter((c) => {
          if ((c.type === 'ADJUSTMENT' || c.type === 'GRANT') && !isAdmin && c.actorId !== 'system') {
            // A customer activating their own pass creates a GRANT for themselves; allow it
            // only when it belongs to a subscription, never as a free-form adjustment.
            if (c.type === 'ADJUSTMENT' || !c.subscriptionId) {
              result.rejected.push(`credit ${c.id}: ${c.type} needs an admin`);
              return false;
            }
          }
          return true;
        })
        .map((c) => {
          const base: Row = {
            id: c.id,
            employee_id: c.employeeId,
            subscription_id: c.subscriptionId || null,
            order_id: c.orderId || null,
            amount: c.delta,
            balance_after: 0,
            details: { reason: c.reason, actorId: c.actorId, type: c.type },
            created_at: c.createdAt,
          };
          if (v2) {
            base.type = c.type;
            base.reason = c.reason || null;
            base.actor_id = c.actorId;
          }
          return base;
        });
      if (rows.length) {
        const { error } = await sb.from('credit_ledger').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`credits: ${error.message}`);
      }
    }

    // ---- photos: large images go to Storage, the row keeps the link ----
    if (changes.photos?.length) {
      const rows: Row[] = [];
      for (const p of changes.photos) {
        const uploaded = await uploadPhoto(sb, p);
        const [storedPath, signedUrl] = uploaded ? uploaded.split('|') : ['', ''];
        if (signedUrl) result.photoUrls[p.id] = signedUrl;
        const row: Row = {
          id: p.id,
          order_id: p.orderId,
          kind: p.kind,
          storage_path: storedPath || p.blobKey,
          captured_at: p.createdAt,
        };
        if (v2) row.uploaded_by = p.uploadedBy;
        rows.push(row);
      }
      const { error } = await sb.from('order_photos').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`photos: ${error.message}`);
    }

    // ---- events (the timeline), issues and audit log ----
    if (changes.orderEvents?.length) {
      const rows = changes.orderEvents.map((ev) => {
        const row: Row = {
          id: ev.id,
          order_id: ev.orderId,
          actor_type: ev.actor.type,
          actor_id: ev.actor.id,
          actor_name: ev.actor.name || null,
          from_status: ev.from || null,
          to_status: ev.to || null,
          created_at: ev.createdAt,
        };
        if (v2) {
          row.type = ev.type;
          row.payload = ev.payload || null;
        }
        return row;
      });
      const { error } = await sb.from('order_events').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`events: ${error.message}`);
    }

    if (v2 && changes.issues?.length) {
      const rows = changes.issues.map((i) => ({
        id: i.id,
        order_id: i.orderId || null,
        category: i.category,
        severity: i.severity,
        description: i.description,
        status: i.status,
        created_by: i.createdBy,
        created_at: i.createdAt,
        resolved_at: i.resolvedAt || null,
      }));
      const { error } = await sb.from('issues').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`issues: ${error.message}`);
    }

    if (v2 && changes.auditLogs?.length) {
      const rows = changes.auditLogs.map((a) => ({
        id: a.id,
        actor: a.actor,
        action: a.action,
        entity_type: a.entityType,
        entity_id: a.entityId,
        details: a.details || null,
        created_at: a.createdAt,
      }));
      const { error } = await sb.from('audit_logs').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`audit: ${error.message}`);
    }

    return result;
  } catch (err) {
    console.warn('applyChanges failed:', err);
    return { ...result, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// -----------------------------------------------------------------------------
// SECURITY: what an employee is allowed to save (everything else is refused)
// -----------------------------------------------------------------------------
const MAX_PHOTO_CHARS = 4_200_000; // about 3 MB of image

async function validateEmployeeBatch(
  sb: SupabaseClient,
  changes: SyncChanges,
  me: string
): Promise<{ errors: string[]; fixed: SyncChanges }> {
  const errors: string[] = [];
  const fixed: SyncChanges = { ...changes };

  // ---- load what the checks need ----
  const orderIds = new Set<string>([
    ...(changes.orders || []).map((o) => o.id),
    ...(changes.photos || []).map((x) => x.orderId),
    ...(changes.orderEvents || []).map((x) => x.orderId),
    ...(changes.credits || []).map((x) => x.orderId || ''),
  ]);
  orderIds.delete('');

  const [orderRes, ledgerRes, subsRes, svcRes, pkgRes, meRes] = await Promise.all([
    orderIds.size ? sb.from('orders').select('id,employee_id,status,credits_used').in('id', Array.from(orderIds)) : Promise.resolve({ data: [] as Row[] }),
    sb.from('credit_ledger').select('id,order_id,amount,type,details').eq('employee_id', me),
    sb.from('employee_subscriptions').select('id,status').eq('employee_id', me),
    sb.from('services').select('price_minor').order('sort_order', { ascending: true }).limit(1),
    sb.from('subscription_packages').select('id,price_minor'),
    sb.from('employees').select('*').eq('id', me).limit(1),
  ]);

  const dbOrders = new Map<string, Row>((orderRes.data || []).map((r: Row) => [String(r.id), r]));
  const ledger = (ledgerRes.data || []) as Row[];
  const ledgerIds = new Set(ledger.map((r) => String(r.id)));
  const dbSubs = (subsRes.data || []) as Row[];
  const servicePrice = Number((svcRes.data || [])[0]?.price_minor || 2000);
  const packages = (pkgRes.data || []) as Row[];
  const packagePrice = Number(packages[0]?.price_minor || 14000);
  const myRow = (meRes.data || [])[0] as Row | undefined;
  const allowedPrices = new Set([servicePrice, packagePrice]);

  const batchOrders = new Map<string, Order>((changes.orders || []).map((o) => [o.id, o]));
  const isMyOrder = (id?: string) => {
    if (!id) return false;
    const inBatch = batchOrders.get(id);
    if (inBatch) return inBatch.employeeId === me;
    const inDb = dbOrders.get(id);
    return !!inDb && String(inDb.employee_id) === me;
  };
  const orderStatus = (id: string): string | undefined =>
    batchOrders.get(id)?.status || (dbOrders.get(id)?.status ? String(dbOrders.get(id)!.status) : undefined);

  // ---- profile: only name, phone and QID, only your own ----
  if (changes.employees?.length) {
    const next: Employee[] = [];
    for (const e of changes.employees) {
      if (e.id !== me || !myRow) {
        errors.push('profile: you can only edit your own profile');
        continue;
      }
      const name = (e.fullName || '').trim();
      const digits = (e.phone || '').replace(/\D/g, '');
      const qid = (e.qid || '').replace(/\D/g, '');
      if (name.length < 2 || name.length > 80) errors.push('profile: name must be 2 to 80 characters');
      if (digits.length < 8 || digits.length > 15) errors.push('profile: phone number is not valid');
      if (qid.length > 11) errors.push('profile: QID is too long');
      const current = mapEmployeeRow(myRow);
      next.push({ ...current, fullName: name, phone: e.phone, qid: qid || undefined });
    }
    fixed.employees = next;
  }

  // ---- vehicles ----
  for (const v of changes.vehicles || []) {
    if (v.employeeId !== me) errors.push('vehicle: not yours');
    if ((v.plateNumber || '').length > 20 || (v.make || '').length > 40 || (v.model || '').length > 40 || (v.color || '').length > 40) {
      errors.push('vehicle: a field is too long');
    }
  }

  // ---- orders ----
  const keptOrders: Order[] = [];
  for (const o of changes.orders || []) {
    if (o.employeeId !== me) {
      errors.push(`order ${o.reference}: not yours`);
      continue;
    }
    const current = dbOrders.get(o.id);
    if (!current) {
      const bay = Number(o.bayCodeSnapshot);
      if (o.status !== 'NEW') errors.push(`order ${o.reference}: a new order must start as NEW`);
      if (!Number.isInteger(bay) || bay < 1 || bay > TOTAL_BAYS) errors.push(`order ${o.reference}: bay must be 1 to ${TOTAL_BAYS}`);
      if (!allowedPrices.has(Number(o.priceSnapshot?.amountMinor))) errors.push(`order ${o.reference}: price does not match`);
      if (!['ONE_TIME', 'CREDIT'].includes(o.paymentMode)) errors.push(`order ${o.reference}: payment mode is not valid`);
      if (!(o.creditsUsed >= 0 && o.creditsUsed <= 1)) errors.push(`order ${o.reference}: credits used is not valid`);
      if ((o.instructions || '').length > 500) errors.push(`order ${o.reference}: notes are too long`);
      // Staff-only fields cannot be set by a customer
      keptOrders.push({
        ...o,
        status: 'NEW',
        assignment: undefined,
        qualityCheck: undefined,
        returnConfirmation: undefined,
        cancellation: undefined,
        statusBeforeIssue: undefined,
        version: 1,
      });
      continue;
    }
    // Existing order: the only customer action is to cancel while it is still NEW
    const from = String(current.status);
    if (o.status === from) continue; // nothing to save
    if (!(from === 'NEW' && o.status === 'CANCELLED')) {
      errors.push(`order ${o.reference}: you can only cancel an order that is still new`);
      continue;
    }
    keptOrders.push(o);
  }
  fixed.orders = keptOrders;

  // ---- passes: one active pass at most, from a real package ----
  const newSubs = (changes.subscriptions || []).filter((x) => !dbSubs.some((d) => String(d.id) === x.id));
  const hasActiveInDb = dbSubs.some((d) => String(d.status) === 'ACTIVE');
  for (const sub of newSubs) {
    if (sub.employeeId !== me) errors.push('pass: not yours');
    if (sub.status !== 'ACTIVE') errors.push('pass: a new pass must be ACTIVE');
    if (hasActiveInDb) errors.push('pass: you already have an active pass');
    if (!packages.some((pk) => String(pk.id) === sub.packageId)) errors.push('pass: package does not exist');
  }
  if (newSubs.length > 1) errors.push('pass: only one pass can be activated at a time');
  for (const sub of changes.subscriptions || []) {
    if (dbSubs.some((d) => String(d.id) === sub.id)) {
      errors.push('pass: an existing pass can only be changed by staff');
    }
  }
  fixed.subscriptions = newSubs;

  // ---- credits: debit your own order, refund a cancelled one, or grant the pass you just bought ----
  let balance = ledger.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const newCredits: CreditLedgerEntry[] = [];
  for (const c of changes.credits || []) {
    if (ledgerIds.has(c.id)) continue; // already saved
    if (c.employeeId !== me) {
      errors.push('credit: not yours');
      continue;
    }
    if (c.type === 'DEBIT') {
      if (!(c.delta < 0 && c.delta >= -3) || !isMyOrder(c.orderId)) errors.push('credit: this debit is not valid');
    } else if (c.type === 'REFUND') {
      const status = c.orderId ? orderStatus(c.orderId) : undefined;
      const used = c.orderId ? Number(batchOrders.get(c.orderId)?.creditsUsed ?? dbOrders.get(c.orderId)?.credits_used ?? 0) : 0;
      const alreadyRefunded = ledger.some(
        (r) => String(r.order_id) === c.orderId && (String(r.type) === 'REFUND' || String((r.details as Row | null)?.type) === 'REFUND')
      );
      if (!(c.delta > 0) || !isMyOrder(c.orderId) || status !== 'CANCELLED' || used !== c.delta || alreadyRefunded) {
        errors.push('credit: this refund is not valid');
      }
    } else if (c.type === 'GRANT') {
      const forNewPass = !!c.subscriptionId && newSubs.some((x) => x.id === c.subscriptionId);
      if (c.delta !== 8 || !forNewPass) errors.push('credit: this grant is not valid');
    } else {
      errors.push('credit: only staff can adjust credits');
    }
    balance += c.delta;
    newCredits.push(c);
  }
  if (balance < 0) errors.push('credit: not enough washes left');
  fixed.credits = newCredits;

  // ---- photos, timeline, audit ----
  for (const ph of changes.photos || []) {
    if (!isMyOrder(ph.orderId)) errors.push('photo: not for your order');
    if (!/^data:image\//.test(ph.blobKey) && !/^https?:\/\//.test(ph.blobKey)) errors.push('photo: not an image');
    if (ph.blobKey.length > MAX_PHOTO_CHARS) errors.push('photo: the image is too large');
  }
  for (const ev of changes.orderEvents || []) {
    if (!isMyOrder(ev.orderId) || ev.actor.id !== me) errors.push('timeline: not yours');
    if (ev.to && !['NEW', 'CANCELLED'].includes(ev.to)) errors.push('timeline: not allowed');
  }
  for (const a of changes.auditLogs || []) {
    if (a.actor.id !== me) errors.push('audit: not yours');
  }
  if ((changes.issues || []).length > 0) errors.push('issues: only staff can report issues');
  fixed.issues = [];

  return { errors: Array.from(new Set(errors)), fixed };
}

// -----------------------------------------------------------------------------
// SECURITY: who gets to see what
// -----------------------------------------------------------------------------
/**
 * - admin: everything
 * - employee: their own account, orders, passes, credits and photos; the price list; nobody else
 * - nobody signed in: the price list only (no people, no orders)
 */
export function scopeState(db: MockDatabase, identity: Identity): MockDatabase {
  if (identity.admin) return db;

  const me = identity.employeeId;
  const catalogue: MockDatabase = {
    ...db,
    staff: [],
    fieldMembers: [],
    fieldTeams: [],
    employees: [],
    vehicles: [],
    subscriptions: [],
    credits: [],
    orders: [],
    photos: [],
    orderEvents: [],
    issues: [],
    auditLogs: [],
  };
  if (!me) return catalogue;

  const mine = db.orders.filter((o) => o.employeeId === me);
  const mineIds = new Set(mine.map((o) => o.id));
  return {
    ...catalogue,
    employees: db.employees.filter((e) => e.id === me),
    vehicles: db.vehicles.filter((v) => v.employeeId === me),
    subscriptions: db.subscriptions.filter((x) => x.employeeId === me),
    credits: db.credits.filter((c) => c.employeeId === me),
    orders: mine,
    photos: db.photos.filter((x) => mineIds.has(x.orderId)),
    orderEvents: db.orderEvents.filter((x) => mineIds.has(x.orderId)),
  };
}
