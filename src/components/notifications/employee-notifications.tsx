'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCircle2, X } from 'lucide-react';
import { mockStore } from '@/data/mock/store';
import { STATUS_META } from '@/domain/status-machine';
import { AR_CUSTOMER_LABELS } from '@/components/ui/status-badge';
import { useLanguage } from '@/context/language-context';
import { readyPlace } from '@/lib/utils';

type Perm = 'checking' | 'default' | 'granted' | 'denied' | 'unsupported';

const COPY = {
  en: {
    title: 'Know when your car is ready.',
    lead: 'Turn on notifications and we will tell you when the team starts the wash, and when your car is parked back in its bay.',
    enable: 'Turn on notifications',
    close: 'Close',
    deniedTitle: 'Notifications are blocked.',
    deniedLead: 'Allow them in your browser settings for this site, then come back.',
    s1: 'Tap the lock icon next to the address bar.',
    s2: 'Open Site settings, then Notifications.',
    s3: 'Choose Allow.',
    recheck: 'I turned it on',
    unsupportedTitle: 'This browser cannot show notifications.',
    unsupportedLead: 'On iPhone, add TripleA to your Home Screen from the Share menu, then open it from there.',
    cont: 'Continue without',
    readyTitle: 'Notifications are on',
    readyBody: 'You will be told when your car is washed and ready.',
    now: 'now',
    p1: 'Team assigned to your car',
    p2: 'Your car is being washed',
    p3: 'Ready in your bay',
  },
  ar: {
    title: 'اعرف متى تصبح سيارتك جاهزة.',
    lead: 'فعّل الإشعارات لنخبرك عندما يبدأ الفريق الغسيل، وعندما تعود سيارتك إلى موقفها.',
    enable: 'تفعيل الإشعارات',
    close: 'إغلاق',
    deniedTitle: 'الإشعارات محظورة.',
    deniedLead: 'اسمح بها من إعدادات المتصفح لهذا الموقع، ثم ارجع.',
    s1: 'اضغط على أيقونة القفل بجانب شريط العنوان.',
    s2: 'افتح إعدادات الموقع ثم الإشعارات.',
    s3: 'اختر السماح.',
    recheck: 'قمت بتفعيلها',
    unsupportedTitle: 'هذا المتصفح لا يدعم الإشعارات.',
    unsupportedLead: 'على الآيفون أضف TripleA إلى الشاشة الرئيسية من قائمة المشاركة، ثم افتحه منها.',
    cont: 'المتابعة بدونها',
    readyTitle: 'الإشعارات مفعّلة',
    readyBody: 'سنخبرك عند غسل سيارتك وجاهزيتها.',
    now: 'الآن',
    p1: 'تم تعيين الفريق لسيارتك',
    p2: 'جاري غسل سيارتك',
    p3: 'سيارتك جاهزة في موقفها',
  },
} as const;

/** A sample of what the notification will look like, cycling through the three moments that matter. */
function NotificationPreview({ c, bay }: { c: (typeof COPY)['en'] | (typeof COPY)['ar']; bay: string }) {
  const steps = [c.p1, c.p2, `${c.p3} · ${bay}`];
  const [i, setI] = useState(2);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loop starts from the first moment
    setI(0);
    const id = setInterval(() => setI((n) => (n + 1) % 3), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative mx-auto h-[72px] w-full max-w-[340px]" aria-hidden="true">
      {steps.map((text, n) => (
        <div
          key={text}
          className={`absolute inset-0 flex items-center gap-3 rounded-[20px] bg-raised px-3.5 text-start transition duration-500 ease-out ${
            n === i ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/triplea-shield.png" alt="" className="h-10 w-10 shrink-0 rounded-[10px] bg-black object-contain p-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink">TripleA</span>
              <span className="text-xs text-dim">{c.now}</span>
            </div>
            <div className="truncate text-[14px] text-muted">{text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
export function EmployeeNotifications({
  employeeId,
  forced = false,
  onClose,
}: {
  employeeId: string;
  /** Opened from the profile: always shown, even if it was closed before */
  forced?: boolean;
  onClose?: () => void;
}) {
  const { language, isRtl } = useLanguage();
  const c = COPY[language === 'ar' ? 'ar' : 'en'];
  const [perm, setPerm] = useState<Perm>('checking');
  const [skipped, setSkipped] = useState(false);
  const [closed, setClosed] = useState(false);
  const [seen, setSeen] = useState<boolean | null>(null);
  const seenKey = `triplea_notif_prompted_${employeeId}`;
  const markSeen = () => {
    try {
      localStorage.setItem(seenKey, '1');
    } catch {
      // Ignore
    }
  };
  const close = () => {
    markSeen();
    setClosed(true);
    onClose?.();
  };
  useEffect(() => {
    let was = false;
    try {
      was = localStorage.getItem(seenKey) === '1';
    } catch {
      // Ignore
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved choice is only known on the client
    setSeen(was);
  }, [seenKey]);
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
      if (result !== 'default') markSeen();
      if (result === 'granted') {
        setJustOn(true);
        const cc = COPY[langRef.current === 'ar' ? 'ar' : 'en'];
        await showSystemNotification(cc.readyTitle, cc.readyBody, 'welcome', '/orders');
        setTimeout(() => {
          setJustOn(false);
          onClose?.();
        }, 1800);
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
                  ? `${label} · ${readyPlace(o) ? `${readyPlace(o)!.floor}، موقف ${readyPlace(o)!.bay}` : `موقف ${o.bayCodeSnapshot}`}`
                  : `${label} · ${readyPlace(o) ? `${readyPlace(o)!.floor}, bay ${readyPlace(o)!.bay}` : `Bay ${o.bayCodeSnapshot}`}`
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

  const bayHint = mockStore.getEmployeeOrders(employeeId)[0]?.bayCodeSnapshot || '34';
  const needsPrompt = perm === 'default' || perm === 'denied' || (perm === 'unsupported' && !skipped);
  const blocking = forced ? !closed : !closed && seen === false && needsPrompt;
  const alreadyOn = forced && perm === 'granted';
  if (perm === 'checking' || seen === null || (!blocking && !justOn)) return null;

  const isDenied = perm === 'denied';
  const isUnsupported = perm === 'unsupported';
  const primary =
    'w-full rounded-full bg-[#0071e3] py-3.5 text-[17px] font-normal text-white transition hover:bg-[#0077ed] active:scale-95 cursor-pointer';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-title"
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-scrim backdrop-blur-sm"
      data-theme="dark"
    >
      <div className="relative w-full sm:max-w-[420px] rounded-t-[28px] sm:rounded-[28px] bg-tile px-7 pt-12 pb-8 text-center">
        {!justOn && (
          <button
            onClick={close}
            aria-label={c.close}
            className="absolute end-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-fill text-muted transition hover:text-ink active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {justOn || alreadyOn ? (
          <div className="py-10 space-y-5">
            <CheckCircle2 className="mx-auto h-12 w-12 text-ink" strokeWidth={1.5} />
            <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{c.readyTitle}</h2>
          </div>
        ) : (
          <>
            {isDenied || isUnsupported ? (
              <BellOff className="mx-auto h-12 w-12 text-dim" strokeWidth={1.5} />
            ) : (
              <Bell className="mx-auto h-12 w-12 text-ink" strokeWidth={1.5} />
            )}

            <h2
              id="notif-title"
              className="mt-6 text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink text-balance"
            >
              {isDenied ? c.deniedTitle : isUnsupported ? c.unsupportedTitle : c.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[340px] text-[17px] leading-[1.47] tracking-[-0.01em] text-muted">
              {isDenied ? c.deniedLead : isUnsupported ? c.unsupportedLead : c.lead}
            </p>

            {isDenied ? (
              <ol className="mx-auto mt-7 max-w-[340px] space-y-3 text-start">
                {[c.s1, c.s2, c.s3].map((step, i) => (
                  <li key={step} className="flex items-baseline gap-3 text-[15px] text-ink">
                    <span className="w-4 shrink-0 text-dim tabular-nums">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            ) : !isUnsupported ? (
              <div className="mt-8">
                <NotificationPreview c={c} bay={bayHint} />
              </div>
            ) : null}

            <div className="mt-9 space-y-3">
              {isUnsupported ? (
                <button onClick={() => setSkipped(true)} className={primary}>
                  {c.cont}
                </button>
              ) : isDenied ? (
                <button onClick={() => setPerm(readPerm())} className={primary}>
                  {c.recheck}
                </button>
              ) : (
                <>
                  <button onClick={enable} className={primary}>
                    {c.enable}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
