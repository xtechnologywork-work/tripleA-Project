'use client';

import React from 'react';
import { Camera, ShieldCheck, AlertTriangle, X, Video, ArrowLeftRight } from 'lucide-react';
import type { Inspection, Order } from '@/domain/types';
import { DAMAGE_TYPES, INSPECTION_ANGLES } from '@/domain/inspection';
import { formatDateTime } from '@/lib/utils';
import { CarMap } from './car-map';
import { SafeImage, SafeVideo } from '@/components/ui/safe-media';
import { useLanguage } from '@/context/language-context';

const SEVERITY_LABEL = { LOW: 'Light', MEDIUM: 'Medium', HIGH: 'Heavy' } as const;
const SEVERITY_DOT = { LOW: 'bg-[#ff9f0a]', MEDIUM: 'bg-[#ff6b35]', HIGH: 'bg-[#ff453a]' } as const;

/** The words the customer sees, in Arabic. The dashboard is always English. */
const AR = {
  videoBefore: 'فيديو قبل الغسيل',
  videoAfter: 'فيديو بعد الغسيل',
  beforeAfter: 'قبل وبعد',
  photosBefore: 'صور قبل الغسيل',
  before: 'قبل',
  after: 'بعد',
  damagesBefore: 'أضرار قبل الغسيل',
  noDamage: 'لم تكن في السيارة أضرار ظاهرة.',
  newDamage: 'أضرار جديدة بعد الغسيل',
  nothingNew: 'لا شيء جديد. عادت السيارة كما دخلت.',
  notes: 'ملاحظات: ',
  closeUp: 'فتح الصورة المقربة',
  angle: {
    FRONT: ['الأمام', 'الأمام'],
    FRONT_RIGHT: ['الأمام يمين', 'أمام ي'],
    RIGHT: ['الجانب الأيمن', 'يمين'],
    REAR_RIGHT: ['الخلف يمين', 'خلف ي'],
    REAR: ['الخلف', 'الخلف'],
    REAR_LEFT: ['الخلف يسار', 'خلف ش'],
    LEFT: ['الجانب الأيسر', 'يسار'],
    FRONT_LEFT: ['الأمام يسار', 'أمام ش'],
  } as Record<string, [string, string]>,
  damage: { SCRATCH: 'خدش', DENT: 'انبعاج', CRACK: 'كسر', PAINT: 'تقشر طلاء', OTHER: 'أخرى' } as Record<string, string>,
  severity: { LOW: 'خفيف', MEDIUM: 'متوسط', HIGH: 'شديد' } as Record<string, string>,
};

function photoCount(i?: Inspection): number {
  return i ? new Set(i.media.filter((m) => m.kind === 'PHOTO' && m.angle).map((m) => m.angle)).size : 0;
}

// ---------------------------------------------------------------------------
// The card on the order, above the progression deck
// ---------------------------------------------------------------------------
interface InspectionCardProps {
  order: Order;
  before?: Inspection;
  after?: Inspection;
  /** False until migration_v3_inspection.sql has been run in Supabase. */
  enabled: boolean;
  onStart: (phase: 'BEFORE' | 'AFTER') => void;
  /** Correct an inspection that was already sent. */
  onEdit: (phase: 'BEFORE' | 'AFTER') => void;
  onSkip: () => void;
  onView: () => void;
}

export function InspectionCard({ order, before, after, enabled, onStart, onEdit, onSkip, onView }: InspectionCardProps) {
  const card = 'rounded-3xl bg-tile p-6';

  if (!enabled) {
    return (
      <div className={`${card} flex items-start gap-4`}>
        <div className="w-10 h-10 rounded-full bg-fill flex items-center justify-center flex-shrink-0">
          <Camera className="h-5 w-5 text-muted" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">Pre-wash inspection</h3>
          <p className="text-sm text-muted mt-1">
            Not set up yet. Run <span className="text-ink">migration_v3_inspection.sql</span> in the Supabase SQL editor, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  const stage = ['IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'RETURNED_TO_PARKING'].includes(order.status);
  const closed = order.status === 'CANCELLED';

  // Skipped with a reason
  if (before?.status === 'SKIPPED') {
    return (
      <div className={`${card} flex items-start gap-4`}>
        <div className="w-10 h-10 rounded-full bg-amber-400/15 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Inspection skipped</h3>
          <p className="text-sm text-muted mt-1">
            {before.inspectedBy} started the wash without an inspection: {before.bypassReason}
          </p>
          <button
            onClick={() => onEdit('BEFORE')}
            className="mt-3 px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink"
          >
            Complete the inspection now
          </button>
        </div>
      </div>
    );
  }

  // Sent
  if (before?.status === 'SUBMITTED') {
    return (
      <div className={`${card} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-400/15 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">Pre-wash inspection done</h3>
              <p className="text-sm text-muted mt-0.5">
                {before.inspectedBy} · {before.submittedAt ? formatDateTime(before.submittedAt) : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onEdit('BEFORE')} className="px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink whitespace-nowrap">
              Edit
            </button>
            <button onClick={onView} className="px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink whitespace-nowrap">
              {after?.status === 'SUBMITTED' ? 'Compare' : 'View'}
            </button>
          </div>
        </div>
        {before.editedAt && (
          <p className="text-xs text-dim -mt-2">
            Edited by {before.editedBy} · {formatDateTime(before.editedAt)}
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-3 py-1 rounded-full bg-fill text-body tabular-nums">
            {before.media.some((m) => m.kind === 'VIDEO') ? 'Video' : `${photoCount(before)} photos`}
          </span>
          <span
            className={`px-3 py-1 rounded-full tabular-nums ${
              before.damages.length > 0 ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'
            }`}
          >
            {before.damages.length > 0 ? `${before.damages.length} damages noted` : 'No damage'}
          </span>
          {after?.status === 'SUBMITTED' && (
            <span className="px-3 py-1 rounded-full bg-[#2997ff]/15 text-link-soft">
              After-wash check done
              {after.damages.length > 0 ? ` · ${after.damages.length} new` : ''}
            </span>
          )}
        </div>

        {after?.status === 'SUBMITTED' && (
          <button onClick={() => onEdit('AFTER')} className="text-sm text-dim hover:text-ink">
            Edit the after-wash check
          </button>
        )}

        {/* After the wash */}
        {!closed && stage && after?.status !== 'SUBMITTED' && (
          <button
            onClick={() => onStart('AFTER')}
            className="w-full py-2.5 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink flex items-center justify-center gap-2"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span>{after ? 'Continue the after-wash check' : 'After-wash check'}</span>
          </button>
        )}
      </div>
    );
  }

  // Not sent yet: this is the step that opens Start Wash
  if (closed) return null;
  const started = before?.status === 'DRAFT';
  return (
    <div className={`${card} space-y-4 ring-2 ring-[#2997ff]/60`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#2997ff]/15 flex items-center justify-center flex-shrink-0">
          <Camera className="h-5 w-5 text-link-soft" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Pre-wash inspection</h3>
          <p className="text-sm text-muted mt-0.5">
            Photograph the car all around and note any damage before the wash. Start Wash opens after you send it.
          </p>
          {started && before && (
            <p className="text-xs text-link-soft mt-1.5 tabular-nums">
              Draft: {before.media.some((m) => m.kind === 'VIDEO') ? 'video recorded' : `${photoCount(before)} of ${INSPECTION_ANGLES.length} photos`}
              {before.damages.length > 0 ? ` · ${before.damages.length} damages` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onStart('BEFORE')}
          className="flex-1 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Camera className="h-4 w-4" />
          <span>{started ? 'Continue inspection' : 'Start inspection'}</span>
        </button>
        <button onClick={onSkip} className="text-sm text-dim hover:text-ink whitespace-nowrap px-2">
          Skip (emergency)
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sent inspection: photos, video, damages, and before/after side by side
// ---------------------------------------------------------------------------
interface InspectionSummaryProps {
  before?: Inspection;
  after?: Inspection;
  onOpenImage: (url: string) => void;
}

export function InspectionSummary({ before, after, onOpenImage }: InspectionSummaryProps) {
  const { isRtl } = useLanguage();
  if (!before) return null;
  // Labels in the customer's language
  const w = {
    videoBefore: isRtl ? AR.videoBefore : 'Video before the wash',
    videoAfter: isRtl ? AR.videoAfter : 'Video after the wash',
    beforeAfter: isRtl ? AR.beforeAfter : 'Before and after',
    photosBefore: isRtl ? AR.photosBefore : 'Photos before the wash',
    before: isRtl ? AR.before : 'before',
    after: isRtl ? AR.after : 'after',
    damagesBefore: isRtl ? AR.damagesBefore : 'Damages before the wash',
    noDamage: isRtl ? AR.noDamage : 'The car had no visible damage.',
    newDamage: isRtl ? AR.newDamage : 'New damage found after the wash',
    nothingNew: isRtl ? AR.nothingNew : 'Nothing new. The car came back the way it went in.',
    notes: isRtl ? AR.notes : 'Notes: ',
    closeUp: isRtl ? AR.closeUp : 'Open the close-up',
  };
  const angleLabel = (a: { key: string; label: string; short: string }) => (isRtl ? AR.angle[a.key]?.[0] || a.label : a.label);
  const angleShort = (a: { key: string; label: string; short: string }) => (isRtl ? AR.angle[a.key]?.[1] || a.short : a.short);
  const damageLabel = (type: string) => (isRtl ? AR.damage[type] : DAMAGE_TYPES.find((t) => t.key === type)?.label) || type;
  const severityLabel = (sev: keyof typeof SEVERITY_LABEL) => (isRtl ? AR.severity[sev] : SEVERITY_LABEL[sev]);
  const beforeVideo = before.media.find((m) => m.kind === 'VIDEO');
  const afterVideo = after?.media.find((m) => m.kind === 'VIDEO');
  const newDamages = after?.damages || [];

  const shot = (i: Inspection | undefined, angle: string) =>
    i?.media.find((m) => m.kind === 'PHOTO' && m.angle === angle);

  return (
    <div className="space-y-5">
      {/* media */}
      {beforeVideo && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink flex items-center gap-2">
            <Video className="h-4 w-4 text-muted" /> {w.videoBefore}
          </p>
          <SafeVideo src={beforeVideo.url} className="w-full rounded-2xl bg-black max-h-[50vh]" />
        </div>
      )}
      {afterVideo && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink flex items-center gap-2">
            <Video className="h-4 w-4 text-muted" /> {w.videoAfter}
          </p>
          <SafeVideo src={afterVideo.url} className="w-full rounded-2xl bg-black max-h-[50vh]" />
        </div>
      )}

      {!beforeVideo && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{after ? w.beforeAfter : w.photosBefore}</p>
          <div className={`grid gap-2 ${after ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {INSPECTION_ANGLES.map((a) => {
              const b = shot(before, a.key);
              const af = shot(after, a.key);
              return (
                <React.Fragment key={a.key}>
                  <button
                    onClick={() => b && onOpenImage(b.url)}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden bg-inset"
                    aria-label={`${angleLabel(a)}, ${w.before}`}
                  >
                    {b ? (
                      <SafeImage src={b.url} alt={`${angleLabel(a)} ${w.before}`} className="absolute inset-0 w-full h-full object-cover" />
                    ) : null}
                    <span className="absolute bottom-1 start-1 px-2 py-0.5 rounded-full bg-black/60 text-[11px] text-white">
                      {angleShort(a)}
                      {after ? ` · ${w.before}` : ''}
                    </span>
                  </button>
                  {after && (
                    <button
                      onClick={() => af && onOpenImage(af.url)}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden bg-inset"
                      aria-label={`${angleLabel(a)}, ${w.after}`}
                    >
                      {af ? (
                        <SafeImage src={af.url} alt={`${angleLabel(a)} ${w.after}`} className="absolute inset-0 w-full h-full object-cover" />
                      ) : null}
                      <span className="absolute bottom-1 start-1 px-2 py-0.5 rounded-full bg-black/60 text-[11px] text-white">
                        {angleShort(a)} · {w.after}
                      </span>
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* damages */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">
          {w.damagesBefore} <span className="text-dim font-normal">({before.damages.length})</span>
        </p>
        {before.damages.length === 0 ? (
          <p className="text-sm text-muted">{w.noDamage}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 items-start">
            <CarMap mode="view" damages={before.damages} className="w-full max-w-[140px] mx-auto" />
            <div className="space-y-2">
              {before.damages.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-inset p-3">
                  {d.photoUrl && (
                    <button onClick={() => onOpenImage(d.photoUrl!)} className="flex-shrink-0" aria-label={w.closeUp}>
                      <SafeImage src={d.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[d.severity]}`} />
                      {i + 1}. {damageLabel(d.type)} · {severityLabel(d.severity)}
                    </p>
                    {d.note && <p className="text-xs text-muted">{d.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {after && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">
            {w.newDamage} <span className="text-dim font-normal">({newDamages.length})</span>
          </p>
          {newDamages.length === 0 ? (
            <p className="text-sm text-emerald-300">{w.nothingNew}</p>
          ) : (
            newDamages.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-rose-400/10 p-3">
                {d.photoUrl && (
                  <button onClick={() => onOpenImage(d.photoUrl!)} className="flex-shrink-0" aria-label={w.closeUp}>
                    <SafeImage src={d.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
                  </button>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-300">
                    {damageLabel(d.type)} · {severityLabel(d.severity)}
                  </p>
                  {d.note && <p className="text-xs text-muted">{d.note}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {before.notes && (
        <p className="text-sm text-muted">
          <span className="text-ink font-medium">{w.notes}</span>
          {before.notes}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A panel that shows the summary on the dashboard
// ---------------------------------------------------------------------------
interface InspectionViewerProps extends InspectionSummaryProps {
  title: string;
  onClose: () => void;
}

export function InspectionViewer({ title, before, after, onOpenImage, onClose }: InspectionViewerProps) {
  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[760px] max-h-[90dvh] overflow-y-auto bg-sidebar rounded-3xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-ink tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-fill hover:bg-fill-strong text-ink flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <InspectionSummary before={before} after={after} onOpenImage={onOpenImage} />
      </div>
    </div>
  );
}
