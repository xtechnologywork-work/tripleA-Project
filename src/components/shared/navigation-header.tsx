'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { mockStore } from '@/data/mock/store';
import { RotateCcw } from 'lucide-react';

export function NavigationHeader() {
  const pathname = usePathname();
  const { actor, setActor, availableEmployees, availableStaff } = useAuth();
  const isAdmin = pathname.startsWith('/admin');

  // Do not render the top desktop header on mobile ordering, client tracking, or on the dedicated full-screen admin console
  if (pathname === '/' || pathname.startsWith('/wash') || pathname.startsWith('/admin') || pathname.startsWith('/orders')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 h-12 w-full bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 relative flex items-center justify-center">
              <Image
                src="/images/triplea-logo.png"
                alt="TripleA AAA Logo"
                width={32}
                height={32}
                className="object-contain"
                priority
              />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">TripleA</div>
              <div className="text-xs text-dim">Tower operations</div>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/?spot=1&token=tk_1_137"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                !isAdmin
                  ? 'bg-fill text-ink font-medium'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Bay client (1)
            </Link>

            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                isAdmin
                  ? 'bg-fill text-ink font-medium'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Operations console
            </Link>
          </nav>
        </div>

        {/* Persona and reset */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-dim hidden sm:inline">Acting as</span>
            <select
              aria-label="Active Demo Persona"
              value={actor.id}
              onChange={(e) => {
                const targetId = e.target.value;
                const emp = availableEmployees.find((x) => x.id === targetId);
                if (emp) {
                  setActor({ type: 'EMPLOYEE', id: emp.id, name: emp.name, email: emp.email });
                  return;
                }
                const st = availableStaff.find((x) => x.id === targetId);
                if (st) {
                  setActor({ type: 'STAFF', id: st.id, name: st.name, email: st.email, role: st.role });
                }
              }}
              className="bg-tile text-ink text-sm rounded-full px-3 py-1.5 outline-none transition hover:bg-raised"
            >
              <optgroup label="Employees">
                {availableEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.company?.split(' ')[0] || 'Employee'})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Operations Staff">
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <button
            onClick={() => {
              if (confirm('Reset operational store to clean seed data?')) {
                mockStore.resetToSeed();
                window.location.reload();
              }
            }}
            title="Reset Seed Data"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-ink rounded-full bg-tile hover:bg-raised transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
