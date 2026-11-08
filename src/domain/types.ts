// Domain Types for CLEANINGBASE
export type Money = {
  amountMinor: number; // e.g. 2000 = 20.00 QAR
  currency: 'QAR';
};

export type PrincipalType = 'EMPLOYEE' | 'STAFF';

export type StaffRole = 'SUPERADMIN' | 'SUPERVISOR';

export type Permission =
  | 'orders.view'
  | 'orders.assign'
  | 'orders.status.update'
  | 'orders.cancel'
  | 'quality.perform'
  | 'issues.manage'
  | 'orders.return.confirm'
  | 'employees.view'
  | 'employees.manage'
  | 'team.manage'
  | 'parking.manage'
  | 'qr.manage'
  | 'services.manage'
  | 'pricing.manage'
  | 'subscriptions.manage'
  | 'credits.adjust'
  | 'reports.view'
  | 'audit.view'
  | 'settings.manage'
  | 'staff.manage';

export interface Employee {
  id: string;
  employeeNo?: string;
  fullName: string;
  email: string;
  phone?: string;
  qid?: string;
  company?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  permissionOverrides?: Permission[];
  status: 'ACTIVE' | 'INACTIVE';
}

export interface FieldTeamMember {
  id: string;
  displayName: string;
  active: boolean;
}

export interface FieldTeam {
  id: string;
  name: string;
  memberIds: string[];
}

export interface ParkingZone {
  id: string;
  code: string; // zone code, e.g. 'P'
  name: string;
  level?: string;
  active: boolean;
}

export interface ParkingBay {
  id: string;
  zoneId: string;
  code: string; // plain number: '1' to '1288'
  active: boolean;
}

export interface QrToken {
  id: string;
  bayId: string;
  token: string;
  version: number;
  status: 'ACTIVE' | 'REVOKED';
  createdAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: Money;
  creditCost: number;
  active: boolean;
  sortOrder: number;
}

export interface SubscriptionPackage {
  id: string;
  name: string;
  paidWashes: number;
  bonusWashes: number;
  price: Money;
  validityDays: number | null;
  eligibleServiceIds: string[];
  active: boolean;
}

export interface EmployeeSubscription {
  id: string;
  employeeId: string;
  packageId: string;
  packageSnapshot: SubscriptionPackage;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
  activatedAt?: string;
  expiresAt?: string;
  activatedBy?: string;
}

export interface CreditLedgerEntry {
  id: string;
  employeeId: string;
  subscriptionId?: string;
  orderId?: string;
  type: 'GRANT' | 'BONUS' | 'DEBIT' | 'REFUND' | 'ADJUSTMENT' | 'EXPIRY';
  delta: number;
  reason?: string;
  actorId: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  employeeId: string;
  plateNumber: string;
  plateType?: string;
  make?: string;
  model?: string;
  color?: string;
  isDefault: boolean;
}

export type OrderStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'QUALITY_CHECK'
  | 'COMPLETED'
  | 'RETURNED_TO_PARKING'
  | 'CANCELLED'
  | 'ISSUE_REPORTED'
  /** The customer postponed a paid order (before the wash started). It waits, with no team work, until they re-order. */
  | 'DELAYED';

export interface Order {
  id: string;
  reference: string; // e.g. CB-261028-0042
  employeeId: string;
  bayId: string;
  bayCodeSnapshot: string;
  zoneCodeSnapshot: string;
  vehicleSnapshot: Vehicle;
  serviceId: string;
  serviceSnapshot: Service;
  paymentMode: 'ONE_TIME' | 'CREDIT';
  priceSnapshot?: Money;
  creditsUsed: number;
  paymentStatus: 'NOT_APPLICABLE' | 'UNPAID' | 'PAID_OFFLINE' | 'PAID_ONLINE';
  instructions?: string;
  status: OrderStatus;
  statusBeforeIssue?: OrderStatus;
  assignment?: {
    type: 'TEAM' | 'MEMBER';
    teamId?: string;
    memberId?: string;
    assignedName?: string;
    assignedBy: string;
    assignedAt: string;
  };
  qualityCheck?: {
    checklist: Record<string, boolean>;
    notes?: string;
    passed: boolean;
    checkedBy: string;
    checkedAt: string;
  };
  returnConfirmation?: {
    /** Where the clean car was parked: the floor (B3 by default) and the exact bay number */
    floor?: string;
    bayCode?: string;
    bayId: string;
    matchesOriginalBay: boolean;
    overrideReason?: string;
    confirmedBy: string;
    confirmedAt: string;
  };
  cancellation?: {
    reason: string;
    by: string;
    at: string;
    creditRefunded: boolean;
  };
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPhoto {
  id: string;
  orderId: string;
  kind: 'BEFORE' | 'AFTER' | 'ISSUE';
  blobKey: string; // Base64 or IDB key
  uploadedBy: string;
  createdAt: string;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  from?: OrderStatus;
  to?: OrderStatus;
  type: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'REASSIGNED' | 'NOTE' | 'PHOTO_ADDED' | 'ISSUE' | 'QC' | 'RETURNED' | 'DELAYED' | 'REORDERED' | 'COLLECTED';
  actor: {
    type: PrincipalType;
    id: string;
    name?: string;
  };
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface Issue {
  id: string;
  orderId?: string;
  category: 'DAMAGE' | 'ACCESS' | 'QUALITY' | 'COMPLAINT' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  id: string;
  actor: {
    type: PrincipalType;
    id: string;
    email?: string;
    role?: string;
  };
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface SystemSettings {
  referencePrefix: string;
  timezone: string;
  operatingHours: {
    start: string;
    end: string;
    days: string[];
  };
  employeeCancelWindow: 'NEW_ONLY';
  qcChecklistItems: string[];
  demo: {
    latencyMs: number;
    failureRate: number;
  };
}

// ---------------------------------------------------------------------------
// Car inspection (before and after the wash)
// ---------------------------------------------------------------------------
export type InspectionAngle =
  | 'FRONT'
  | 'FRONT_RIGHT'
  | 'RIGHT'
  | 'REAR_RIGHT'
  | 'REAR'
  | 'REAR_LEFT'
  | 'LEFT'
  | 'FRONT_LEFT';

export type InspectionPhase = 'BEFORE' | 'AFTER';

/** DRAFT: being filled in. SUBMITTED: locked. SKIPPED: a supervisor started the wash without one, with a reason. */
export type InspectionStatus = 'DRAFT' | 'SUBMITTED' | 'SKIPPED';

export interface InspectionMedia {
  id: string;
  kind: 'PHOTO' | 'VIDEO';
  angle?: InspectionAngle;
  /** Where the file lives in private storage. The server keeps only this. */
  path?: string;
  /** What the screen shows: a signed link, or a data link in local demo mode. */
  url: string;
  createdAt: string;
}

export interface InspectionDamage {
  id: string;
  /** Position on the car map, in percent of its width and height (0 to 100). */
  x: number;
  y: number;
  type: 'SCRATCH' | 'DENT' | 'CRACK' | 'PAINT' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  note?: string;
  photoPath?: string;
  photoUrl?: string;
  /** After the wash: a damage that was not there before. */
  isNew?: boolean;
}

export interface Inspection {
  id: string;
  orderId: string;
  phase: InspectionPhase;
  status: InspectionStatus;
  noDamage: boolean;
  notes?: string;
  media: InspectionMedia[];
  damages: InspectionDamage[];
  inspectedBy: string;
  startedAt: string;
  submittedAt?: string;
  bypassReason?: string;
  /** Set when a sent inspection was corrected afterwards. */
  editedAt?: string;
  editedBy?: string;
}
