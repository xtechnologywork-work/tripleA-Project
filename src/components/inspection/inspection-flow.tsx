'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Video, Check, X, Trash2, ChevronRight, ChevronLeft, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { mockStore, uid } from '@/data/mock/store';
import type { ActorContext } from '@/domain/status-machine';
import type { Inspection, InspectionAngle, InspectionDamage, InspectionMedia, InspectionPhase, Order } from '@/domain/types';
import { DAMAGE_SEVERITIES, DAMAGE_TYPES, INSPECTION_ANGLES, validateInspection } from '@/domain/inspection';
import { stampPhoto, uploadInspectionFile } from '@/lib/inspection-media';
import { CarMap } from './car-map';

type Step = 'photos' | 'damages' | 'review';

interface InspectionFlowProps {
  order: Order;
  phase: InspectionPhase;
  actor: ActorContext;
  /** Correct an inspection that was already sent. The original stays as it was until "Save changes". */
  editing?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const SEVERITY_DOT: Record<InspectionDamage['severity'], string> = {
  LOW: 'bg-[#ff9f0a]',
  MEDIUM: 'bg-[#ff6b35]',
  HIGH: 'bg-[#ff453a]',
};

function stampLabel(order: Order): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Bay ${order.bayCodeSnapshot} · ${order.reference} · ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function InspectionFlow({ order, phase, actor, editing = false, onClose, onDone }: InspectionFlowProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const ref = useRef<Inspection | null>(null);
  const [step, setStep] = useState<Step>('photos');
  const [activeAngle, setActiveAngle] = useState<InspectionAngle>('FRONT');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Damage being added
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [dmgType, setDmgType] = useState<InspectionDamage['type']>('SCRATCH');
  const [dmgSeverity, setDmgSeverity] = useState<InspectionDamage['severity']>('LOW');
  const [dmgNote, setDmgNote] = useState('');
  const [dmgPhoto, setDmgPhoto] = useState<{ path?: string; url: string } | null>(null);
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);

  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const damageInput = useRef<HTMLInputElement>(null);

  const before = phase === 'AFTER' ? mockStore.getInspection(order.id, 'BEFORE') : undefined;

  // Open (or create) the draft. It is saved after every change, so a closed phone loses nothing.
  useEffect(() => {
    try {
      let draft: Inspection;
      if (editing) {
        const sent = mockStore.getInspection(order.id, phase);
        if (!sent || sent.status === 'DRAFT') throw new Error('There is no sent inspection to edit');
        // Work on a copy: nothing is saved until "Save changes"
        draft = JSON.parse(JSON.stringify(sent)) as Inspection;
      } else {
        draft = mockStore.startInspection(order.id, phase, actor);
      }
      ref.current = draft;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load the draft once
      setInspection(draft);
      const firstMissing = INSPECTION_ANGLES.find((a) => !draft.media.some((m) => m.kind === 'PHOTO' && m.angle === a.key));
      if (firstMissing) setActiveAngle(firstMissing.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the inspection');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Change the draft and save it right away. Always works on the latest copy. */
  const commit = (change: (current: Inspection) => Inspection) => {
    if (!ref.current) return;
    try {
      // An edit stays on this screen until it is saved; a new inspection is saved after every change
      const saved = editing ? change(ref.current) : mockStore.saveInspection(change(ref.current));
      ref.current = saved;
      setInspection(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  if (!inspection) {
    return (
      <div data-theme="dark" className="fixed inset-0 z-[60] bg-canvas flex items-center justify-center text-ink">
        {error ? <p className="text-sm text-rose-400 px-6 text-center">{error}</p> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }

  const photos = inspection.media.filter((m) => m.kind === 'PHOTO' && m.angle);
  const video = inspection.media.find((m) => m.kind === 'VIDEO');
  const doneAngles = new Set<InspectionAngle>(photos.map((m) => m.angle as InspectionAngle));
  const photosComplete = doneAngles.size === INSPECTION_ANGLES.length || !!video;
  const activeInfo = INSPECTION_ANGLES.find((a) => a.key === activeAngle)!;
  const problem = validateInspection(inspection);

  // ---------- photos and video ----------
  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(activeAngle);
    try {
      const blob = await stampPhoto(file, stampLabel(order));
      const up = await uploadInspectionFile(order.id, blob, 'PHOTO');
      const media: InspectionMedia = {
        id: up.mediaId,
        kind: 'PHOTO',
        angle: activeAngle,
        path: up.path,
        url: up.url,
        createdAt: new Date().toISOString(),
      };
      commit((cur) => ({
        ...cur,
        media: [...cur.media.filter((m) => !(m.kind === 'PHOTO' && m.angle === activeAngle)), media],
      }));
      // jump to the next angle that still needs a photo
      const taken = new Set(doneAngles).add(activeAngle);
      const next = INSPECTION_ANGLES.find((a) => !taken.has(a.key));
      if (next) setActiveAngle(next.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo');
    } finally {
      setBusy(null);
    }
  };

  const handleVideo = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy('video');
    try {
      const up = await uploadInspectionFile(order.id, file, 'VIDEO');
      const media: InspectionMedia = { id: up.mediaId, kind: 'VIDEO', path: up.path, url: up.url, createdAt: new Date().toISOString() };
      commit((cur) => ({ ...cur, media: [...cur.media.filter((m) => m.kind !== 'VIDEO'), media] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the video');
    } finally {
      setBusy(null);
    }
  };

  const removeMedia = (id: string) => commit((cur) => ({ ...cur, media: cur.media.filter((m) => m.id !== id) }));

  // ---------- damages ----------
  const resetDamageForm = () => {
    setPendingPoint(null);
    setDmgType('SCRATCH');
    setDmgSeverity('LOW');
    setDmgNote('');
    setDmgPhoto(null);
  };

  const handleDamagePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy('damage');
    try {
      const blob = await stampPhoto(file, stampLabel(order));
      const up = await uploadInspectionFile(order.id, blob, 'PHOTO');
      setDmgPhoto({ path: up.path, url: up.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo');
    } finally {
      setBusy(null);
    }
  };

  const saveDamage = () => {
    if (!pendingPoint) return;
    if (!dmgPhoto) {
      setError('Take a close-up photo of the damage first');
      return;
    }
    setError('');
    const damage: InspectionDamage = {
      id: uid('dmg'),
      x: pendingPoint.x,
      y: pendingPoint.y,
      type: dmgType,
      severity: dmgSeverity,
      note: dmgNote.trim() || undefined,
      photoPath: dmgPhoto.path,
      photoUrl: dmgPhoto.url,
      isNew: phase === 'AFTER',
    };
    commit((cur) => ({ ...cur, noDamage: false, damages: [...cur.damages, damage] }));
    resetDamageForm();
  };

  const removeDamage = (id: string) => {
    commit((cur) => ({ ...cur, damages: cur.damages.filter((d) => d.id !== id) }));
    setSelectedDamageId(null);
  };

  // ---------- send ----------
  const submit = () => {
    setError('');
    const issue = validateInspection(inspection);
    if (issue) {
      setError(issue);
      return;
    }
    try {
      if (editing) {
        mockStore.updateSubmittedInspection(inspection, actor);
        onDone('Inspection updated.');
      } else {
        mockStore.submitInspection(order.id, phase, actor);
        onDone(phase === 'BEFORE' ? 'Inspection sent. Start Wash is now unlocked.' : 'After-wash photos sent.');
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the inspection');
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'photos', label: '360° photos' },
    { key: 'damages', label: 'Damages' },
    { key: 'review', label: 'Review' },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div data-theme="dark" className="fixed inset-0 z-[60] bg-canvas text-ink font-sans overflow-y-auto" role="dialog" aria-modal="true" aria-label="Car inspection">
      {/* top bar */}
      <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur-xl">
        <div className="max-w-[720px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold truncate">
              {editing ? 'Edit inspection' : phase === 'BEFORE' ? 'Pre-wash inspection' : 'After-wash check'}
            </p>
            <p className="text-xs text-dim truncate tabular-nums">
              Bay {order.bayCodeSnapshot} · {order.reference}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-fill hover:bg-fill-strong text-sm"
            aria-label={editing ? 'Close without saving' : 'Close. The draft is saved.'}
          >
            <X className="h-4 w-4" />
            <span>{editing ? 'Cancel' : 'Save and close'}</span>
          </button>
        </div>

        {/* steps */}
        <div className="max-w-[720px] mx-auto px-4 pb-3 flex gap-2">
          {steps.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition ${
                step === s.key ? 'bg-[#0071e3] text-white' : i < stepIndex ? 'bg-fill-strong text-ink' : 'bg-fill text-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 py-4 pb-28 space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-rose-400/15 text-rose-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ================= STEP 1: PHOTOS ================= */}
        {step === 'photos' && (
          <>
            <div className="bg-tile rounded-3xl p-4 grid grid-cols-[minmax(0,180px)_1fr] gap-4 items-center">
              <CarMap
                mode="angles"
                activeAngle={activeAngle}
                doneAngles={doneAngles}
                onSelectAngle={setActiveAngle}
                className="w-full max-h-[46vh] mx-auto"
              />
              <div className="space-y-3">
                <p className="text-xs text-dim">
                  {doneAngles.size} of {INSPECTION_ANGLES.length} photos{video ? ' · video recorded' : ''}
                </p>
                <p className="text-[22px] font-semibold leading-tight tracking-tight">{activeInfo.label}</p>
                <p className="text-sm text-muted">Stand back so the whole {activeInfo.label.toLowerCase()} of the car is in the frame.</p>

                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    void handlePhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => photoInput.current?.click()}
                  disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold disabled:opacity-60"
                >
                  {busy === activeAngle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <span>{doneAngles.has(activeAngle) ? 'Retake photo' : 'Take photo'}</span>
                </button>
              </div>
            </div>

            {/* the eight angles */}
            <div className="grid grid-cols-4 gap-2">
              {INSPECTION_ANGLES.map((a) => {
                const shot = photos.find((m) => m.angle === a.key);
                return (
                  <button
                    key={a.key}
                    onClick={() => setActiveAngle(a.key)}
                    className={`relative aspect-square rounded-2xl overflow-hidden bg-tile text-xs text-muted flex items-center justify-center ${
                      activeAngle === a.key ? 'ring-2 ring-[#2997ff]' : ''
                    }`}
                    aria-label={a.label}
                  >
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shot.url} alt={a.label} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span>{a.short}</span>
                    )}
                    {shot && (
                      <span className="absolute top-1 end-1 w-5 h-5 rounded-full bg-[#30d158] flex items-center justify-center">
                        <Check className="h-3 w-3 text-white stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* video instead */}
            <div className="bg-tile rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">Or record one video around the car</p>
                  <p className="text-xs text-dim mt-0.5">Walk once around the car. A video replaces the 8 photos.</p>
                </div>
              </div>
              <input
                ref={videoInput}
                type="file"
                accept="video/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void handleVideo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {video ? (
                <div className="space-y-2">
                  <video src={video.url} controls playsInline className="w-full rounded-2xl bg-black max-h-[40vh]" />
                  <button onClick={() => removeMedia(video.id)} className="flex items-center gap-1.5 text-sm text-rose-300">
                    <Trash2 className="h-4 w-4" />
                    <span>Delete video</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => videoInput.current?.click()}
                  disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-fill hover:bg-fill-strong text-[15px] font-medium disabled:opacity-60"
                >
                  {busy === 'video' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  <span>{busy === 'video' ? 'Uploading video' : 'Record video'}</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* ================= STEP 2: DAMAGES ================= */}
        {step === 'damages' && (
          <>
            <div className="bg-tile rounded-3xl p-4 space-y-3">
              <p className="text-sm text-muted">
                {phase === 'BEFORE'
                  ? 'Tap the car where you see a scratch, dent or crack. Add a close-up photo of each one.'
                  : 'Tap the car only if you see a NEW damage that was not there before the wash.'}
              </p>
              <CarMap
                mode="damages"
                damages={inspection.damages}
                referenceDamages={before?.damages}
                selectedDamageId={selectedDamageId}
                onPickPoint={(pt) => {
                  setSelectedDamageId(null);
                  setPendingPoint(pt);
                }}
                onSelectDamage={setSelectedDamageId}
                className="w-full max-h-[46vh] mx-auto"
              />
            </div>

            {inspection.damages.length > 0 && (
              <div className="space-y-2">
                {inspection.damages.map((d, i) => (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDamageId(d.id)}
                    className={`flex items-center gap-3 bg-tile rounded-2xl p-3 ${selectedDamageId === d.id ? 'ring-2 ring-[#2997ff]' : ''}`}
                  >
                    {d.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[d.severity]}`} />
                        <span>
                          {i + 1}. {DAMAGE_TYPES.find((t) => t.key === d.type)?.label}
                        </span>
                      </p>
                      {d.note && <p className="text-xs text-dim truncate">{d.note}</p>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDamage(d.id);
                      }}
                      className="w-9 h-9 rounded-full bg-fill hover:bg-rose-400/20 text-muted hover:text-rose-300 flex items-center justify-center flex-shrink-0"
                      aria-label="Delete this damage"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {phase === 'BEFORE' && inspection.damages.length === 0 && (
              <button
                onClick={() => {
                  commit((cur) => ({ ...cur, noDamage: !cur.noDamage }));
                }}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl p-4 text-start transition ${
                  inspection.noDamage ? 'bg-emerald-400/15 text-emerald-300' : 'bg-tile'
                }`}
              >
                <span className="text-[15px] font-medium">The car has no visible damage</span>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${inspection.noDamage ? 'bg-[#30d158]' : 'bg-fill'}`}>
                  {inspection.noDamage && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                </span>
              </button>
            )}
          </>
        )}

        {/* ================= STEP 3: REVIEW ================= */}
        {step === 'review' && (
          <>
            <div className="bg-tile rounded-3xl p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-inset p-3">
                  <p className="text-[22px] font-semibold tabular-nums">{video ? 'Video' : `${doneAngles.size}/${INSPECTION_ANGLES.length}`}</p>
                  <p className="text-xs text-dim">{video ? 'recorded' : 'photos'}</p>
                </div>
                <div className="rounded-2xl bg-inset p-3">
                  <p className="text-[22px] font-semibold tabular-nums">{inspection.damages.length}</p>
                  <p className="text-xs text-dim">damages</p>
                </div>
                <div className="rounded-2xl bg-inset p-3">
                  <p className="text-[22px] font-semibold">{phase === 'BEFORE' && inspection.noDamage ? 'None' : '—'}</p>
                  <p className="text-xs text-dim">{phase === 'BEFORE' ? 'declared' : 'phase'}</p>
                </div>
              </div>

              <div>
                <label htmlFor="inspection-notes" className="text-sm text-body block mb-2">General notes (optional)</label>
                <textarea
                  id="inspection-notes"
                  rows={3}
                  defaultValue={inspection.notes || ''}
                  onBlur={(e) => commit((cur) => ({ ...cur, notes: e.target.value.trim() || undefined }))}
                  placeholder="e.g. Dusty from a long trip, a child seat in the back"
                  className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink placeholder-dim resize-none"
                />
              </div>
            </div>

            {problem ? (
              <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-400/10 text-amber-300 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{problem}</span>
              </div>
            ) : (
              <p className="text-sm text-muted px-1">
                {editing
                  ? 'Your changes replace the saved inspection. The edit is recorded with your name and the time.'
                  : phase === 'BEFORE'
                  ? 'Start Wash opens right away after you send it. You can still edit the inspection later.'
                  : 'You can still edit this later.'}
              </p>
            )}
          </>
        )}
      </div>

      {/* bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-10 bg-canvas/90 backdrop-blur-xl">
        <div className="max-w-[720px] mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setStep(steps[Math.max(0, stepIndex - 1)].key)}
            disabled={stepIndex === 0}
            className="h-12 w-12 rounded-full bg-fill hover:bg-fill-strong flex items-center justify-center disabled:opacity-30 flex-shrink-0"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {step !== 'review' ? (
            <button
              onClick={() => {
                if (step === 'photos' && !photosComplete) {
                  setError(`Take all ${INSPECTION_ANGLES.length} photos, or record a video`);
                  return;
                }
                setError('');
                setStep(steps[stepIndex + 1].key);
              }}
              className="flex-1 h-12 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold flex items-center justify-center gap-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!!problem}
              className="flex-1 h-12 rounded-full bg-[#30d158] hover:bg-[#34e060] text-black text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>{editing ? 'Save changes' : 'Submit inspection'}</span>
            </button>
          )}
        </div>
      </div>

      {/* add a damage: bottom sheet */}
      {pendingPoint && (
        <div className="fixed inset-0 z-20 bg-scrim flex items-end justify-center" onClick={resetDamageForm}>
          <div
            className="w-full max-w-[720px] bg-tile rounded-t-[32px] p-5 space-y-4 max-h-[88dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add a damage</h3>
              <button onClick={resetDamageForm} className="w-9 h-9 rounded-full bg-fill flex items-center justify-center" aria-label="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-sm text-muted mb-2">Type</p>
              <div className="flex flex-wrap gap-2">
                {DAMAGE_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setDmgType(t.key)}
                    className={`px-4 py-2 rounded-full text-sm ${dmgType === t.key ? 'bg-white text-black font-semibold' : 'bg-fill text-body'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted mb-2">How bad</p>
              <div className="flex gap-2">
                {DAMAGE_SEVERITIES.map((sv) => (
                  <button
                    key={sv.key}
                    onClick={() => setDmgSeverity(sv.key)}
                    className={`flex-1 py-2 rounded-full text-sm flex items-center justify-center gap-2 ${
                      dmgSeverity === sv.key ? 'bg-white text-black font-semibold' : 'bg-fill text-body'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[sv.key]}`} />
                    {sv.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted mb-2">Close-up photo (required)</p>
              <input
                ref={damageInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void handleDamagePhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {dmgPhoto ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dmgPhoto.url} alt="Damage close-up" className="w-20 h-20 rounded-2xl object-cover" />
                  <button onClick={() => damageInput.current?.click()} className="flex items-center gap-1.5 text-sm text-link">
                    <RotateCcw className="h-4 w-4" />
                    <span>Retake</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => damageInput.current?.click()}
                  disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-raised hover:bg-raised-strong text-[15px] disabled:opacity-60"
                >
                  {busy === 'damage' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <span>Take close-up photo</span>
                </button>
              )}
            </div>

            <div>
              <label htmlFor="damage-note" className="text-sm text-muted block mb-2">Note (optional)</label>
              <input
                id="damage-note"
                value={dmgNote}
                onChange={(e) => setDmgNote(e.target.value)}
                placeholder="e.g. 10 cm scratch, rear left door"
                className="w-full bg-raised rounded-2xl px-4 py-3 text-sm text-ink placeholder-dim"
              />
            </div>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <button
              onClick={saveDamage}
              className="w-full py-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold"
            >
              Save damage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
