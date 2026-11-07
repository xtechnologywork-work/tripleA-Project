'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, VideoOff } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onError'>;

/**
 * A photo that tries again if it fails to load (a dropped connection, a link that was just renewed),
 * and shows a calm placeholder instead of a broken image when it still cannot.
 */
export function SafeImage({ src, alt, className, ...rest }: ImgProps) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new link starts fresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the file changes
    setAttempt(0);
    setFailed(false);
  }, [src]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!src) return <div className={`${className || ''} bg-inset`} aria-hidden="true" />;

  if (failed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
        className={`${className || ''} flex items-center justify-center bg-inset text-dim cursor-pointer`}
        aria-label={alt || 'Photo unavailable. Tap to retry'}
      >
        <ImageOff className="h-5 w-5" />
      </button>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={src}
      alt={alt}
      className={className}
      {...rest}
      onError={() => {
        if (attempt < 2) {
          timer.current = setTimeout(() => setAttempt((n) => n + 1), 1200 * (attempt + 1));
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'onError' | 'src'> & { src?: string };

/** A video with the settings phones need, and a message with a retry and an "open" link when it cannot play. */
export function SafeVideo({ src, className, ...rest }: VideoProps) {
  const { isRtl } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the file changes
    setAttempt(0);
    setFailed(false);
  }, [src]);

  if (!src) return null;

  if (failed) {
    return (
      <div className="rounded-2xl bg-inset p-5 text-center space-y-3">
        <VideoOff className="h-6 w-6 text-dim mx-auto" />
        <p className="text-sm text-muted">
          {isRtl ? 'تعذر تشغيل الفيديو. قد يكون الاتصال ضعيفاً أو أن صيغته لا يدعمها هذا الجهاز.' : 'The video could not play. The connection may be weak, or this device may not support its format.'}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition cursor-pointer"
          >
            {isRtl ? 'إعادة المحاولة' : 'Try again'}
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition">
            {isRtl ? 'فتح الفيديو' : 'Open video'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <video
      key={attempt}
      src={src}
      controls
      playsInline
      preload="metadata"
      className={className}
      {...rest}
      onError={() => setFailed(true)}
    />
  );
}
