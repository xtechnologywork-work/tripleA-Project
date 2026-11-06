import {
  Employee,
  StaffUser,
  FieldTeamMember,
  FieldTeam,
  ParkingZone,
  ParkingBay,
  QrToken,
  Service,
  SubscriptionPackage,
  EmployeeSubscription,
  CreditLedgerEntry,
  Vehicle,
  Order,
  OrderPhoto,
  OrderEvent,
  Issue,
  AuditLog,
  SystemSettings,
} from '../../domain/types';

export interface MockDatabase {
  schemaVersion: number;
  employees: Employee[];
  staff: StaffUser[];
  fieldMembers: FieldTeamMember[];
  fieldTeams: FieldTeam[];
  zones: ParkingZone[];
  bays: ParkingBay[];
  qrTokens: QrToken[];
  services: Service[];
  packages: SubscriptionPackage[];
  subscriptions: EmployeeSubscription[];
  credits: CreditLedgerEntry[];
  vehicles: Vehicle[];
  orders: Order[];
  photos: OrderPhoto[];
  orderEvents: OrderEvent[];
  issues: Issue[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
}

/** Parking bays are plain numbers: 1 to TOTAL_BAYS. */
export const TOTAL_BAYS = 1288;
export const MAIN_ZONE_ID = 'zone-main';

export function createInitialSeed(): MockDatabase {
  const zones: ParkingZone[] = [
    { id: MAIN_ZONE_ID, code: 'P', name: 'Tower Parking', active: true },
  ];

  const bays: ParkingBay[] = [];
  const qrTokens: QrToken[] = [];

  // Generate the numbered parking bays: 1 to TOTAL_BAYS
  for (let i = 1; i <= TOTAL_BAYS; i++) {
    const bayCode = String(i);
    const bayId = `bay-${i}`;
    bays.push({
      id: bayId,
      zoneId: MAIN_ZONE_ID,
      code: bayCode,
      active: true,
    });

    qrTokens.push({
      id: `qr-${bayCode}`,
      bayId: bayId,
      token: `tk_${bayCode}_${i * 137}`,
      version: 1,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
  }

  const services: Service[] = [
    {
      id: 'srv-exterior',
      name: 'Signature Exterior Hydro-Wash',
      description: 'Touchless high-pressure pre-wash, luxury foam treatment, microfibre hand wash, and tire gloss dressing.',
      durationMin: 35,
      price: { amountMinor: 2000, currency: 'QAR' }, // QAR 20.00
      creditCost: 1,
      active: true,
      sortOrder: 1,
    },
    {
      id: 'srv-interior',
      name: 'Interior Pure Detailing',
      description: 'Comprehensive vacuum, dashboard conditioning, glass polishing, and premium ozone fragrance.',
      durationMin: 45,
      price: { amountMinor: 3500, currency: 'QAR' }, // QAR 35.00
      creditCost: 2,
      active: true,
      sortOrder: 2,
    },
    {
      id: 'srv-full',
      name: 'Grand Executive Concierge Wash',
      description: 'Complete interior & exterior royal service: ceramic top-coat booster, leather deep nourish, and engine bay dusting.',
      durationMin: 70,
      price: { amountMinor: 5000, currency: 'QAR' }, // QAR 50.00
      creditCost: 3,
      active: true,
      sortOrder: 3,
    },
  ];

  const packages: SubscriptionPackage[] = [
    {
      id: 'pkg-executive',
      name: 'Executive Concierge Pack (6 + 2 Free = 8 Total)',
      paidWashes: 6,
      bonusWashes: 2,
      price: { amountMinor: 14000, currency: 'QAR' }, // QAR 140.00
      validityDays: 60,
      eligibleServiceIds: ['srv-exterior'],
      active: true,
    },
    {
      id: 'pkg-prestige',
      name: 'Prestige Monthly Pass (16 + 4 Free)',
      paidWashes: 16,
      bonusWashes: 4,
      price: { amountMinor: 26000, currency: 'QAR' }, // QAR 260.00
      validityDays: 90,
      eligibleServiceIds: ['srv-exterior', 'srv-interior'],
      active: true,
    },
  ];

  const staff: StaffUser[] = [
    {
      id: 'staff-admin-1',
      fullName: 'Tariq Al-Mansoor',
      email: 'operations.head@triplea.qa',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
    },
    {
      id: 'staff-sup-1',
      fullName: 'Kareem Nasser',
      email: 'kareem.supervisor@triplea.qa',
      role: 'SUPERVISOR',
      status: 'ACTIVE',
    },
  ];

  const fieldMembers: FieldTeamMember[] = [
    { id: 'cleaner-1', displayName: 'Rashid Khan (Lead Tech)', active: true },
    { id: 'cleaner-2', displayName: 'Bilal Ahmed (Detailer)', active: true },
    { id: 'cleaner-3', displayName: 'Sunil Perera (Detailer)', active: true },
    { id: 'cleaner-4', displayName: 'Farhan Mir (Hydro Specialist)', active: true },
    { id: 'cleaner-5', displayName: 'Carlos Santos (Senior Tech)', active: true },
  ];

  const fieldTeams: FieldTeam[] = [
    {
      id: 'team-alpha',
      name: 'Alpha Response Crew (P1)',
      memberIds: ['cleaner-1', 'cleaner-2'],
    },
    {
      id: 'team-bravo',
      name: 'Bravo Detailing Unit (P2)',
      memberIds: ['cleaner-3', 'cleaner-4', 'cleaner-5'],
    },
  ];

  const employees: Employee[] = [
    {
      id: 'emp-1',
      employeeNo: 'EMP-7401',
      fullName: 'Hamad Al-Thani',
      email: 'hamad.althani@investqatar.qa',
      phone: '+974 5512 8901',
      qid: '28863401928',
      company: 'Qatar Investment Authority',
      status: 'ACTIVE',
      createdAt: '2026-10-10T08:00:00.000Z',
    },
    {
      id: 'emp-2',
      employeeNo: 'EMP-3290',
      fullName: 'Fatima Al-Sulaiti',
      email: 'f.alsulaiti@qnb.com.qa',
      phone: '+974 6620 4419',
      qid: '29263408192',
      company: 'QNB Capital',
      status: 'ACTIVE',
      createdAt: '2026-10-12T09:30:00.000Z',
    },
    {
      id: 'emp-3',
      employeeNo: 'EMP-8842',
      fullName: 'Nasser Al-Kuwari',
      email: 'nasser.kuwari@ooredoo.qa',
      phone: '+974 3309 7712',
      qid: '28563404551',
      company: 'Ooredoo Tower',
      status: 'ACTIVE',
      createdAt: '2026-10-15T11:15:00.000Z',
    },
  ];

  const vehicles: Vehicle[] = [
    {
      id: 'veh-1',
      employeeId: 'emp-1',
      plateNumber: '559201',
      plateType: 'Private',
      make: 'Porsche',
      model: 'Panamera GTS',
      color: 'Night Blue Metallic',
      isDefault: true,
    },
    {
      id: 'veh-2',
      employeeId: 'emp-2',
      plateNumber: '110488',
      plateType: 'Private',
      make: 'Range Rover',
      model: 'Autobiography',
      color: 'Santorini Black',
      isDefault: true,
    },
    {
      id: 'veh-3',
      employeeId: 'emp-3',
      plateNumber: '782390',
      plateType: 'Private',
      make: 'Mercedes-Benz',
      model: 'S 580 Maybach',
      color: 'Obsidian Black',
      isDefault: true,
    },
  ];

  const subscriptions: EmployeeSubscription[] = [
    {
      id: 'sub-1',
      employeeId: 'emp-1',
      packageId: 'pkg-executive',
      packageSnapshot: packages[0],
      status: 'ACTIVE',
      activatedAt: '2026-10-11T09:00:00.000Z',
      expiresAt: '2026-12-10T09:00:00.000Z',
      activatedBy: 'staff-admin-1',
    },
  ];

  const credits: CreditLedgerEntry[] = [
    {
      id: 'crd-1',
      employeeId: 'emp-1',
      subscriptionId: 'sub-1',
      type: 'GRANT',
      delta: 6,
      reason: 'Package activation (6 paid washes)',
      actorId: 'staff-admin-1',
      createdAt: '2026-10-11T09:00:00.000Z',
    },
    {
      id: 'crd-2',
      employeeId: 'emp-1',
      subscriptionId: 'sub-1',
      type: 'BONUS',
      delta: 2,
      reason: 'Welcome promotion (2 bonus washes)',
      actorId: 'staff-admin-1',
      createdAt: '2026-10-11T09:00:00.000Z',
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord-a01-seed',
      reference: 'CB-261028-0001',
      employeeId: 'emp-1',
      bayId: 'bay-12',
      bayCodeSnapshot: '12',
      zoneCodeSnapshot: 'P',
      vehicleSnapshot: vehicles[0],
      serviceId: 'srv-exterior',
      serviceSnapshot: services[0],
      paymentMode: 'CREDIT',
      priceSnapshot: { amountMinor: 2000, currency: 'QAR' },
      creditsUsed: 1,
      paymentStatus: 'NOT_APPLICABLE',
      instructions: 'Please take special care around the rear diffuser rims.',
      status: 'IN_PROGRESS',
      assignment: {
        type: 'MEMBER',
        memberId: 'cleaner-1',
        assignedName: 'Rashid Khan (Lead Tech)',
        assignedBy: 'staff-admin-1',
        assignedAt: '2026-10-28T07:15:00.000Z',
      },
      idempotencyKey: 'idem-a01-seed-001',
      version: 2,
      createdAt: '2026-10-28T07:05:00.000Z',
      updatedAt: '2026-10-28T07:20:00.000Z',
    },
    {
      id: 'ord-b14-seed',
      reference: 'CB-261028-0002',
      employeeId: 'emp-2',
      bayId: 'bay-214',
      bayCodeSnapshot: '214',
      zoneCodeSnapshot: 'P',
      vehicleSnapshot: vehicles[1],
      serviceId: 'srv-full',
      serviceSnapshot: services[2],
      paymentMode: 'ONE_TIME',
      priceSnapshot: { amountMinor: 5000, currency: 'QAR' },
      creditsUsed: 0,
      paymentStatus: 'PAID_OFFLINE',
      instructions: 'Key left inside center console under badge.',
      status: 'NEW',
      idempotencyKey: 'idem-b14-seed-002',
      version: 1,
      createdAt: '2026-10-28T07:35:00.000Z',
      updatedAt: '2026-10-28T07:35:00.000Z',
    },
  ];

  const orderEvents: OrderEvent[] = [
    {
      id: 'evt-1',
      orderId: 'ord-a01-seed',
      type: 'CREATED',
      actor: { type: 'EMPLOYEE', id: 'emp-1', name: 'Hamad Al-Thani' },
      to: 'NEW',
      createdAt: '2026-10-28T07:05:00.000Z',
    },
    {
      id: 'evt-2',
      orderId: 'ord-a01-seed',
      from: 'NEW',
      to: 'ASSIGNED',
      type: 'ASSIGNED',
      actor: { type: 'STAFF', id: 'staff-admin-1', name: 'Tariq Al-Mansoor' },
      payload: { assignedName: 'Rashid Khan (Lead Tech)' },
      createdAt: '2026-10-28T07:15:00.000Z',
    },
    {
      id: 'evt-3',
      orderId: 'ord-a01-seed',
      from: 'ASSIGNED',
      to: 'IN_PROGRESS',
      type: 'STATUS_CHANGED',
      actor: { type: 'STAFF', id: 'staff-admin-1', name: 'Tariq Al-Mansoor' },
      createdAt: '2026-10-28T07:20:00.000Z',
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      actor: { type: 'STAFF', id: 'staff-admin-1', email: 'operations.head@triplea.qa', role: 'SUPERADMIN' },
      action: 'system.bootstrap',
      entityType: 'SYSTEM',
      entityId: 'global',
      details: { message: 'Initialized CLEANINGBASE operational demo database' },
      createdAt: '2026-10-28T07:00:00.000Z',
    },
  ];

  const settings: SystemSettings = {
    referencePrefix: 'CB',
    timezone: 'Asia/Qatar',
    operatingHours: {
      start: '07:00',
      end: '18:00',
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    },
    employeeCancelWindow: 'NEW_ONLY',
    qcChecklistItems: [
      'Paint surface dry & streak-free',
      'Glass & mirrors mirror-finish clarity',
      'Tires dressed & wheel arches rinsed',
      'Vehicle safely relocked and key secure',
      'Vehicle returned to exact parking bay alignment',
    ],
    demo: {
      latencyMs: 150,
      failureRate: 0,
    },
  };

  return {
    schemaVersion: 1,
    employees,
    staff,
    fieldMembers,
    fieldTeams,
    zones,
    bays,
    qrTokens,
    services,
    packages,
    subscriptions,
    credits,
    vehicles,
    orders,
    photos: [],
    orderEvents,
    issues: [],
    auditLogs,
    settings,
  };
}
