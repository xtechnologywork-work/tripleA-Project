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
import { ActorContext, hasPermission, getAllowedTransitions, isValidStaffTransition } from '../../domain/status-machine';

const STORAGE_KEY = 'cb_supabase_live_v2';
const SYNC_CHANNEL_NAME = 'cb_cross_tab_sync';

/** Unique ids: two actions in the same millisecond (or on two devices) can never collide. */
export function uid(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

type TrackedCollection =
  | 'employees'
  | 'vehicles'
  | 'orders'
  | 'subscriptions'
  | 'credits'
  | 'photos'
  | 'orderEvents'
  | 'issues'
  | 'auditLogs';

const TRACKED: TrackedCollection[] = [
  'employees',
  'vehicles',
  'orders',
  'subscriptions',
  'credits',
  'photos',
  'orderEvents',
  'issues',
  'auditLogs',
];

type Changes = Partial<Record<TrackedCollection, Array<{ id: string }>>>;

class MockStore {
  private db: MockDatabase | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Array<() => void> = [];
  private lastServerVersion = 0;
  private isSyncing = false;

  // What the server is known to hold: "collection:id" -> JSON. Only rows that differ are sent.
  private synced = new Map<string, string>();
  private inFlight = 0;
  private failStreak = 0;
  private authToken: string | null = null;
  private issueListeners: Array<(messages: string[]) => void> = [];

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

      // Background cross-device polling
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

  /** Called when the server refuses or fails to save a change (invalid stage, no permission, offline). */
  public onSyncIssue(listener: (messages: string[]) => void): () => void {
    this.issueListeners.push(listener);
    return () => {
      this.issueListeners = this.issueListeners.filter((l) => l !== listener);
    };
  }

  /** The admin dashboard passes its Supabase access token so the server can trust its changes. */
  public setAuthToken(token: string | null): void {
    this.authToken = token;
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

  private rowsOf(db: MockDatabase, key: TrackedCollection): Array<{ id: string }> {
    return ((db as unknown as Record<string, unknown>)[key] as Array<{ id: string }>) || [];
  }

  /** Remember the server's copy of every tracked row, so later saves send only real changes. */
  private markAllSynced(db: MockDatabase): void {
    this.synced.clear();
    for (const key of TRACKED) {
      for (const row of this.rowsOf(db, key)) {
        this.synced.set(`${key}:${row.id}`, JSON.stringify(row));
      }
    }
  }

  private collectChanges(): { changes: Changes; count: number } {
    const changes: Changes = {};
    let count = 0;
    if (!this.db) return { changes, count };
    for (const key of TRACKED) {
      for (const row of this.rowsOf(this.db, key)) {
        if (this.synced.get(`${key}:${row.id}`) !== JSON.stringify(row)) {
          (changes[key] ||= []).push(row);
          count += 1;
        }
      }
    }
    return { changes, count };
  }

  private hasUnsyncedChanges(): boolean {
    return this.inFlight > 0 || this.collectChanges().count > 0;
  }

  private reportIssues(messages: string[]): void {
    for (const l of this.issueListeners) {
      try {
        l(messages);
      } catch {}
    }
  }

  /** Send only the rows that changed. Never replaces the server's database. */
  private async pushChanges(): Promise<void> {
    const { changes, count } = this.collectChanges();
    if (count === 0 || typeof window === 'undefined') return;

    // Snapshot what is being sent, so edits made while the request is running are not marked as saved
    const sent = new Map<string, string>();
    for (const key of TRACKED) {
      for (const row of changes[key] || []) sent.set(`${key}:${row.id}`, JSON.stringify(row));
    }

    this.inFlight += 1;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        this.failStreak += 1;
        this.reportIssues([data.error || 'Could not save to the server. It will retry.']);
        return;
      }

      const rejected: string[] = Array.isArray(data.rejected) ? data.rejected : [];

      // Apply fixes the server made while saving (a new order number, or a photo moved to Storage)
      const fixes: Record<string, string> = data.referenceFixes || {};
      const photoUrls: Record<string, string> = data.photoUrls || {};
      if (this.db) {
        for (const order of this.db.orders) {
          if (fixes[order.id]) order.reference = fixes[order.id];
        }
        for (const photo of this.db.photos) {
          if (photoUrls[photo.id]) photo.blobKey = photoUrls[photo.id];
        }
      }

      for (const [k, json] of sent) {
        const id = k.slice(k.indexOf(':') + 1);
        const collection = k.slice(0, k.indexOf(':')) as TrackedCollection;
        const row = this.db ? this.rowsOf(this.db, collection).find((r) => r.id === id) : undefined;
        const changedBySave = !!(fixes[id] || photoUrls[id]);
        this.synced.set(k, changedBySave && row ? JSON.stringify(row) : json);
      }
      this.failStreak = 0;

      if (rejected.length > 0) {
        this.reportIssues(rejected);
        this.lastServerVersion = 0; // force the next poll to restore the server's version
      }
      if (Object.keys(fixes).length > 0 || Object.keys(photoUrls).length > 0) {
        this.saveLocalMirror();
        this.notify();
      }
    } catch {
      // Offline: the rows stay unsynced and are sent with the next save
      this.failStreak += 1;
    } finally {
      this.inFlight -= 1;
    }
  }

  public async syncFromServer(fresh = false): Promise<void> {
    if (typeof window === 'undefined' || this.isSyncing) return;
    // Do not let the server's older copy overwrite a change that is still being saved
    // (after repeated save failures the server's copy wins, so the screen never freezes)
    if (this.db && this.failStreak < 5 && this.hasUnsyncedChanges()) {
      void this.pushChanges();
      return;
    }
    this.isSyncing = true;
    try {
      const res = await fetch(fresh ? '/api/sync?fresh=1' : '/api/sync', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.db && (data.source === 'supabase' || !this.db || data.version !== this.lastServerVersion)) {
          // Re-check: a change may have been made while the request was in flight
          if (this.db && this.hasUnsyncedChanges()) return;
          this.lastServerVersion = data.version;
          this.db = data.db;
          this.markAllSynced(this.db!);
          this.saveLocalMirror();
          this.notify();
        } else if (!data.db && this.db) {
          // Server is empty: send the local state once, as changes
          this.synced.clear();
          await this.pushChanges();
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
        this.saveLocalMirror();
      }
    } catch {
      this.db = createInitialSeed();
    }
  }

  private saveLocalMirror(): void {
    if (typeof window === 'undefined' || !this.db) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !this.db) return;
    this.saveLocalMirror();
    try {
      if (this.channel) {
        this.channel.postMessage({ type: 'DB_UPDATED', timestamp: Date.now() });
      }
    } catch {}
    this.notify();

    // Push only what changed, in the background
    void this.pushChanges();
  }

  /** Local demo reset: clears this browser's copy only. It never deletes anything on the server. */
  public resetToSeed(): void {
    this.db = createInitialSeed();
    this.markAllSynced(this.db);
    this.saveLocalMirror();
    this.notify();
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
    const refPrefix = `CB-${now.substring(2, 4)}${now.substring(5, 7)}${now.substring(8, 10)}`;
    const lastSeqToday = db.orders
      .filter((o) => o.reference.startsWith(`${refPrefix}-`))
      .reduce((max, o) => Math.max(max, parseInt(o.reference.split('-').pop() || '0', 10) || 0), 0);
    const orderSeq = (lastSeqToday + 1).toString().padStart(4, '0');
    const reference = `${refPrefix}-${orderSeq}`;

    const newOrder: Order = {
      ...orderData,
      id: uid('ord'),
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
        id: uid('crd'),
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
      id: uid('evt'),
      orderId: newOrder.id,
      to: 'NEW',
      type: 'CREATED',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      createdAt: now,
    };
    db.orderEvents.push(event);

    const audit: AuditLog = {
      id: uid('aud'),
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
    if (isStaffOrAdmin && !isValidStaffTransition(order.status, toStatus, order.statusBeforeIssue)) {
      throw new Error(`An order that is ${order.status} cannot go to ${toStatus}`);
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
          id: uid('crd-refund'),
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
        id: uid('iss'),
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
      id: uid('evt'),
      orderId: order.id,
      from: previousStatus,
      to: toStatus,
      type: toStatus === 'ASSIGNED' ? 'ASSIGNED' : 'STATUS_CHANGED',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      payload: payload as Record<string, unknown>,
      createdAt: now,
    });

    db.auditLogs.unshift({
      id: uid('aud'),
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
      id: uid('pht'),
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
      id: uid('crd-adj'),
      employeeId,
      type: 'ADJUSTMENT',
      delta,
      reason,
      actorId: actor.id,
      createdAt: now,
    });
    db.auditLogs.unshift({
      id: uid('aud'),
      actor: { type: actor.type, id: actor.id, email: actor.email, role: actor.role },
      action: 'credit.adjust',
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      details: { delta, reason },
      createdAt: now,
    });
    this.saveToStorage();
  }

  /**
   * Guests have no account. Their orders belong to one shared "Guest" record, so they are
   * never attached to a real employee and never touch anyone's wash credits.
   */
  public ensureGuestActor(): ActorContext {
    const db = this.getDb();
    const guestId = 'emp-guest';
    if (!db.employees.some((e) => e.id === guestId)) {
      db.employees.push({
        id: guestId,
        fullName: 'Guest customer',
        email: 'guest@triplea.qa',
        phone: '',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      });
      this.saveToStorage();
    }
    return { type: 'EMPLOYEE', id: guestId, name: 'Guest customer', email: 'guest@triplea.qa' };
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
    const alreadyActive = db.subscriptions.find((x) => x.employeeId === employeeId && x.status === 'ACTIVE');
    if (alreadyActive) return alreadyActive;
    const pkg = db.packages.find((p) => p.id === 'pkg-executive') || db.packages[0];
    const now = new Date().toISOString();
    const subId = uid('sub-moci');

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
      id: uid('crd'),
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
        id: vehicleData.id || uid('veh'),
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
