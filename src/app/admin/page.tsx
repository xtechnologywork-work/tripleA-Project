'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { mockStore } from '@/data/mock/store';
import { TOTAL_BAYS } from '@/data/mock/seed';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/context/auth-context';
import {
  Order,
  OrderStatus,
  FieldTeamMember,
  Employee,
  EmployeeSubscription,
} from '@/domain/types';
import { formatDateTime, formatQAR } from '@/lib/utils';
import { getAllowedTransitions, ActorContext } from '@/domain/status-machine';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Layers,
  Users,
  CreditCard,
  TrendingUp,
  MapPin,
  Sparkles,
  Phone,
  ExternalLink,
  Camera,
  Check,
  X,
  FileText,
  Award,
  User,
  Eye,
  MessageSquare,
  Maximize2,
  KeyRound,
} from 'lucide-react';

type AdminTab = 'DISPATCH' | 'CLIENTS' | 'SUBSCRIPTIONS' | 'BAYS' | 'INSIGHTS';

export default function AdminDashboardPage() {
  const { actor } = useAuth();

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<AdminTab>('DISPATCH');

  // Core Data States (synchronized live from mockStore)
  const [orders, setOrders] = useState<Order[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subscriptions, setSubscriptions] = useState<EmployeeSubscription[]>([]);
  const [fieldMembers, setFieldMembers] = useState<FieldTeamMember[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter States for Dispatch
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');

  // Selected Order for Execution Console
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Action Inputs for Order Execution
  const [assigneeId, setAssigneeId] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [returnOverrideBay, setReturnOverrideBay] = useState('');

  // Modals state
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [creditModalClient, setCreditModalClient] = useState<Employee | null>(null);
  const [creditAdjustmentAmount, setCreditAdjustmentAmount] = useState<number>(1);
  const [creditAdjustmentReason, setCreditAdjustmentReason] = useState<string>('Corporate VIP Complimentary Pass');
  const [historyModalClient, setHistoryModalClient] = useState<Employee | null>(null);
  const [bayLookup, setBayLookup] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Client Directory Filters
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientSubFilter, setClientSubFilter] = useState<'ALL' | 'ACTIVE_SUB' | 'NO_SUB'>('ALL');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Reload all domain collections without resetting user's selected order
  const reloadData = useCallback(() => {
    setIsSyncing(true);
    setLastSyncTime(new Date());

    const updateState = () => {
      const ords = mockStore.getOrders();
      setOrders(ords);
      setEmployees(mockStore.getEmployees());
      setSubscriptions(mockStore.getAllSubscriptions());
      setFieldMembers(mockStore.getFieldMembers());

      setSelectedOrderId((prev) => {
        if (prev && ords.some((o) => o.id === prev)) {
          return prev;
        }
        return ords[0]?.id || null;
      });
      setIsSyncing(false);
    };

    mockStore.syncFromServer().finally(() => {
      updateState();
    });
  }, []);

  // Synchronize on mount + live subscriptions + auto-polling fallback
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    reloadData();
    const unsub = mockStore.subscribe(reloadData);
    const interval = setInterval(reloadData, 3500);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [reloadData]);

  // Filtered Orders for Dispatch
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = searchQuery.toLowerCase().trim();
      const client = employees.find((e) => e.id === o.employeeId);
      const matchesSearch =
        !q ||
        o.reference.toLowerCase().includes(q) ||
        o.bayCodeSnapshot.toLowerCase().includes(q) ||
        o.vehicleSnapshot.plateNumber.toLowerCase().includes(q) ||
        (o.vehicleSnapshot.make || '').toLowerCase().includes(q) ||
        (client?.fullName || '').toLowerCase().includes(q) ||
        (client?.phone || '').includes(q) ||
        (client?.qid || '').includes(q);

      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchesZone = zoneFilter === 'ALL' || o.zoneCodeSnapshot === zoneFilter;

      return matchesSearch && matchesStatus && matchesZone;
    });
  }, [orders, searchQuery, statusFilter, zoneFilter, employees]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || filteredOrders[0] || null;
  const selectedOrderClient = selectedOrder ? employees.find((e) => e.id === selectedOrder.employeeId) : null;
  const selectedOrderPhotos = selectedOrder ? mockStore.getOrderPhotos(selectedOrder.id) : [];
  const selectedOrderEvents = selectedOrder ? mockStore.getOrderEvents(selectedOrder.id) : [];

  // Sync inputs with selected order
  useEffect(() => {
    if (selectedOrder) {
      if (selectedOrder.assignment?.memberId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync inputs with selected order
        setAssigneeId(selectedOrder.assignment.memberId);
      }
      setReturnOverrideBay(selectedOrder.bayCodeSnapshot || '');
    }
  }, [selectedOrder?.id]);

  // Filtered Clients for Directory
  const filteredClients = useMemo(() => {
    return employees.filter((emp) => {
      const q = clientSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        emp.fullName.toLowerCase().includes(q) ||
        (emp.phone || '').includes(q) ||
        (emp.qid || '').includes(q) ||
        (emp.employeeNo || '').toLowerCase().includes(q);

      const sub = mockStore.getEmployeeSubscription(emp.id);
      const hasActiveSub = sub && sub.status === 'ACTIVE';

      if (clientSubFilter === 'ACTIVE_SUB' && !hasActiveSub) return false;
      if (clientSubFilter === 'NO_SUB' && hasActiveSub) return false;

      return matchesSearch;
    });
  }, [employees, clientSearchQuery, clientSubFilter, subscriptions]);

  // Order Transition Handler
  const handleTransition = (toStatus: OrderStatus, customAssigneeId?: string) => {
    if (!selectedOrder) return;
    try {
      const payload: Parameters<typeof mockStore.transitionOrder>[2] = {};
      const activeAssignee = customAssigneeId || assigneeId;
      const mem = fieldMembers.find((m) => m.id === activeAssignee) || fieldMembers[0];

      if (toStatus === 'ASSIGNED') {
        payload.assignment = {
          type: 'MEMBER',
          memberId: mem?.id || 'ft_01',
          assignedName: mem?.displayName || 'Tariq Mansour',
          assignedBy: 'Tower Operations Lead',
          assignedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'IN_PROGRESS') {
        if (!selectedOrder.assignment) {
          payload.assignment = {
            type: 'MEMBER',
            memberId: mem?.id || 'ft_01',
            assignedName: mem?.displayName || 'Tariq Mansour',
            assignedBy: 'Tower Operations Lead',
            assignedAt: new Date().toISOString(),
          };
        }
      } else if (toStatus === 'COMPLETED') {
        payload.qualityCheck = {
          checklist: { 'Surface Dry': true, 'Glass Cleared': true, 'Tires Dressed': true },
          notes: qcNotes || 'Sign-off complete',
          passed: true,
          checkedBy: 'Tower Operations Lead',
          checkedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'RETURNED_TO_PARKING') {
        const targetBayCode = returnOverrideBay.trim() || selectedOrder.bayCodeSnapshot;
        payload.returnConfirmation = {
          bayId: selectedOrder.bayId,
          matchesOriginalBay: targetBayCode.toUpperCase() === selectedOrder.bayCodeSnapshot.toUpperCase(),
          overrideReason: targetBayCode !== selectedOrder.bayCodeSnapshot ? `Moved to bay ${targetBayCode}` : undefined,
          confirmedBy: 'Tower Operations Lead',
          confirmedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'ISSUE_REPORTED') {
        payload.issue = {
          category: 'ACCESS',
          severity: 'MEDIUM',
          description: issueDesc || 'Bay obstruction or vehicle locked.',
        };
      } else if (toStatus === 'CANCELLED') {
        payload.cancellation = {
          reason: 'Cancelled from Tower Operations Console',
        };
      }

      // Operational Staff Authority
      const adminOperator: ActorContext = {
        type: 'STAFF',
        id: 'usr_ops_lead',
        name: 'Tower Operations Dispatcher',
        email: 'ops@triplea.qa',
        role: 'SUPERADMIN',
      };

      mockStore.transitionOrder(selectedOrder.id, toStatus, payload, adminOperator);
      showToast(`Order ${selectedOrder.reference} updated to ${toStatus}`);
      reloadData();
    } catch (err: unknown) {
      alert(`Action error: ${(err instanceof Error ? err.message : String(err))}`);
    }
  };

  const allowedTransitions = selectedOrder ? getAllowedTransitions(selectedOrder, actor) : [];

  // Manual Credit Adjustment Action
  const handleSaveCreditAdjustment = () => {
    if (!creditModalClient) return;
    try {
      mockStore.adjustCredit(
        creditModalClient.id,
        creditAdjustmentAmount,
        creditAdjustmentReason || 'Admin Management Adjustment',
        actor
      );
      showToast(
        `Granted ${creditAdjustmentAmount > 0 ? '+' : ''}${creditAdjustmentAmount} wash credits to ${creditModalClient.fullName}`
      );
      setCreditModalClient(null);
      reloadData();
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : String(err)) || 'Error adjusting credit');
    }
  };

  // Quick 140 QAR Subscription Activation Action
  const handleActivateSubscription = (emp: Employee) => {
    try {
      mockStore.activateSubscriptionForEmployee(emp.id);
      showToast(`Activated 140 QAR Corporate Package (8 Washes) for ${emp.fullName}`);
      reloadData();
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : String(err)) || 'Error activating subscription');
    }
  };

  // High-Level Operational Metrics
  const metrics = useMemo(() => {
    const totalRevenueMinor = orders.reduce((acc, o) => acc + (o.priceSnapshot?.amountMinor || 0), 0);
    const subRevenueMinor = subscriptions.filter((s) => s.status === 'ACTIVE').length * 14000;
    const combinedRevenue = totalRevenueMinor + subRevenueMinor;

    const activeWashes = orders.filter((o) =>
      ['ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK'].includes(o.status)
    ).length;

    const newQueue = orders.filter((o) => o.status === 'NEW').length;
    const completed = orders.filter((o) => o.status === 'RETURNED_TO_PARKING').length;

    const savingsQar =
      orders.filter((o) => o.paymentMode === 'CREDIT' || (o.priceSnapshot?.amountMinor || 0) <= 2000).length * 10 +
      subscriptions.filter((s) => s.status === 'ACTIVE').length * 100;

    const activeSubscribers = subscriptions.filter((s) => s.status === 'ACTIVE').length;

    return {
      combinedRevenueQar: Math.round(combinedRevenue / 100),
      activeWashes,
      newQueue,
      completed,
      savingsQar,
      activeSubscribers,
      totalOrders: orders.length,
      totalClients: employees.length,
    };
  }, [orders, subscriptions, employees]);

  // Status Styling Helper (Strict Linear/Stripe design - no neon slop)
  const renderStatusPill = (status: OrderStatus) => {
    const config: Record<OrderStatus, { text: string; dot: string; bg: string }> = {
      NEW: { text: 'New', dot: 'bg-zinc-400', bg: 'bg-fill text-body border-transparent' },
      ASSIGNED: { text: 'Assigned', dot: 'bg-blue-400', bg: 'bg-[#2997ff]/15 text-link-soft border-transparent' },
      IN_PROGRESS: { text: 'In Progress', dot: 'bg-amber-400', bg: 'bg-amber-400/15 text-amber-300 border-transparent' },
      QUALITY_CHECK: { text: 'QC Check', dot: 'bg-ink', bg: 'bg-fill text-ink border-transparent' },
      COMPLETED: { text: 'Completed', dot: 'bg-teal-400', bg: 'bg-emerald-400/15 text-emerald-300 border-transparent' },
      RETURNED_TO_PARKING: { text: 'Returned to Bay', dot: 'bg-emerald-400', bg: 'bg-emerald-400/15 text-emerald-300 border-transparent' },
      CANCELLED: { text: 'Cancelled', dot: 'bg-zinc-500', bg: 'bg-fill-soft text-dim border-transparent' },
      ISSUE_REPORTED: { text: 'Issue Reported', dot: 'bg-red-400', bg: 'bg-rose-400/15 text-rose-300 border-transparent' },
    };

    const s = config[status] || { text: status, dot: 'bg-zinc-400', bg: 'bg-raised text-body border-zinc-700' };

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums border ${s.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span>{s.text}</span>
      </span>
    );
  };

  // Bays are plain numbers: 1 to TOTAL_BAYS
  const ACTIVE_BAY_STATES: OrderStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK'];
  const occupiedBayCodes = Array.from(
    new Set(
      orders
        .filter((o) => ACTIVE_BAY_STATES.includes(o.status) || o.status === 'RETURNED_TO_PARKING')
        .map((o) => o.bayCodeSnapshot)
    )
  ).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const detailingBayCount = occupiedBayCodes.filter((c) =>
    orders.some((o) => o.bayCodeSnapshot === c && ACTIVE_BAY_STATES.includes(o.status))
  ).length;
  const readyBayCount = occupiedBayCodes.length - detailingBayCount;
  const availableBayCount = Math.max(TOTAL_BAYS - occupiedBayCodes.length, 0);
  const lookupDigits = bayLookup.replace(/\D/g, '');
  const lookupNumber = Number(lookupDigits);
  const lookupValid = lookupDigits !== '' && lookupNumber >= 1 && lookupNumber <= TOTAL_BAYS;
  const visibleBayCodes = lookupDigits === '' ? occupiedBayCodes : lookupValid ? [String(lookupNumber)] : [];

  // Shared surface tokens for the console
  const card = 'rounded-3xl bg-tile';
  const subtle = 'text-xs text-dim';
  const chipBtn =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition cursor-pointer';

  const navItems: { key: AdminTab; label: string; icon: React.ReactNode; count: number | null; hot?: boolean }[] = [
    { key: 'DISPATCH', label: 'Dispatch Queue', icon: <Layers className="h-[18px] w-[18px]" />, count: metrics.newQueue > 0 ? metrics.newQueue : null, hot: true },
    { key: 'CLIENTS', label: 'Clients & Registry', icon: <Users className="h-[18px] w-[18px]" />, count: metrics.totalClients },
    { key: 'SUBSCRIPTIONS', label: '140 QAR Passes', icon: <CreditCard className="h-[18px] w-[18px]" />, count: metrics.activeSubscribers },
    { key: 'BAYS', label: 'Tower Bays', icon: <MapPin className="h-[18px] w-[18px]" />, count: null },
    { key: 'INSIGHTS', label: 'Analytics', icon: <TrendingUp className="h-[18px] w-[18px]" />, count: null },
  ];
  const activeNav = navItems.find((n) => n.key === activeTab) || navItems[0];

  const kpis: { label: string; value: string; unit?: string; dot?: string }[] = [
    { label: 'Gross Revenue', value: metrics.combinedRevenueQar.toLocaleString(), unit: 'QAR' },
    { label: 'In Detailing', value: String(metrics.activeWashes), dot: 'bg-amber-400' },
    { label: 'Queue', value: String(metrics.newQueue), dot: 'bg-zinc-400' },
    { label: 'Returned to Bay', value: String(metrics.completed), dot: 'bg-emerald-400' },
    { label: 'Active Passes', value: String(metrics.activeSubscribers), dot: 'bg-[#2997ff]' },
    { label: 'Ministry Savings', value: `+${metrics.savingsQar.toLocaleString()}`, unit: 'QAR' },
  ];

  const statusChips: { value: string; label: string }[] = [
    { value: 'ALL', label: `All (${orders.length})` },
    { value: 'NEW', label: `New (${orders.filter((o) => o.status === 'NEW').length})` },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'QUALITY_CHECK', label: 'QC Check' },
    { value: 'RETURNED_TO_PARKING', label: 'Returned' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const stageIsReady = selectedOrder
    ? selectedOrder.status === 'RETURNED_TO_PARKING' || selectedOrder.status === 'COMPLETED'
    : false;
  const stageIsCleaning = selectedOrder
    ? selectedOrder.status === 'IN_PROGRESS' || selectedOrder.status === 'QUALITY_CHECK'
    : false;

  const stageShell = (active: boolean) =>
    `rounded-2xl p-4 flex flex-col justify-between gap-4 transition ${
      active ? 'bg-raised ring-2 ring-[#2997ff]' : 'bg-inset'
    }`;
  const stagePrimary = 'w-full py-2.5 rounded-full text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5';

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-canvas text-body font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 end-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-raised text-ink text-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SIDEBAR                                                                */}
      {/* ---------------------------------------------------------------------- */}
      <aside className="w-[76px] lg:w-[256px] flex-shrink-0 bg-sidebar flex flex-col py-5 px-3 lg:px-4">
        <Link href="/admin" className="flex items-center gap-3 px-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/triplea-shield.png" alt="TripleA" className="w-9 h-9 object-contain flex-shrink-0" />
          <div className="hidden lg:block leading-tight min-w-0">
            <div className="text-[14px] font-semibold text-ink tracking-tight truncate">TripleA Operations</div>
            <div className="text-xs text-dim truncate">Lusail Towers</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                title={item.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition cursor-pointer ${
                  active ? 'bg-fill text-ink' : 'text-muted hover:text-ink hover:bg-fill-soft'
                }`}
              >
                <span className={active ? 'text-link' : ''}>{item.icon}</span>
                <span className="hidden lg:block flex-1 text-start truncate">{item.label}</span>
                {item.count !== null && (
                  <span
                    className={`hidden lg:inline text-xs tabular-nums px-2 py-0.5 rounded-full ${
                      item.hot ? 'bg-amber-400/20 text-amber-300 font-semibold' : 'text-dim'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/?spot=1"
            target="_blank"
            title="Customer Portal"
            className="flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-sm font-medium text-white transition whitespace-nowrap"
          >
            <span className="hidden lg:inline">Customer Portal</span>
            <ExternalLink className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-3 px-2 pt-2">
            <div className="w-8 h-8 rounded-full bg-raised flex items-center justify-center text-sm font-semibold text-ink flex-shrink-0">
              {actor.name ? actor.name.charAt(0) : 'A'}
            </div>
            <span className="hidden lg:block text-sm text-body truncate">{actor.name || 'Admin'}</span>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------------- */}
      {/* MAIN                                                                   */}
      {/* ---------------------------------------------------------------------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Page header */}
        <header className="flex-shrink-0 flex items-center justify-between gap-4 px-8 pt-6 pb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-ink tracking-tight leading-tight truncate">{activeNav.label}</h1>
            <p className="text-sm text-dim mt-0.5">Lusail Towers Parking · {TOTAL_BAYS.toLocaleString()} bays</p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="inline-flex items-center gap-2 text-sm text-emerald-300 bg-emerald-400/10 px-3 py-1.5 rounded-full whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · Supabase
            </span>
            <span className="text-sm text-dim tabular-nums whitespace-nowrap">
              {lastSyncTime
                ? lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Syncing'}
            </span>
            <ThemeToggle />
            <button
              onClick={reloadData}
              disabled={isSyncing}
              className="w-9 h-9 rounded-full bg-tile hover:bg-raised text-body hover:text-ink transition flex items-center justify-center"
              title="Force reload data"
              aria-label="Force reload data"
            >
              <RotateCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Key numbers */}
        <div className="flex-shrink-0 px-8 pb-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-tile px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                {k.dot && <span className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />}
                <span className="truncate">{k.label}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[21px] leading-none font-semibold text-ink tracking-tight tabular-nums">{k.value}</span>
                {k.unit && <span className="text-sm text-dim">{k.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        <main className="flex-1 min-h-0 overflow-hidden">
          {/* ================================================================== */}
          {/* DISPATCH                                                           */}
          {/* ================================================================== */}
          {activeTab === 'DISPATCH' && (
            <div className="h-full flex gap-5 px-8 pb-6">
              {/* Queue */}
              <aside className="w-[360px] xl:w-[420px] flex-shrink-0 flex flex-col min-h-0">
                <div className="flex items-center gap-2 flex-shrink-0 bg-tile rounded-full px-4 py-2.5 text-sm text-ink mb-3">
                  <Search className="h-4 w-4 text-dim flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Filter by bay, plate, or customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent outline-none placeholder-dim text-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-dim hover:text-ink" aria-label="Clear search">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pb-3 flex-shrink-0">
                  {statusChips.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setStatusFilter(c.value)}
                      className={`${chipBtn} ${
                        statusFilter === c.value
                          ? 'bg-ink text-canvas'
                          : 'bg-tile text-body hover:bg-raised'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 p-1 -m-1">
                  {filteredOrders.length === 0 ? (
                    <div className={`${card} p-10 text-center text-sm text-dim space-y-2`}>
                      <p>No orders match current criteria.</p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('ALL');
                        }}
                        className="text-link hover:underline"
                      >
                        Reset filter
                      </button>
                    </div>
                  ) : (
                    filteredOrders.map((ord) => {
                      const isSelected = selectedOrder?.id === ord.id;
                      const client = employees.find((e) => e.id === ord.employeeId);
                      const photos = mockStore.getOrderPhotos(ord.id);

                      return (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedOrderId(ord.id)}
                          className={`p-4 rounded-2xl cursor-pointer transition flex items-start gap-3 ${
                            isSelected ? 'bg-raised ring-2 ring-[#2997ff]' : 'bg-tile hover:bg-tile-hover'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-xl bg-fill flex flex-col items-center justify-center flex-shrink-0 tabular-nums">
                            <span className="text-sm font-semibold text-ink leading-none">{ord.bayCodeSnapshot}</span>
                                                      </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-ink tabular-nums">{ord.vehicleSnapshot.plateNumber}</span>
                              {photos.length > 0 && <Camera className="h-3.5 w-3.5 text-link-soft" />}
                            </div>
                            <div className="text-sm text-body truncate">
                              {client?.fullName || 'Ministry Staff'}
                              <span className="text-dim tabular-nums ms-1.5">({client?.phone || 'Qatar'})</span>
                            </div>
                            <div className="text-xs text-dim tabular-nums truncate">
                              {ord.reference} · {ord.serviceSnapshot.name} ·{' '}
                              {ord.paymentMode === 'CREDIT' ? 'Pass (0 QAR)' : formatQAR(ord.priceSnapshot?.amountMinor || 0)}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            {renderStatusPill(ord.status)}
                            <span className="text-xs tabular-nums text-dim">
                              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Order console */}
              <section className="flex-1 min-w-0 overflow-y-auto pe-1">
                {selectedOrder ? (
                  <div className="max-w-[980px] space-y-4">
                    {/* Order header */}
                    <div className={`${card} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-[24px] leading-none font-semibold text-ink tracking-tight tabular-nums">
                            {selectedOrder.reference}
                          </h2>
                          {renderStatusPill(selectedOrder.status)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted flex-wrap">
                          <span className="flex items-center gap-1.5 text-body">
                            <MapPin className="h-4 w-4 text-dim" />
                            Parking Bay <strong className="text-ink tabular-nums">{selectedOrder.bayCodeSnapshot}</strong>
                          </span>
                          <span className="text-faint">·</span>
                          <span className="tabular-nums">Submitted {formatDateTime(selectedOrder.createdAt)}</span>
                        </div>
                      </div>

                      {selectedOrder.status !== 'CANCELLED' && (
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to cancel order ${selectedOrder.reference}?`)) {
                              handleTransition('CANCELLED');
                            }
                          }}
                          className="px-4 py-2 rounded-full bg-fill-soft hover:bg-rose-400/15 text-body hover:text-rose-300 text-sm transition cursor-pointer whitespace-nowrap"
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>

                    {/* Progression */}
                    <div className={`${card} p-6 space-y-5`}>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-base font-semibold text-ink tracking-tight">Order Progression Deck</h3>
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-400/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live Client Sync Active
                          </span>
                        </div>
                        <span className="text-sm text-dim">
                          Select any stage below to instantly update customer&apos;s live tracking view:
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3">
                        {/* Stage 1 */}
                        <div className={stageShell(selectedOrder.status === 'NEW')}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-dim">Stage 1</span>
                              {selectedOrder.status === 'NEW' ? (
                                <span className="text-xs text-ink bg-fill px-2 py-0.5 rounded-full font-semibold">Current</span>
                              ) : (
                                <Check className="h-4 w-4 text-dim" />
                              )}
                            </div>
                            <div className="text-[14px] font-semibold text-ink">Received (تم الاستلام)</div>
                            <p className="text-sm text-dim">Order queued in tower dispatch</p>
                          </div>
                          <button
                            onClick={() => handleTransition('NEW')}
                            disabled={selectedOrder.status === 'NEW'}
                            className={`${stagePrimary} ${
                              selectedOrder.status === 'NEW'
                                ? 'bg-fill text-dim'
                                : 'bg-raised hover:bg-raised-strong text-ink'
                            }`}
                          >
                            {selectedOrder.status === 'NEW' ? 'Active Stage' : 'Set to Received'}
                          </button>
                        </div>

                        {/* Stage 2 */}
                        <div className={stageShell(selectedOrder.status === 'ASSIGNED')}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-dim">Stage 2</span>
                              {selectedOrder.status === 'ASSIGNED' ? (
                                <span className="text-xs text-ink bg-fill px-2 py-0.5 rounded-full font-semibold">Current</span>
                              ) : selectedOrder.assignment ? (
                                <Check className="h-4 w-4 text-link" />
                              ) : null}
                            </div>
                            <div className="text-[14px] font-semibold text-ink">Assigned (تم التعيين)</div>
                            <select
                              value={assigneeId}
                              onChange={(e) => setAssigneeId(e.target.value)}
                              aria-label="Field specialist"
                              className="w-full bg-raised rounded-xl px-3 py-2 text-sm text-ink outline-none"
                            >
                              {fieldMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.displayName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleTransition('ASSIGNED', assigneeId)}
                            className={`${stagePrimary} bg-[#0071e3] hover:bg-[#0077ed] text-white`}
                          >
                            <User className="h-4 w-4" />
                            <span>{selectedOrder.status === 'ASSIGNED' ? 'Reassign Tech' : 'Dispatch Tech'}</span>
                          </button>
                        </div>

                        {/* Stage 3 */}
                        <div className={stageShell(stageIsCleaning)}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-dim">Stage 3</span>
                              {stageIsCleaning ? (
                                <span className="text-xs text-ink bg-fill px-2 py-0.5 rounded-full font-semibold animate-pulse">In Progress</span>
                              ) : null}
                            </div>
                            <div className="text-[14px] font-semibold text-ink">Cleaning (جاري الغسيل)</div>
                            <p className="text-sm text-dim">Hydro wash & interior detailing</p>
                          </div>
                          <button
                            onClick={() => handleTransition('IN_PROGRESS')}
                            className={`${stagePrimary} ${
                              selectedOrder.status === 'IN_PROGRESS'
                                ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                                : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
                            }`}
                          >
                            <Sparkles className="h-4 w-4" />
                            <span>{selectedOrder.status === 'IN_PROGRESS' ? 'Detailing Active' : 'Start Wash'}</span>
                          </button>
                        </div>

                        {/* Stage 4 */}
                        <div className={stageShell(stageIsReady)}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-dim">Stage 4</span>
                              {stageIsReady ? (
                                <span className="text-xs text-ink bg-fill px-2 py-0.5 rounded-full font-semibold">Ready</span>
                              ) : null}
                            </div>
                            <div className="text-[14px] font-semibold text-ink">Ready at Bay (جاهزة بالموقف)</div>
                            <p className="text-sm text-dim">
                              Bay: <strong className="text-ink tabular-nums">{selectedOrder.bayCodeSnapshot}</strong>
                            </p>
                          </div>
                          <button
                            onClick={() => handleTransition('RETURNED_TO_PARKING')}
                            className={`${stagePrimary} ${
                              stageIsReady
                                ? 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                                : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{selectedOrder.status === 'RETURNED_TO_PARKING' ? 'Confirmed Ready' : 'Mark Ready'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                      <div className="xl:col-span-3 space-y-4">
                        {/* Customer */}
                        <div className={`${card} p-6 space-y-4`}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">Customer Profile</h3>
                            <span className="text-xs text-emerald-300 bg-emerald-400/10 px-2.5 py-1 rounded-full">Verified Corporate</span>
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-ink tracking-tight">
                              {selectedOrderClient?.fullName || 'Ministry Staff'}
                            </h4>
                            <p className="text-sm text-dim mt-0.5">
                              {selectedOrderClient?.company || 'Ministry of Commerce & Industry'}
                            </p>
                          </div>
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Qatar ID (QID)</dt>
                              <dd className="mt-1 text-[14px] text-ink font-medium tabular-nums">
                                {selectedOrderClient?.qid || <span className="text-dim">—</span>}
                              </dd>
                            </div>
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Qatar Mobile</dt>
                              <dd className="mt-1">
                                <a
                                  href={`https://wa.me/${(selectedOrderClient?.phone || '').replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-[14px] text-ink font-medium tabular-nums hover:text-link transition"
                                >
                                  <Phone className="h-4 w-4 text-dim" />
                                  <span>{selectedOrderClient?.phone || 'Qatar Phone'}</span>
                                </a>
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Vehicle */}
                        <div className={`${card} p-6 space-y-4`}>
                          <h3 className="text-base font-semibold text-ink">Vehicle &amp; Package Details</h3>
                          <dl className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Plate Number</dt>
                              <dd className="mt-1 text-[14px] text-ink font-semibold tabular-nums">
                                {selectedOrder.vehicleSnapshot.plateNumber} (Qatar)
                              </dd>
                            </div>
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Assigned Bay</dt>
                              <dd className="mt-1 text-[14px] text-ink font-semibold tabular-nums">{selectedOrder.bayCodeSnapshot}</dd>
                            </div>
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Service</dt>
                              <dd className="mt-1 text-[14px] text-ink font-medium">{selectedOrder.serviceSnapshot.name}</dd>
                            </div>
                            <div className="rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Payment</dt>
                              <dd className="mt-1 text-[14px] text-ink font-medium tabular-nums">
                                {selectedOrder.paymentMode === 'CREDIT'
                                  ? 'Corporate Pass Credit (0 QAR)'
                                  : formatQAR(selectedOrder.priceSnapshot?.amountMinor || 0)}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {selectedOrder.instructions && (
                          <div className="rounded-3xl bg-amber-400/[0.08] p-5 space-y-1.5">
                            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
                              <KeyRound className="h-4 w-4" />
                              <span>Customer Instruction</span>
                            </div>
                            <p className="text-sm text-body leading-relaxed">{selectedOrder.instructions}</p>
                          </div>
                        )}
                      </div>

                      <div className="xl:col-span-2 space-y-4">
                        {/* Photo */}
                        <div className={`${card} p-5 space-y-3`}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">Rear Verification Photo</h3>
                            {selectedOrderPhotos.length > 0 && (
                              <span className="text-xs text-emerald-300">✓ Plate Attached</span>
                            )}
                          </div>

                          {selectedOrderPhotos.length > 0 ? (
                            <div
                              onClick={() => setLightboxPhoto(selectedOrderPhotos[0].blobKey)}
                              className="relative rounded-2xl overflow-hidden h-56 bg-canvas group cursor-pointer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={selectedOrderPhotos[0].blobKey}
                                alt="Rear Vehicle Verification"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition flex items-center justify-center">
                                <span className="px-3 py-1.5 rounded-full bg-black/70 text-white text-sm flex items-center gap-1.5">
                                  <Maximize2 className="h-3.5 w-3.5" /> Click to Inspect Plate
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-32 rounded-2xl bg-inset flex items-center justify-center text-sm text-dim text-center px-4">
                              No verification photo attached by client.
                            </div>
                          )}
                        </div>

                        {/* Specialist */}
                        <div className={`${card} p-5 space-y-3`}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">Allocated Specialist</h3>
                            {selectedOrder.assignment ? (
                              <span className="text-xs text-link-soft font-semibold">Active On Order</span>
                            ) : (
                              <span className="text-sm text-dim whitespace-nowrap">Unassigned</span>
                            )}
                          </div>

                          {selectedOrder.assignment ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-[#2997ff]/20 flex items-center justify-center text-sm font-semibold text-link-soft flex-shrink-0">
                                  {(selectedOrder.assignment.assignedName || 'S').charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[14px] font-semibold text-ink truncate">
                                    {selectedOrder.assignment.assignedName || 'Field Specialist'}
                                  </div>
                                  <span className="text-xs text-dim">Senior Detailing Specialist</span>
                                </div>
                              </div>

                              <a
                                href="https://wa.me/97455551234"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-body transition flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <MessageSquare className="h-4 w-4 text-emerald-400" />
                                <span>WhatsApp</span>
                              </a>
                            </div>
                          ) : (
                            <p className="text-sm text-dim">Use Stage 2 above to allocate a tower specialist.</p>
                          )}
                        </div>

                        {/* QC and issues */}
                        <div className={`${card} p-5 space-y-3`}>
                          <h3 className="text-base font-semibold text-ink">Operational Escalation &amp; QC</h3>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                const note = prompt('Enter inspection sign-off notes (e.g. Surface dry, streak-free):', 'QC Inspection Passed');
                                if (note) {
                                  setQcNotes(note);
                                  handleTransition('COMPLETED');
                                }
                              }}
                              className="py-2.5 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Award className="h-4 w-4" />
                              <span>Sign-off QC</span>
                            </button>

                            <button
                              onClick={() => {
                                const desc = prompt('Enter operational issue description (e.g. Bay obstructed, vehicle locked):');
                                if (desc) {
                                  setIssueDesc(desc);
                                  handleTransition('ISSUE_REPORTED');
                                }
                              }}
                              className="py-2.5 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-sm text-amber-300 transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <AlertTriangle className="h-4 w-4" />
                              <span>Report Issue</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Audit trail */}
                    {selectedOrderEvents.length > 0 && (
                      <div className={`${card} p-6 space-y-4`}>
                        <h3 className="text-base font-semibold text-ink">Lifecycle Audit Trail</h3>
                        <ol className="space-y-3">
                          {selectedOrderEvents.map((ev) => (
                            <li key={ev.id} className="flex items-center gap-3 text-sm">
                              <span className="w-2 h-2 rounded-full bg-[#2997ff] flex-shrink-0" />
                              <span className="flex-1 text-muted min-w-0">
                                {ev.from ? `${ev.from} → ` : ''}
                                <strong className="text-ink font-semibold">{ev.to || ev.type}</strong>
                              </span>
                              <span className="text-xs text-dim tabular-nums whitespace-nowrap">{formatDateTime(ev.createdAt)}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-dim text-sm gap-3">
                    <FileText className="h-9 w-9 text-faint" />
                    <p>Select an order from the dispatch list to inspect details.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ================================================================== */}
          {/* CLIENTS                                                            */}
          {/* ================================================================== */}
          {activeTab === 'CLIENTS' && (
            <div className="h-full overflow-y-auto px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[280px] bg-tile rounded-full px-4 py-2.5">
                    <Search className="h-4 w-4 text-dim flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by client name, Qatar mobile, or employee ID..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-sm text-ink placeholder-dim outline-none"
                    />
                    {clientSearchQuery && (
                      <button onClick={() => setClientSearchQuery('')} className="text-dim hover:text-ink" aria-label="Clear search">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <select
                    value={clientSubFilter}
                    onChange={(e) => setClientSubFilter(e.target.value as 'ALL' | 'ACTIVE_SUB' | 'NO_SUB')}
                    className="bg-tile rounded-full px-4 py-2.5 text-sm text-body outline-none"
                  >
                    <option value="ALL">All Clients ({employees.length})</option>
                    <option value="ACTIVE_SUB">Active 140 QAR Passes ({metrics.activeSubscribers})</option>
                    <option value="NO_SUB">No Active Pass</option>
                  </select>
                </div>

                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full text-left text-sm border-collapse min-w-[860px]">
                    <thead>
                      <tr className="text-dim text-xs">
                        <th className="py-3.5 px-5 font-medium">Client Name</th>
                        <th className="py-3.5 px-5 font-medium">Qatar Mobile</th>
                        <th className="py-3.5 px-5 font-medium">Corporate Entity</th>
                        <th className="py-3.5 px-5 font-medium">140 QAR Pass</th>
                        <th className="py-3.5 px-5 font-medium">Wash Balance</th>
                        <th className="py-3.5 px-5 font-medium">Total Washes</th>
                        <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-14 text-center text-dim">
                            No matching clients found in directory.
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((emp) => {
                          const sub = mockStore.getEmployeeSubscription(emp.id);
                          const hasSub = sub && sub.status === 'ACTIVE';
                          const balance = mockStore.getCreditBalance(emp.id);
                          const clientOrders = mockStore.getEmployeeOrders(emp.id);

                          return (
                            <tr key={emp.id} className="hover:bg-fill-soft transition">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-raised flex items-center justify-center text-sm font-semibold text-ink flex-shrink-0">
                                    {emp.fullName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-ink block">{emp.fullName}</span>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-dim tabular-nums">
                                      <span>{emp.employeeNo || `MOCI-${(emp.phone || '').slice(-4)}`}</span>
                                      {emp.qid && <span>QID: {emp.qid}</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-5 tabular-nums text-body">
                                <a
                                  href={`https://wa.me/${(emp.phone || '').replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 hover:text-link transition"
                                >
                                  <Phone className="h-3.5 w-3.5 text-dim" />
                                  <span>{emp.phone || 'N/A'}</span>
                                </a>
                              </td>

                              <td className="py-3.5 px-5 text-body">
                                <span className="truncate max-w-[200px] block">
                                  {emp.company || 'Ministry of Commerce & Industry'}
                                </span>
                              </td>

                              <td className="py-3.5 px-5">
                                {hasSub ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-300 text-xs font-medium whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    Active Pass
                                  </span>
                                ) : (
                                  <span className="text-dim whitespace-nowrap">No Active Pass</span>
                                )}
                              </td>

                              <td className="py-3.5 px-5 tabular-nums">
                                {balance > 0 ? (
                                  <span className="text-ink font-semibold">{balance} Washes</span>
                                ) : (
                                  <span className="text-dim">0 Washes</span>
                                )}
                              </td>

                              <td className="py-3.5 px-5 tabular-nums text-body">{clientOrders.length} Completed</td>

                              <td className="py-3.5 px-5">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setCreditModalClient(emp)}
                                    className="px-3.5 py-1.5 rounded-full bg-fill hover:bg-fill-strong text-ink text-sm transition cursor-pointer whitespace-nowrap"
                                    title="Add credits"
                                  >
                                    + Credits
                                  </button>

                                  {!hasSub && (
                                    <button
                                      onClick={() => handleActivateSubscription(emp)}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-sm transition cursor-pointer whitespace-nowrap"
                                      title="Activate 140 QAR pass"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      Pass
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setHistoryModalClient(emp)}
                                    className="w-8 h-8 rounded-full bg-fill hover:bg-fill-strong text-body transition cursor-pointer flex items-center justify-center"
                                    title="Order history"
                                    aria-label="Order history"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* SUBSCRIPTIONS                                                      */}
          {/* ================================================================== */}
          {activeTab === 'SUBSCRIPTIONS' && (
            <div className="h-full overflow-y-auto px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className={`${card} p-6 flex flex-col md:flex-row md:items-center justify-between gap-5`}>
                  <div>
                    <h3 className="text-base font-semibold text-ink tracking-tight">Corporate Pass Management (140 QAR)</h3>
                    <p className="text-sm text-dim mt-1">
                      8 Washes (6 Paid + 2 Free) for Qatar Ministry of Commerce &amp; Industry staff
                    </p>
                  </div>
                  <div className="flex items-center gap-8">
                    <div>
                      <div className="text-sm text-dim">Total Subscribers</div>
                      <div className="text-[22px] leading-none mt-1 font-semibold text-ink tabular-nums">{metrics.activeSubscribers}</div>
                    </div>
                    <div>
                      <div className="text-sm text-dim">Active Value</div>
                      <div className="text-[22px] leading-none mt-1 font-semibold text-ink tabular-nums">
                        {(metrics.activeSubscribers * 140).toLocaleString()}
                        <span className="text-sm text-dim font-normal ms-1.5">QAR</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full text-left text-sm border-collapse min-w-[860px]">
                    <thead>
                      <tr className="text-dim text-xs">
                        <th className="py-3.5 px-5 font-medium">Subscriber</th>
                        <th className="py-3.5 px-5 font-medium">Qatar Phone</th>
                        <th className="py-3.5 px-5 font-medium">Package</th>
                        <th className="py-3.5 px-5 font-medium">Remaining Balance</th>
                        <th className="py-3.5 px-5 font-medium">Status</th>
                        <th className="py-3.5 px-5 font-medium">Activated</th>
                        <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {subscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-14 text-center text-dim">
                            No corporate subscriptions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        subscriptions.map((sub) => {
                          const client = employees.find((e) => e.id === sub.employeeId);
                          const balance = client ? mockStore.getCreditBalance(client.id) : 0;

                          return (
                            <tr key={sub.id} className="hover:bg-fill-soft transition">
                              <td className="py-3.5 px-5">
                                <span className="font-semibold text-ink block">{client?.fullName || 'Ministry Staff'}</span>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-dim tabular-nums">
                                  <span>{sub.id}</span>
                                  {client?.qid && <span>QID: {client.qid}</span>}
                                </div>
                              </td>
                              <td className="py-3.5 px-5 tabular-nums text-body">{client?.phone || 'N/A'}</td>
                              <td className="py-3.5 px-5 text-body">140 QAR Corporate Package (6 + 2 Free = 8 Washes)</td>
                              <td className="py-3.5 px-5 tabular-nums font-semibold text-ink">{balance} Washes Left</td>
                              <td className="py-3.5 px-5">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                    sub.status === 'ACTIVE'
                                      ? 'bg-emerald-400/15 text-emerald-300'
                                      : 'bg-fill text-body'
                                  }`}
                                >
                                  {sub.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 tabular-nums text-muted">
                                {sub.activatedAt ? formatDateTime(sub.activatedAt) : 'N/A'}
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                {sub.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => {
                                      if (confirm('Cancel this active corporate subscription?')) {
                                        mockStore.cancelSubscription(sub.id);
                                        showToast('Subscription cancelled');
                                        reloadData();
                                      }
                                    }}
                                    className="px-3.5 py-1.5 rounded-full bg-rose-400/10 hover:bg-rose-400/20 text-rose-300 text-sm transition cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* BAYS                                                               */}
          {/* ================================================================== */}
          {activeTab === 'BAYS' && (
            <div className="h-full overflow-y-auto px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className={`${card} p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5`}>
                  <div>
                    <h3 className="text-base font-semibold text-ink tracking-tight">
                      Lusail Tower Parking Bays (1 to {TOTAL_BAYS.toLocaleString()})
                    </h3>
                    <p className="text-sm text-dim mt-1">Click any active bay to inspect detailing progress</p>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-body flex-wrap">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
                      <strong className="text-ink tabular-nums">{availableBayCount.toLocaleString()}</strong>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> Detailing
                      <strong className="text-ink tabular-nums">{detailingBayCount}</strong>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#2997ff]" /> Ready
                      <strong className="text-ink tabular-nums">{readyBayCount}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 max-w-[360px] bg-tile rounded-full px-4 py-2.5">
                  <Search className="h-4 w-4 text-dim flex-shrink-0" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder={`Find a bay (1 to ${TOTAL_BAYS})`}
                    value={bayLookup}
                    onChange={(e) => setBayLookup(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full bg-transparent text-sm text-ink placeholder-dim outline-none tabular-nums"
                  />
                  {bayLookup && (
                    <button onClick={() => setBayLookup('')} className="text-dim hover:text-ink" aria-label="Clear bay search">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {visibleBayCodes.length === 0 ? (
                  <div className={`${card} p-10 text-center text-sm text-dim`}>
                    {lookupDigits !== '' && !lookupValid
                      ? `Bay number must be between 1 and ${TOTAL_BAYS.toLocaleString()}.`
                      : `No bays are in use right now. All ${TOTAL_BAYS.toLocaleString()} bays are available.`}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                    {visibleBayCodes.map((code) => {
                      const activeBayOrder = orders.find(
                        (o) => o.bayCodeSnapshot === code && ACTIVE_BAY_STATES.includes(o.status)
                      );
                      const returnedOrder = orders.find(
                        (o) => o.bayCodeSnapshot === code && o.status === 'RETURNED_TO_PARKING'
                      );

                      const tone = activeBayOrder
                        ? 'bg-amber-400/[0.1]'
                        : returnedOrder
                        ? 'bg-[#2997ff]/[0.12]'
                        : 'bg-tile';
                      const dot = activeBayOrder ? 'bg-amber-400' : returnedOrder ? 'bg-[#2997ff]' : 'bg-emerald-400';

                      return (
                        <div
                          key={code}
                          onClick={() => {
                            if (activeBayOrder) {
                              setSelectedOrderId(activeBayOrder.id);
                              setActiveTab('DISPATCH');
                            }
                          }}
                          className={`rounded-3xl p-5 space-y-6 transition ${tone} ${
                            activeBayOrder ? 'cursor-pointer hover:brightness-125' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="tabular-nums text-lg font-semibold text-ink">{code}</span>
                            <span className={`w-2 h-2 rounded-full ${dot}`} />
                          </div>

                          <div className="text-sm">
                            {activeBayOrder ? (
                              <div className="space-y-0.5">
                                <span className="text-amber-300 font-semibold block tabular-nums">{activeBayOrder.vehicleSnapshot.plateNumber}</span>
                                <span className="text-xs text-muted block">{activeBayOrder.status}</span>
                              </div>
                            ) : returnedOrder ? (
                              <div className="space-y-0.5">
                                <span className="text-link-soft font-semibold block tabular-nums">{returnedOrder.vehicleSnapshot.plateNumber}</span>
                                <span className="text-xs text-muted block">Ready in Bay</span>
                              </div>
                            ) : (
                              <span className="text-emerald-300">Available</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* INSIGHTS                                                           */}
          {/* ================================================================== */}
          {activeTab === 'INSIGHTS' && (
            <div className="h-full overflow-y-auto px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className={`${card} p-6 space-y-4`}>
                    <h3 className="text-base font-semibold text-ink">Revenue Streams</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">140 QAR Passes</span>
                        <span className="tabular-nums text-ink">{(metrics.activeSubscribers * 140).toLocaleString()} QAR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Single Washes</span>
                        <span className="tabular-nums text-ink">{(metrics.combinedRevenueQar - metrics.activeSubscribers * 140).toLocaleString()} QAR</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-line">
                      <div className="text-sm text-muted">Total Revenue</div>
                      <div className="text-[24px] leading-none mt-1.5 font-semibold text-ink tabular-nums">
                        {metrics.combinedRevenueQar.toLocaleString()} <span className="text-sm text-dim font-normal">QAR</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${card} p-6 space-y-4`}>
                    <h3 className="text-base font-semibold text-ink">Operational SLA</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Average Turnaround</span>
                        <span className="tabular-nums text-ink">28 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">QC Pass Rate</span>
                        <span className="tabular-nums text-ink">99.4%</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-line">
                      <div className="text-sm text-muted">Bay Coverage</div>
                      <div className="text-[24px] leading-none mt-1.5 font-semibold text-ink tabular-nums">
                        1,200 <span className="text-sm text-dim font-normal">Bays</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${card} p-6 space-y-4`}>
                    <h3 className="text-base font-semibold text-ink">Ministry Partnership ROI</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Per-Wash Discount</span>
                        <span className="tabular-nums text-ink">10 QAR Saved</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Pass Bonus Value</span>
                        <span className="tabular-nums text-ink">100 QAR Saved</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-line">
                      <div className="text-sm text-muted">Cumulative Savings</div>
                      <div className="text-[24px] leading-none mt-1.5 font-semibold text-ink tabular-nums">
                        +{metrics.savingsQar.toLocaleString()} <span className="text-sm text-dim font-normal">QAR</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${card} p-6 space-y-4`}>
                  <h3 className="text-base font-semibold text-ink">Field Technicians on Active Duty</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {fieldMembers.map((m) => {
                      const assignedCount = orders.filter(
                        (o) => o.assignment?.memberId === m.id && o.status !== 'RETURNED_TO_PARKING'
                      ).length;

                      return (
                        <div key={m.id} className="p-4 rounded-2xl bg-inset flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-raised flex items-center justify-center font-semibold text-sm text-ink flex-shrink-0">
                              {m.displayName.charAt(0)}
                            </div>
                            <span className="font-medium text-ink truncate">{m.displayName}</span>
                          </div>
                          <span className="text-sm tabular-nums text-muted whitespace-nowrap">{assignedCount} active orders</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* LIGHTBOX                                                               */}
      {/* ---------------------------------------------------------------------- */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-tile rounded-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between text-base font-semibold text-ink">
              <span>Vehicle Rear Plate Verification Photo</span>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition cursor-pointer flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative max-h-[75vh] overflow-hidden rounded-2xl bg-canvas flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxPhoto} alt="Full resolution vehicle photo" className="w-full h-auto max-h-[75vh] object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* GRANT CREDIT MODAL                                                     */}
      {/* ---------------------------------------------------------------------- */}
      {creditModalClient && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-tile rounded-3xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm text-dim">Wash Balance Adjustment</span>
                <h4 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{creditModalClient.fullName}</h4>
                {creditModalClient.qid && (
                  <span className="text-xs tabular-nums text-dim">QID: {creditModalClient.qid}</span>
                )}
              </div>
              <button
                onClick={() => setCreditModalClient(null)}
                className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition cursor-pointer flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="text-body block mb-2">Number of Washes to Add</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 5, 10].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCreditAdjustmentAmount(amt)}
                      className={`py-2.5 rounded-full tabular-nums font-semibold transition cursor-pointer ${
                        creditAdjustmentAmount === amt
                          ? 'bg-ink text-canvas'
                          : 'bg-fill text-ink hover:bg-fill-strong'
                      }`}
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-body block mb-2">Reason / Reference</label>
                <input
                  type="text"
                  value={creditAdjustmentReason}
                  onChange={(e) => setCreditAdjustmentReason(e.target.value)}
                  className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none"
                />
              </div>

              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={handleSaveCreditAdjustment}
                  className="flex-1 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold transition cursor-pointer"
                >
                  Confirm Grant
                </button>
                <button
                  onClick={() => setCreditModalClient(null)}
                  className="px-5 py-3 rounded-full bg-fill hover:bg-fill-strong text-body transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* CLIENT WASH HISTORY MODAL                                              */}
      {/* ---------------------------------------------------------------------- */}
      {historyModalClient && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-tile rounded-3xl p-6 max-h-[85vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm text-dim">Wash Order History</span>
                <h4 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{historyModalClient.fullName}</h4>
                {historyModalClient.qid && (
                  <span className="text-xs tabular-nums text-dim">QID: {historyModalClient.qid}</span>
                )}
              </div>
              <button
                onClick={() => setHistoryModalClient(null)}
                className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition cursor-pointer flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {mockStore.getEmployeeOrders(historyModalClient.id).length === 0 ? (
                <div className="p-10 text-center text-sm text-dim">No previous wash orders for this client.</div>
              ) : (
                mockStore.getEmployeeOrders(historyModalClient.id).map((ord) => (
                  <div key={ord.id} className="p-4 rounded-2xl bg-inset space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-ink font-semibold tabular-nums">Bay {ord.bayCodeSnapshot}</span>
                      {renderStatusPill(ord.status)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-dim tabular-nums">
                      <span>{ord.reference}</span>
                      <span>{formatDateTime(ord.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
