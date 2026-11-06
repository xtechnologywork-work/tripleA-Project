'use client';

import React from 'react';
import type { InspectionAngle, InspectionDamage } from '@/domain/types';
import { INSPECTION_ANGLES } from '@/domain/inspection';

// Where each camera angle sits around the car (top view, the front is at the top)
const ANGLE_POINTS: Record<InspectionAngle, { x: number; y: number }> = {
  FRONT: { x: 100, y: 22 },
  FRONT_RIGHT: { x: 172, y: 58 },
  RIGHT: { x: 186, y: 200 },
  REAR_RIGHT: { x: 172, y: 342 },
  REAR: { x: 100, y: 378 },
  REAR_LEFT: { x: 28, y: 342 },
  LEFT: { x: 14, y: 200 },
  FRONT_LEFT: { x: 28, y: 58 },
};

const SEVERITY_COLOR: Record<InspectionDamage['severity'], string> = {
  LOW: '#ff9f0a',
  MEDIUM: '#ff6b35',
  HIGH: '#ff453a',
};

interface CarMapProps {
  /** angles: pick a camera angle. damages: tap the car to mark a damage. view: read only. */
  mode: 'angles' | 'damages' | 'view';
  activeAngle?: InspectionAngle;
  doneAngles?: Set<InspectionAngle>;
  onSelectAngle?: (angle: InspectionAngle) => void;
  damages?: InspectionDamage[];
  /** Damages from the first inspection, drawn in grey (used after the wash). */
  referenceDamages?: InspectionDamage[];
  selectedDamageId?: string | null;
  onPickPoint?: (point: { x: number; y: number }) => void;
  onSelectDamage?: (id: string) => void;
  className?: string;
}

export function CarMap({
  mode,
  activeAngle,
  doneAngles,
  onSelectAngle,
  damages = [],
  referenceDamages = [],
  selectedDamageId,
  onPickPoint,
  onSelectDamage,
  className,
}: CarMapProps) {
  const handlePick = (e: React.MouseEvent<SVGRectElement>) => {
    if (mode !== 'damages' || !onPickPoint) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    onPickPoint({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  return (
    <svg
      viewBox="0 0 200 400"
      className={className}
      role="img"
      aria-label={mode === 'damages' ? 'Car map. Tap where the damage is.' : 'Car, seen from above'}
    >
      {/* ground shadow */}
      <ellipse cx="100" cy="200" rx="62" ry="168" fill="rgba(41,151,255,0.05)" />

      {/* wheels */}
      {[
        [38, 98],
        [150, 98],
        [38, 274],
        [150, 274],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="12" height="34" rx="4" fill="#1c1c1e" stroke="#64b5ff" strokeOpacity="0.5" />
      ))}

      {/* body */}
      <path
        d="M100 48 C128 48 144 62 146 92 L150 150 L150 290 C150 322 138 346 100 350 C62 346 50 322 50 290 L50 150 L54 92 C56 62 72 48 100 48 Z"
        fill="rgba(41,151,255,0.08)"
        stroke="#64b5ff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* hood and trunk lines */}
      <path d="M66 104 Q100 94 134 104" fill="none" stroke="#64b5ff" strokeOpacity="0.45" />
      <path d="M66 318 Q100 326 134 318" fill="none" stroke="#64b5ff" strokeOpacity="0.45" />
      {/* windshield, roof, rear window */}
      <path d="M68 138 L132 138 L126 172 L74 172 Z" fill="rgba(100,181,255,0.18)" stroke="#64b5ff" strokeOpacity="0.8" />
      <rect x="70" y="176" width="60" height="84" rx="10" fill="rgba(100,181,255,0.06)" stroke="#64b5ff" strokeOpacity="0.6" />
      <path d="M74 264 L126 264 L132 292 L68 292 Z" fill="rgba(100,181,255,0.18)" stroke="#64b5ff" strokeOpacity="0.8" />
      {/* mirrors */}
      <ellipse cx="45" cy="140" rx="7" ry="5" fill="#1c1c1e" stroke="#64b5ff" strokeOpacity="0.6" />
      <ellipse cx="155" cy="140" rx="7" ry="5" fill="#1c1c1e" stroke="#64b5ff" strokeOpacity="0.6" />
      {/* lights */}
      <path d="M62 66 L82 58 M138 66 L118 58" stroke="#f5f5f7" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 334 L82 340 M138 334 L118 340" stroke="#ff6b6b" strokeWidth="3" strokeLinecap="round" />

      {/* camera angles */}
      {mode === 'angles' &&
        INSPECTION_ANGLES.map((a) => {
          const pt = ANGLE_POINTS[a.key];
          const done = doneAngles?.has(a.key);
          const active = activeAngle === a.key;
          return (
            <g
              key={a.key}
              onClick={() => onSelectAngle?.(a.key)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={a.label}
            >
              {active && (
                <circle cx={pt.x} cy={pt.y} r="16" fill="none" stroke="#2997ff" strokeWidth="2" className="animate-ping" style={{ transformOrigin: `${pt.x}px ${pt.y}px` }} />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r="11"
                fill={done ? '#30d158' : active ? '#2997ff' : '#2c2c2e'}
                stroke={active ? '#ffffff' : '#64b5ff'}
                strokeOpacity={active ? 1 : 0.5}
                strokeWidth="1.5"
              />
              {done ? (
                <path d={`M${pt.x - 4} ${pt.y} l3 3 l5 -6`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle cx={pt.x} cy={pt.y} r="3" fill={active ? '#fff' : '#a1a1a6'} />
              )}
            </g>
          );
        })}

      {/* damages from the first inspection (grey) */}
      {referenceDamages.map((d, i) => (
        <g key={`ref-${d.id}`} opacity="0.55">
          <circle cx={(d.x / 100) * 200} cy={(d.y / 100) * 400} r="8" fill="none" stroke="#a1a1a6" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x={(d.x / 100) * 200} y={(d.y / 100) * 400 + 3.5} textAnchor="middle" fontSize="9" fill="#a1a1a6" fontWeight="600">
            {i + 1}
          </text>
        </g>
      ))}

      {/* damages */}
      {damages.map((d, i) => {
        const cx = (d.x / 100) * 200;
        const cy = (d.y / 100) * 400;
        const selected = selectedDamageId === d.id;
        return (
          <g
            key={d.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectDamage?.(d.id);
            }}
            style={{ cursor: onSelectDamage ? 'pointer' : 'default' }}
          >
            <circle cx={cx} cy={cy} r={selected ? 12 : 10} fill={SEVERITY_COLOR[d.severity]} stroke="#fff" strokeWidth={selected ? 2.5 : 1.5} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">
              {i + 1}
            </text>
          </g>
        );
      })}

      {/* the tap area, only while marking damages */}
      {mode === 'damages' && <rect x="0" y="0" width="200" height="400" fill="transparent" onClick={handlePick} style={{ cursor: 'crosshair' }} />}
      {/* damages stay tappable above the tap area */}
      {mode === 'damages' &&
        damages.map((d, i) => {
          const cx = (d.x / 100) * 200;
          const cy = (d.y / 100) * 400;
          return (
            <g key={`hit-${d.id}`} onClick={(e) => { e.stopPropagation(); onSelectDamage?.(d.id); }} style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r="14" fill="transparent" />
              <title>{`Damage ${i + 1}`}</title>
            </g>
          );
        })}
    </svg>
  );
}
