import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type UiLang = 'ar' | 'en';

export function formatQAR(amountMinor: number, lang: UiLang = 'en'): string {
  const qar = (amountMinor / 100).toFixed(2);
  return lang === 'ar' ? `${qar} ر.ق` : `${qar} QAR`;
}

/** Service names are saved in English; the customer screens show these Arabic names. */
const SERVICE_NAMES_AR: Record<string, string> = {
  'srv-exterior': 'غسيل خارجي هيدرو مميز',
  'srv-interior': 'تنظيف داخلي متكامل',
  'srv-full': 'غسيل تنفيذي شامل',
};

export function serviceName(service: { id?: string; name: string }, lang: UiLang = 'en'): string {
  if (lang === 'ar' && service.id && SERVICE_NAMES_AR[service.id]) return SERVICE_NAMES_AR[service.id];
  return service.name;
}

/** When no plate was typed, the order keeps the placeholder "Photo Verified". Customers see a plain phrase instead. */
export function plateLabel(plate: string | undefined, lang: UiLang = 'en'): string {
  if (!plate || plate === 'Photo Verified') return lang === 'ar' ? 'صورة اللوحة مرفقة' : 'Plate photo';
  return plate;
}

export function formatDateTime(isoString: string, lang: UiLang = 'en'): string {
  try {
    const date = new Date(isoString);
    // Latin digits in both languages, so times and numbers look the same everywhere
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Qatar',
    }).format(date);
  } catch {
    return isoString;
  }
}
