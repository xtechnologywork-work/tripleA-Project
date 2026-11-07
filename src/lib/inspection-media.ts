import { getSupabase } from '@/lib/supabase';
import { uid } from '@/data/mock/store';

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

/** Draws the label (bay, order, time) onto the photo so it can never be separated from its proof. Returns a JPEG. */
export function stampPhoto(file: File, label: string, maxSide = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not a photo'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process the photo'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const fontSize = Math.max(14, Math.round(canvas.width / 38));
      ctx.font = `600 ${fontSize}px sans-serif`;
      const pad = Math.round(fontSize * 0.6);
      const barHeight = fontSize + pad * 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pad, canvas.height - barHeight / 2);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the photo'));
    };
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

function extensionFor(blob: Blob, kind: 'PHOTO' | 'VIDEO'): string {
  if (kind === 'PHOTO') return 'jpg';
  if (blob.type.includes('quicktime')) return 'mov';
  if (blob.type.includes('webm')) return 'webm';
  return 'mp4';
}

export interface UploadedFile {
  mediaId: string;
  /** Private storage path. Missing in local demo mode, where the photo is kept inside the saved data. */
  path?: string;
  /** What to show on screen right away. */
  url: string;
}

/**
 * Sends a photo or video to private storage. The browser uploads straight to Supabase with a one-time link
 * from our server, so even a long video never passes through the API.
 */
export async function uploadInspectionFile(orderId: string, blob: Blob, kind: 'PHOTO' | 'VIDEO'): Promise<UploadedFile> {
  if (kind === 'VIDEO' && blob.size > MAX_VIDEO_BYTES) {
    throw new Error('The video is too large (250 MB at most). Record a shorter one.');
  }
  const mediaId = uid(kind === 'VIDEO' ? 'vid' : 'img');
  const ext = extensionFor(blob, kind);

  const sb = getSupabase();
  const session = sb ? (await sb.auth.getSession()).data.session : null;

  const res = await fetch('/api/inspection/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ orderId, mediaId, ext }),
  });
  const data = await res.json().catch(() => ({}));

  if (data.local) {
    // Local demo mode (no Supabase): keep photos inside the saved data
    if (kind === 'VIDEO') throw new Error('Video needs Supabase. Connect it to record a video.');
    return { mediaId, url: await blobToDataUrl(blob) };
  }
  if (!res.ok || !data.path || !data.token || !sb) {
    throw new Error(data.error || 'Could not prepare the upload. Check your connection.');
  }

  // On a weak connection a long upload can drop. Try again up to three times before giving up.
  const contentType = blob.type || (kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await sb.storage.from('inspections').uploadToSignedUrl(data.path, data.token, blob, { contentType, upsert: true });
    if (!error) return { mediaId, path: data.path, url: URL.createObjectURL(blob) };
    lastError = error.message || '';
    // A file that is too big will not get smaller by trying again
    if (/size|exceed|too large|limit/i.test(lastError)) break;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  if (/size|exceed|too large|limit/i.test(lastError)) {
    throw new Error('The file is larger than the storage limit. Record a shorter video, or raise the file size limit in Supabase Storage settings.');
  }
  throw new Error('Upload failed. Check your connection and try again.');
}
