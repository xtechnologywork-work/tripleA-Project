'use client';

import { useEffect } from 'react';

/**
 * Keeps the app at one size on phones, like an installed app: no pinch zoom (double-tap zoom is off through CSS touch-action).
 * Safari ignores "user-scalable=no" for pinching, so the pinch gesture is stopped here.
 * Text can still be selected and the page still scrolls.
 */
export function ViewportLock() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    // Safari's own pinch events
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('gestureend', stop);
    // A second finger on the screen starts a pinch: do not let it zoom
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('gestureend', stop);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);
  return null;
}
