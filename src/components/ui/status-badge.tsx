'use client';

import React from 'react';
import { OrderStatus } from '@/domain/types';
import { STATUS_META } from '@/domain/status-machine';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';

const AR_CUSTOMER_LABELS: Record<OrderStatus, string> = {
  NEW: 'تم استلام الطلب',
  ASSIGNED: 'تم تعيين الفريق',
  IN_PROGRESS: 'جاري غسل السيارة',
  QUALITY_CHECK: 'قيد الفحص',
  COMPLETED: 'اكتمل الغسيل',
  RETURNED_TO_PARKING: 'جاهزة في الموقف',
  ISSUE_REPORTED: 'تحديث على الخدمة',
  CANCELLED: 'تم إلغاء الطلب',
};

interface StatusBadgeProps {
  status: OrderStatus;
  isCustomerView?: boolean;
  className?: string;
}

export function StatusBadge({ status, isCustomerView = false, className }: StatusBadgeProps) {
  const { language } = useLanguage();
  const meta = STATUS_META[status] || {
    label: status,
    customerLabel: status,
    badgeVariant: 'neutral',
  };

  const label = isCustomerView
    ? (language === 'ar' && AR_CUSTOMER_LABELS[status]) || meta.customerLabel
    : meta.label;

  const styleMap: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    neutral: { bg: 'bg-fill', text: 'text-body', dot: 'bg-zinc-400', border: 'border-transparent' },
    info: { bg: 'bg-[#2997ff]/15', text: 'text-link-soft', dot: 'bg-[#2997ff]', border: 'border-transparent' },
    warning: { bg: 'bg-amber-400/15', text: 'text-amber-300', dot: 'bg-amber-400', border: 'border-transparent' },
    purple: { bg: 'bg-fill', text: 'text-ink', dot: 'bg-ink', border: 'border-transparent' },
    teal: { bg: 'bg-emerald-400/15', text: 'text-emerald-300', dot: 'bg-emerald-400', border: 'border-transparent' },
    success: { bg: 'bg-emerald-400/15', text: 'text-emerald-300', dot: 'bg-emerald-400', border: 'border-transparent' },
    danger: { bg: 'bg-rose-400/15', text: 'text-rose-300', dot: 'bg-rose-400', border: 'border-transparent' },
    muted: { bg: 'bg-fill-soft', text: 'text-dim', dot: 'bg-zinc-600', border: 'border-transparent' },
  };

  const conf = styleMap[meta.badgeVariant] || styleMap.neutral;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums border transition-colors',
        conf.bg,
        conf.text,
        conf.border,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', conf.dot)} />
      <span>{label}</span>
    </span>
  );
}
