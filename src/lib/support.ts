/**
 * Support numbers, digits only with the country code.
 * WhatsApp chat: +974 5090 0503. Phone call: +974 5090 0502.
 * Either can be changed with NEXT_PUBLIC_SUPPORT_WHATSAPP and NEXT_PUBLIC_SUPPORT_CALL in .env.local.
 */
const digits = (v: string | undefined, fallback: string) => ((v || '').replace(/\D/g, '') || fallback);

export const SUPPORT_WHATSAPP = digits(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP, '97450900503');
export const SUPPORT_CALL = digits(process.env.NEXT_PUBLIC_SUPPORT_CALL, '97450900502');
