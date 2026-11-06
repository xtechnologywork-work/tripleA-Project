/**
 * The support number for the chat and call buttons (digits only, with the country code, for example 97455000000).
 * Set NEXT_PUBLIC_SUPPORT_WHATSAPP in .env.local. Without it the buttons are hidden, so nobody is sent to a wrong number.
 */
export const SUPPORT_PHONE = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
