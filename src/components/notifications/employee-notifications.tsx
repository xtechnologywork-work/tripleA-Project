'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCircle2, Sparkles, Car, ShieldAlert } from 'lucide-react';
import { mockStore } from '@/data/mock/store';
import { STATUS_META } from '@/domain/status-machine';
import { AR_CUSTOMER_LABELS } from '@/components/ui/status-badge';
import { useLanguage } from '@/context/language-context';

type Perm = 'checking' | 'default' | 'granted' | 'denied' | 'unsupported';

const COPY = {
  en: {
    title: 'Turn on notifications',
    lead: 'We tell you the moment something happens to your car. Without this you would have to keep checking the app.',
    b1: 'Team assigned to your car',
    b2: 'Your car is being washed',
    b3: 'Ready in your bay, with the bay number',
    enable: 'Turn on notifications',
    required: 'Required to use the service',
    deniedTitle: 'Notifications are blocked',
    deniedLead: 'Open your browser settings for this site and set Notifications to Allow. Then come back and tap the button.',
    s1: 'Tap the lock icon next to the address bar',
    s2: 'Open Site settings, then Notifications',
    s3: 'Choose Allow',
    recheck: 'I turned it on',
    unsupportedTitle: 'Notifications are not available here',
    unsupportedLead: 'This browser cannot show notifications. On iPhone, add TripleA to your Home Screen from the Share menu, then open it from there.',
    cont: 'Continue anyway',
    readyTitle: 'Notifications are on',
    readyBody: 'You will be told when your car is washed and ready.',
    open: 'Open order',
  },
  ar: {
    title: 'فعّل الإشعارات',
    lead: 'نخبرك لحظة حدوث أي شيء لسيارتك. بدونها ستضطر لفتح التطبيق باستمرار.',
    b1: 'تعيين الفريق لسيارتك',
    b2: 'بدء غسيل سيارتك',
    b3: 'السيارة جاهزة في موقفها مع رقم الموقف',
    enable: 'تفعيل الإشعارات',
    required: 'مطلوب لاستخدام الخدمة',
    deniedTitle: 'الإشعارات محظورة',
    deniedLead: 'افتح إعدادات المتصفح لهذا الموقع واجعل الإشعارات على السماح. ثم ارجع واضغط الزر.',
    s1: 'اضغط على أيقونة القفل بجانب شريط العنوان',
    s2: 'افتح إعدادات الموقع ثم الإشعارات',
    s3: 'اختر السماح',
    recheck: 'قمت بتفعيلها',
    unsupportedTitle: 'الإشعارات غير متاحة هنا',
    unsupportedLead: 'هذا المتصفح لا يدعم الإشعارات. على الآيفون أضف TripleA إلى الشاشة الرئيسية من قائمة المشاركة ثم افتحه منها.',
    cont: 'المتابعة على أي حال',
    readyTitle: 'الإشعارات مفعّلة',
    readyBody: 'سنخبرك عند غسل سيارتك وجاهزيتها.',
    open: 'فتح الطلب',
  },
} as const;

async function showSystemNotification(title: string, body: string, tag: string, url: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, tag, data: { url }, icon: '/favicon.ico' });
      return;
    }
  } catch {
    // fall through to the page notification
  }
  try {
    new Notification(title, { body, tag });
  } catch {
    // Ignore
  }
}

const SEEN_KEY = 'triplea_seen_status';

/**
 * Asks the employee to turn notifications on right after sign in (the screen cannot be closed
 * until they do), then shows a system notification whenever one of their orders changes stage.
 */
export function EmployeeNotifications({ employeeId }: { employeeId: string }) {
  const { language, isRtl } = useLanguage();
  const c = COPY[language === 'ar' ? 'ar' : 'en'];
  const [perm, setPerm] = useState<Perm>('checking');
  const [skipped, setSkipped] = useState(false);
  const [justOn, setJustOn] = useState(false);
  const langRef = useRef(language);
  useEffect(() => {
    langRef.current = language;
  }, [language]);

  const readPerm = useCallback((): Perm => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as Perm;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser permission is only known on the client
    setPerm(readPerm());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [readPerm]);

  // Re-check when the person comes back from the browser settings
  useEffect(() => {
    const again = () => setPerm(readPerm());
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [readPerm]);

  const enable = async () => {
    try {
      const result = await Notification.requestPermission();
      setPerm(result as Perm);
      if (result === 'granted') {
        setJustOn(true);
        const cc = COPY[langRef.current === 'ar' ? 'ar' : 'en'];
        await showSystemNotification(cc.readyTitle, cc.readyBody, 'welcome', '/orders');
        setTimeout(() => setJustOn(false), 1800);
      }
    } catch {
      setPerm(readPerm());
    }
  };

  // Tell the employee when one of their orders moves to a new stage
  useEffect(() => {
    if (perm !== 'granted' || !employeeId) return;
    const check = () => {
      let seen: Record<string, string> = {};
      try {
        seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
      } catch {
        seen = {};
      }
      const mine = mockStore.getEmployeeOrders(employeeId);
      let changed = false;
      for (const o of mine) {
        const before = seen[o.id];
        if (before !== o.status) {
          // The first time an order is seen only records its stage, so nothing old is announced
          if (before !== undefined) {
            const ar = langRef.current === 'ar';
            const label = ar ? AR_CUSTOMER_LABELS[o.status] : STATUS_META[o.status].customerLabel;
            const body =
              o.status === 'RETURNED_TO_PARKING'
                ? ar
                  ? `${label} · موقف ${o.bayCodeSnapshot}`
                  : `${label} · Bay ${o.bayCodeSnapshot}`
                : label;
            void showSystemNotification(`TripleA · ${o.reference}`, body, o.id, `/orders/${o.reference}`);
          }
          seen[o.id] = o.status;
          changed = true;
        }
      }
      if (changed) {
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
        } catch {
          // Ignore
        }
      }
    };
    check();
    return mockStore.subscribe(check);
  }, [perm, employeeId]);

  const blocking = perm === 'default' || perm === 'denied' || (perm === 'unsupported' && !skipped);
  if (perm === 'checking' || (!blocking && !justOn)) return null;

  const isDenied = perm === 'denied';
  const isUnsupported = perm === 'unsupported';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-title"
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-scrim backdrop-blur-md px-4 pb-4 sm:pb-0"
      data-theme="dark"
    >
      <div className="w-full max-w-[400px] rounded-[28px] bg-tile p-7 text-center shadow-2xl">
        {justOn ? (
          <div className="py-8 space-y-4">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h2 className="text-[20px] font-semibold text-ink">{c.readyTitle}</h2>
          </div>
        ) : (
          <>
            <div className="relative mx-auto mb-5 h-20 w-20">
              {!isDenied && !isUnsupported && (
                <>
                  <span className="absolute inset-0 rounded-full bg-[#2997ff]/20 animate-ping" />
                  <span className="absolute -inset-2 rounded-full bg-[#2997ff]/10" />
                </>
              )}
              <div
                className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
                  isDenied ? 'bg-rose-400/15 text-rose-300' : isUnsupported ? 'bg-fill text-dim' : 'bg-[#0071e3] text-white'
                }`}
              >
                {isDenied ? <ShieldAlert className="h-9 w-9" /> : isUnsupported ? <Bell className="h-9 w-9" /> : <BellRing className="h-9 w-9" />}
              </div>
            </div>

            <h2 id="notif-title" className="text-[22px] font-semibold tracking-tight text-ink">
              {isDenied ? c.deniedTitle : isUnsupported ? c.unsupportedTitle : c.title}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {isDenied ? c.deniedLead : isUnsupported ? c.unsupportedLead : c.lead}
            </p>

            {!isUnsupported && !isDenied && (
              <ul className="mt-6 space-y-2.5 text-start">
                {[
                  { icon: <Sparkles className="h-4 w-4" />, text: c.b1 },
                  { icon: <Car className="h-4 w-4" />, text: c.b2 },
                  { icon: <CheckCircle2 className="h-4 w-4" />, text: c.b3 },
                ].map((row) => (
                  <li key={row.text} className="flex items-center gap-3 rounded-2xl bg-inset px-4 py-3 text-[14px] text-ink">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2997ff]/15 text-[#2997ff]">
                      {row.icon}
                    </span>
                    {row.text}
                  </li>
                ))}
              </ul>
            )}

            {isDenied && (
              <ol className="mt-6 space-y-2.5 text-start">
                {[c.s1, c.s2, c.s3].map((step, i) => (
                  <li key={step} className="flex items-center gap-3 rounded-2xl bg-inset px-4 py-3 text-[14px] text-ink">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-7 space-y-2.5">
              {isUnsupported ? (
                <button
                  onClick={() => setSkipped(true)}
                  className="w-full rounded-full bg-[#0071e3] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#0077ed] cursor-pointer"
                >
                  {c.cont}
                </button>
              ) : isDenied ? (
                <button
                  onClick={() => setPerm(readPerm())}
                  className="w-full rounded-full bg-[#0071e3] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#0077ed] cursor-pointer"
                >
                  {c.recheck}
                </button>
              ) : (
                <>
                  <button
                    onClick={enable}
                    className="w-full rounded-full bg-[#0071e3] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#0077ed] cursor-pointer"
                  >
                    {c.enable}
                  </button>
                  <p className="text-xs text-dim">{c.required}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
