/**
 * The photo of the clean car at its bay. The team must take it to mark an order "ready at bay": the customer sees
 * where the car is and that it was washed, and the company keeps proof of the state it was left in.
 * Pure rules, no imports, so they can be tested on their own.
 */

interface PhotoLike {
  kind?: string;
  createdAt?: string;
}

/** Is this move the one that needs the ready photo? (Marking the car ready at its bay, from any earlier step.) */
export const needsReadyPhoto = (from: string, to: string): boolean => to === 'RETURNED_TO_PARKING' && from !== 'RETURNED_TO_PARKING';

/** The customer's own photo (rear of the car, taken when ordering). Older photos without a kind count as the customer's. */
export function customerPhotos<T extends PhotoLike>(photos: T[]): T[] {
  return photos.filter((p) => !p.kind || p.kind === 'BEFORE');
}

/** The newest photo of the clean car at its bay, or undefined. */
export function readyPhotoOf<T extends PhotoLike>(photos: T[]): T | undefined {
  return photos
    .filter((p) => p.kind === 'AFTER')
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
}
