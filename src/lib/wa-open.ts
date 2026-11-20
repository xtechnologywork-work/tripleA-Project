'use client';
/**
 * Opens WhatsApp on a customer's chat with a message written in, and brings a photo along when there is one.
 *
 * WhatsApp links (wa.me, WhatsApp Web) carry text only: no website can attach a photo to them.
 * So, with a photo:
 *  - on a computer: the photo is copied to the clipboard first, then WhatsApp Web opens on the chat;
 *    the team presses Ctrl+V in the chat to add it, then Send;
 *  - on a phone: the phone's share menu opens with the photo and the message together (choose WhatsApp, then the customer).
 */
import { waLink } from '@/domain/whatsapp';

export const onPhone = (): boolean => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Any photo (data URL or link) as an image the clipboard accepts (PNG). */
async function photoBlob(src: string, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const fetched = await (await fetch(src, { cache: 'force-cache' })).blob();
  const bitmap = await createImageBitmap(fetched);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), type, 0.9));
}

export type WaOpenResult =
  /** WhatsApp opened; `photoCopied` tells whether the photo is waiting in the clipboard */
  | { ok: true; how: 'chat'; photoCopied: boolean }
  /** The phone's share menu was used (photo and message together) */
  | { ok: true; how: 'share' }
  | { ok: false; reason: 'no-number' | 'blocked' | 'cancelled' };

/**
 * Must be called straight from a click (browsers allow opening a tab, copying an image or sharing only then).
 * Never throws.
 */
export async function openWhatsApp(opts: { phone: string | undefined | null; message: string; photo?: string | null }): Promise<WaOpenResult> {
  const phone = onPhone();
  const link = waLink(opts.phone, opts.message, phone ? 'app' : 'web');
  if (!link) return { ok: false, reason: 'no-number' };

  // A phone with a photo: the share menu carries both
  if (phone && opts.photo && typeof navigator.share === 'function') {
    try {
      const file = new File([await photoBlob(opts.photo, 'image/jpeg')], 'triplea-ready.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: opts.message });
        return { ok: true, how: 'share' };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, reason: 'cancelled' };
      // Sharing not possible: fall back to the chat with the text
    }
  }

  // A computer with a photo: copy it first, so it is ready to paste in the chat
  let photoCopied = false;
  if (!phone && opts.photo && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const png = await photoBlob(opts.photo, 'image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      photoCopied = true;
    } catch {
      // The browser refused the clipboard: the text still goes
    }
  }

  // One reused tab on a computer (WhatsApp Web runs in one tab only)
  const tab = window.open(link, phone ? '_blank' : 'triplea_whatsapp');
  if (!tab) return { ok: false, reason: 'blocked' };
  try {
    tab.opener = null;
  } catch {
    // Already a different site
  }
  return { ok: true, how: 'chat', photoCopied };
}

/** What to tell the team after trying, in one line. */
export function waResultText(r: WaOpenResult, hadPhoto: boolean): string {
  if (!r.ok) {
    if (r.reason === 'no-number') return 'This customer has no usable mobile number.';
    if (r.reason === 'blocked') return 'The browser blocked the WhatsApp tab. Allow pop-ups for this site and press the WhatsApp button again.';
    return 'Sharing was cancelled.';
  }
  if (r.how === 'share') return 'Choose WhatsApp, then the customer, and send.';
  if (hadPhoto && r.photoCopied) return 'WhatsApp opened with the message. The photo is copied: press Ctrl+V in the chat to add it, then Send.';
  if (hadPhoto) return 'WhatsApp opened with the message. The browser did not allow copying the photo: attach it in WhatsApp by hand.';
  return 'WhatsApp opened with the message. Check it and press Send.';
}
