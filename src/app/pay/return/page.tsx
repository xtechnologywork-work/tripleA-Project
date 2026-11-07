'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { mockStore } from '@/data/mock/store';

type State = 'checking' | 'paid' | 'failed' | 'error';

/**
 * MyFatoorah sends the customer back here after paying. The server checks the payment with MyFatoorah and
 * makes the order; then this page opens the order's tracking page.
 */
function PaymentReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const { t, isRtl } = useLanguage();
  const [state, setState] = useState<State>('checking');

  // Asking twice is safe: the server makes the order only once
  useEffect(() => {
    const paymentId = params.get('paymentId') || params.get('PaymentId') || params.get('Id') || params.get('id') || '';
    let paymentRef = '';
    try {
      paymentRef = sessionStorage.getItem('triplea_payment_ref') || '';
    } catch {
      // Ignore
    }

    let cancelled = false;
    const ask = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch('/api/pay/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId, paymentRef }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.status === 'PAID' && data.reference) {
          setState('paid');
          try {
            sessionStorage.removeItem('triplea_payment_ref');
          } catch {
            // Ignore
          }
          // Bring the new order onto this device, then show it
          await mockStore.syncFromServer(true).catch(() => undefined);
          setTimeout(() => router.replace(`/orders/${data.reference}`), 900);
          return;
        }
        if (data.status === 'FAILED') {
          setState('failed');
          return;
        }
        // Still being processed: ask again for about a minute
        if ((data.status === 'PENDING' || res.status >= 500) && attempt < 20) {
          setTimeout(() => void ask(attempt + 1), 3000);
          return;
        }
        setState('error');
      } catch {
        if (cancelled) return;
        if (attempt < 20) setTimeout(() => void ask(attempt + 1), 3000);
        else setState('error');
      }
    };
    if (!paymentId && !paymentRef) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check
      setState('error');
    } else {
      void ask(0);
    }
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  const view = {
    checking: { icon: <Loader2 className="h-12 w-12 text-ink animate-spin" />, title: t('payCheckingTitle'), body: t('payCheckingBody') },
    paid: { icon: <CheckCircle2 className="h-12 w-12 text-emerald-400" />, title: t('paySuccessTitle'), body: t('paySuccessBody') },
    failed: { icon: <XCircle className="h-12 w-12 text-rose-400" />, title: t('payFailedTitle'), body: t('payFailedBody') },
    error: { icon: <AlertTriangle className="h-12 w-12 text-amber-300" />, title: t('payErrorTitle'), body: t('payErrorBody') },
  }[state];

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-canvas text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] text-center space-y-5" role="status" aria-live="polite">
        <div className="flex justify-center">{view.icon}</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">{view.title}</h1>
        <p className="text-[15px] text-muted leading-relaxed">{view.body}</p>
        {(state === 'failed' || state === 'error') && (
          <div className="flex flex-col gap-2.5 pt-2">
            {state === 'failed' && (
              <Link href="/" className="py-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[16px] transition active:scale-95">
                {t('payTryAgain')}
              </Link>
            )}
            <Link
              href={state === 'error' ? '/orders' : '/'}
              className="py-3.5 rounded-full bg-fill hover:bg-fill-strong text-ink text-[16px] transition active:scale-95"
            >
              {state === 'error' ? t('orderHistoryTitle') : t('payGoHome')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <PaymentReturn />
    </Suspense>
  );
}
