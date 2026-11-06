import { getSupabase } from './supabase';
import { MockDatabase, TOTAL_BAYS } from '../data/mock/seed';
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
} from '../domain/types';

export async function fetchSupabaseState(): Promise<{ db: MockDatabase; version: number } | null> {
  const sb = getSupabase();
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
    ] = await Promise.all([
      sb.from('employees').select('*').order('created_at', { ascending: false }),
      sb.from('vehicles').select('*'),
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('services').select('*'),
      sb.from('subscription_packages').select('*'),
      sb.from('employee_subscriptions').select('*'),
      sb.from('credit_ledger').select('*'),
      sb.from('field_team_members').select('*'),
      sb.from('parking_zones').select('*'),
      sb.from('order_photos').select('*'),
      sb.from('order_events').select('*'),
    ]);

    if (empsRes.error) {
      console.warn('Supabase fetch error:', empsRes.error.message);
      return null;
    }

    const employees: Employee[] = (empsRes.data || []).map((e: Record<string, unknown>) => ({
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

    const vehicles: Vehicle[] = (vehsRes.data || []).map((v: Record<string, unknown>) => ({
      id: String(v.id),
      employeeId: String(v.employee_id),
      plateNumber: String(v.plate_number),
      plateType: String(v.plate_type || 'Private'),
      make: String(v.make || 'Porsche'),
      model: String(v.model || 'Panamera'),
      color: String(v.color || 'Jet Black Metallic'),
      isDefault: Boolean(v.is_default ?? true),
    }));

    const orders: Order[] = (ordsRes.data || []).map((o: Record<string, unknown>) => ({
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
      assignment: o.assignment ? (o.assignment as Order['assignment']) : undefined,
      qualityCheck: o.quality_check ? (o.quality_check as Order['qualityCheck']) : undefined,
      returnConfirmation: o.return_confirmation ? (o.return_confirmation as Order['returnConfirmation']) : undefined,
      idempotencyKey: o.idempotency_key ? String(o.idempotency_key) : `idem-${o.id}`,
      version: 1,
      createdAt: String(o.created_at || new Date().toISOString()),
      updatedAt: String(o.updated_at || new Date().toISOString()),
    }));

    const services: Service[] = (srvsRes.data || []).map((s: Record<string, unknown>) => ({
      id: String(s.id),
      name: String(s.name || ''),
      description: String(s.description || ''),
      durationMin: Number(s.duration_min || 35),
      price: { amountMinor: Number(s.price_minor || 2000), currency: 'QAR' },
      creditCost: Number(s.credit_cost || 1),
      active: Boolean(s.active ?? true),
      sortOrder: Number(s.sort_order || 1),
    }));

    const packages: SubscriptionPackage[] = (pkgsRes.data || []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name || ''),
      paidWashes: Number(p.paid_washes || 6),
      bonusWashes: Number(p.bonus_washes || 2),
      price: { amountMinor: Number(p.price_minor || 14000), currency: 'QAR' },
      validityDays: Number(p.validity_days || 60),
      eligibleServiceIds: (p.eligible_service_ids as string[]) || ['srv-exterior'],
      active: Boolean(p.active ?? true),
    }));

    const subscriptions: EmployeeSubscription[] = (subsRes.data || []).map((sub: Record<string, unknown>) => ({
      id: String(sub.id),
      employeeId: String(sub.employee_id),
      packageId: String(sub.package_id),
      packageSnapshot: sub.package_snapshot as SubscriptionPackage,
      status: (sub.status || 'ACTIVE') as EmployeeSubscription['status'],
      activatedAt: String(sub.activated_at || new Date().toISOString()),
      expiresAt: sub.expires_at ? String(sub.expires_at) : undefined,
      activatedBy: sub.activated_by ? String(sub.activated_by) : undefined,
    }));

    const credits: CreditLedgerEntry[] = (creditsRes.data || []).map((c: Record<string, unknown>) => ({
      id: String(c.id),
      employeeId: String(c.employee_id),
      subscriptionId: c.subscription_id ? String(c.subscription_id) : undefined,
      orderId: c.order_id ? String(c.order_id) : undefined,
      type: (c.type || 'GRANT') as CreditLedgerEntry['type'],
      delta: Number(c.delta || c.amount || 0),
      reason: c.reason ? String(c.reason) : undefined,
      actorId: String(c.actor_id || 'system'),
      createdAt: String(c.created_at || new Date().toISOString()),
    }));

    const fieldMembers: FieldTeamMember[] = (membersRes.data || []).map((m: Record<string, unknown>) => ({
      id: String(m.id),
      displayName: String(m.display_name),
      active: Boolean(m.active ?? true),
    }));

    const zones: ParkingZone[] = (zonesRes.data || []).map((z: Record<string, unknown>) => ({
      id: String(z.id),
      code: String(z.code),
      name: String(z.name),
      level: z.level ? String(z.level) : undefined,
      active: Boolean(z.active ?? true),
    }));

    const photos: OrderPhoto[] = (photosRes.data || []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      orderId: String(p.order_id),
      kind: (p.kind || 'BEFORE') as OrderPhoto['kind'],
      blobKey: String(p.storage_path || p.blobKey || ''),
      uploadedBy: String(p.uploaded_by || 'staff'),
      createdAt: String(p.captured_at || p.createdAt || new Date().toISOString()),
    }));

    const orderEvents: OrderEvent[] = (eventsRes.data || []).map((ev: Record<string, unknown>) => ({
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

    // Generate parking bays for the zones
    const bays = [];
    const qrTokens = [];
    const targetZones = zones.length > 0 ? zones : [{ id: 'zone-main', code: 'P', name: 'Tower Parking', active: true }];
    // Numbered bays: 1 to TOTAL_BAYS, all under the first zone
    const bayZoneId = targetZones[0].id;
    for (let i = 1; i <= TOTAL_BAYS; i++) {
      const bayCode = String(i);
      const bayId = `bay-${i}`;
      bays.push({ id: bayId, zoneId: bayZoneId, code: bayCode, active: true });
      qrTokens.push({
        id: `qr-${bayCode}`,
        bayId,
        token: `tk_${bayCode}_${i * 137}`,
        version: 1,
        status: 'ACTIVE' as const,
        createdAt: new Date().toISOString(),
      });
    }

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
      issues: [],
      auditLogs: [],
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

export async function saveSupabaseState(db: MockDatabase, version: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    // 1. Save global sync state for cache
    await sb.from('app_sync_state').upsert(
      {
        id: 'global_state',
        payload: db,
        version,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // 2. Sync all relational tables
    await syncRelationalTables(db);
    return true;
  } catch (err) {
    console.warn('saveSupabaseState error:', err);
    return false;
  }
}

async function syncRelationalTables(db: MockDatabase) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    // Sync employees
    if (db.employees && db.employees.length > 0) {
      const rows = db.employees.map((e) => ({
        id: e.id,
        employee_no: e.employeeNo || null,
        full_name: e.fullName,
        email: e.email || null,
        phone: e.phone || null,
        qid: e.qid || null,
        company: e.company || 'Ministry of Commerce and Industry - State of Qatar',
        status: e.status || 'ACTIVE',
      }));
      const { error: employeesError } = await sb.from('employees').upsert(rows, { onConflict: 'id' });
      if (employeesError) {
        console.warn('Supabase employees sync failed:', employeesError.message);
      }
    }

    // Sync vehicles
    if (db.vehicles && db.vehicles.length > 0) {
      const vRows = db.vehicles.map((v) => ({
        id: v.id,
        employee_id: v.employeeId,
        plate_number: v.plateNumber,
        plate_type: v.plateType || 'Private',
        make: v.make || 'Porsche',
        model: v.model || 'Panamera',
        color: v.color || 'Jet Black Metallic',
        is_default: v.isDefault ?? true,
      }));
      await sb.from('vehicles').upsert(vRows, { onConflict: 'id' });
    }

    // Sync orders
    if (db.orders && db.orders.length > 0) {
      const oRows = db.orders.map((o) => ({
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
      }));
      await sb.from('orders').upsert(oRows, { onConflict: 'id' });
    }

    // Sync employee subscriptions
    if (db.subscriptions && db.subscriptions.length > 0) {
      const subRows = db.subscriptions.map((s) => ({
        id: s.id,
        employee_id: s.employeeId,
        package_id: s.packageId,
        package_snapshot: s.packageSnapshot,
        status: s.status,
        activated_at: s.activatedAt,
        expires_at: s.expiresAt || null,
        activated_by: s.activatedBy || null,
      }));
      await sb.from('employee_subscriptions').upsert(subRows, { onConflict: 'id' });
    }

    // Sync credit ledger
    if (db.credits && db.credits.length > 0) {
      const cRows = db.credits.map((c) => ({
        id: c.id,
        employee_id: c.employeeId,
        subscription_id: c.subscriptionId || null,
        order_id: c.orderId || null,
        amount: c.delta,
        balance_after: 0,
        details: { reason: c.reason, actorId: c.actorId },
        created_at: c.createdAt,
      }));
      await sb.from('credit_ledger').upsert(cRows, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('syncRelationalTables notice:', err);
  }
}
