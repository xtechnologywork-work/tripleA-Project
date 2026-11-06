'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { mockStore } from '@/data/mock/store';
import { Order, OrderEvent, OrderPhoto } from '@/domain/types';
import { formatDateTime, formatQAR } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Globe,
  MapPin,
  KeyRound,
  Camera,
  Maximize2,
  X,
  MessageSquare,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Suspense } from 'react';

function OrderTrackingContent({ params }: { params: Promise<{ reference: string }> }) {
  const resolvedParams = use(params);
  const reference = resolvedParams.reference;
  const router = useRouter();
  const { actor } = useAuth();
  const { isRtl, toggleLanguage } = useLanguage();

  const [order, setOrder] = useState<Order | null>(null);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = () => {
      const found = mockStore.getOrderById(reference);
      if (found) {
        setOrder(found);
        setPhotos(mockStore.getOrderPhotos(found.id));
        setEvents(mockStore.getOrderEvents(found.id));
      }
    };

    fetchOrder();
    const unsubscribe = mockStore.subscribe(fetchOrder);
    
    // Cross-device sync (polls server every 1000ms for live phone/PC sync)
    const interval = setInterval(async () => {
      await mockStore.syncFromServer();
      fetchOrder();
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [reference]);

  if (!order) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
        <div className="text-center space-y-3 text-sm text-muted">
          <RotateCw className="h-5 w-5 animate-spin mx-auto text-ink" />
          <p>{isRtl ? `جاري تحميل تفاصيل الطلب ${reference}...` : `Loading order reference ${reference}...`}</p>
        </div>
      </div>
    );
  }

  // 4 Core Progression Milestones
  const statusSteps = [
    { key: 'NEW', label: isRtl ? 'تم الاستلام' : 'Received', desc: isRtl ? 'بانتظار التعيين' : 'In queue' },
    { key: 'ASSIGNED', label: isRtl ? 'تم التعيين' : 'Assigned', desc: isRtl ? 'الفني في الطريق' : 'En route' },
    { key: 'IN_PROGRESS', label: isRtl ? 'جاري الغسيل' : 'Cleaning', desc: isRtl ? 'تنظيف هيدرو فاخر' : 'Hydro detailing' },
    { key: 'RETURNED_TO_PARKING', label: isRtl ? 'جاهزة بالموقف' : 'Ready at Bay', desc: isRtl ? 'تم إرجاع السيارة' : 'Parked & ready' },
  ];

  // Helper for step progression
  const getStepIndex = (status: string) => {
    switch (status) {
      case 'NEW':
        return 0;
      case 'ASSIGNED':
        return 1;
      case 'IN_PROGRESS':
        return 2;
      case 'QUALITY_CHECK':
        return 2; // Treat QC as active wash final phase
      case 'COMPLETED':
      case 'RETURNED_TO_PARKING':
        return 3;
      default:
        return 0;
    }
  };

  const currentStepIdx = getStepIndex(order.status);
  const isCancelled = order.status === 'CANCELLED';
  const isIssue = order.status === 'ISSUE_REPORTED';

  const handleCancel = () => {
    if (confirm(isRtl ? 'هل تريد بالتأكيد إلغاء طلب الغسيل؟' : 'Are you sure you want to cancel this detailing request?')) {
      try {
        mockStore.transitionOrder(
          order.id,
          'CANCELLED',
          { cancellation: { reason: 'Client cancelled request' } },
          actor
        );
      } catch (err: unknown) {
        alert((err instanceof Error ? err.message : String(err)) || 'Unable to cancel order');
      }
    }
  };

  // Get dynamic headline
  const getHeadline = () => {
    if (isCancelled) return isRtl ? 'تم إلغاء الطلب' : 'Order cancelled';
    if (isIssue) return isRtl ? 'تنبيه تشغيلي قيد المتابعة' : 'Under review';

    switch (order.status) {
      case 'NEW':
        return isRtl ? 'تم استلام طلبك بنجاح' : 'Order received';
      case 'ASSIGNED':
        return isRtl ? 'تم تعيين فني الغسيل' : 'Technician assigned';
      case 'IN_PROGRESS':
        return isRtl ? 'جاري تنظيف وتلميع سيارتك' : 'Washing your car';
      case 'QUALITY_CHECK':
        return isRtl ? 'فحص الجودة النهائي' : 'Final check';
      case 'COMPLETED':
      case 'RETURNED_TO_PARKING':
        return isRtl ? 'سيارتك جاهزة ونظيفة في الموقف' : 'Your car is ready';
      default:
        return isRtl ? 'متابعة حالة الغسيل' : 'Live status';
    }
  };

  const tile = 'rounded-3xl bg-tile';
  const ChevronBack = isRtl ? ChevronRight : ChevronLeft;
  const ArrowFwd = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-canvas text-ink pb-16 font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-30 h-14 bg-canvas/80 backdrop-blur-xl">
        <div className="max-w-[1040px] mx-auto h-full px-4 md:px-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-link hover:text-link-soft py-2 whitespace-nowrap">
            <ChevronBack className="h-5 w-5" />
            <span>{isRtl ? 'الرئيسية' : 'Portal'}</span>
          </Link>

          <div className="text-center min-w-0">
            <h1 className="text-[14px] font-semibold text-ink leading-tight truncate">
              {isRtl ? 'تتبع الغسيل المباشر' : 'Live status'}
            </h1>
            <span className="text-xs text-dim block truncate">TripleA · Lusail Towers</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 text-sm text-ink bg-fill hover:bg-fill-strong px-4 py-2 rounded-full whitespace-nowrap"
            >
              <Globe className="h-4 w-4" />
              <span>{isRtl ? 'English' : 'العربية'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1040px] mx-auto px-4 md:px-8 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left column */}
        <div className="space-y-4">
          {/* Status */}
          <div className={`${tile} p-6 space-y-6`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-body">{isRtl ? 'متابعة فورية' : 'Live Tracking'}</span>
              </div>
              <span className="text-sm text-body bg-fill px-3 py-1 rounded-full tabular-nums">{order.reference}</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-[26px] md:text-[32px] font-semibold text-ink tracking-tight leading-[1.08]">{getHeadline()}</h2>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-fill text-sm tabular-nums">
                <MapPin className="h-4 w-4 text-body" />
                <span className="text-body">{isRtl ? 'موقف رقم:' : 'Bay:'}</span>
                <strong className="text-ink text-[14px]">{order.bayCodeSnapshot}</strong>
              </div>
            </div>

            {isIssue && (
              <div className="p-4 rounded-2xl bg-amber-400/10 text-amber-200 text-sm flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <span>
                  {isRtl
                    ? 'تم تسجيل ملاحظة تشغيلية من قبل فريق العمل ويجري متابعتها فوراً.'
                    : 'An operational note was recorded by the crew and is being handled.'}
                </span>
              </div>
            )}

            {isCancelled && (
              <div className="p-4 rounded-2xl bg-rose-400/10 text-rose-300 text-sm flex items-center gap-3">
                <XCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
                <span>
                  {isRtl
                    ? `تم إلغاء الطلب: ${order.cancellation?.reason || 'بواسطة العميل'}`
                    : `Order cancelled: ${order.cancellation?.reason || 'By customer'}`}
                </span>
              </div>
            )}

            {!isCancelled && (
              <ol className="pt-2">
                {statusSteps.map((step, idx) => {
                  const isDone = currentStepIdx > idx;
                  const isCurrent = currentStepIdx === idx;
                  const isLast = idx === statusSteps.length - 1;

                  return (
                    <li key={step.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isDone
                              ? 'bg-[#2997ff] text-white'
                              : isCurrent
                              ? 'bg-ink animate-pulse'
                              : 'bg-fill'
                          }`}
                        >
                          {isDone ? (
                            <Check className="h-4 w-4 stroke-[3]" />
                          ) : (
                            <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-canvas' : 'bg-zinc-500'}`} />
                          )}
                        </span>
                        {!isLast && (
                          <span className={`w-0.5 flex-1 min-h-[28px] ${isDone ? 'bg-[#2997ff]' : 'bg-fill'}`} />
                        )}
                      </div>
                      <div className={isLast ? '' : 'pb-6'}>
                        <div
                          className={`text-[15px] leading-7 ${
                            isCurrent ? 'text-ink font-semibold' : isDone ? 'text-body' : 'text-dim'
                          }`}
                        >
                          {step.label}
                        </div>
                        <div className={`text-sm ${isCurrent ? 'text-muted' : 'text-faint'}`}>{step.desc}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Specialist */}
          {order.assignment?.assignedName && (
            <div className={`${tile} p-5 flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center text-ink font-semibold text-base flex-shrink-0">
                  {order.assignment.assignedName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="text-sm text-muted block">
                    {isRtl ? 'الفني الميداني المسؤول' : 'Your technician'}
                  </span>
                  <span className="text-[15px] font-semibold text-ink block truncate">{order.assignment.assignedName}</span>
                </div>
              </div>

              <a
                href="https://wa.me/97455128901?text=Hello%20TripleA%20Concierge"
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 rounded-full bg-fill hover:bg-fill-strong text-ink flex items-center justify-center flex-shrink-0 transition"
                title={isRtl ? 'محادثة فورية' : 'Chat'}
                aria-label={isRtl ? 'محادثة فورية' : 'Chat'}
              >
                <MessageSquare className="h-5 w-5" />
              </a>
            </div>
          )}

          {/* Photo */}
          {photos.length > 0 && (
            <div className={`${tile} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-ink flex items-center gap-2">
                  <Camera className="h-4 w-4 text-body" />
                  <span>{isRtl ? 'صورة التحقق من لوحة السيارة' : 'Rear plate photo'}</span>
                </span>
                <span className="text-sm text-emerald-400">{isRtl ? 'مرفقة' : 'Verified'}</span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setLightboxPhoto(photos[0].blobKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLightboxPhoto(photos[0].blobKey);
                  }
                }}
                className="relative rounded-2xl overflow-hidden h-52 bg-black/50 group cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[0].blobKey}
                  alt="Vehicle Rear Verification"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition flex items-center justify-center">
                  <span className="px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-sm flex items-center gap-2">
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>{isRtl ? 'اضغط لتكبير الصورة' : 'Tap to enlarge'}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {order.instructions && (
            <div className={`${tile} p-5 space-y-2`}>
              <div className="flex items-center gap-2 text-sm text-muted">
                <KeyRound className="h-4 w-4 text-body" />
                <span>{isRtl ? 'تعليماتك لفريق العمل' : 'Your notes for the crew'}</span>
              </div>
              <p className="text-[14px] text-ink leading-relaxed">{order.instructions}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Reminder */}
          <div className="rounded-3xl bg-amber-400/[0.08] p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-400/15 flex items-center justify-center flex-shrink-0 text-amber-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-[14px] font-semibold text-amber-300">{isRtl ? 'تذكير هام' : 'Reminder'}</h4>
              <p className="text-sm text-body leading-relaxed">
                {isRtl
                  ? 'يرجى التأكد من ترك نافذة السيارة مفتوحة قليلاً والمفتاح بداخلها ليتمكن الفني من تنظيف سيارتك بأمان.'
                  : 'Leave a window slightly open and the key inside so the crew can reach your car.'}
              </p>
            </div>
          </div>

          {/* Receipt */}
          <div className={`${tile} p-6 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">{isRtl ? 'تفاصيل الإيصال والمركبة' : 'Receipt'}</h3>
              <span className="text-sm text-dim tabular-nums">{formatDateTime(order.createdAt)}</span>
            </div>

            <dl className="space-y-3 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{isRtl ? 'رقم اللوحة' : 'Plate Number'}</dt>
                <dd className="flex items-center gap-2 tabular-nums font-semibold text-ink bg-fill px-3.5 py-1 rounded-full">
                  <span>{order.vehicleSnapshot.plateNumber}</span>
                  <span className="text-xs text-muted font-normal">{isRtl ? 'قطر' : 'QATAR'}</span>
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{isRtl ? 'نوع الخدمة' : 'Service'}</dt>
                <dd className="font-medium text-ink text-end">{order.serviceSnapshot.name}</dd>
              </div>

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{isRtl ? 'موقع الموقف' : 'Parking Bay'}</dt>
                <dd className="tabular-nums font-semibold text-ink">
                  {order.bayCodeSnapshot}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                <dt className="text-muted">{isRtl ? 'طريقة الدفع' : 'Payment Mode'}</dt>
                <dd className="tabular-nums font-semibold text-ink text-end">
                  {order.paymentMode === 'CREDIT'
                    ? isRtl
                      ? `${order.creditsUsed} رصيد باقة 140 ر.ق (0 ر.ق)`
                      : `${order.creditsUsed} Pass Credit (0 QAR)`
                    : formatQAR(order.priceSnapshot?.amountMinor || 0)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/"
              className="w-full py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[14px] transition flex items-center justify-center gap-2"
            >
              <span>{isRtl ? 'الرجوع للبوابة الرئيسية' : 'Back to home'}</span>
              <ArrowFwd className="h-4 w-4" />
            </Link>

            <a
              href="https://wa.me/97455128901?text=Hello%20TripleA%20Concierge"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-full bg-fill hover:bg-fill-strong text-body hover:text-ink text-[14px] transition flex items-center justify-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{isRtl ? 'محادثة فورية مع الكونسيرج (واتساب)' : 'Chat on WhatsApp'}</span>
            </a>

            {order.status === 'NEW' && (
              <button
                onClick={handleCancel}
                className="w-full py-3 rounded-full bg-rose-400/10 hover:bg-rose-400/15 text-rose-300 text-[14px] transition"
              >
                {isRtl ? 'إلغاء الطلب' : 'Cancel Order'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-tile rounded-3xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-ink">
                {isRtl ? 'صورة التحقق من لوحة السيارة' : 'Rear plate photo'}
              </span>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="w-9 h-9 rounded-full bg-fill text-ink hover:bg-fill-strong transition flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative max-h-[70vh] overflow-hidden rounded-2xl bg-canvas flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxPhoto} alt="Full verification photo" className="w-full h-auto max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderTrackingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
          <div className="text-center tabular-nums text-xs text-muted">
            Loading...
          </div>
        </div>
      }
    >
      <OrderTrackingContent params={params} />
    </Suspense>
  );
}
