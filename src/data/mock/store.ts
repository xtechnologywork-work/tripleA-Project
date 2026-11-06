import { MockDatabase, createInitialSeed } from './seed';
import {
  Employee,
  EmployeeSubscription,
  Order,
  OrderEvent,
  AuditLog,
  CreditLedgerEntry,
  OrderStatus,
  OrderPhoto,
  Service,
  SubscriptionPackage,
  ParkingBay,
  QrToken,
  FieldTeamMember,
  Vehicle,
  Issue,
} from '../../domain/types';
import { ActorContext, hasPermission, getAllowedTransitions } from '../../domain/status-machine';

const STORAGE_KEY = 'cb_supabase_live_v2';
const SYNC_CHANNEL_NAME = 'cb_cross_tab_sync';

class MockStore {
  private db: MockDatabase | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Array<() => void> = [];
  private lastServerVersion = 0;
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        // Discard any legacy stale mock caches
        localStorage.removeItem('cb_mock_db_v1');
      } catch {}

      try {
        this.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'DB_UPDATED') {
            this.loadFromStorage();
            this.notify();
          }
        };
      } catch {
        // Fallback for environments where BroadcastChannel is unavailable
      }

      // Initial server sync from live Supabase
      this.syncFromServer();

      // Background cross-device polling every 1500ms
      setInterval(() => {
        this.syncFromServer();
      }, 1500);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in store listener:', err);
      }
    }
  }

  public async syncFromServer(): Promise<void> {
    if (typeof window === 'undefined' || this.isSyncing) return;
    this.isSyncing = true;
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.db && (data.source === 'supabase' || !this.db || data.version !== this.lastServerVersion)) {
          this.lastServerVersion = data.version;
          this.db = data.db;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
          } catch {}
          this.notify();
        } else if (!data.db && this.db) {
          // Initialize server with local state
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ db: this.db }),
          });
        }
      }
    } catch {
      // Network offline or endpoint unreachable - continue with localStorage
    } finally {
      this.isSyncing = false;
    }
  }

  public getDb(): MockDatabase {
    if (!this.db) {
      this.loadFromStorage();
    }
    return this.db!;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') {
      this.db = createInitialSeed();
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.db = JSON.parse(raw);
      } else {
        this.db = createInitialSeed();
        this.saveToStorage();
      }
    } catch {
      this.db = createInitialSeed();
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !this.db) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
      if (this.channel) {
        this.channel.postMessage({ type: 'DB_UPDATED', timestamp: Date.now() });
      }
      this.notify();

      // Asynchronously push to server for cross-device sync (PC <-> Phone)
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db: this.db }),
      }).then(async (res) => {
        if (res.ok) {
          const d = await res.json();
          if (d.version) this.lastServerVersion = d.version;
        }
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  public resetToSeed(): void {
    this.db = createInitialSeed();
    this.saveToStorage();
  }

  // --- Core Domain Operations ---

  public resolveQr(spotCode: string, tokenString: string): { bay: ParkingBay; token: QrToken } | null {
    const db = this.getDb();
    const bay = db.bays.find((b) => b.code.toUpperCase() === spotCode.trim().toUpperCase());
    if (!bay || !bay.active) return null;

    const token = db.qrTokens.find((t) => t.token === tokenString && t.bayId === bay.id && t.status === 'ACTIVE');
    if (!token) return null;

    return { bay, token };
  }

  public getBayByCode(code: string): ParkingBay | undefined {
    return this.getDb().bays.find((b) => b.code.toUpperCase() === code.trim().toUpperCase());
  }

  public getOrCreateBay(rawCode: string): ParkingBay {
    const db = this.getDb();
    // Bays are plain numbers: keep digits only and drop leading zeros ("007" -> "7")
    const cleanCode = String(parseInt((rawCode || '').replace(/\D/g, ''), 10) || 1);
    let bay = db.bays.find((b) => b.code === cleanCode);
    if (!bay) {
      bay = {
        id: `bay-${cleanCode}`,
        code: cleanCode,
        zoneId: db.zones[0]?.id || 'zone-main',
        active: true,
      };
      db.bays.push(bay);
      this.saveToStorage();
    }
    return bay;
  }

  public getOrders(): Order[] {
    return [...this.getDb().orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getOrderById(id: string): Order | undefined {
    return this.getDb().orders.find((o) => o.id === id || o.reference === id);
  }

  public getOrderEvents(orderId: string): OrderEvent[] {
    return this.getDb()
      .orderEvents.filter((e) => e.orderId === orderId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public getCreditBalance(employeeId: string): number {
    return this.getDb()
      .credits.filter((c) => c.employeeId === employeeId)
      .reduce((sum, item) => sum + item.delta, 0);
  }

  public getServices(): Service[] {
    return this.getDb().services.filter((s) => s.active);
  }

  public getPackages(): SubscriptionPackage[] {
    return this.getDb().packages.filter((p) => p.active);
  }

  public getFieldMembers(): FieldTeamMember[] {
    return this.getDb().fieldMembers.filter((m) => m.active);
  }

  public getEmployees(): Employee[] {
    return [...this.getDb().employees];
  }

  public getEmployeeById(id: string): Employee | undefined {
    return this.getDb().employees.find((e) => e.id === id);
  }

  public getAllSubscriptions(): EmployeeSubscription[] {
    return [...this.getDb().subscriptions];
  }

  public cancelSubscription(subscriptionId: string): void {
    const db = this.getDb();
    const sub = db.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) {
      sub.status = 'CANCELLED';
      this.saveToStorage();
    }
  }

  public createOrder(
    orderData: Omit<Order, 'id' | 'reference' | 'version' | 'createdAt' | 'updatedAt' | 'status'>,
    actor: ActorContext
  ): Order {
    const db = this.getDb();
    const now = new Date().toISOString();
    const orderSeq = (db.orders.length + 1).toString().padStart(4, '0');
    const reference = `CB-${now.substring(2, 4)}${now.substring(5, 7)}${now.substring(8, 10)}-${orderSeq}`;

    const newOrder: Order = {
      ...orderData,
      id: `ord-${Date.now()}`,
      reference,
      status: 'NEW',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Credit deduction if paying with package wash credit
    if (newOrder.paymentMode === 'CREDIT' && newOrder.creditsUsed > 0) {
      const balance = this.getCreditBalance(newOrder.employeeId);
      if (balance < newOrder.creditsUsed) {
        throw new Error(`Insufficient credit balance. Required: ${newOrder.creditsUsed}, Available: ${balance}`);
      }

      const creditDebit: CreditLedgerEntry = {
        id: `crd-${Date.now()}`,
        employeeId: newOrder.employeeId,
        orderId: newOrder.id,
        type: 'DEBIT',
        delta: -newOrder.creditsUsed,
        reason: `Deduction for wash order ${reference}`,
        actorId: actor.id,
        createdAt: now,
      };
      db.credits.push(creditDebit);
    }

    db.orders.unshift(newOrder);

    // Record Event & Audit
    const event: OrderEvent = {
      id: `evt-${Date.now()}`,
      orderId: newOrder.id,
      to: 'NEW',
      type: 'CREATED',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      createdAt: now,
    };
    db.orderEvents.push(event);

    const audit: AuditLog = {
      id: `aud-${Date.now()}`,
      actor: { type: actor.type, id: actor.id, email: actor.email, role: actor.role },
      action: 'order.create',
      entityType: 'ORDER',
      entityId: newOrder.id,
      details: { reference, paymentMode: newOrder.paymentMode },
      createdAt: now,
    };
    db.auditLogs.unshift(audit);

    this.saveToStorage();
    return newOrder;
  }

  public transitionOrder(
    orderId: string,
    toStatus: OrderStatus,
    payload: {
      assignment?: Order['assignment'];
      qualityCheck?: Order['qualityCheck'];
      returnConfirmation?: Order['returnConfirmation'];
      cancellation?: { reason: string };
      issue?: { category: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' };
    },
    actor: ActorContext
  ): Order {
    const db = this.getDb();
    const orderIndex = db.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) throw new Error('Order not found');

    const order = db.orders[orderIndex];
    const isStaffOrAdmin = actor.type === 'STAFF' || actor.role === 'SUPERADMIN';
    const allowed = getAllowedTransitions(order, actor);

    if (!isStaffOrAdmin && !allowed.includes(toStatus)) {
      throw new Error(`Transition from ${order.status} to ${toStatus} is not permitted for this role`);
    }

    const now = new Date().toISOString();
    const previousStatus = order.status;

    order.status = toStatus;
    order.updatedAt = now;
    order.version += 1;

    // Apply specific transition payload data
    if (payload.assignment) {
      order.assignment = payload.assignment;
    }
    if (payload.qualityCheck) {
      order.qualityCheck = payload.qualityCheck;
    }
    if (payload.returnConfirmation) {
      order.returnConfirmation = payload.returnConfirmation;
    }
    if (payload.cancellation) {
      const shouldRefund = order.paymentMode === 'CREDIT' && order.creditsUsed > 0;
      order.cancellation = {
        reason: payload.cancellation.reason,
        by: actor.name || actor.id,
        at: now,
        creditRefunded: shouldRefund,
      };

      if (shouldRefund) {
        db.credits.push({
          id: `crd-refund-${Date.now()}`,
          employeeId: order.employeeId,
          orderId: order.id,
          type: 'REFUND',
          delta: order.creditsUsed,
          reason: `Automatic refund for cancelled order ${order.reference}`,
          actorId: actor.id,
          createdAt: now,
        });
      }
    }
    if (payload.issue) {
      order.statusBeforeIssue = previousStatus;
      db.issues.unshift({
        id: `iss-${Date.now()}`,
        orderId: order.id,
        category: payload.issue.category as Issue['category'],
        severity: payload.issue.severity,
        description: payload.issue.description,
        status: 'OPEN',
        createdBy: actor.name || actor.id,
        createdAt: now,
      });
    }

    db.orders[orderIndex] = { ...order };

    // Record Event & Audit
    db.orderEvents.push({
      id: `evt-${Date.now()}`,
      orderId: order.id,
      from: previousStatus,
      to: toStatus,
      type: toStatus === 'ASSIGNED' ? 'ASSIGNED' : 'STATUS_CHANGED',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      payload: payload as Record<string, unknown>,
      createdAt: now,
    });

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor: { type: actor.type, id: actor.id, email: actor.email, role: actor.role },
      action: `order.transition.${toStatus}`,
      entityType: 'ORDER',
      entityId: order.id,
      details: { from: previousStatus, to: toStatus, reference: order.reference },
      createdAt: now,
    });

    this.saveToStorage();
    return order;
  }

  public addOrderPhoto(orderId: string, kind: 'BEFORE' | 'AFTER' | 'ISSUE', blobKey: string, uploadedBy: string): OrderPhoto {
    const db = this.getDb();
    const photo: OrderPhoto = {
      id: `pht-${Date.now()}`,
      orderId,
      kind,
      blobKey,
      uploadedBy,
      createdAt: new Date().toISOString(),
    };
    db.photos.push(photo);
    this.saveToStorage();
    return photo;
  }

  public getOrderPhotos(orderId: string): OrderPhoto[] {
    return this.getDb().photos.filter((p) => p.orderId === orderId);
  }

  public adjustCredit(employeeId: string, delta: number, reason: string, actor: ActorContext): void {
    if (!hasPermission(actor, 'credits.adjust')) {
      throw new Error('Unauthorized to adjust credits');
    }
    const db = this.getDb();
    const now = new Date().toISOString();
    db.credits.push({
      id: `crd-adj-${Date.now()}`,
      employeeId,
      type: 'ADJUSTMENT',
      delta,
      reason,
      actorId: actor.id,
      createdAt: now,
    });
    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor: { type: actor.type, id: actor.id, email: actor.email, role: actor.role },
      action: 'credit.adjust',
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      details: { delta, reason },
      createdAt: now,
    });
    this.saveToStorage();
  }

  public findOrCreateEmployeeByPhone(rawPhone: string, fullName?: string): { employee: Employee; isNew: boolean } {
    const db = this.getDb();
    const digits = rawPhone.replace(/\D/g, '');
    const cleanPhone = digits.length >= 8 ? digits.slice(-8) : digits;
    const formattedPhone = `+974 ${cleanPhone.slice(0, 4)} ${cleanPhone.slice(4)}`;

    const existing = db.employees.find((e) => {
      const eDigits = (e.phone || '').replace(/\D/g, '');
      return eDigits.endsWith(cleanPhone) || e.id === `emp-moci-${cleanPhone}`;
    });

    if (existing) {
      return { employee: existing, isNew: false };
    }

    const newEmployee: Employee = {
      id: `emp-moci-${cleanPhone}`,
      employeeNo: `MOCI-${cleanPhone.slice(-4)}`,
      fullName: fullName || `منسوب الوزارة (${cleanPhone})`,
      email: `moci.${cleanPhone}@moci.gov.qa`,
      phone: formattedPhone,
      company: 'Ministry of Commerce and Industry - State of Qatar',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    db.employees.unshift(newEmployee);
    this.saveToStorage();
    return { employee: newEmployee, isNew: true };
  }

  public registerEmployee(rawPhone: string, fullName: string, qid?: string, employeeNo?: string): Employee {
    const db = this.getDb();
    const digits = rawPhone.replace(/\D/g, '');
    const cleanPhone = digits.length >= 8 ? digits.slice(-8) : digits;
    const formattedPhone = `+974 ${cleanPhone.slice(0, 4)} ${cleanPhone.slice(4)}`;
    const cleanQid = qid ? qid.replace(/\D/g, '').trim() : undefined;

    const existing = db.employees.find((e) => {
      const eDigits = (e.phone || '').replace(/\D/g, '');
      return eDigits.endsWith(cleanPhone) || e.id === `emp-moci-${cleanPhone}`;
    });

    if (existing) {
      let updated = false;
      if (fullName && fullName.trim()) {
        existing.fullName = fullName.trim();
        updated = true;
      }
      if (cleanQid) {
        existing.qid = cleanQid;
        updated = true;
      }
      if (employeeNo && employeeNo.trim()) {
        existing.employeeNo = employeeNo.trim();
        updated = true;
      }
      if (updated) {
        this.saveToStorage();
      }
      return existing;
    }

    const newEmployee: Employee = {
      id: `emp-moci-${cleanPhone}`,
      employeeNo: employeeNo && employeeNo.trim() ? employeeNo.trim() : `MOCI-${cleanPhone.slice(-4)}`,
      fullName: fullName.trim() || `منسوب الوزارة (${cleanPhone})`,
      email: `moci.${cleanPhone}@moci.gov.qa`,
      phone: formattedPhone,
      qid: cleanQid,
      company: 'Ministry of Commerce and Industry - State of Qatar',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    db.employees.unshift(newEmployee);
    this.saveToStorage();
    return newEmployee;
  }

  public getEmployeeByPhone(rawPhone: string): Employee | undefined {
    const db = this.getDb();
    const digits = rawPhone.replace(/\D/g, '');
    const cleanPhone = digits.length >= 8 ? digits.slice(-8) : digits;
    return db.employees.find((e) => {
      const eDigits = (e.phone || '').replace(/\D/g, '');
      return eDigits.endsWith(cleanPhone);
    });
  }

  public getEmployeeSubscription(employeeId: string): EmployeeSubscription | undefined {
    return this.getDb().subscriptions.find(
      (s) => s.employeeId === employeeId && (s.status === 'ACTIVE' || s.status === 'PENDING_ACTIVATION')
    );
  }

  public getEmployeeOrders(employeeId: string): Order[] {
    return this.getOrders().filter((o) => o.employeeId === employeeId);
  }

  public activateSubscriptionForEmployee(employeeId: string): EmployeeSubscription {
    const db = this.getDb();
    const pkg = db.packages.find((p) => p.id === 'pkg-executive') || db.packages[0];
    const now = new Date().toISOString();
    const subId = `sub-moci-${Date.now()}`;

    const sub: EmployeeSubscription = {
      id: subId,
      employeeId,
      packageId: pkg.id,
      packageSnapshot: pkg,
      status: 'ACTIVE',
      activatedAt: now,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      activatedBy: 'self-service',
    };

    db.subscriptions.unshift(sub);

    // Grant 8 washes (6 paid + 2 bonus)
    db.credits.push({
      id: `crd-${Date.now()}`,
      employeeId,
      subscriptionId: subId,
      type: 'GRANT',
      delta: 8,
      reason: '140 QAR Corporate Package Activation (6 Washes + 2 Free = 8 Total)',
      actorId: employeeId,
      createdAt: now,
    });

    this.saveToStorage();
    return sub;
  }

  public updateEmployee(employeeId: string, updates: Partial<Employee>): Employee | undefined {
    const db = this.getDb();
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return undefined;
    Object.assign(emp, updates);
    this.saveToStorage();
    return emp;
  }

  public getEmployeeVehicles(employeeId: string): Vehicle[] {
    const db = this.getDb();
    let vehicles = db.vehicles.filter((v) => v.employeeId === employeeId);
    if (vehicles.length === 0) {
      // Provide a clean default registered vehicle
      const defaultVeh: Vehicle = {
        id: `veh-${employeeId}-01`,
        employeeId,
        plateNumber: '559201',
        plateType: 'Private',
        make: 'Porsche',
        model: 'Panamera',
        color: 'Jet Black Metallic',
        isDefault: true,
      };
      db.vehicles.push(defaultVeh);
      this.saveToStorage();
      vehicles = [defaultVeh];
    }
    return vehicles;
  }

  public saveEmployeeVehicle(employeeId: string, vehicleData: Partial<Vehicle>): Vehicle {
    const db = this.getDb();
    let vehicle = db.vehicles.find(
      (v) => v.employeeId === employeeId && (vehicleData.id ? v.id === vehicleData.id : true)
    );
    if (vehicle) {
      Object.assign(vehicle, vehicleData);
    } else {
      vehicle = {
        id: vehicleData.id || `veh-${employeeId}-${Date.now()}`,
        employeeId,
        plateNumber: vehicleData.plateNumber || '559201',
        plateType: vehicleData.plateType || 'Private',
        make: vehicleData.make || 'Porsche',
        model: vehicleData.model || 'Panamera',
        color: vehicleData.color || 'Jet Black Metallic',
        isDefault: vehicleData.isDefault ?? true,
      };
      db.vehicles.push(vehicle);
    }
    this.saveToStorage();
    return vehicle;
  }
}

export const mockStore = new MockStore();
