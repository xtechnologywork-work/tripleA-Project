'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function WashRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(params ? `/?${params}` : '/');
  }, [router, searchParams]);

  return (
    <div className="p-12 text-center text-xs text-dim tabular-nums bg-canvas min-h-screen">
      Redirecting to Bay Ordering Client...
    </div>
  );
}

export default function WashPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-dim tabular-nums bg-canvas min-h-screen">Loading...</div>}>
      <WashRedirect />
    </Suspense>
  );
}
