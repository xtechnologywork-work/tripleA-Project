'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { mockStore } from '@/data/mock/store';
import { TOTAL_BAYS } from '@/data/mock/seed';
import { compressImage } from '@/lib/image';
import type { ActorContext } from '@/domain/status-machine';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Vehicle, Employee } from '@/domain/types';
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Zap,
  MapPin,
  Gift,
  X,
  Camera,
  Check,
  User,
  KeyRound,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Globe,
  Phone,
  CheckCircle2,
  Edit3,
  Car,
  Clock,
  LogOut,
  MessageSquare,
  BadgeCheck,
  Trash2,
  AlertCircle,
  Smartphone,
  Bell,
} from 'lucide-react';

import { EmployeeNotifications } from '@/components/notifications/employee-notifications';
import { AddToHomeScreen } from '@/components/notifications/add-to-home-screen';
import { SUPPORT_WHATSAPP, SUPPORT_CALL } from '@/lib/support';
import { OtpCode } from '@/components/auth/otp-code';
import { qatarMobile } from '@/domain/otp';
import { StatusBadge } from '@/components/ui/status-badge';

type PortalMode = 'UNSELECTED' | 'EMPLOYEE';

function BayOrderingClientScreen() {
  const router = useRouter();
  const { setActor } = useAuth();
  const { toggleLanguage, isRtl, t } = useLanguage();


  // Portal selection state
  const [portalMode, setPortalMode] = useState<PortalMode>('UNSELECTED');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  // A new account is made only after the person has checked the number on screen (a typo would start a second, empty account)
  const [confirmNumber, setConfirmNumber] = useState<string | null>(null);
  const [employeePhone, setEmployeePhone] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [showContactNoticeModal, setShowContactNoticeModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // After sign in: first add to the Home Screen (phones), then turn on notifications
  const [installStepDone, setInstallStepDone] = useState(false);
  const finishInstallStep = useCallback(() => setInstallStepDone(true), []);
  // Opened by hand from the profile
  const [profilePrompt, setProfilePrompt] = useState<'install' | 'notif' | null>(null);
  const closeProfilePrompt = useCallback(() => setProfilePrompt(null), []);

  // Vehicle form state (declared before the sync effect that populates it)
  const [plateNumber, setPlateNumber] = useState('');
  const [plateType] = useState('Private');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editQid, setEditQid] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editMakeModel, setEditMakeModel] = useState('');
  const [editColor, setEditColor] = useState('');
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // The phone saved on this device pre-fills the sign-in field (once)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration sync from localStorage
      setEmployeePhone(localStorage.getItem('cb_active_employee_phone') || '');
    } catch {
      // Ignore
    }
  }, []);

  // Re-read the account whenever the data changes (live updates from the server)
  useEffect(() => mockStore.subscribe(() => setRefreshTrigger((n) => n + 1)), []);

  // Tell the employee when the server could not save something
  useEffect(() => {
    return mockStore.onSyncIssue(() => {
      setNotice(t('saveFailedNotice'));
      setTimeout(() => setNotice(''), 5000);
    });
  }, [t]);

  // Load the signed-in employee and their vehicle
  useEffect(() => {
    try {
      const savedPhone = localStorage.getItem('cb_active_employee_phone') || '';
      const emp = savedPhone && mockStore.getEmployeeToken() ? mockStore.getEmployeeByPhone(savedPhone) : undefined;
      if (!emp) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- no session: nobody is signed in
        setCurrentEmployee(null);
        return;
      }
      setCurrentEmployee(emp);
      setEditName(emp.fullName || '');
      setEditPhone(emp.phone || savedPhone);
      setEditQid(emp.qid || '');
      const vehs = mockStore.getEmployeeVehicles(emp.id);
      if (vehs.length > 0) {
        const v = vehs[0];
        setEditPlate(v.plateNumber);
        setEditMakeModel(`${v.make || ''} ${v.model || ''}`.trim());
        setEditColor(v.color || '');
        setPlateNumber(v.plateNumber);
        setMake(v.make || '');
        setModel(v.model || '');
        setColor(v.color || '');
      }
    } catch {
      // Ignore
    }
  }, [refreshTrigger]);

  const handleSaveProfile = () => {
    if (!currentEmployee) return;

    // Check the form here, so a mistake is explained instead of silently not saving
    const nameTrim = editName.trim();
    const phoneDigits = editPhone.replace(/\D/g, '');
    if (nameTrim.length < 2 || nameTrim.length > 80) {
      setProfileError(t('nameRequiredError'));
      return;
    }
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      setProfileError(t('phoneError'));
      return;
    }
    if (editPlate.trim().length > 20 || editColor.trim().length > 40 || editMakeModel.trim().length > 80) {
      setProfileError(t('genericAuthError'));
      return;
    }
    setProfileError('');

    const parts = editMakeModel.trim().split(' ');
    const newMake = parts[0] || '';
    const newModel = parts.slice(1).join(' ');

    const updatedEmp = mockStore.updateEmployee(currentEmployee.id, {
      fullName: editName.trim() || currentEmployee.fullName,
      phone: editPhone.trim() || currentEmployee.phone,
      qid: editQid.trim() || currentEmployee.qid,
    });
    if (updatedEmp) {
      setCurrentEmployee({ ...updatedEmp });
      setEditQid(updatedEmp.qid || '');
      const digits = editPhone.replace(/\D/g, '');
      if (digits.length >= 8) {
        try {
          localStorage.setItem('cb_active_employee_phone', digits.slice(-8));
        } catch {
          // Ignore
        }
      }
    }

    // A vehicle is saved only when a plate number was entered
    if (editPlate.trim()) {
      const existingVehId = mockStore.getEmployeeVehicles(currentEmployee.id)[0]?.id;
      const updatedVeh = mockStore.saveEmployeeVehicle(currentEmployee.id, {
        id: existingVehId,
        plateNumber: editPlate.trim(),
        make: newMake,
        model: newModel,
        color: editColor.trim(),
        isDefault: true,
      });
      setPlateNumber(updatedVeh.plateNumber);
      setMake(updatedVeh.make || '');
      setModel(updatedVeh.model || '');
      setColor(updatedVeh.color || '');
    }

    setIsEditingProfile(false);
    setProfileSaveSuccess(true);
    setTimeout(() => setProfileSaveSuccess(false), 3000);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Reopening the app on a device that is already signed in goes straight to the account
  useEffect(() => {
    try {
      const savedPhone = localStorage.getItem('cb_active_employee_phone') || '';
      if (mockStore.getEmployeeToken() && savedPhone && mockStore.getEmployeeByPhone(savedPhone)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the session on load
        setPortalMode('EMPLOYEE');
      }
    } catch {
      // Ignore
    }
  }, []);

  // Every time the screen changes (gate <-> ordering), start at the top of the page
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [portalMode]);

  // The gate: already signed in on this device goes straight in; otherwise sign in or sign up
  const enterEmployeePortal = () => {
    const savedPhone = (() => {
      try {
        return localStorage.getItem('cb_active_employee_phone') || '';
      } catch {
        return '';
      }
    })();
    if (mockStore.getEmployeeToken() && savedPhone && mockStore.getEmployeeByPhone(savedPhone)) {
      try {
        sessionStorage.setItem('triplea_portal_mode', 'EMPLOYEE');
      } catch {
        // Ignore
      }
      setPortalMode('EMPLOYEE');
      return;
    }
    setAuthMode('LOGIN');
    setShowPhoneModal(true);
    setPhoneError('');
  };

  // Scanning the QR code lands here with ?src=qr: remember it, tidy the address, and open the sign in sheet
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('src') !== 'qr') return;
      localStorage.setItem('triplea_src', 'qr');
      window.history.replaceState(null, '', window.location.pathname);
      if (!mockStore.getEmployeeToken()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- open the sign in sheet for someone who scanned the code
        setAuthMode('LOGIN');
        setShowPhoneModal(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Step 2 of sign in: the code sent by SMS
  const [otp, setOtp] = useState<{ phone: string; action: 'login' | 'signup'; pending?: string; resendAt: number } | null>(null);
  const [otpError, setOtpError] = useState('');
  const [otpErrorKey, setOtpErrorKey] = useState(0);

  const authErrorText = (code: string | undefined): string => {
    const errors: Record<string, string> = {
      NOT_FOUND: t('accountNotFoundError'),
      EXISTS: t('accountExistsError'),
      TOO_MANY: t('tooManyAttemptsError'),
      SUSPENDED: t('accountSuspendedError'),
      BAD_NAME: t('nameRequiredError'),
      BAD_EMPLOYEE_NO: t('employeeNoRequiredError'),
      NOT_ALLOWED: t('signUpNotAllowedError'),
      BAD_PHONE: t('phoneError'),
      WRONG_CODE: t('otpWrong'),
      EXPIRED: t('otpExpired'),
      BLOCKED: t('otpBlocked'),
      NOT_READY: t('otpNotReady'),
    };
    return (code && errors[code]) || t('genericAuthError');
  };

  const qrSource = (): string | undefined => {
    try {
      return localStorage.getItem('triplea_src') === 'qr' ? 'qr' : undefined;
    } catch {
      return undefined;
    }
  };

  /** Asks the server to send a code. Returns the server's answer. */
  const requestCode = async (action: 'login' | 'signup', phone: string) => {
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        phone,
        fullName: employeeName.trim(),
        employeeNo: employeeNumber.trim(),
        lang: isRtl ? 'ar' : 'en',
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  /** Step 2: checks the code (or none, when codes are switched off) and signs the person in. */
  const finishAuth = async (state: { phone: string; action: 'login' | 'signup'; pending?: string }, code?: string): Promise<string | null> => {
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: state.action, phone: state.phone, code, pending: state.pending, source: qrSource() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.employee || !data.token) return data.error || 'FAILED';

    const employee = data.employee as Employee;
    try {
      localStorage.removeItem('triplea_src'); // counted once
    } catch {
      // Ignore
    }
    mockStore.adoptEmployee(employee, data.token);
    setCurrentEmployee(employee);
    setActor({ type: 'EMPLOYEE', id: employee.id, name: employee.fullName, email: employee.email });
    try {
      localStorage.setItem('cb_active_employee_phone', state.phone);
      sessionStorage.setItem('triplea_portal_mode', 'EMPLOYEE');
    } catch {
      // Ignore
    }
    setOtp(null);
    setOtpError('');
    setShowPhoneModal(false);
    setPortalMode('EMPLOYEE');
    if (state.action === 'signup') setShowContactNoticeModal(true);
    setRefreshTrigger((prev) => prev + 1);
    return null;
  };

  const submitCode = async (code: string) => {
    if (!otp || authBusy) return;
    setAuthBusy(true);
    setOtpError('');
    try {
      const error = await finishAuth(otp, code);
      if (error) {
        if (error === 'EXPIRED' && otp.action === 'signup') {
          // The sign-up details timed out: back to the form
          setOtp(null);
          setPhoneError(t('otpStartAgain'));
          return;
        }
        setOtpError(authErrorText(error));
        setOtpErrorKey((k) => k + 1);
      }
    } catch {
      setOtpError(t('genericAuthError'));
      setOtpErrorKey((k) => k + 1);
    } finally {
      setAuthBusy(false);
    }
  };

  const resendCode = async (): Promise<boolean> => {
    if (!otp) return false;
    try {
      const { ok, data } = await requestCode(otp.action, otp.phone);
      if (!ok) {
        setOtpError(authErrorText(data.error));
        setOtpErrorKey((k) => k + 1);
        return false;
      }
      setOtpError('');
      setOtp({ ...otp, pending: data.pending || otp.pending, resendAt: Date.now() + (Number(data.resendIn) || 60) * 1000 });
      return true;
    } catch {
      setOtpError(t('genericAuthError'));
      return false;
    }
  };

  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authBusy) return;
    // A Qatar mobile: 8 digits starting with 3, 5, 6 or 7
    const qatarNumber = qatarMobile(employeePhone);
    if (!qatarNumber) {
      setPhoneError(t('phoneError'));
      return;
    }

    if (authMode === 'SIGNUP') {
      if (!employeeName.trim()) {
        setPhoneError(t('nameRequiredError'));
        return;
      }
      if (!employeeNumber.trim()) {
        setPhoneError(t('employeeNoRequiredError'));
        return;
      }
      if (confirmNumber !== qatarNumber) {
        setConfirmNumber(qatarNumber);
        return;
      }
    }

    setAuthBusy(true);
    setPhoneError('');
    try {
      const action = authMode === 'LOGIN' ? 'login' : 'signup';
      const { ok, data } = await requestCode(action, qatarNumber);
      if (!ok) {
        // A Twilio error number, when there is one, helps the team find the cause
        const ref = data.twilio?.code ? ` (${data.twilio.code})` : data.twilio?.status ? ` (${data.twilio.status})` : '';
        setPhoneError(authErrorText(data.error) + ref);
        return;
      }
      const state = { phone: qatarNumber, action: action as 'login' | 'signup', pending: data.pending as string | undefined };
      if (data.skip) {
        // Codes are switched off: sign in straight away
        const error = await finishAuth(state);
        if (error) setPhoneError(authErrorText(error));
        return;
      }
      setOtpError('');
      setOtp({ ...state, resendAt: Date.now() + (Number(data.resendIn) || 60) * 1000 });
    } catch {
      setPhoneError(t('genericAuthError'));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSwitchPortal = () => {
    setPortalMode('UNSELECTED');
    setShowPhoneModal(false);
    setPhoneError('');
    try {
      sessionStorage.removeItem('triplea_portal_mode');
    } catch {
      // Ignore
    }
  };

  // Sign out: the session and everything saved on this device is removed
  const handleSignOut = () => {
    mockStore.signOutEmployee();
    setCurrentEmployee(null);
    setActor({ type: 'EMPLOYEE', id: '', name: '', email: '' });
    setShowProfileModal(false);
    handleSwitchPortal();
  };

  // Subscription, orders, and stats for the active employee
  const activeSub = currentEmployee ? mockStore.getEmployeeSubscription(currentEmployee.id) : undefined;
  const hasActiveSubscription = !!activeSub;
  const employeeCredits = currentEmployee ? mockStore.getCreditBalance(currentEmployee.id) : 0;
  // The pass started with this many washes; the card counts down from it
  const passTotal = activeSub
    ? Math.max(
        employeeCredits,
        mockStore
          .getDb()
          .credits.filter((c) => c.subscriptionId === activeSub.id && c.type === 'GRANT')
          .reduce((sum, c) => sum + c.delta, 0)
      )
    : 0;
  const employeeOrders = currentEmployee ? mockStore.getEmployeeOrders(currentEmployee.id) : [];
  // Orders that are not finished yet: shown at the top so the tracking page is always one tap away
  const activeOrders = employeeOrders.filter((o) => o.status !== 'RETURNED_TO_PARKING' && o.status !== 'CANCELLED');
  const registeredVehicle = currentEmployee
    ? mockStore.getEmployeeVehicles(currentEmployee.id)[0]
    : null;

  // Checkout modal state
  const [selectedPlan, setSelectedPlan] = useState<{
    id: string;
    title: string;
    subtitle: string;
    price: number;
    creditsCost: number;
    paymentMode: 'ONE_TIME' | 'CREDIT';
    badge: string;
  } | null>(null);

  // Parking Bay input & Order confirmation state
  const [parkingBayInput, setParkingBayInput] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Escape closes the open sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedPlan) {
        setSelectedPlan(null);
        setConfirmError('');
      } else if (showProfileModal) {
        setIsEditingProfile(false);
        setShowProfileModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPlan, showProfileModal]);


  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoPreview(await compressImage(file));
    } catch {
      setConfirmError(t('photoFailedError'));
    }
  };

  // A paid wash or a new pass goes through MyFatoorah first; washes from an existing pass do not
  const needsPayment =
    !!selectedPlan &&
    mockStore.isPaymentsEnabled() &&
    (selectedPlan.id === 'subscription-8' || (selectedPlan.id === 'one-time' && selectedPlan.paymentMode === 'ONE_TIME'));

  const startPayment = async (bay: string) => {
    if (!selectedPlan || !currentEmployee) return;
    const res = await fetch('/api/pay/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-employee-token': mockStore.getEmployeeToken() || '' },
      body: JSON.stringify({
        plan: selectedPlan.id === 'subscription-8' ? 'pass' : 'single',
        bay,
        notes: notes.trim() || undefined,
        plate: plateNumber.trim() || registeredVehicle?.plateNumber || undefined,
        make: make || undefined,
        model: model || undefined,
        color: color || undefined,
        photo: photoPreview || undefined,
        lang: isRtl ? 'ar' : 'en',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      const errors: Record<string, string> = {
        BAD_BAY: t('parkingBayRangeError'),
        HAS_PASS: t('payHasPass'),
        TOO_MANY: t('tooManyAttemptsError'),
        GATEWAY: t('payGatewayError'),
      };
      setConfirmError(errors[data.error] || t('payGatewayError'));
      setIsSubmitting(false);
      return;
    }
    try {
      // So the return page can find this payment even if MyFatoorah sends no id back
      sessionStorage.setItem('triplea_payment_ref', String(data.paymentRef || ''));
    } catch {
      // Ignore
    }
    window.location.assign(data.url);
  };

  const handleConfirmOrder = () => {
    if (!selectedPlan) return;

    const cleanBay = parkingBayInput.replace(/\D/g, '');
    if (!cleanBay) {
      setConfirmError(t('parkingBayRequiredError'));
      return;
    }
    const bayNumber = Number(cleanBay);
    if (bayNumber < 1 || bayNumber > TOTAL_BAYS) {
      setConfirmError(t('parkingBayRangeError'));
      return;
    }

    if (!currentEmployee) {
      setConfirmError(t('genericAuthError'));
      return;
    }

    setConfirmError('');
    setIsSubmitting(true);

    if (needsPayment) {
      startPayment(String(bayNumber)).catch(() => {
        setConfirmError(t('payGatewayError'));
        setIsSubmitting(false);
      });
      return;
    }

    try {
      // Every order belongs to the signed-in employee
      const orderActor: ActorContext = {
        type: 'EMPLOYEE',
        id: currentEmployee.id,
        name: currentEmployee.fullName,
        email: currentEmployee.email,
      };
      // A new 8-wash pass is granted first, so the credit it pays with exists when the order is created
      if (selectedPlan.id === 'subscription-8') {
        mockStore.activateSubscriptionForEmployee(currentEmployee.id);
        setRefreshTrigger((prev) => prev + 1);
      }
      const bay = mockStore.getOrCreateBay(cleanBay);
      const service = mockStore.getServices()[0];
      const finalPlate = plateNumber.trim() || registeredVehicle?.plateNumber || 'Photo Verified';

      const vehicleSnapshot: Vehicle = {
        id: `veh-${Date.now()}`,
        employeeId: orderActor.id,
        plateNumber: finalPlate,
        plateType,
        make: make || 'Vehicle',
        model: model || '',
        color: color || '',
        isDefault: true,
      };

      const created = mockStore.createOrder(
        {
          employeeId: orderActor.id,
          bayId: bay.id,
          bayCodeSnapshot: bay.code,
          zoneCodeSnapshot: 'P',
          vehicleSnapshot,
          serviceId: service.id,
          serviceSnapshot: service,
          paymentMode: selectedPlan.paymentMode,
          priceSnapshot: { amountMinor: Math.round(selectedPlan.price * 100), currency: 'QAR' },
          creditsUsed: selectedPlan.creditsCost,
          paymentStatus: selectedPlan.paymentMode === 'CREDIT' ? 'NOT_APPLICABLE' : 'UNPAID',
          instructions: notes.trim() || undefined,
          idempotencyKey: `idem-${Date.now()}-${Math.random()}`,
        },
        orderActor
      );

      if (photoPreview) {
        mockStore.addOrderPhoto(created.id, 'BEFORE', photoPreview, orderActor.name || orderActor.id);
      }

      router.push(`/orders/${created.reference}`);
      // If the page did not change (a slow connection), let the button work again
      setTimeout(() => setIsSubmitting(false), 8000);
    } catch (err: unknown) {
      setConfirmError((err instanceof Error ? err.message : String(err)) || t('genericAuthError'));
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Shared design tokens for the customer screens
  // --------------------------------------------------------------------------
  const tile = 'rounded-3xl bg-tile';
  const inner = 'rounded-2xl bg-inset';
  const fieldCls =
    'w-full bg-raised rounded-xl px-4 py-3 text-[14px] text-ink placeholder-dim transition';
  const pillBtn =
    'inline-flex items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition whitespace-nowrap';
  const primaryBtn = `${pillBtn} bg-[#0071e3] hover:bg-[#0077ed] text-white`;
  const softBtn = `${pillBtn} bg-fill hover:bg-fill-strong text-ink`;

  const ChevronFwd = isRtl ? ChevronLeft : ChevronRight;
  const ChevronBack = isRtl ? ChevronRight : ChevronLeft;
  const ArrowFwd = isRtl ? ArrowLeft : ArrowRight;
  const ArrowBack = isRtl ? ArrowRight : ArrowLeft;

  const activate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const languageToggleBtn = (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap"
      title={isRtl ? 'Switch to English' : 'التحويل إلى العربية'}
    >
      <Globe className="h-4 w-4" />
      <span className="font-medium">{t('toggleLangLabel')}</span>
    </button>
  );

  const poweredByFooter = (
    <a
      href="https://xtechnology.group/"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 text-dim hover:text-body transition-colors py-2"
    >
      <span className="text-sm">{t('poweredBy')}</span>
      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/xtech-logo.png" alt="XTech Logo" className="w-4 h-4 object-contain" />
        <span className="text-sm font-semibold text-body">XTechnology</span>
      </div>
    </a>
  );

  // --------------------------------------------------------------------------
  // GATE
  // --------------------------------------------------------------------------
  if (portalMode === 'UNSELECTED') {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full min-h-[100dvh] bg-canvas text-ink font-sans">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 bg-canvas/80 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto h-full px-5 md:px-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/triplea-shield.png" alt="TripleA" className="h-7 w-7 object-contain" />
              <span className="text-sm text-muted">{t('dohaQatar')}</span>
            </div>
            <div className="flex items-center gap-2">
              {languageToggleBtn}
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative isolate overflow-hidden min-h-[480px] h-[66dvh] flex items-center justify-center">
          <Image
            src="/images/hero-car.jpg"
            alt="BMW Coupe"
            fill
            priority
            className="object-cover object-[72%_center] opacity-80 -z-10"
          />
          <div className="absolute inset-0 -z-10 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 h-40 -z-10 bg-gradient-to-t from-canvas to-transparent" />

          <div data-theme="dark" className="px-6 text-center max-w-[860px] rise-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/triplea-shield.png" alt="TripleA Shield Logo" className="w-20 h-20 md:w-24 md:h-24 mx-auto object-contain mb-6" />
            <h1 className="text-[32px] md:text-[52px] font-semibold tracking-tight leading-[1.05] text-ink">
              {t('tripleaDetailing')}
            </h1>
            <p className="text-base md:text-[20px] text-body mt-5 leading-snug max-w-[640px] mx-auto">
              {t('heroSubtitle')}
            </p>
            <div className="mt-10 inline-flex items-center gap-2 text-[14px] text-body">
              <span>{t('selectPortalBadge')}</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </section>

        {/* Portals */}
        <section className="px-5 md:px-8 pb-12">
          <div className="max-w-[560px] mx-auto space-y-3">
            {[
              {
                key: 'moci',
                onOpen: enterEmployeePortal,
                title: t('ministryEmployeeTitle'),
                subtitle: t('ministrySubtitle'),
                icon: (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/images/qatar-moci-logo.png"
                    alt="Ministry of Commerce and Industry - State of Qatar"
                    className="w-full h-full object-contain"
                  />
                ),
                primary: true,
              },
            ].map((p) => (
              <div
                key={p.key}
                role="button"
                tabIndex={0}
                onClick={p.onOpen}
                onKeyDown={activate(p.onOpen)}
                className={`group flex items-center gap-4 ${tile} hover:bg-tile-hover px-5 py-4 cursor-pointer transition-colors`}
              >
                <div className={`w-14 h-14 rounded-2xl p-2 flex items-center justify-center flex-shrink-0 ${p.key === 'moci' ? 'bg-logo-chip' : 'bg-fill-soft'}`}>
                  {p.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-tight text-ink truncate">{p.title}</h2>
                  <p className="text-sm text-muted truncate">{p.subtitle}</p>
                </div>
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    p.primary ? 'bg-[#0071e3] group-hover:bg-[#0077ed] text-white' : 'bg-fill text-body'
                  }`}
                >
                  <ChevronFwd className="h-5 w-5" />
                </span>
              </div>
            ))}
          </div>
        </section>

        <footer className="pb-10">{poweredByFooter}</footer>

        {/* Employee access dialog */}
        {showPhoneModal && (
          <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-end md:items-center justify-center md:p-4">
            <div className="w-full md:max-w-[440px] bg-tile rounded-t-[32px] md:rounded-[32px] p-6 max-h-[92dvh] overflow-y-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-logo-chip p-1.5 flex items-center justify-center flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/qatar-moci-logo.png" alt="Ministry Crest" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <span className="text-sm text-muted">{t('ministryPortalLabel')}</span>
                    <h3 className="text-[19px] font-semibold text-ink tracking-tight leading-tight">
                      {authMode === 'LOGIN' ? t('authLoginTab') : t('authSignUpTab')}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowPhoneModal(false);
                    setPhoneError('');
                    setOtp(null);
                    setOtpError('');
                  }}
                  className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-body flex items-center justify-center"
                  aria-label={t('closeBtn')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {otp ? (
                <OtpCode
                  phone={otp.phone}
                  resendAt={otp.resendAt}
                  busy={authBusy}
                  error={otpError}
                  errorKey={otpErrorKey}
                  onSubmit={submitCode}
                  onResend={resendCode}
                  onChangeNumber={() => {
                    setOtp(null);
                    setOtpError('');
                  }}
                />
              ) : (
                <>
              {/* Segmented control */}
              <div className="grid grid-cols-2 p-1 bg-raised rounded-full text-sm font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('LOGIN');
                    setPhoneError('');
                  }}
                  className={`py-2.5 rounded-full transition ${
                    authMode === 'LOGIN' ? 'bg-ink text-canvas font-semibold' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t('authLoginTab')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('SIGNUP');
                    setPhoneError('');
                  }}
                  className={`py-2.5 rounded-full transition ${
                    authMode === 'SIGNUP' ? 'bg-ink text-canvas font-semibold' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t('authSignUpTab')}
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-5">
                {authMode === 'SIGNUP' && (
                  <>
                    <div>
                      <label className="text-sm text-body block mb-2">{t('fullNameLabel')}</label>
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          required
                          maxLength={80}
                          autoComplete="name"
                          placeholder={t('fullNamePlaceholder')}
                          value={employeeName}
                          onChange={(e) => {
                            setEmployeeName(e.target.value);
                            setPhoneError('');
                          }}
                          className={`${fieldCls} ps-11`}
                        />
                        <User className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-body block mb-2">{t('employeeNoLabel')}</label>
                      <div className="relative">
                        <input
                          type="text"
                          maxLength={20}
                          required
                          placeholder={t('employeeNoPlaceholder')}
                          value={employeeNumber}
                          onChange={(e) => {
                            setEmployeeNumber(e.target.value.replace(/[^\w-]/g, '').slice(0, 20));
                            setPhoneError('');
                          }}
                          className={`${fieldCls} tabular-nums ps-11`}
                        />
                        <BadgeCheck className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm text-body block mb-2">{t('corporatePasscodeLabel')}</label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <div className="px-4 py-3 bg-raised rounded-xl text-[14px] font-semibold text-ink tabular-nums select-none">
                      +974
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={14}
                        autoFocus={authMode === 'LOGIN'}
                        placeholder={t('phoneInputPlaceholder')}
                        value={employeePhone}
                        onChange={(e) => {
                          // Digits only; a pasted +974 number is cut down to the 8 digits the server reads
                          setEmployeePhone(e.target.value.replace(/\D/g, '').slice(0, 14));
                          setConfirmNumber(null);
                          setPhoneError('');
                        }}
                        className={`${fieldCls} tabular-nums ps-11`}
                      />
                      <Phone className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
                    </div>
                  </div>

                  {phoneError ? (
                    <p role="alert" className="mt-3 text-sm text-rose-400 leading-relaxed">
                      {phoneError}
                    </p>
                  ) : (
                    <p className="text-sm text-dim mt-3 leading-relaxed">{t('phoneInputHint')}</p>
                  )}
                </div>

                {authMode === 'SIGNUP' && confirmNumber && (
                  <div role="alert" className="rounded-2xl bg-amber-400/10 p-4 space-y-2">
                    <p className="text-sm font-semibold text-amber-200">{t('confirmNumberTitle')}</p>
                    <p dir="ltr" className="text-[22px] font-semibold text-ink tabular-nums tracking-wide">
                      +974 {confirmNumber.slice(0, 4)} {confirmNumber.slice(4)}
                    </p>
                    <p className="text-sm text-body leading-relaxed">{t('confirmNumberBody')}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(false)}
                    className={`${softBtn} px-6 py-3`}
                  >
                    {t('cancelBtn')}
                  </button>
                  <button type="submit" disabled={authBusy} className={`${primaryBtn} flex-1 py-3 disabled:opacity-60`}>
                    <span>{authMode === 'SIGNUP' && confirmNumber ? t('confirmNumberYes') : t('otpContinue')}</span>
                    <ArrowFwd className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'LOGIN' ? 'SIGNUP' : 'LOGIN');
                      setConfirmNumber(null);
                      setPhoneError('');
                    }}
                    className="text-sm text-muted hover:text-ink transition"
                  >
                    {authMode === 'LOGIN' ? t('switchToSignUp') : t('switchToLogin')}
                  </button>
                </div>
              </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* Registration confirmation */}
        {showContactNoticeModal && (
          <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-end md:items-center justify-center md:p-4">
            <div className="w-full md:max-w-[420px] bg-tile rounded-t-[32px] md:rounded-[32px] p-8 space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-400/15 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex px-3 py-1 rounded-full bg-fill text-sm text-body">
                  {t('contactNoticeBadge')}
                </span>
                <h3 className="text-[20px] font-semibold text-ink tracking-tight">{t('contactNoticeTitle')}</h3>
                <p className="text-sm text-dim tabular-nums" dir="ltr">
                  {currentEmployee?.phone || employeePhone}
                </p>
              </div>

              <p className={`${inner} p-4 text-[14px] text-body leading-relaxed`}>{t('contactNoticeBody')}</p>

              <button onClick={() => setShowContactNoticeModal(false)} className={`${primaryBtn} w-full py-3`}>
                {t('contactNoticeDismiss')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ORDERING
  // --------------------------------------------------------------------------
  const renderPlanTile = (opts: {
    image: string;
    imageAlt: string;
    badge: string;
    title: string;
    desc: string;
    price: number;
    was?: number;
    discount?: string;
    bonus?: string;
    plan: NonNullable<typeof selectedPlan>;
  }) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setSelectedPlan(opts.plan)}
      onKeyDown={activate(() => setSelectedPlan(opts.plan))}
      className={`group ${tile} overflow-hidden cursor-pointer flex flex-col hover:bg-tile-hover active:scale-[0.99] transition`}
    >
      <div className="relative h-44 md:h-56 overflow-hidden">
        <Image
          src={opts.image}
          alt={opts.imageAlt}
          fill
          sizes="(min-width: 768px) 540px, 100vw"
          className="object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
        />
        <span className="absolute top-4 start-4 inline-flex px-3 py-1 rounded-full bg-black/70 text-sm text-white">
          {opts.badge}
        </span>
      </div>

      <div className="p-5 md:p-6 flex flex-col gap-5 flex-1">
        <div className="space-y-1.5">
          <h3 className="text-[22px] font-semibold tracking-[-0.01em] leading-tight text-ink">{opts.title}</h3>
          <p className="text-[15px] text-muted leading-snug">{opts.desc}</p>
          {opts.bonus && (
            <div className="flex items-center gap-2 text-[14px] text-body pt-1">
              <Gift className="h-4 w-4 text-muted" />
              <span>{opts.bonus}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
            <span className="text-[34px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{opts.price}</span>
            <span className="text-[15px] text-muted">{t('qar')}</span>
            {opts.was && (
              <span className="text-[15px] text-dim line-through decoration-zinc-500 tabular-nums">
                {opts.was} {t('qar')}
              </span>
            )}
            {opts.discount && (
              <span dir="ltr" className="text-sm font-semibold tabular-nums text-[#30d158] bg-[#30d158]/15 px-2.5 py-0.5 rounded-full">
                {opts.discount}
              </span>
            )}
          </div>
          <span className="h-11 w-11 rounded-full bg-[#0071e3] group-hover:bg-[#0077ed] flex items-center justify-center text-white flex-shrink-0 transition-colors">
            <ArrowFwd className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  );

  const trustPillars = [
    { icon: ShieldCheck, label: t('trustedService') },
    { icon: Zap, label: t('premiumQuality') },
    { icon: MapPin, label: t('acrossQatar') },
  ];

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full min-h-[100dvh] bg-canvas text-ink font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-14 bg-canvas/80 backdrop-blur-xl">
        <div className="max-w-[1100px] mx-auto h-full px-4 md:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-ink truncate">{t('activeEmployeePill')}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowProfileModal(true)}
              className="hidden sm:flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap active:scale-95 transition"
            >
              <User className="h-4 w-4" />
              <span>{t('viewProfileBtn')}</span>
            </button>
            {languageToggleBtn}
            <button
              onClick={handleSwitchPortal}
              className="flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap active:scale-95 transition"
              title={isRtl ? 'رجوع للبوابة الرئيسية' : 'Back to previous portal'}
            >
              <ArrowBack className="h-4 w-4" />
              <span className="font-medium">{t('backBtn')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden min-h-[280px] h-[36dvh] md:h-[42dvh] flex items-center justify-center">
        <Image
          src="/images/hero-car.jpg"
          alt="BMW Coupe"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[72%_center] opacity-80 -z-10"
        />
        <div className="absolute inset-0 -z-10 bg-black/55" />

        <div data-theme="dark" className="px-6 text-center max-w-[760px] rise-in">
          <div className="flex items-center justify-center gap-4 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/triplea-shield.png" alt="TripleA Shield Logo" className="w-11 h-11 md:w-14 md:h-14 object-contain" />
            <span className="text-dim text-sm select-none">✕</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/qatar-moci-logo.png"
              alt="Ministry of Commerce and Industry - State of Qatar"
              className="w-[72px] h-[72px] md:w-24 md:h-24 object-contain"
            />
          </div>

          <h1 className="text-[28px] md:text-[44px] font-semibold tracking-[-0.02em] leading-[1.08] text-ink text-balance">
            {t('employeeTagline')}
          </h1>
          <p className="text-[15px] md:text-lg text-body mt-2.5">{t('employeeSubTagline')}</p>
        </div>
      </section>

      <main className="px-4 md:px-8 pt-6 md:pt-8 pb-6">
        <div className="max-w-[1100px] mx-auto space-y-4 md:space-y-5">
          {/* The order in progress: one tap to follow it */}
          {activeOrders.length > 0 && (
            <Link
              href={`/orders/${activeOrders[0].reference}`}
              className={`${tile} hover:bg-tile-hover active:scale-[0.99] p-4 md:p-5 flex items-center gap-4 transition`}
            >
              <span className="h-12 w-12 rounded-2xl bg-fill flex items-center justify-center text-[17px] font-semibold text-ink tabular-nums flex-shrink-0">
                {activeOrders[0].bayCodeSnapshot}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[15px] font-semibold text-ink">{t('activeOrderTitle')}</div>
                <StatusBadge status={activeOrders[0].status} isCustomerView />
              </div>
              <span className="flex items-center gap-1 text-[15px] text-link flex-shrink-0">
                {t('trackOrderBtn')}
                <ChevronFwd className="h-4 w-4" />
              </span>
            </Link>
          )}

          {/* Your pass: how many washes are left, updated live */}
          {hasActiveSubscription && (
            <section aria-label={t('passCardTitle')} className={`${tile} p-5 md:p-7 space-y-6`}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-[15px] text-muted">{t('passCardTitle')}</p>
                {activeOrders.length > 0 && (
                  <span className="inline-flex px-3 py-1 rounded-full bg-[#2997ff]/15 text-sm font-medium text-link-soft whitespace-nowrap">
                    {activeOrders.length} {t('passInProgressLabel')}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[64px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">{employeeCredits}</span>
                <span className="text-[17px] text-muted lowercase">
                  {t('passOfLabel')} {passTotal} {t('washesLeftLabel')}
                </span>
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: passTotal }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < employeeCredits ? 'bg-[#2997ff]' : 'bg-fill'}`}
                  />
                ))}
              </div>
              {employeeCredits > 0 && (
                <button
                  onClick={() =>
                    setSelectedPlan({
                      id: 'one-time',
                      title: t('oneTimeWash'),
                      subtitle: t('oneTimeDesc'),
                      price: 20,
                      creditsCost: 1,
                      paymentMode: 'CREDIT',
                      badge: t('mociBenefitBadge'),
                    })
                  }
                  className={`${primaryBtn} w-full py-3.5 text-[17px] font-normal active:scale-95`}
                >
                  <span>{t('orderWithPassBtn')}</span>
                </button>
              )}
            </section>
          )}

          {/* Plans */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {renderPlanTile({
              image: '/images/wash-spray.jpg',
              imageAlt: 'Car Wash Spray',
              badge: t('mociBenefitBadge'),
              title: t('oneTimeWash'),
              desc: t('oneTimeDesc'),
              price: 20,
              was: 30,
              discount: '-33%',
              plan: {
                id: 'one-time',
                title: t('oneTimeWash'),
                subtitle: t('oneTimeDesc'),
                price: 20,
                creditsCost: 0,
                paymentMode: 'ONE_TIME',
                badge: t('mociBenefitBadge'),
              },
            })}
            {!hasActiveSubscription &&
              renderPlanTile({
                image: '/images/subscription-car.jpg',
                imageAlt: 'BMW Sedan Rear',
                badge: t('bestValueBadge'),
                title: t('subscription8'),
                desc: t('subscriptionDesc'),
                bonus: t('freeWashes2'),
                price: 140,
                was: 240,
                discount: '-42%',
                plan: {
                  id: 'subscription-8',
                  title: t('subscription8'),
                  subtitle: t('subscriptionDesc'),
                  price: 140,
                  creditsCost: 1,
                  paymentMode: 'CREDIT',
                  badge: t('bestValueBadge'),
                },
              })}
          </section>

          {/* Account: profile and history */}
          <section aria-label={t('myProfileSectionTitle')} className={`${tile} p-2 space-y-1`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowProfileModal(true)}
              onKeyDown={activate(() => setShowProfileModal(true))}
              className="rounded-[20px] hover:bg-fill-soft active:scale-[0.99] p-3.5 md:p-4 flex items-center justify-between gap-4 cursor-pointer transition group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-11 h-11 rounded-full bg-raised flex items-center justify-center text-[17px] font-semibold text-ink flex-shrink-0">
                  {(currentEmployee?.fullName || '?').trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold text-ink truncate">
                    {currentEmployee?.fullName || t('ministryEmployeeTitle')}
                  </div>
                  <div className="text-sm text-muted tabular-nums whitespace-nowrap" dir="ltr">
                    {currentEmployee?.phone || employeePhone}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {!hasActiveSubscription && (
                  <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-fill text-sm text-muted whitespace-nowrap">
                    {t('statusInactive')}
                  </span>
                )}
                <ChevronFwd className="h-5 w-5 text-dim group-hover:text-ink transition-colors" />
              </div>
            </div>

            {employeeOrders.length > 0 && (
              <Link
                href="/orders"
                className="rounded-[20px] hover:bg-fill-soft active:scale-[0.99] p-3.5 md:p-4 flex items-center justify-between gap-4 transition group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-11 h-11 rounded-full bg-raised flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-ink" />
                  </span>
                  <span className="text-[16px] font-semibold text-ink truncate">{t('orderHistoryTitle')}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {activeOrders.length > 0 && (
                    <span className="inline-flex px-3 py-1 rounded-full bg-[#2997ff]/15 text-sm font-medium text-link-soft whitespace-nowrap">
                      {activeOrders.length} {t('inProgressLabel')}
                    </span>
                  )}
                  <ChevronFwd className="h-5 w-5 text-dim group-hover:text-ink transition-colors" />
                </div>
              </Link>
            )}
          </section>

          {/* Trust */}
          <section className="grid grid-cols-3 gap-3 text-center pt-6 pb-2">
            {trustPillars.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex flex-col items-center gap-2.5">
                <Icon className="h-6 w-6 text-muted stroke-[1.5]" />
                <span className="text-[13px] text-muted leading-snug whitespace-pre-line">{label}</span>
              </div>
            ))}
          </section>
        </div>
      </main>

      <footer className="pb-10 pt-4">{poweredByFooter}</footer>

      {notice && (
        <div className="fixed bottom-5 inset-x-4 z-[60] flex justify-center pointer-events-none">
          <div role="status" className="px-4 py-2.5 rounded-full bg-raised text-ink text-sm">{notice}</div>
        </div>
      )}

      {portalMode === 'EMPLOYEE' && currentEmployee && !installStepDone && <AddToHomeScreen onDone={finishInstallStep} />}
      {portalMode === 'EMPLOYEE' && currentEmployee && installStepDone && !profilePrompt && <EmployeeNotifications employeeId={currentEmployee.id} />}
      {profilePrompt === 'install' && <AddToHomeScreen forced onDone={closeProfilePrompt} />}
      {profilePrompt === 'notif' && currentEmployee && (
        <EmployeeNotifications forced employeeId={currentEmployee.id} onClose={closeProfilePrompt} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PROFILE                                                            */}
      {/* ------------------------------------------------------------------ */}
      {showProfileModal && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 bg-canvas min-h-[100dvh] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200 text-ink"
        >
          <div className="sticky top-0 z-40 h-14 bg-canvas/80 backdrop-blur-xl">
            <div className="max-w-[560px] mx-auto h-full px-4 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setIsEditingProfile(false);
                  setShowProfileModal(false);
                }}
                className="flex items-center gap-1.5 text-sm text-link hover:opacity-80 py-2 whitespace-nowrap"
              >
                <ChevronBack className="h-5 w-5" />
                <span>{t('backToServices')}</span>
              </button>

              <h2 className="text-[15px] font-semibold text-ink truncate">{t('myProfileSectionTitle')}</h2>

              <button
                onClick={() => {
                  setIsEditingProfile(false);
                  setShowProfileModal(false);
                }}
                className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-body flex items-center justify-center"
                title={t('closeBtn')}
                aria-label={t('closeBtn')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-w-[560px] mx-auto px-4 py-4 pb-20 space-y-3">
            {profileSaveSuccess && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-400/15 text-emerald-300 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span>{t('savedSuccess')}</span>
              </div>
            )}

            {isEditingProfile ? (
              <section className={`${tile} p-6 space-y-4`}>
                <div>
                  <label className="text-sm text-muted block mb-1.5">{t('fullNameLabel')}</label>
                  <input type="text" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="text-sm text-muted block mb-1.5">{t('qatarPhoneLabel')}</label>
                  <input type="tel" inputMode="tel" value={editPhone} maxLength={20} onChange={(e) => setEditPhone(e.target.value)} className={`${fieldCls} tabular-nums`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted block mb-1.5">{t('plateNumberLabelShort')}</label>
                    <input type="text" value={editPlate} maxLength={20} onChange={(e) => setEditPlate(e.target.value)} className={`${fieldCls} tabular-nums`} />
                  </div>
                  <div>
                    <label className="text-sm text-muted block mb-1.5">{t('colorLabel')}</label>
                    <input type="text" value={editColor} maxLength={40} onChange={(e) => setEditColor(e.target.value)} className={fieldCls} />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted block mb-1.5">{t('vehicleMake')}</label>
                  <input type="text" value={editMakeModel} maxLength={80} onChange={(e) => setEditMakeModel(e.target.value)} className={fieldCls} />
                </div>
                {profileError && (
                  <p role="alert" className="text-sm text-rose-300">
                    {profileError}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={handleSaveProfile} className={`${primaryBtn} flex-1 py-3`}>
                    <Check className="h-4 w-4" />
                    <span>{t('saveChanges')}</span>
                  </button>
                  <button onClick={() => setIsEditingProfile(false)} className={`${softBtn} px-6 py-3`}>
                    {t('cancelEdit')}
                  </button>
                </div>
              </section>
            ) : (
              <>
                {/* Who you are */}
                <section className={`${tile} p-6`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-[24px] font-semibold text-ink tracking-tight leading-tight truncate">
                        {currentEmployee?.fullName}
                      </h3>
                      <p className="text-sm text-muted tabular-nums" dir="ltr">{currentEmployee?.phone || employeePhone}</p>
                      <p className="text-sm text-muted tabular-nums">
                        {t('employeeNoLabel')}: {currentEmployee?.employeeNo}
                      </p>
                    </div>
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="flex items-center gap-1.5 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{t('editProfile')}</span>
                    </button>
                  </div>
                </section>

                {/* The app on this phone */}
                <section className={`${tile} p-4 grid grid-cols-2 gap-3`}>
                  <button
                    onClick={() => setProfilePrompt('install')}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-inset hover:bg-fill px-3 py-4 text-sm text-ink transition active:scale-95 cursor-pointer"
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <span>{t('addToHomeBtn')}</span>
                  </button>
                  <button
                    onClick={() => setProfilePrompt('notif')}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-inset hover:bg-fill px-3 py-4 text-sm text-ink transition active:scale-95 cursor-pointer"
                  >
                    <Bell className="h-4 w-4 shrink-0" />
                    <span>{t('notificationsBtn')}</span>
                  </button>
                </section>

                {/* Wash pass */}
                <section className={`${tile} p-6 space-y-4`}>
                  {hasActiveSubscription ? (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-sm text-muted">{t('subscriptionCardTitle')}</p>
                          <p className="text-sm text-dim mt-0.5">{t('creditsBalanceLabel')}</p>
                        </div>
                        <div className="text-end">
                          <span className="text-[40px] leading-none font-semibold text-ink tabular-nums">{employeeCredits}</span>
                          <span className="text-sm text-muted ms-2">{t('washesLeftLabel')}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileModal(false);
                          setSelectedPlan({
                            id: 'one-time',
                            title: t('oneTimeWash'),
                            subtitle: t('oneTimeDesc'),
                            price: 20,
                            creditsCost: 1,
                            paymentMode: 'CREDIT',
                            badge: t('mociBenefitBadge'),
                          });
                        }}
                        className={`${primaryBtn} w-full py-3`}
                      >
                        <span>{t('confirmOrderBtn')}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[17px] font-semibold text-ink">{t('subscriptionCardTitle')}</p>
                          <p className="text-sm text-muted mt-0.5">{t('subscriptionCardSubtitle')}</p>
                        </div>
                        <div className="flex items-baseline gap-1.5 flex-shrink-0">
                          <span className="text-[30px] leading-none font-semibold text-ink tabular-nums">140</span>
                          <span className="text-sm text-muted">{t('qar')}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileModal(false);
                          setSelectedPlan({
                            id: 'subscription-8',
                            title: t('subscription8'),
                            subtitle: t('subscriptionDesc'),
                            price: 140,
                            creditsCost: 1,
                            paymentMode: 'ONE_TIME',
                            badge: t('bestValueBadge'),
                          });
                        }}
                        className={`${primaryBtn} w-full py-3`}
                      >
                        <Zap className="h-4 w-4" />
                        <span>{t('activateSubNowBtn')}</span>
                        <ArrowFwd className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </section>

                {/* Vehicle */}
                <section className={`${tile} p-6 flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Car className="h-5 w-5 text-muted flex-shrink-0" />
                    {registeredVehicle ? (
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink truncate">
                          {`${registeredVehicle.make || ''} ${registeredVehicle.model || ''}`.trim() || t('vehicleDetailsTitle')}
                        </p>
                        {registeredVehicle.color && <p className="text-sm text-muted">{registeredVehicle.color}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">{t('noVehicleYet')}</p>
                    )}
                  </div>
                  {registeredVehicle && (
                    <span className="text-[15px] font-semibold text-ink tabular-nums bg-fill px-3.5 py-1 rounded-full flex-shrink-0">
                      {registeredVehicle.plateNumber}
                    </span>
                  )}
                </section>

                {/* Order history: one row that opens the history page */}
                <Link
                  href="/orders"
                  className={`${tile} hover:bg-tile-hover p-6 flex items-center justify-between gap-4 transition-colors group`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock className="h-5 w-5 text-muted flex-shrink-0" />
                    <span className="text-[15px] font-semibold text-ink truncate">{t('orderHistoryTitle')}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {employeeOrders.length > 0 && <span className="text-sm text-dim tabular-nums">{employeeOrders.length}</span>}
                    <ChevronFwd className="h-5 w-5 text-dim group-hover:text-ink transition-colors" />
                  </div>
                </Link>

                {/* Support and sign out */}
                {(
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={`https://wa.me/${SUPPORT_WHATSAPP}?text=Hello%20TripleA`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${softBtn} py-3`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>{t('contactWhatsApp')}</span>
                    </a>
                    <a href={`tel:+${SUPPORT_CALL}`} className={`${softBtn} py-3`}>
                      <Phone className="h-4 w-4" />
                      <span>{t('callConcierge')}</span>
                    </a>
                  </div>
                )}

                <button
                  onClick={handleSignOut}
                  className="w-full py-3 rounded-full text-muted hover:text-ink text-sm flex items-center justify-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t('switchAccountBtn')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CHECKOUT SHEET                                                     */}
      {/* ------------------------------------------------------------------ */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-end md:items-center justify-center md:p-4">
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="w-full md:max-w-[480px] bg-tile rounded-t-[32px] md:rounded-[32px] p-6 md:p-8 max-h-[94dvh] overflow-y-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-sm text-muted">{t('confirmSheetBadge')}</span>
                <h3 className="text-[21px] font-semibold text-ink tracking-tight leading-tight mt-0.5">{selectedPlan.title}</h3>
                <div className="text-sm text-muted mt-1 tabular-nums">
                  {selectedPlan.price} {t('qar')}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedPlan(null);
                  setConfirmError('');
                }}
                className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-body flex items-center justify-center flex-shrink-0"
                aria-label={t('closeBtn')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-amber-400/[0.1] p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0 text-amber-300">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-[14px] font-semibold text-amber-300">{t('bigNoticeTitle')}</h4>
                <p className="text-sm text-body leading-relaxed">{t('bigNoticeDesc')}</p>
              </div>
            </div>

            {confirmError && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-400/15 text-rose-300 text-sm flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>{confirmError}</span>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="bay-input" className="text-[14px] text-ink font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted" />
                    <span>{t('parkingBayInputLabel')}</span>
                  </label>
                </div>
                <input
                  id="bay-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  value={parkingBayInput}
                  onChange={(e) => {
                    setParkingBayInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                    if (confirmError) setConfirmError('');
                  }}
                  placeholder={t('parkingBayPlaceholder')}
                  className={`${fieldCls} tabular-nums font-semibold`}
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-ink font-semibold flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted" />
                    <span>{t('uploadRearPhotoTitle')}</span>
                  </span>
                  {photoPreview && (
                    <span className="text-sm text-emerald-400 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" /> {t('photoAttached')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted leading-relaxed">{t('uploadRearPhotoDesc')}</p>

                {photoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden bg-fill">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Rear Vehicle Preview" className="w-full h-44 object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
                    <button
                      type="button"
                      onClick={() => setPhotoPreview(null)}
                      className="absolute top-3 end-3 w-9 h-9 rounded-full bg-black/70 hover:bg-rose-500 text-white flex items-center justify-center backdrop-blur-md"
                      title={t('removePhotoBtn')}
                      aria-label={t('removePhotoBtn')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3 start-4 text-sm text-ink flex items-center gap-1.5">
                      <BadgeCheck className="h-4 w-4 text-emerald-400" />
                      <span>{t('photoUploadedSuccess')}</span>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <div className="rounded-2xl bg-raised hover:bg-raised-strong p-6 text-center transition space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-fill flex items-center justify-center">
                        <Camera className="h-5 w-5 text-ink" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[14px] font-semibold text-ink block">{t('uploadPhotoPrompt')}</span>
                        <span className="text-sm text-dim block">JPG · PNG · HEIC</span>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              <div>
                <label htmlFor="notes-input" className="text-[14px] text-body block mb-2 font-medium">
                  {t('instructionsLabel')}
                </label>
                <input
                  id="notes-input"
                  type="text"
                  placeholder={t('instructionsPlaceholder')}
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </div>

            <button
              onClick={handleConfirmOrder}
              disabled={isSubmitting}
              className={`${primaryBtn} w-full py-3.5 disabled:opacity-50`}
            >
              <span>
                {isSubmitting
                  ? needsPayment
                    ? t('payRedirecting')
                    : t('processing')
                  : needsPayment
                  ? `${t('payNowBtn')} · ${selectedPlan.price} ${t('qar')}`
                  : parkingBayInput.trim()
                  ? `${t('confirmOrderBtn')} ${parkingBayInput.trim()} · ${selectedPlan.price} ${t('qar')}`
                  : `${t('confirmOrderBtn')} · ${selectedPlan.price} ${t('qar')}`}
              </span>
              <ArrowFwd className="h-4 w-4" />
            </button>
            {needsPayment && <p className="text-center text-[13px] text-dim">{t('payMethodsNote')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-dim bg-canvas min-h-screen">
          Loading...
        </div>
      }
    >
      <BayOrderingClientScreen />
    </Suspense>
  );
}
