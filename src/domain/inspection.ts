import type {
  Inspection,
  InspectionAngle,
  InspectionDamage,
  OrderStatus,
} from './types';

export const INSPECTION_ANGLES: { key: InspectionAngle; label: string; short: string }[] = [
  { key: 'FRONT', label: 'Front', short: 'Front' },
  { key: 'FRONT_RIGHT', label: 'Front right', short: 'Front R' },
  { key: 'RIGHT', label: 'Right side', short: 'Right' },
  { key: 'REAR_RIGHT', label: 'Rear right', short: 'Rear R' },
  { key: 'REAR', label: 'Rear', short: 'Rear' },
  { key: 'REAR_LEFT', label: 'Rear left', short: 'Rear L' },
  { key: 'LEFT', label: 'Left side', short: 'Left' },
  { key: 'FRONT_LEFT', label: 'Front left', short: 'Front L' },
];

export const DAMAGE_TYPES: { key: InspectionDamage['type']; label: string }[] = [
  { key: 'SCRATCH', label: 'Scratch' },
  { key: 'DENT', label: 'Dent' },
  { key: 'CRACK', label: 'Crack' },
  { key: 'PAINT', label: 'Paint chip' },
  { key: 'OTHER', label: 'Other' },
];

export const DAMAGE_SEVERITIES: { key: InspectionDamage['severity']; label: string }[] = [
  { key: 'LOW', label: 'Light' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'HIGH', label: 'Heavy' },
];

/** A wash may only start from these two statuses once the car has been inspected. */
export function requiresPreWashInspection(from: OrderStatus, to: OrderStatus): boolean {
  return to === 'IN_PROGRESS' && (from === 'NEW' || from === 'ASSIGNED');
}

/** The one rule for "is this inspection complete enough to send". Used by the screen, the store and the server. */
export function validateInspection(i: Inspection): string | null {
  // Any photos count (4 of 8 is enough); the inspection only needs some proof of the car's state, a photo or a video
  const hasPhoto = i.media.some((m) => m.kind === 'PHOTO');
  const hasVideo = i.media.some((m) => m.kind === 'VIDEO');
  if (!hasVideo && !hasPhoto) {
    return 'Take at least one photo, or record a video around the car';
  }
  if (i.damages.some((d) => !d.photoPath && !d.photoUrl)) {
    return 'Every damage needs a close-up photo';
  }
  if (i.phase === 'BEFORE' && i.damages.length === 0 && !i.noDamage) {
    return 'Mark the damages, or confirm that there are none';
  }
  return null;
}

/** Cleared to start the wash: the inspection was sent, or a supervisor skipped it with a reason. */
export function isCleared(i?: Pick<Inspection, 'status'> | null): boolean {
  return !!i && (i.status === 'SUBMITTED' || i.status === 'SKIPPED');
}
