import React from 'react';
import { Crown } from 'lucide-react';

/** The gold VIP mark: next to a VIP client's name (dashboard) and in their own profile. */
export function VipBadge({ className = '', label = 'VIP' }: { className?: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${className}`}
      title="VIP"
    >
      <Crown className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
