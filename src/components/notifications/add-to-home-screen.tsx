'use client';

import React, { useEffect, useState } from 'react';
import { Share, SquarePlus, EllipsisVertical, Smartphone, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome fires this once, early; keep it until the person taps Install
let deferredInstall: InstallEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallEvent;
  });
}

const COPY = {
  en: {
    title: 'Add TripleA to your Home Screen.',
    leadIos: 'Notifications only reach your lock screen when TripleA is opened from the Home Screen. It takes ten seconds.',
    leadAndroid: 'Install TripleA so it opens like an app and can send you notifications.',
    s1: 'Tap the Share button in Safari.',
    s2: 'Choose Add to Home Screen.',
    s3: 'Open TripleA from your Home Screen.',
    a1: 'Open the browser menu.',
    a2: 'Choose Install app or Add to Home screen.',
    a3: 'Open TripleA from your Home Screen.',
    install: 'Install',
    skip: 'Continue in the browser',
    close: 'Close',
    already: 'TripleA is already on your Home Screen.',
    note: 'Notifications will not reach your lock screen this way.',
  },
  ar: {
    title: 'أضف TripleA إلى شاشتك الرئيسية.',
    leadIos: 'الإشعارات تصل إلى شاشة القفل فقط عندما تفتح TripleA من الشاشة الرئيسية. يستغرق الأمر عشر ثوانٍ.',
    leadAndroid: 'ثبّت TripleA ليُفتح كتطبيق ويستطيع إرسال الإشعارات إليك.',
    s1: 'اضغط زر المشاركة في Safari.',
    s2: 'اختر إضافة إلى الشاشة الرئيسية.',
    s3: 'افتح TripleA من شاشتك الرئيسية.',
    a1: 'افتح قائمة المتصفح.',
    a2: 'اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.',
    a3: 'افتح TripleA من شاشتك الرئيسية.',
    install: 'تثبيت',
    skip: 'المتابعة في المتصفح',
    close: 'إغلاق',
    already: 'TripleA موجود بالفعل على شاشتك الرئيسية.',
    note: 'بهذه الطريقة لن تصل الإشعارات إلى شاشة القفل.',
  },
} as const;

const SEEN_KEY = 'triplea_install_prompted';

type Kind = 'checking' | 'none' | 'ios' | 'android';

function detect(): Kind {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'none';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'none'; // computers: nothing to install
}

/**
 * The first step after sign in on a phone: add the app to the Home Screen.
 * Calls onDone when the app is already installed, on a computer, or when the person chooses to continue.
 */
export function AddToHomeScreen({ onDone, forced = false }: { onDone: () => void; forced?: boolean }) {
  const { language, isRtl } = useLanguage();
  const c = COPY[language === 'ar' ? 'ar' : 'en'];
  const [kind, setKind] = useState<Kind>('checking');
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let k = detect();
    let was = false;
    try {
      was = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Ignore
    }
    if (!forced && (k === 'none' || was)) {
      onDone();
      return;
    }
    // Asked from the profile: an installed app says so, a computer shows the browser steps
    if (k === 'none') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- install state is only known on the client
      setInstalled(standalone);
      k = 'android';
    }
    setKind(k);
    setCanPrompt(!!deferredInstall);
    const onPrompt = () => setCanPrompt(!!deferredInstall);
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => onDone();
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [onDone, forced]);

  if (kind === 'checking' || kind === 'none') return null;

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Ignore
    }
    onDone();
  };

  const install = async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    const choice = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    setCanPrompt(false);
    if (choice?.outcome === 'accepted') finish();
  };

  const steps =
    kind === 'ios'
      ? [
          { icon: <Share className="h-5 w-5" strokeWidth={1.75} />, text: c.s1 },
          { icon: <SquarePlus className="h-5 w-5" strokeWidth={1.75} />, text: c.s2 },
          { icon: <Smartphone className="h-5 w-5" strokeWidth={1.75} />, text: c.s3 },
        ]
      : [
          { icon: <EllipsisVertical className="h-5 w-5" strokeWidth={1.75} />, text: c.a1 },
          { icon: <SquarePlus className="h-5 w-5" strokeWidth={1.75} />, text: c.a2 },
          { icon: <Smartphone className="h-5 w-5" strokeWidth={1.75} />, text: c.a3 },
        ];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      className="fixed inset-0 z-[310] flex items-end sm:items-center justify-center bg-scrim backdrop-blur-sm"
      data-theme="dark"
    >
      <div className="w-full sm:max-w-[420px] rounded-t-[28px] sm:rounded-[28px] bg-tile px-7 pt-12 pb-8 text-center">
        {installed ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-ink" strokeWidth={1.5} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/images/triplea-shield.png" alt="" className="mx-auto h-14 w-12 object-contain" />
        )}
        <h2
          id="install-title"
          className="mt-6 text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink text-balance"
        >
          {installed ? c.already : c.title}
        </h2>
        {!installed && (
          <p className="mx-auto mt-3 max-w-[340px] text-[17px] leading-[1.47] tracking-[-0.01em] text-muted">
            {kind === 'ios' ? c.leadIos : c.leadAndroid}
          </p>
        )}

        {!installed && !(kind === 'android' && canPrompt) && (
          <ol className="mx-auto mt-7 max-w-[340px] space-y-3 text-start">
            {steps.map((step, i) => (
              <li key={step.text} className="flex items-center gap-3 text-[15px] text-ink">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-raised text-ink">
                  {step.icon}
                </span>
                <span>
                  <span className="me-2 tabular-nums text-dim">{i + 1}</span>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-9 space-y-3">
          {!installed && kind === 'android' && canPrompt && (
            <button
              onClick={install}
              className="w-full rounded-full bg-[#0071e3] py-3.5 text-[17px] font-normal text-white transition hover:bg-[#0077ed] active:scale-95 cursor-pointer"
            >
              {c.install}
            </button>
          )}
          <button
            onClick={finish}
            className={
              kind === 'android' && canPrompt
                ? 'w-full py-2 text-[15px] text-link-soft cursor-pointer'
                : 'w-full rounded-full bg-raised py-3.5 text-[17px] font-normal text-ink transition active:scale-95 cursor-pointer'
            }
          >
            {forced ? c.close : c.skip}
          </button>
          {!forced && <p className="text-[13px] text-dim">{c.note}</p>}
        </div>
      </div>
    </div>
  );
}
