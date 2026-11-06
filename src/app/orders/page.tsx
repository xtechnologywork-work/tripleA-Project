'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mockStore } from '@/data/mock/store';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Order } from '@/domain/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/utils';
import {
  Car,
  Clock,
  ChevronRight,
  ChevronLeft,
  Plus,
  Globe,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

export default function EmployeeOrdersPage() {
  const { actor } = useAuth();
  const router = useRouter();

  // Orders belong to a signed-in employee
  useEffect(() => {
    if (!mockStore.getEmployeeToken()) router.replace('/');
  }, [router]);
  const { isRtl, toggleLanguage } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);

  useEffect(() => {
    const loadData = () => {
      const all = mockStore.getOrders().filter((o) => o.employeeId === actor.id);
      setOrders(all);
      setCreditBalance(mockStore.getCreditBalance(actor.id));
    };

    loadData();
    const unsub = mockStore.subscribe(loadData);
    return () => unsub();
  }, [actor.id]);

  const ChevronBack = isRtl ? ChevronRight : ChevronLeft;
  const ChevronFwd = isRtl ? ChevronLeft : ChevronRight;
  const ArrowFwd = isRtl ? ArrowLeft : ArrowRight;
  const tile = 'rounded-3xl bg-tile';

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
              {isRtl ? 'سجل الطلبات' : 'Order History'}
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

      <div className="max-w-[1040px] mx-auto px-4 md:px-8 pt-4 space-y-8">
        {/* Pass balance */}
        <section className={`${tile} p-6 md:p-7 flex items-center justify-between gap-6`}>
          <div className="space-y-2">
            <span className="text-sm md:text-base text-muted block">
              {isRtl ? 'باقة الغسيل النشطة (140 ر.ق)' : 'Wash pass (140 QAR)'}
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-[48px] md:text-[56px] leading-none font-semibold text-ink tracking-tight tabular-nums">
                {creditBalance}
              </span>
              <span className="text-base md:text-base text-muted">{isRtl ? 'غسلات متبقية' : 'washes left'}</span>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-[14px] transition whitespace-nowrap flex-shrink-0"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>{isRtl ? 'طلب غسيل' : 'New wash'}</span>
          </Link>
        </section>

        {/* Orders */}
        <section className="space-y-4">
          <h2 className="text-[19px] font-semibold text-ink tracking-tight px-1">
            {isRtl ? 'قائمة الطلبات' : 'Recent orders'} <span className="text-dim font-normal tabular-nums">({orders.length})</span>
          </h2>

          {orders.length === 0 ? (
            <div className={`${tile} p-12 text-center space-y-5`}>
              <Car className="h-12 w-12 text-faint mx-auto stroke-[1.5]" />
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-ink">{isRtl ? 'لا توجد طلبات سابقة' : 'No orders yet'}</h3>
                <p className="text-[14px] text-muted max-w-[300px] mx-auto">
                  {isRtl
                    ? 'لم تقم بتقديم أي طلب غسيل سيارة حتى الآن.'
                    : 'You have not ordered a wash yet.'}
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-fill hover:bg-fill-strong text-[14px] font-medium text-ink transition"
              >
                <span>{isRtl ? 'طلب أول غسيل لسيارتك' : 'Order your first wash'}</span>
                <ArrowFwd className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {orders.map((ord) => (
                <Link
                  key={ord.id}
                  href={`/orders/${ord.reference}`}
                  className={`block ${tile} hover:bg-tile-hover p-6 transition-colors group`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[15px] tabular-nums font-semibold text-ink">{ord.reference}</span>
                        <span className="text-sm tabular-nums text-body bg-fill px-3 py-0.5 rounded-full">
                          {isRtl ? 'موقف' : 'Bay'} {ord.bayCodeSnapshot}
                        </span>
                      </div>

                      <div className="text-[14px] text-body truncate">
                        {ord.vehicleSnapshot.plateNumber} · {ord.vehicleSnapshot.make} {ord.vehicleSnapshot.model}
                      </div>

                      <div className="text-sm text-dim flex items-center gap-1.5 tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDateTime(ord.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <StatusBadge status={ord.status} isCustomerView />
                      <span className="text-sm text-link flex items-center gap-0.5">
                        <span>{isRtl ? 'تتبع' : 'Track'}</span>
                        <ChevronFwd className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
