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
  Sparkles,
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
} from 'lucide-react';

import { EmployeeNotifications } from '@/components/notifications/employee-notifications';
import { AddToHomeScreen } from '@/components/notifications/add-to-home-screen';

type PortalMode = 'UNSELECTED' | 'EMPLOYEE';

function BayOrderingClientScreen() {
  const router = useRouter();
  const { setActor } = useAuth();
  const { toggleLanguage, isRtl, t } = useLanguage();


  // Portal selection state
  const [portalMode, setPortalMode] = useState<PortalMode>('UNSELECTED');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
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

  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authBusy) return;
    const cleanDigits = employeePhone.replace(/\D/g, '');

    // Standard Qatari mobile is 8 digits
    if (cleanDigits.length < 8) {
      setPhoneError(t('phoneError'));
      return;
    }
    const qatarNumber = cleanDigits.slice(-8);

    if (authMode === 'SIGNUP') {
      if (!employeeName.trim()) {
        setPhoneError(t('nameRequiredError'));
        return;
      }
      if (!employeeNumber.trim()) {
        setPhoneError(t('employeeNoRequiredError'));
        return;
      }
    }

    setAuthBusy(true);
    setPhoneError('');
    try {
      // The server checks the number, creates the account when needed, and returns a signed session
      const res = await fetch('/api/auth/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode === 'LOGIN' ? 'login' : 'signup',
          phone: qatarNumber,
          fullName: employeeName.trim(),
          employeeNo: employeeNumber.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errors: Record<string, string> = {
          NOT_FOUND: t('accountNotFoundError'),
          EXISTS: t('accountExistsError'),
          TOO_MANY: t('tooManyAttemptsError'),
          SUSPENDED: t('accountSuspendedError'),
          BAD_NAME: t('nameRequiredError'),
          BAD_EMPLOYEE_NO: t('employeeNoRequiredError'),
          BAD_PHONE: t('phoneError'),
        };
        setPhoneError(errors[data.error] || t('genericAuthError'));
        return;
      }

      const employee = data.employee as Employee;
      mockStore.adoptEmployee(employee, data.token);
      setCurrentEmployee(employee);
      setActor({ type: 'EMPLOYEE', id: employee.id, name: employee.fullName, email: employee.email });

      try {
        localStorage.setItem('cb_active_employee_phone', qatarNumber);
        sessionStorage.setItem('triplea_portal_mode', 'EMPLOYEE');
      } catch {
        // Ignore
      }

      setShowPhoneModal(false);
      setPortalMode('EMPLOYEE');
      if (authMode === 'SIGNUP') setShowContactNoticeModal(true); // Popup for free corporate verification notice on registration
      setRefreshTrigger((prev) => prev + 1);
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoPreview(await compressImage(file));
    } catch {
      setConfirmError(t('photoFailedError'));
    }
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
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : String(err)) || 'Error processing wash order');
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
                  }}
                  className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-body flex items-center justify-center"
                  aria-label={t('closeBtn')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

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
                        autoFocus={authMode === 'LOGIN'}
                        placeholder={t('phoneInputPlaceholder')}
                        value={employeePhone}
                        onChange={(e) => {
                          setEmployeePhone(e.target.value);
                          setPhoneError('');
                        }}
                        className={`${fieldCls} tabular-nums ps-11`}
                      />
                      <Phone className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
                    </div>
                  </div>

                  {phoneError ? (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-sm text-rose-400 leading-relaxed">{phoneError}</p>
                      {authMode === 'LOGIN' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('SIGNUP');
                            setPhoneError('');
                          }}
                          className="text-sm text-link font-medium hover:underline"
                        >
                          {t('switchToSignUp')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-dim mt-3 leading-relaxed">{t('phoneInputHint')}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(false)}
                    className={`${softBtn} px-6 py-3`}
                  >
                    {t('cancelBtn')}
                  </button>
                  <button type="submit" disabled={authBusy} className={`${primaryBtn} flex-1 py-3 disabled:opacity-60`}>
                    <span>{authMode === 'LOGIN' ? t('signInBtn') : t('signUpBtn')}</span>
                    <ArrowFwd className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'LOGIN' ? 'SIGNUP' : 'LOGIN');
                      setPhoneError('');
                    }}
                    className="text-sm text-muted hover:text-ink transition"
                  >
                    {authMode === 'LOGIN' ? t('switchToSignUp') : t('switchToLogin')}
                  </button>
                </div>
              </form>
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
      className={`group ${tile} overflow-hidden cursor-pointer flex flex-col hover:bg-tile-hover transition-colors`}
    >
      <div className="relative h-52 md:h-60 overflow-hidden">
        <Image
          src={opts.image}
          alt={opts.imageAlt}
          fill
          className="object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-tile to-transparent" />
        <span className="absolute top-4 start-4 inline-flex px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-sm text-zinc-100">
          {opts.badge}
        </span>
      </div>

      <div className="p-6 md:p-6 flex flex-col gap-5 flex-1">
        <div className="space-y-2">
          <h3 className="text-[21px] font-semibold tracking-tight leading-tight text-ink">{opts.title}</h3>
          <p className="text-base text-muted leading-snug">{opts.desc}</p>
          {opts.bonus && (
            <div className="flex items-center gap-2 text-[14px] text-body pt-1">
              <Gift className="h-4 w-4 text-muted" />
              <span>{opts.bonus}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[32px] leading-none font-semibold tracking-tight text-ink tabular-nums">{opts.price}</span>
            <span className="text-base text-muted">{t('qar')}</span>
            {opts.was && (
              <span className="text-base text-dim line-through decoration-zinc-500 tabular-nums">
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
            <span className="text-sm font-semibold text-ink truncate">
              {t('activeEmployeePill')}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowProfileModal(true)}
              className="hidden sm:flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap"
            >
              <User className="h-4 w-4" />
              <span>{t('viewProfileBtn')}</span>
            </button>
            {languageToggleBtn}
            <button
              onClick={handleSwitchPortal}
              className="flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap"
              title={isRtl ? 'رجوع للبوابة الرئيسية' : 'Back to previous portal'}
            >
              <ArrowBack className="h-4 w-4" />
              <span className="font-medium">{t('backBtn')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden min-h-[360px] h-[46dvh] flex items-center justify-center">
        <Image
          src="/images/hero-car.jpg"
          alt="BMW Coupe"
          fill
          priority
          className="object-cover object-[72%_center] opacity-80 -z-10"
        />
        <div className="absolute inset-0 -z-10 bg-black/50" />
        <div className="absolute inset-x-0 bottom-0 h-32 -z-10 bg-gradient-to-t from-canvas to-transparent" />

        <div data-theme="dark" className="px-6 text-center max-w-[760px] rise-in">
          <div className="flex items-center justify-center gap-5 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/triplea-shield.png" alt="TripleA Shield Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain" />
            <span className="text-dim text-sm select-none">✕</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/qatar-moci-logo.png"
              alt="Ministry of Commerce and Industry - State of Qatar"
              className="w-24 h-24 md:w-32 md:h-32 object-contain"
            />
          </div>

          <h1 className="text-[26px] md:text-[40px] font-semibold tracking-tight leading-[1.08] text-ink">
            {t('employeeTagline')}
          </h1>
          <p className="text-base md:text-lg text-body mt-3">
            {t('employeeSubTagline')}
          </p>
        </div>
      </section>

      <main className="px-4 md:px-8 pb-6">
        <div className="max-w-[1100px] mx-auto space-y-10">
          {/* Employee strip */}
          {(
            <section aria-label={t('myProfileSectionTitle')} className="space-y-3">
              <h2 className="text-sm text-dim px-1">{t('myProfileSectionTitle')}</h2>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowProfileModal(true)}
                onKeyDown={activate(() => setShowProfileModal(true))}
                className={`${tile} hover:bg-tile-hover p-4 md:p-5 flex items-center justify-between gap-4 cursor-pointer transition-colors group`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="hidden sm:flex w-12 h-12 rounded-full bg-raised items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-ink" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink truncate">
                      {currentEmployee?.fullName || t('ministryEmployeeTitle')}
                    </div>
                    <div className="text-sm text-muted tabular-nums whitespace-nowrap" dir="ltr">
                      {currentEmployee?.phone || employeePhone}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {hasActiveSubscription ? (
                    <span className="inline-flex px-3.5 py-1.5 rounded-full bg-[#2997ff]/15 text-sm font-medium text-link-soft whitespace-nowrap">
                      {employeeCredits} {t('washesLeftLabel')}
                    </span>
                  ) : (
                    <span className="inline-flex px-3.5 py-1.5 rounded-full bg-fill text-sm text-muted whitespace-nowrap">
                      {t('statusInactive')}
                    </span>
                  )}
                  <ChevronFwd className="h-5 w-5 text-dim group-hover:text-ink transition-colors" />
                </div>
              </div>
            </section>
          )}

          {employeeOrders.length > 0 && (
            <Link
              href="/orders"
              className={`${tile} hover:bg-tile-hover p-4 md:p-5 flex items-center justify-between gap-4 transition-colors group`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Clock className="h-5 w-5 text-muted flex-shrink-0" />
                <span className="text-[15px] font-semibold text-ink truncate">{t('orderHistoryTitle')}</span>
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

          {/* Plans */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(
              <>
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
                {renderPlanTile({
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
              </>
            )}
          </section>

          {/* Trust */}
          <section className="grid grid-cols-3 gap-3 text-center py-3.5">
            {trustPillars.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <Icon className="h-7 w-7 text-body stroke-[1.5]" />
                <span className="text-[14px] font-medium text-body leading-snug whitespace-pre-line">{label}</span>
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
      {portalMode === 'EMPLOYEE' && currentEmployee && installStepDone && <EmployeeNotifications employeeId={currentEmployee.id} />}

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
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="text-sm text-muted block mb-1.5">{t('qatarPhoneLabel')}</label>
                  <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={`${fieldCls} tabular-nums`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted block mb-1.5">{t('plateNumberLabelShort')}</label>
                    <input type="text" value={editPlate} onChange={(e) => setEditPlate(e.target.value)} className={`${fieldCls} tabular-nums`} />
                  </div>
                  <div>
                    <label className="text-sm text-muted block mb-1.5">{t('colorLabel')}</label>
                    <input type="text" value={editColor} onChange={(e) => setEditColor(e.target.value)} className={fieldCls} />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted block mb-1.5">{t('vehicleMake')}</label>
                  <input type="text" value={editMakeModel} onChange={(e) => setEditMakeModel(e.target.value)} className={fieldCls} />
                </div>
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
                        <Sparkles className="h-4 w-4" />
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
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href="https://wa.me/97455128901?text=Hello%20TripleA%20Concierge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${softBtn} py-3`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>{t('contactWhatsApp')}</span>
                  </a>
                  <a href="tel:+97455128901" className={`${softBtn} py-3`}>
                    <Phone className="h-4 w-4" />
                    <span>{t('callConcierge')}</span>
                  </a>
                </div>

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
                  ? t('processing')
                  : parkingBayInput.trim()
                  ? `${t('confirmOrderBtn')} ${parkingBayInput.trim()} · ${selectedPlan.price} ${t('qar')}`
                  : `${t('confirmOrderBtn')} · ${selectedPlan.price} ${t('qar')}`}
              </span>
              <ArrowFwd className="h-4 w-4" />
            </button>
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
