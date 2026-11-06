'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in, or running without Supabase (local demo): go straight to the dashboard
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      router.replace('/admin');
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/admin');
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError('');

    const { error: signInError } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError('Wrong email or password.');
      setBusy(false);
      return;
    }
    router.replace('/admin');
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-5 font-sans">
      <div className="w-full max-w-[400px] space-y-8">
        <div className="text-center space-y-3">
          <Image src="/images/triplea-shield.png" alt="TripleA" width={56} height={56} className="mx-auto object-contain" priority />
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-tight">TripleA Operations</h1>
            <p className="text-sm text-dim mt-1">Sign in to open the dashboard</p>
          </div>
        </div>

        {!isSupabaseConfigured() ? (
          <p className="text-sm text-muted text-center">Supabase is not configured. Opening the demo dashboard.</p>
        ) : (
          <form onSubmit={handleSubmit} className="bg-tile rounded-[28px] p-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="text-sm text-body block mb-2">Email</label>
              <div className="relative">
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  className="w-full bg-raised rounded-xl ps-11 pe-4 py-3 text-[14px] text-ink placeholder-dim"
                />
                <Mail className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="text-sm text-body block mb-2">Password</label>
              <div className="relative">
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full bg-raised rounded-xl ps-11 pe-4 py-3 text-[14px] text-ink placeholder-dim"
                />
                <Lock className="h-4 w-4 text-dim absolute top-1/2 -translate-y-1/2 start-4" />
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 text-sm text-rose-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Sign in</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
