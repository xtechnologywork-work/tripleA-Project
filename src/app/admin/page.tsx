'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mockStore } from '@/data/mock/store';
import { TOTAL_BAYS } from '@/data/mock/seed';
import { getSupabase } from '@/lib/supabase';
import { InspectionCard, InspectionViewer } from '@/components/inspection/inspection-card';
import { InspectionFlow } from '@/components/inspection/inspection-flow';
import { isCleared, requiresPreWashInspection } from '@/domain/inspection';
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
import { ActorContext, isValidStaffTransition } from '@/domain/status-machine';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Layers,
  ChevronLeft,
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
  LogOut,
  Loader2,
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
  const [, setFieldMembers] = useState<FieldTeamMember[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter States for Dispatch
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [zoneFilter] = useState<string>('ALL');

  // Selected Order for Execution Console
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  // On a phone or tablet the queue and the order are two screens: this says the order is open
  const [mobileDetail, setMobileDetail] = useState(false);
  const openOrder = (id: string) => {
    setSelectedOrderId(id);
    setMobileDetail(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  // Action Inputs for Order Execution
  const [, setAssigneeId] = useState('');
  const [issueDesc] = useState('');
  const [qcNotes] = useState('');
  const [returnOverrideBay, setReturnOverrideBay] = useState('');

  // Modals state
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [creditModalClient, setCreditModalClient] = useState<Employee | null>(null);
  const [creditAdjustmentAmount, setCreditAdjustmentAmount] = useState<number>(1);
  const [creditAdjustmentReason, setCreditAdjustmentReason] = useState<string>('Corporate VIP Complimentary Pass');
  const [historyModalClient, setHistoryModalClient] = useState<Employee | null>(null);
  // Editing a subscriber: their details, their pass and the washes they have left
  const [editSub, setEditSub] = useState<EmployeeSubscription | null>(null);
  const [esForm, setEsForm] = useState({
    name: '',
    phone: '',
    employeeNo: '',
    left: 0,
    expiry: '',
    status: 'ACTIVE' as EmployeeSubscription['status'],
    reason: '',
  });
  const [esError, setEsError] = useState('');
  const [bayLookup, setBayLookup] = useState('');
  const [clock, setClock] = useState<number | null>(null);
  const [inspectionFlow, setInspectionFlow] = useState<{ phase: 'BEFORE' | 'AFTER'; editing: boolean } | null>(null);
  const [inspectionViewOpen, setInspectionViewOpen] = useState(false);
  const [clientPanelId, setClientPanelId] = useState<string | null>(null);

  // In-app dialogs (replace the browser's confirm / prompt boxes)
  type AdminDialog = { kind: 'cancel' | 'qc' | 'issue' | 'cancelSub' | 'skipInspection'; subId?: string } | null;
  const [dialog, setDialog] = useState<AdminDialog>(null);
  const [dialogText, setDialogText] = useState('');

  // Global search (Ctrl/⌘ K)
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
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

  // The current time, set after the page loads and refreshed every minute (for the daily numbers)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- time is only known in the browser
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ---- Sign-in: only admins open the dashboard (when Supabase is configured) ----
  const router = useRouter();
  const [authState, setAuthState] = useState<'checking' | 'ok' | 'denied'>('checking');
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      // Local demo mode has no accounts
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no Supabase: nothing to sign in to
      setAuthState('ok');
      return;
    }
    let active = true;

    const check = async (token: string | null) => {
      mockStore.setAuthToken(token);
      if (!token) {
        router.replace('/admin/login');
        return;
      }
      try {
        const res = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setAdminEmail(data.email || '');
          setAuthState('ok');
        } else {
          setAuthState('denied');
        }
      } catch {
        if (active) setAuthState('denied');
      }
    };

    sb.auth.getSession().then(({ data }) => check(data.session?.access_token ?? null));
    const { data: listener } = sb.auth.onAuthStateChange((event, session) => {
      mockStore.setAuthToken(session?.access_token ?? null);
      if (event === 'SIGNED_OUT') router.replace('/admin/login');
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    await getSupabase()?.auth.signOut();
    mockStore.setAuthToken(null);
    router.replace('/admin/login');
  };

  // ---- Live updates: Supabase tells us the moment anything changes ----
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || authState !== 'ok') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pull = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void mockStore.syncFromServer(true);
      }, 250);
    };
    const channel = sb
      .channel('ops-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, pull)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [authState]);

  // ---- A new order arrives: toast and a short sound ----
  const seenOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (orders.length === 0 && seenOrderIds.current === null) return;
    if (seenOrderIds.current === null) {
      seenOrderIds.current = new Set(orders.map((o) => o.id));
      return;
    }
    const known = seenOrderIds.current;
    const fresh = orders.filter((o) => !known.has(o.id) && o.status === 'NEW');
    orders.forEach((o) => known.add(o.id));
    if (fresh.length === 0) return;
    setToastMessage(
      fresh.length === 1
        ? `New order ${fresh[0].reference} at bay ${fresh[0].bayCodeSnapshot}`
        : `${fresh.length} new orders`
    );
    setTimeout(() => setToastMessage(null), 5000);
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Sound is optional
    }
  }, [orders]);

  // ---- Ctrl/⌘ K opens the global search; Esc closes anything open ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setDialog(null);
        setDialogText('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- The server refused or could not save something: say so ----
  useEffect(() => {
    return mockStore.onSyncIssue((messages) => {
      setToastMessage(messages[0] || 'Could not save');
      setTimeout(() => setToastMessage(null), 4000);
    });
  }, []);

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
        (client?.employeeNo || '').includes(q);

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
        (emp.employeeNo || '').includes(q) ||
        (emp.employeeNo || '').toLowerCase().includes(q);

      const sub = mockStore.getEmployeeSubscription(emp.id);
      const hasActiveSub = sub && sub.status === 'ACTIVE';

      if (clientSubFilter === 'ACTIVE_SUB' && !hasActiveSub) return false;
      if (clientSubFilter === 'NO_SUB' && hasActiveSub) return false;

      return matchesSearch;
    });
  }, [employees, clientSearchQuery, clientSubFilter]);

  // Order Transition Handler
  const handleTransition = (toStatus: OrderStatus, customAssigneeId?: string, note?: string, orderOverride?: Order) => {
    const target = orderOverride || selectedOrder;
    if (!target) return;
    try {
      const payload: Parameters<typeof mockStore.transitionOrder>[2] = {};
      if (toStatus === 'ASSIGNED') {
        payload.assignment = {
          type: 'TEAM',
          teamId: 'team-triplea',
          assignedName: 'TripleA Team',
          assignedBy: adminEmail || 'Tower Operations Lead',
          assignedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'IN_PROGRESS') {
        if (!target.assignment) {
          payload.assignment = {
            type: 'TEAM',
            teamId: 'team-triplea',
            assignedName: 'TripleA Team',
            assignedBy: adminEmail || 'Tower Operations Lead',
            assignedAt: new Date().toISOString(),
          };
        }
      } else if (toStatus === 'COMPLETED') {
        payload.qualityCheck = {
          checklist: { 'Surface Dry': true, 'Glass Cleared': true, 'Tires Dressed': true },
          notes: note || qcNotes || 'Sign-off complete',
          passed: true,
          checkedBy: 'Tower Operations Lead',
          checkedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'RETURNED_TO_PARKING') {
        const targetBayCode = returnOverrideBay.trim() || target.bayCodeSnapshot;
        payload.returnConfirmation = {
          bayId: target.bayId,
          matchesOriginalBay: targetBayCode.toUpperCase() === target.bayCodeSnapshot.toUpperCase(),
          overrideReason: targetBayCode !== target.bayCodeSnapshot ? `Moved to bay ${targetBayCode}` : undefined,
          confirmedBy: 'Tower Operations Lead',
          confirmedAt: new Date().toISOString(),
        };
      } else if (toStatus === 'ISSUE_REPORTED') {
        payload.issue = {
          category: 'ACCESS',
          severity: 'MEDIUM',
          description: note || issueDesc || 'Bay obstruction or vehicle locked.',
        };
      } else if (toStatus === 'CANCELLED') {
        payload.cancellation = {
          reason: note || 'Cancelled from Tower Operations Console',
        };
      }

      // Operational Staff Authority
      const adminOperator: ActorContext = {
        type: 'STAFF',
        id: 'usr_ops_lead',
        name: adminEmail || 'Tower Operations Dispatcher',
        email: adminEmail || 'ops@triplea.qa',
        role: 'SUPERADMIN',
      };

      mockStore.transitionOrder(target.id, toStatus, payload, adminOperator);
      showToast(`Order ${target.reference} updated to ${toStatus}`);
      reloadData();
    } catch (err: unknown) {
      showToast(`Could not update: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openEditSub = (sub: EmployeeSubscription) => {
    const client = employees.find((e) => e.id === sub.employeeId);
    setEsForm({
      name: client?.fullName || '',
      phone: client?.phone || '',
      employeeNo: client?.employeeNo || '',
      left: mockStore.getCreditBalance(sub.employeeId),
      expiry: sub.expiresAt ? sub.expiresAt.slice(0, 10) : '',
      status: sub.status,
      reason: '',
    });
    setEsError('');
    setEditSub(sub);
  };

  const handleSaveEditSub = () => {
    if (!editSub) return;
    const name = esForm.name.trim();
    const digits = esForm.phone.replace(/\D/g, '');
    const number = esForm.employeeNo.trim();
    const left = Number(esForm.left);
    if (name.length < 2 || name.length > 80) return setEsError('Name must be 2 to 80 characters');
    if (digits.length < 8 || digits.length > 15) return setEsError('Phone number is not valid');
    if (!/^[\w-]{1,20}$/.test(number)) return setEsError('Employee number is not valid');
    if (!Number.isInteger(left) || left < 0 || left > 99) return setEsError('Washes left must be a whole number from 0 to 99');
    if (esForm.expiry && Number.isNaN(new Date(esForm.expiry).getTime())) return setEsError('End date is not valid');
    const current = mockStore.getCreditBalance(editSub.employeeId);
    if (left !== current && esForm.reason.trim().length < 3) return setEsError('Write a short reason for changing the washes left');

    try {
      const emp = employees.find((e) => e.id === editSub.employeeId);
      if (emp && (emp.fullName !== name || emp.phone !== esForm.phone.trim() || (emp.employeeNo || '') !== number)) {
        mockStore.updateEmployee(emp.id, { fullName: name, phone: esForm.phone.trim(), employeeNo: number });
      }
      mockStore.updateSubscription(
        editSub.id,
        {
          status: esForm.status,
          expiresAt: esForm.expiry ? new Date(`${esForm.expiry}T23:59:59`).toISOString() : null,
        },
        staffActor
      );
      if (left !== current) {
        mockStore.adjustCredit(editSub.employeeId, left - current, esForm.reason.trim(), staffActor);
      }
      showToast(`Saved changes for ${name}`);
      setEditSub(null);
      reloadData();
    } catch (err: unknown) {
      setEsError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  // Manual Credit Adjustment Action
  const handleSaveCreditAdjustment = () => {
    if (!creditModalClient) return;
    try {
      mockStore.adjustCredit(
        creditModalClient.id,
        creditAdjustmentAmount,
        creditAdjustmentReason || 'Admin Management Adjustment',
        staffActor
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
    // Cancelled orders are not revenue, and a wash paid with a pass credit was paid when the pass was bought
    const totalRevenueMinor = orders
      .filter((o) => o.status !== 'CANCELLED' && o.paymentMode === 'ONE_TIME')
      .reduce((acc, o) => acc + (o.priceSnapshot?.amountMinor || 0), 0);
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
  // The wash pass of a customer: washes left out of the washes it started with
  const passInfo = (employeeId: string) => {
    const left = mockStore.getCreditBalance(employeeId);
    const sub = mockStore.getEmployeeSubscription(employeeId);
    const granted = sub
      ? mockStore
          .getDb()
          .credits.filter((c) => c.subscriptionId === sub.id && c.type === 'GRANT')
          .reduce((sum, c) => sum + c.delta, 0)
      : 0;
    return { left, total: sub ? Math.max(left, granted) : left, active: !!sub };
  };

  // What kind of order this is: a single 20 QAR wash, the order that buys a 140 QAR pass, or a wash paid with the pass
  const orderKind = (o: Order) => {
    const amount = o.priceSnapshot?.amountMinor || 0;
    if (o.paymentMode !== 'CREDIT') {
      return { key: 'single' as const, label: `Single wash · ${formatQAR(amount)}`, tone: 'bg-fill text-body' };
    }
    if (amount >= 14000) {
      return { key: 'purchase' as const, label: `New pass · ${formatQAR(amount)}`, tone: 'bg-[#2997ff]/20 text-link-soft' };
    }
    return { key: 'pass' as const, label: 'Pass wash', tone: 'bg-[#2997ff]/15 text-link-soft' };
  };

  const renderKindBadge = (o: Order) => {
    const kind = orderKind(o);
    const pass = kind.key === 'single' ? null : passInfo(o.employeeId);
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums ${kind.tone}`}>
          {kind.label}
        </span>
        {pass && pass.active && (
          <span className="text-xs text-dim tabular-nums whitespace-nowrap">
            {pass.left} of {pass.total} left
          </span>
        )}
      </span>
    );
  };

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

  const navItems: { key: AdminTab; label: string; short: string; icon: React.ReactNode; count: number | null; hot?: boolean }[] = [
    { key: 'DISPATCH', label: 'Dispatch Queue', short: 'Dispatch', icon: <Layers className="h-[18px] w-[18px]" />, count: metrics.newQueue > 0 ? metrics.newQueue : null, hot: true },
    { key: 'CLIENTS', label: 'Clients & Registry', short: 'Clients', icon: <Users className="h-[18px] w-[18px]" />, count: metrics.totalClients },
    { key: 'SUBSCRIPTIONS', label: '140 QAR Passes', short: 'Passes', icon: <CreditCard className="h-[18px] w-[18px]" />, count: metrics.activeSubscribers },
    { key: 'BAYS', label: 'Tower Bays', short: 'Bays', icon: <MapPin className="h-[18px] w-[18px]" />, count: null },
    { key: 'INSIGHTS', label: 'Analytics', short: 'Insights', icon: <TrendingUp className="h-[18px] w-[18px]" />, count: null },
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

  // ---- Client panel ----
  const panelClient = clientPanelId ? employees.find((e) => e.id === clientPanelId) || null : null;
  const panelOrders = panelClient ? orders.filter((o) => o.employeeId === panelClient.id) : [];
  const panelLedger = panelClient
    ? mockStore
        .getDb()
        .credits.filter((c) => c.employeeId === panelClient.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const csvCell = (value: string | number | undefined) => {
    const text = String(value ?? '');
    // A cell that starts with = + - @ could run as a formula in Excel; a leading quote makes it plain text
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const exportClientsCsv = () => {
    const header = ['Name', 'Employee number', 'Phone', 'Company', 'Pass', 'Wash balance', 'Orders'];
    const rows = filteredClients.map((emp) => {
      const sub = mockStore.getEmployeeSubscription(emp.id);
      return [
        emp.fullName,
        emp.employeeNo || '',
        emp.phone || '',
        emp.company || '',
        sub && sub.status === 'ACTIVE' ? 'Active' : 'None',
        mockStore.getCreditBalance(emp.id),
        mockStore.getEmployeeOrders(emp.id).length,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Analytics: the last 7 days and the order mix ----
  const last7Days = (clock === null
    ? []
    : Array.from({ length: 7 }, (_, i) => {
        const d = new Date(clock);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - (6 - i));
        return d;
      })
  ).map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= day.getTime() && t < next.getTime() && o.status !== 'CANCELLED';
    });
    const revenue = dayOrders
      .filter((o) => o.paymentMode === 'ONE_TIME')
      .reduce((sum, o) => sum + (o.priceSnapshot?.amountMinor || 0), 0) / 100;
    return {
      label: day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      orders: dayOrders.length,
      revenue,
    };
  });
  const maxDayRevenue = Math.max(1, ...last7Days.map((d) => d.revenue));
  const statusMix = (['NEW', 'ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'RETURNED_TO_PARKING', 'CANCELLED', 'ISSUE_REPORTED'] as OrderStatus[])
    .map((st) => ({ status: st, count: orders.filter((o) => o.status === st).length }))
    .filter((x) => x.count > 0);

  const closeDialog = () => {
    setDialog(null);
    setDialogText('');
  };

  const confirmDialog = () => {
    if (!dialog) return;
    const text = dialogText.trim();
    if ((dialog.kind === 'issue' || dialog.kind === 'skipInspection') && !text) return;
    if (dialog.kind === 'cancel') handleTransition('CANCELLED', undefined, text || undefined);
    if (dialog.kind === 'qc') handleTransition('COMPLETED', undefined, text || undefined);
    if (dialog.kind === 'issue') handleTransition('ISSUE_REPORTED', undefined, text);
    if (dialog.kind === 'skipInspection' && selectedOrder) {
      try {
        mockStore.skipInspection(selectedOrder.id, text, staffActor);
        showToast('Inspection skipped. Start Wash is unlocked.');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not skip the inspection');
      }
    }
    if (dialog.kind === 'cancelSub' && dialog.subId) {
      mockStore.cancelSubscription(dialog.subId);
      showToast('Subscription cancelled');
      reloadData();
    }
    closeDialog();
  };

  const dialogConfig = {
    cancel: {
      title: 'Cancel this order?',
      body: selectedOrder ? `${selectedOrder.reference} will be cancelled. A pass credit is refunded automatically.` : '',
      label: 'Reason (optional)',
      placeholder: 'e.g. Customer asked to cancel',
      confirm: 'Cancel order',
      tone: 'danger',
    },
    qc: {
      title: 'Sign off quality check',
      body: 'Confirm the car is clean: surface dry, glass clear, tires dressed.',
      label: 'Notes (optional)',
      placeholder: 'e.g. Surface dry, streak-free',
      confirm: 'Sign off',
      tone: 'primary',
    },
    issue: {
      title: 'Report an issue',
      body: 'The order is put on hold until the issue is resolved.',
      label: 'What happened?',
      placeholder: 'e.g. Bay obstructed, vehicle locked',
      confirm: 'Report issue',
      tone: 'warning',
    },
    skipInspection: {
      title: 'Skip the inspection?',
      body: 'Only for an emergency, like a broken camera or no connection. Your name and the reason are saved on the order.',
      label: 'Reason (required)',
      placeholder: 'e.g. Phone camera is broken',
      confirm: 'Skip and unlock',
      tone: 'warning',
    },
    cancelSub: {
      title: 'Cancel this pass?',
      body: 'The client loses the pass. Washes already used stay in the history.',
      label: '',
      placeholder: '',
      confirm: 'Cancel pass',
      tone: 'danger',
    },
  } as const;

  // Global search results
  const gq = globalQuery.trim().toLowerCase();
  const searchOrders = gq
    ? orders
        .filter((o) => {
          const c = employees.find((e) => e.id === o.employeeId);
          return (
            o.reference.toLowerCase().includes(gq) ||
            o.bayCodeSnapshot === gq.replace(/\D/g, '') && gq.replace(/\D/g, '') !== '' ||
            o.vehicleSnapshot.plateNumber.toLowerCase().includes(gq) ||
            (c?.fullName || '').toLowerCase().includes(gq) ||
            (c?.phone || '').replace(/\D/g, '').includes(gq.replace(/\D/g, '') || '\u0000')
          );
        })
        .slice(0, 6)
    : [];
  const searchClients = gq
    ? employees
        .filter(
          (e) =>
            e.fullName.toLowerCase().includes(gq) ||
            (e.employeeNo || '').toLowerCase().includes(gq) ||
            (e.employeeNo || '').includes(gq) ||
            (e.phone || '').replace(/\D/g, '').includes(gq.replace(/\D/g, '') || '\u0000')
        )
        .slice(0, 5)
    : [];

  // Real analytics, calculated from the events and orders (no invented numbers)
  const turnaroundMinutes = (() => {
    const events = mockStore.getDb().orderEvents;
    const mins = orders
      .filter((o) => o.status === 'RETURNED_TO_PARKING')
      .map((o) => {
        const ev = events.find((e) => e.orderId === o.id && e.to === 'RETURNED_TO_PARKING');
        return ev ? (new Date(ev.createdAt).getTime() - new Date(o.createdAt).getTime()) / 60000 : null;
      })
      .filter((m): m is number => m !== null && m >= 0);
    return mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  })();
  const qcChecked = orders.filter((o) => o.qualityCheck);
  const qcPassRate = qcChecked.length
    ? Math.round((qcChecked.filter((o) => o.qualityCheck!.passed).length / qcChecked.length) * 100)
    : null;

  const staffActor: ActorContext = {
    type: 'STAFF',
    id: 'usr_ops_lead',
    name: adminEmail || 'TripleA Team',
    email: adminEmail || 'ops@triplea.qa',
    role: 'SUPERADMIN',
  };

  // Inspection of the selected order: Start Wash stays locked until it was sent (or skipped with a reason)
  const inspectionEnabled = mockStore.isInspectionEnabled();
  const selectedBefore = selectedOrder ? mockStore.getInspection(selectedOrder.id, 'BEFORE') : undefined;
  const selectedAfter = selectedOrder ? mockStore.getInspection(selectedOrder.id, 'AFTER') : undefined;
  const washLocked =
    !!selectedOrder &&
    inspectionEnabled &&
    requiresPreWashInspection(selectedOrder.status, 'IN_PROGRESS') &&
    !isCleared(selectedBefore);

  // Staff can only take a valid next step; everything else is disabled
  const canGo = (to: OrderStatus) =>
    !!selectedOrder && isValidStaffTransition(selectedOrder.status, to, selectedOrder.statusBeforeIssue);

  // Stages open one by one: inspection, then assign, then wash, then ready
  const inspectionDone = !inspectionEnabled || isCleared(selectedBefore);
  const st = selectedOrder?.status;
  const open2 = inspectionDone && canGo('ASSIGNED');
  const open3 = inspectionDone && canGo('IN_PROGRESS') && st !== 'NEW';
  const open4 = canGo('RETURNED_TO_PARKING') && st !== 'NEW' && st !== 'ASSIGNED';
  const lockHint = !inspectionDone ? 'Send the inspection first' : 'Finish the previous stage first';
  const stageShell = (active: boolean, locked = false) =>
    `rounded-2xl p-4 flex flex-col justify-between gap-4 transition ${
      active ? 'bg-raised ring-2 ring-[#2997ff]' : 'bg-inset'
    } ${locked ? 'opacity-50' : ''}`;
  const stagePrimary =
    'w-full py-2.5 rounded-full text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

  if (authState !== 'ok') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-5 font-sans text-center">
        {authState === 'checking' ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking your account</span>
          </div>
        ) : (
          <div className="max-w-[380px] space-y-4">
            <h1 className="text-[20px] font-semibold text-ink">No access to the dashboard</h1>
            <p className="text-sm text-muted">
              This account is not an admin. Ask the owner to give it the admin role, then sign in again.
            </p>
            <button
              onClick={handleSignOut}
              className="px-5 py-2.5 rounded-full bg-fill hover:bg-fill-strong text-ink text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full md:h-screen md:overflow-hidden flex flex-col md:flex-row bg-canvas text-body font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 md:bottom-6 end-4 md:end-6 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-raised text-ink text-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SIDEBAR                                                                */}
      {/* ---------------------------------------------------------------------- */}
      <aside className="hidden md:flex w-[76px] lg:w-[256px] flex-shrink-0 bg-sidebar flex-col py-5 px-3 lg:px-4">
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
            <span className="hidden lg:block text-sm text-body truncate flex-1">{adminEmail || actor.name || 'Admin'}</span>
            {getSupabase() && (
              <button
                onClick={handleSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="w-8 h-8 rounded-full hover:bg-fill text-muted hover:text-ink flex items-center justify-center flex-shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>


      {/* ---------------------------------------------------------------------- */}
      {/* BOTTOM NAVIGATION (phones)                                             */}
      {/* ---------------------------------------------------------------------- */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-sidebar flex justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                setActiveTab(item.key);
                setMobileDetail(false);
                window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
              }}
              aria-label={item.label}
              className={`relative flex flex-1 flex-col items-center gap-1 py-1.5 rounded-xl text-[11px] cursor-pointer ${
                active ? 'text-link' : 'text-muted'
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.hot && item.count ? (
                  <span className="absolute -top-1.5 -end-2.5 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-black text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </span>
              <span className="truncate max-w-full">{item.short}</span>
            </button>
          );
        })}
      </nav>

      {/* ---------------------------------------------------------------------- */}
      {/* MAIN                                                                   */}
      {/* ---------------------------------------------------------------------- */}
      <div className="flex-1 min-w-0 flex flex-col pb-[84px] md:pb-0">
        {/* Page header */}
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-4 md:px-8 pt-4 md:pt-6 pb-3 md:pb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-ink tracking-tight leading-tight truncate">{activeNav.label}</h1>
            <p className="hidden sm:block text-sm text-dim mt-0.5">Lusail Towers Parking · {TOTAL_BAYS.toLocaleString()} bays</p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <span className="inline-flex items-center gap-2 text-sm text-emerald-300 bg-emerald-400/10 px-2.5 md:px-3 py-1.5 rounded-full whitespace-nowrap" title="Live · Supabase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Live · Supabase</span>
            </span>
            <span className="hidden lg:inline text-sm text-dim tabular-nums whitespace-nowrap">
              {lastSyncTime
                ? lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Syncing'}
            </span>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center justify-center gap-2 h-9 w-9 md:w-auto md:px-4 rounded-full bg-tile hover:bg-raised text-sm text-muted hover:text-ink transition"
              aria-label="Search everything"
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden md:inline text-xs text-dim">Ctrl K</kbd>
            </button>
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
            {getSupabase() && (
              <button
                onClick={handleSignOut}
                className="md:hidden w-9 h-9 rounded-full bg-tile text-body flex items-center justify-center"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Key numbers */}
        <div
          className={`flex-shrink-0 px-4 md:px-8 pb-4 md:pb-5 gap-3 ${
            mobileDetail && activeTab === 'DISPATCH'
              ? 'hidden min-[1360px]:grid min-[1360px]:grid-cols-6'
              : 'flex overflow-x-auto md:overflow-visible md:grid md:grid-cols-3 xl:grid-cols-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          }`}
        >
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-tile px-4 py-3 min-w-[136px] flex-shrink-0 md:min-w-0">
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

        <main className="md:flex-1 md:min-h-0 md:overflow-hidden">
          {/* ================================================================== */}
          {/* DISPATCH                                                           */}
          {/* ================================================================== */}
          {activeTab === 'DISPATCH' && (
            <div className="md:h-full flex gap-5 px-4 md:px-8 pb-6">
              {/* Queue */}
              <aside className={`${mobileDetail ? 'hidden min-[1360px]:flex' : 'flex'} w-full min-[1360px]:w-[380px] 2xl:w-[420px] flex-shrink-0 flex-col min-h-0`}>
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
                          onClick={() => openOrder(ord.id)}
                          className={`p-4 rounded-2xl cursor-pointer transition flex items-start gap-3 ${
                            isSelected
                              ? 'bg-tile min-[1360px]:bg-raised min-[1360px]:ring-2 min-[1360px]:ring-[#2997ff]'
                              : 'bg-tile hover:bg-tile-hover'
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
                              {ord.reference} · {ord.serviceSnapshot.name}
                            </div>
                            <div className="pt-1">{renderKindBadge(ord)}</div>
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
              <section className={`${mobileDetail ? 'block' : 'hidden min-[1360px]:block'} flex-1 min-w-0 md:overflow-y-auto pe-1`}>
                {selectedOrder ? (
                  <div className="max-w-[980px] space-y-4">
                    <button
                      onClick={() => setMobileDetail(false)}
                      className="min-[1360px]:hidden flex items-center gap-1.5 text-sm text-link py-1 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Back to the queue</span>
                    </button>
                    {/* Order header */}
                    <div className={`${card} p-4 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-[24px] leading-none font-semibold text-ink tracking-tight tabular-nums">
                            {selectedOrder.reference}
                          </h2>
                          {renderStatusPill(selectedOrder.status)}
                          {renderKindBadge(selectedOrder)}
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

                      {canGo('CANCELLED') && (
                        <button
                          onClick={() => setDialog({ kind: 'cancel' })}
                          className="px-4 py-2 rounded-full bg-fill-soft hover:bg-rose-400/15 text-body hover:text-rose-300 text-sm transition cursor-pointer whitespace-nowrap"
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>

                    {/* Pre-wash inspection: comes first, and opens Start Wash */}
                    <InspectionCard
                      order={selectedOrder}
                      before={selectedBefore}
                      after={selectedAfter}
                      enabled={inspectionEnabled}
                      onStart={(phase) => setInspectionFlow({ phase, editing: false })}
                      onEdit={(phase) => setInspectionFlow({ phase, editing: true })}
                      onSkip={() => setDialog({ kind: 'skipInspection' })}
                      onView={() => setInspectionViewOpen(true)}
                    />

                    {/* Progression */}
                    <div className={`${card} p-4 md:p-6 space-y-5`}>
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
                            disabled={selectedOrder.status === 'NEW' || !canGo('NEW')}
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
                        <div className={stageShell(selectedOrder.status === 'ASSIGNED', !open2 && selectedOrder.status !== 'ASSIGNED' && !selectedOrder.assignment)}>
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
                            <div className="w-full bg-raised rounded-xl px-3 py-2 text-sm text-ink">TripleA Team</div>
                          </div>
                          <button
                            onClick={() => handleTransition('ASSIGNED')}
                            disabled={!open2 || selectedOrder.status === 'ASSIGNED'}
                            className={`${stagePrimary} bg-[#0071e3] hover:bg-[#0077ed] text-white`}
                          >
                            <User className="h-4 w-4" />
                            <span>{selectedOrder.status === 'ASSIGNED' ? 'Team assigned' : !open2 && st === 'NEW' ? lockHint : 'Assign team'}</span>
                          </button>
                        </div>

                        {/* Stage 3 */}
                        <div className={stageShell(stageIsCleaning, !open3 && !stageIsCleaning && !stageIsReady)}>
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
                            disabled={!open3 || washLocked}
                            className={`${stagePrimary} ${
                              selectedOrder.status === 'IN_PROGRESS'
                                ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                                : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
                            }`}
                          >
                            <Sparkles className="h-4 w-4" />
                            <span>{selectedOrder.status === 'IN_PROGRESS' ? 'Detailing Active' : !open3 ? (st === 'NEW' ? lockHint : washLocked ? 'Inspect the car first' : 'Start Wash') : 'Start Wash'}</span>
                          </button>
                        </div>

                        {/* Stage 4 */}
                        <div className={stageShell(stageIsReady, !open4 && !stageIsReady)}>
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
                            disabled={!open4}
                            className={`${stagePrimary} ${
                              stageIsReady
                                ? 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                                : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{selectedOrder.status === 'RETURNED_TO_PARKING' ? 'Confirmed Ready' : !open4 && (st === 'NEW' || st === 'ASSIGNED') ? lockHint : 'Mark Ready'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                      <div className="xl:col-span-3 space-y-4">
                        {/* Customer */}
                        <div className={`${card} p-4 md:p-6 space-y-4`}>
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
                              <dt className={subtle}>Employee number</dt>
                              <dd className="mt-1 text-[14px] text-ink font-medium tabular-nums">
                                {selectedOrderClient?.employeeNo || <span className="text-dim">—</span>}
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
                        <div className={`${card} p-4 md:p-6 space-y-4`}>
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
                            <div className="col-span-2 rounded-2xl bg-inset p-4">
                              <dt className={subtle}>Payment</dt>
                              {(() => {
                                const kind = orderKind(selectedOrder);
                                const pass = passInfo(selectedOrder.employeeId);
                                const amount = formatQAR(selectedOrder.priceSnapshot?.amountMinor || 0);
                                return (
                                  <dd className="mt-1 space-y-1 tabular-nums">
                                    <div className="text-[14px] text-ink font-semibold">
                                      {kind.key === 'single'
                                        ? `Single wash · ${amount}`
                                        : kind.key === 'purchase'
                                          ? `Wash pass purchased · ${amount}`
                                          : 'Paid with the wash pass'}
                                    </div>
                                    {kind.key === 'single' && (
                                      <div className="text-sm text-muted">
                                        {selectedOrder.paymentStatus === 'PAID_OFFLINE' ? 'Paid' : 'To be paid at handover'}
                                      </div>
                                    )}
                                    {kind.key !== 'single' && (
                                      <div className="text-sm text-muted">
                                        {pass.active
                                          ? `${pass.left} of ${pass.total} washes left on this customer's pass`
                                          : 'No active pass'}
                                      </div>
                                    )}
                                  </dd>
                                );
                              })()}
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
                            <h3 className="text-base font-semibold text-ink">Assigned team</h3>
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
                                  <span className="text-xs text-dim">Operations team</span>
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
                            <p className="text-sm text-dim">Use Stage 2 above to assign the TripleA Team.</p>
                          )}
                        </div>

                        {/* QC and issues */}
                        <div className={`${card} p-5 space-y-3`}>
                          <h3 className="text-base font-semibold text-ink">Operational Escalation &amp; QC</h3>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setDialog({ kind: 'qc' })}
                              disabled={!canGo('COMPLETED')}
                              className="py-2.5 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Award className="h-4 w-4" />
                              <span>Sign-off QC</span>
                            </button>

                            <button
                              onClick={() => setDialog({ kind: 'issue' })}
                              disabled={!canGo('ISSUE_REPORTED')}
                              className="py-2.5 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-sm text-amber-300 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <div className={`${card} p-4 md:p-6 space-y-4`}>
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
            <div className="md:h-full md:overflow-y-auto px-4 md:px-8 pb-10">
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

                <div className="flex justify-end">
                  <button
                    onClick={exportClientsCsv}
                    disabled={filteredClients.length === 0}
                    className="px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Export CSV ({filteredClients.length})
                  </button>
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
                              <td className="py-3.5 px-5 cursor-pointer" onClick={() => setClientPanelId(emp.id)} title="Open client">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-raised flex items-center justify-center text-sm font-semibold text-ink flex-shrink-0">
                                    {emp.fullName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-ink block">{emp.fullName}</span>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-dim tabular-nums">
                                      <span>{emp.employeeNo || `MOCI-${(emp.phone || '').slice(-4)}`}</span>
                                      {emp.employeeNo && <span>Employee no: {emp.employeeNo}</span>}
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
            <div className="md:h-full md:overflow-y-auto px-4 md:px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className={`${card} p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5`}>
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
                                  {client?.employeeNo && <span>Employee no: {client.employeeNo}</span>}
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
                                {sub.expiresAt && (
                                  <span className="block text-xs text-dim">Ends {formatDateTime(sub.expiresAt).split(',')[0]}</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => openEditSub(sub)}
                                  className="me-2 px-3.5 py-1.5 rounded-full bg-fill hover:bg-fill-strong text-ink text-sm transition cursor-pointer"
                                >
                                  Edit
                                </button>
                                {sub.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => setDialog({ kind: 'cancelSub', subId: sub.id })}
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
            <div className="md:h-full md:overflow-y-auto px-4 md:px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className={`${card} p-4 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5`}>
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
                              openOrder(activeBayOrder.id);
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
            <div className="md:h-full md:overflow-y-auto px-4 md:px-8 pb-10">
              <div className="max-w-[1200px] space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className={`${card} p-4 md:p-6 space-y-4`}>
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

                  <div className={`${card} p-4 md:p-6 space-y-4`}>
                    <h3 className="text-base font-semibold text-ink">Operational SLA</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Average Turnaround</span>
                        <span className="tabular-nums text-ink">{turnaroundMinutes === null ? 'No data yet' : `${turnaroundMinutes} min`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">QC Pass Rate</span>
                        <span className="tabular-nums text-ink">{qcPassRate === null ? 'No data yet' : `${qcPassRate}%`}</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-line">
                      <div className="text-sm text-muted">Bay Coverage</div>
                      <div className="text-[24px] leading-none mt-1.5 font-semibold text-ink tabular-nums">
                        1,200 <span className="text-sm text-dim font-normal">Bays</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${card} p-4 md:p-6 space-y-4`}>
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className={`${card} p-4 md:p-6 space-y-4 lg:col-span-2`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-ink">Revenue, last 7 days</h3>
                      <span className="text-sm text-dim tabular-nums">
                        {last7Days.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()} QAR
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-3 items-end h-40">
                      {last7Days.map((d) => (
                        <div key={d.label} className="flex flex-col items-center justify-end gap-2 h-full">
                          <span className="text-xs text-muted tabular-nums">{d.revenue > 0 ? d.revenue : ''}</span>
                          <div
                            className="w-full rounded-lg bg-[#0071e3]"
                            style={{ height: `${Math.max(4, (d.revenue / maxDayRevenue) * 100)}%`, opacity: d.revenue > 0 ? 1 : 0.25 }}
                            title={`${d.orders} orders`}
                          />
                          <span className="text-xs text-dim whitespace-nowrap">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`${card} p-4 md:p-6 space-y-4`}>
                    <h3 className="text-base font-semibold text-ink">Orders by status</h3>
                    {statusMix.length === 0 ? (
                      <p className="text-sm text-dim">No orders yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {statusMix.map((x) => (
                          <div key={x.status} className="flex items-center justify-between gap-3">
                            {renderStatusPill(x.status)}
                            <span className="text-sm text-ink tabular-nums font-semibold">{x.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className={`${card} p-4 md:p-6 space-y-4`}>
                  <h3 className="text-base font-semibold text-ink">TripleA Team</h3>
                  <div className="p-4 rounded-2xl bg-inset flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-raised flex items-center justify-center font-semibold text-sm text-ink flex-shrink-0">
                        T
                      </div>
                      <span className="font-medium text-ink truncate">TripleA Team</span>
                    </div>
                    <span className="text-sm tabular-nums text-muted whitespace-nowrap">
                      {orders.filter((o) => o.assignment && o.status !== 'RETURNED_TO_PARKING' && o.status !== 'CANCELLED').length} active orders
                    </span>
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
      {panelClient && (
        <div className="fixed inset-0 z-40 bg-scrim" onClick={() => setClientPanelId(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Client"
            className="absolute inset-y-0 end-0 w-full max-w-[460px] bg-sidebar overflow-y-auto p-6 space-y-5 animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-ink tracking-tight truncate">{panelClient.fullName}</h3>
                <p className="text-sm text-dim tabular-nums">
                  {panelClient.employeeNo || ''} {panelClient.status === 'SUSPENDED' ? '· Suspended' : ''}
                </p>
              </div>
              <button
                onClick={() => setClientPanelId(null)}
                className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-ink flex items-center justify-center flex-shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-tile p-4">
                <dt className="text-xs text-dim">Phone</dt>
                <dd className="mt-1 text-ink tabular-nums">{panelClient.phone || '—'}</dd>
              </div>
              <div className="rounded-2xl bg-tile p-4">
                <dt className="text-xs text-dim">Employee number</dt>
                <dd className="mt-1 text-ink tabular-nums">{panelClient.employeeNo || '—'}</dd>
              </div>
              <div className="rounded-2xl bg-tile p-4">
                <dt className="text-xs text-dim">Wash balance</dt>
                <dd className="mt-1 text-ink font-semibold tabular-nums">{mockStore.getCreditBalance(panelClient.id)}</dd>
              </div>
              <div className="rounded-2xl bg-tile p-4">
                <dt className="text-xs text-dim">Pass</dt>
                <dd className="mt-1 text-ink">
                  {mockStore.getEmployeeSubscription(panelClient.id)?.status === 'ACTIVE' ? 'Active' : 'None'}
                </dd>
              </div>
            </dl>

            <div className="flex gap-2">
              <button
                onClick={() => setCreditModalClient(panelClient)}
                className="flex-1 py-2.5 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink"
              >
                + Credits
              </button>
              {mockStore.getEmployeeSubscription(panelClient.id)?.status !== 'ACTIVE' && (
                <button
                  onClick={() => handleActivateSubscription(panelClient)}
                  className="flex-1 py-2.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-sm text-white"
                >
                  Activate pass
                </button>
              )}
            </div>

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-ink">Orders ({panelOrders.length})</h4>
              {panelOrders.length === 0 ? (
                <p className="text-sm text-dim">No orders yet.</p>
              ) : (
                panelOrders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      openOrder(o.id);
                      setActiveTab('DISPATCH');
                      setClientPanelId(null);
                    }}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl bg-tile hover:bg-tile-hover px-4 py-3 text-start"
                  >
                    <span className="min-w-0">
                      <span className="text-sm text-ink tabular-nums block">{o.reference} · Bay {o.bayCodeSnapshot}</span>
                      <span className="text-xs text-dim tabular-nums">{formatDateTime(o.createdAt)}</span>
                    </span>
                    {renderStatusPill(o.status)}
                  </button>
                ))
              )}
            </section>

            <section className="space-y-2 pb-6">
              <h4 className="text-sm font-semibold text-ink">Wash credit history</h4>
              {panelLedger.length === 0 ? (
                <p className="text-sm text-dim">No credit activity yet.</p>
              ) : (
                panelLedger.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-tile px-4 py-3">
                    <span className="min-w-0">
                      <span className="text-sm text-ink block truncate">{c.reason || c.type}</span>
                      <span className="text-xs text-dim tabular-nums">{formatDateTime(c.createdAt)} · {c.type}</span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${c.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {c.delta > 0 ? '+' : ''}{c.delta}
                    </span>
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4" onClick={closeDialog}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={dialogConfig[dialog.kind].title}
            className="w-full max-w-[420px] bg-tile rounded-3xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h4 className="text-lg font-semibold text-ink tracking-tight">{dialogConfig[dialog.kind].title}</h4>
              <p className="text-sm text-muted mt-1">{dialogConfig[dialog.kind].body}</p>
            </div>

            {dialogConfig[dialog.kind].label && (
              <div>
                <label htmlFor="dialog-text" className="text-sm text-body block mb-2">{dialogConfig[dialog.kind].label}</label>
                <textarea
                  id="dialog-text"
                  autoFocus
                  rows={3}
                  value={dialogText}
                  onChange={(e) => setDialogText(e.target.value)}
                  placeholder={dialogConfig[dialog.kind].placeholder}
                  className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink placeholder-dim resize-none"
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={confirmDialog}
                disabled={(dialog.kind === 'issue' || dialog.kind === 'skipInspection') && !dialogText.trim()}
                className={`flex-1 py-3 rounded-full text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  dialogConfig[dialog.kind].tone === 'danger'
                    ? 'bg-rose-500 hover:bg-rose-400 text-white'
                    : dialogConfig[dialog.kind].tone === 'warning'
                    ? 'bg-amber-400 hover:bg-amber-300 text-black'
                    : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'
                }`}
              >
                {dialogConfig[dialog.kind].confirm}
              </button>
              <button onClick={closeDialog} className="px-5 py-3 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink">
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="w-full max-w-[560px] bg-tile rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <Search className="h-5 w-5 text-dim flex-shrink-0" />
              <input
                autoFocus
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Order, plate, bay, client, phone or employee number"
                className="w-full bg-transparent text-[15px] text-ink placeholder-dim outline-none"
              />
              <kbd className="text-xs text-dim">Esc</kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
              {!gq ? (
                <p className="px-3 py-6 text-sm text-dim text-center">Start typing to search orders and clients.</p>
              ) : searchOrders.length === 0 && searchClients.length === 0 ? (
                <p className="px-3 py-6 text-sm text-dim text-center">Nothing found.</p>
              ) : (
                <>
                  {searchOrders.length > 0 && <p className="px-3 pt-2 pb-1 text-xs text-dim">Orders</p>}
                  {searchOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        openOrder(o.id);
                        setActiveTab('DISPATCH');
                        setSearchQuery('');
                        setStatusFilter('ALL');
                        setSearchOpen(false);
                        setGlobalQuery('');
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-fill text-start"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-ink tabular-nums block truncate">
                          {o.reference} · Bay {o.bayCodeSnapshot}
                        </span>
                        <span className="text-xs text-dim block truncate">
                          {o.vehicleSnapshot.plateNumber} · {employees.find((e) => e.id === o.employeeId)?.fullName || 'Client'}
                        </span>
                      </span>
                      {renderStatusPill(o.status)}
                    </button>
                  ))}

                  {searchClients.length > 0 && <p className="px-3 pt-3 pb-1 text-xs text-dim">Clients</p>}
                  {searchClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setClientSearchQuery(c.fullName);
                        setActiveTab('CLIENTS');
                        setSearchOpen(false);
                        setGlobalQuery('');
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-fill text-start"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-ink block truncate">{c.fullName}</span>
                        <span className="text-xs text-dim block truncate tabular-nums">
                          {c.employeeNo || ''} {c.phone ? `· ${c.phone}` : ''}
                        </span>
                      </span>
                      <Users className="h-4 w-4 text-dim flex-shrink-0" />
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {inspectionFlow && selectedOrder && (
        <InspectionFlow
          key={`${selectedOrder.id}-${inspectionFlow.phase}-${inspectionFlow.editing}`}
          order={selectedOrder}
          phase={inspectionFlow.phase}
          editing={inspectionFlow.editing}
          actor={staffActor}
          onClose={() => setInspectionFlow(null)}
          onDone={(message) => showToast(message)}
        />
      )}

      {inspectionViewOpen && selectedOrder && selectedBefore && (
        <InspectionViewer
          title={`Inspection · ${selectedOrder.reference}`}
          before={selectedBefore}
          after={selectedAfter?.status === 'SUBMITTED' ? selectedAfter : undefined}
          onOpenImage={(url) => setLightboxPhoto(url)}
          onClose={() => setInspectionViewOpen(false)}
        />
      )}

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
      {editSub && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-[460px] max-h-[92dvh] overflow-y-auto bg-tile rounded-3xl p-5 md:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-sm text-dim">Edit subscriber</span>
                <h4 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{esForm.name || 'Subscriber'}</h4>
                <span className="text-xs tabular-nums text-dim">{editSub.id}</span>
              </div>
              <button
                onClick={() => setEditSub(null)}
                className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition cursor-pointer flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="text-body block mb-1.5" htmlFor="es-name">Full name</label>
                <input
                  id="es-name"
                  type="text"
                  value={esForm.name}
                  onChange={(e) => setEsForm({ ...esForm, name: e.target.value })}
                  className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body block mb-1.5" htmlFor="es-phone">Qatar mobile</label>
                  <input
                    id="es-phone"
                    type="tel"
                    value={esForm.phone}
                    onChange={(e) => setEsForm({ ...esForm, phone: e.target.value })}
                    className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-body block mb-1.5" htmlFor="es-no">Employee number</label>
                  <input
                    id="es-no"
                    type="text"
                    value={esForm.employeeNo}
                    onChange={(e) => setEsForm({ ...esForm, employeeNo: e.target.value })}
                    className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body block mb-1.5" htmlFor="es-left">Washes left</label>
                  <div className="flex items-center bg-raised rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setEsForm({ ...esForm, left: Math.max(0, Number(esForm.left) - 1) })}
                      className="w-11 h-11 text-lg text-ink cursor-pointer"
                      aria-label="One less"
                    >
                      −
                    </button>
                    <input
                      id="es-left"
                      type="number"
                      min={0}
                      max={99}
                      value={esForm.left}
                      onChange={(e) => setEsForm({ ...esForm, left: Number(e.target.value) })}
                      className="flex-1 min-w-0 bg-transparent text-center text-sm text-ink outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setEsForm({ ...esForm, left: Math.min(99, Number(esForm.left) + 1) })}
                      className="w-11 h-11 text-lg text-ink cursor-pointer"
                      aria-label="One more"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-body block mb-1.5" htmlFor="es-end">Pass ends</label>
                  <input
                    id="es-end"
                    type="date"
                    value={esForm.expiry}
                    onChange={(e) => setEsForm({ ...esForm, expiry: e.target.value })}
                    className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none tabular-nums"
                  />
                </div>
              </div>

              {Number(esForm.left) !== mockStore.getCreditBalance(editSub.employeeId) && (
                <div>
                  <label className="text-body block mb-1.5" htmlFor="es-reason">Reason for changing the washes left</label>
                  <input
                    id="es-reason"
                    type="text"
                    value={esForm.reason}
                    onChange={(e) => setEsForm({ ...esForm, reason: e.target.value })}
                    className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink outline-none"
                  />
                </div>
              )}

              <div>
                <span className="text-body block mb-1.5">Status</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['ACTIVE', 'CANCELLED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEsForm({ ...esForm, status: st })}
                      className={`py-2.5 rounded-full font-medium transition cursor-pointer ${
                        esForm.status === st ? 'bg-ink text-canvas' : 'bg-fill text-ink hover:bg-fill-strong'
                      }`}
                    >
                      {st === 'ACTIVE' ? 'Active' : 'Cancelled'}
                    </button>
                  ))}
                </div>
              </div>

              {esError && (
                <p role="alert" className="text-sm text-rose-300">
                  {esError}
                </p>
              )}

              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={handleSaveEditSub}
                  className="flex-1 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold transition cursor-pointer active:scale-95"
                >
                  Save changes
                </button>
                <button
                  onClick={() => setEditSub(null)}
                  className="px-5 py-3 rounded-full bg-fill hover:bg-fill-strong text-body transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {creditModalClient && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-tile rounded-3xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm text-dim">Wash Balance Adjustment</span>
                <h4 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{creditModalClient.fullName}</h4>
                {creditModalClient.employeeNo && (
                  <span className="text-xs tabular-nums text-dim">Employee no: {creditModalClient.employeeNo}</span>
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
                {historyModalClient.employeeNo && (
                  <span className="text-xs tabular-nums text-dim">Employee no: {historyModalClient.employeeNo}</span>
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
