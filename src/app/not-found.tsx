'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/language-context';

export default function NotFound() {
  const { isRtl } = useLanguage();
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-canvas text-ink flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-[320px]">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{isRtl ? 'الصفحة غير موجودة' : 'Page not found'}</h1>
        <p className="text-[15px] text-muted leading-relaxed">
          {isRtl ? 'قد يكون الرابط خاطئاً أو أن الصفحة نُقلت.' : 'The link may be wrong, or the page has moved.'}
        </p>
        <Link href="/" className="inline-flex px-6 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] transition active:scale-95">
          {isRtl ? 'الرئيسية' : 'Go home'}
        </Link>
      </div>
    </div>
  );
}
