'use client';

import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, TriangleAlert } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import type { QrStats } from '@/domain/qr-stats';

const card = 'rounded-3xl bg-tile';

const num = (n: number) => n.toLocaleString('en-US');
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

function ago(now: number, then: number | null): string {
  if (then === null) return 'No scans yet';
  const m = Math.max(0, Math.floor((now - then) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-inset p-4">
      <div className="text-xs text-dim">{label}</div>
      <div className="mt-1 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink tabular-nums">{value}</div>
      {sub && <div className="text-xs text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

/** The address inside the code never changes: it is the site address followed by /qr */
function useSiteUrl(): { url: string; fixed: boolean; ready: boolean } {
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
    setOrigin(window.location.origin);
  }, []);
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const base = configured || origin;
  return { url: base ? `${base}/qr` : '', fixed: !!configured, ready: !!base };
}

export function QrPage({ now }: { now: number | null }) {
  const { url, fixed, ready } = useSiteUrl();
  const [png, setPng] = useState('');
  const [svg, setSvg] = useState('');
  const [stats, setStats] = useState<QrStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // The code itself: high error correction, a quiet border, black on white so every phone reads it
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const opts = { errorCorrectionLevel: 'H' as const, margin: 2, color: { dark: '#000000', light: '#ffffff' } };
    Promise.all([QRCode.toDataURL(url, { ...opts, width: 1200 }), QRCode.toString(url, { ...opts, type: 'svg' })])
      .then(([p, s]) => {
        if (cancelled) return;
        setPng(p);
        setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const loadStats = useCallback(async () => {
    try {
      const sb = getSupabase();
      const session = sb ? (await sb.auth.getSession()).data.session : null;
      const res = await fetch('/api/admin/qr-stats', {
        cache: 'no-store',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error('stats');
      setStats((await res.json()) as QrStats);
      setStatsError(false);
    } catch {
      setStatsError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once, then keep fresh
    void loadStats();
    const timer = setInterval(loadStats, 20_000);
    return () => clearInterval(timer);
  }, [loadStats]);

  const save = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const downloadPng = () => png && save(png, 'triplea-qr-code.png');
  const downloadSvg = () => {
    if (!svg) return;
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    save(blobUrl, 'triplea-qr-code.svg');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore
    }
  };

  // A link that only works on this computer cannot be scanned by a phone
  const localOnly = ready && !fixed && /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|.*\.local$)/i.test(new URL(url).hostname);
  const insecure = ready && !fixed && url.startsWith('http://') && !localOnly;

  const days = stats?.byDay || [];
  const maxDay = Math.max(1, ...days.map((d) => d.scans));
  const reached = stats ? stats.signups + stats.logins : 0;
  const deviceTotal = stats ? stats.devices.mobile + stats.devices.desktop + stats.devices.other : 0;
  const every = 5;

  return (
    <div className="max-w-[1200px] space-y-4">
      {(localOnly || insecure) && (
        <div className="rounded-2xl bg-amber-400/[0.08] p-4 flex items-start gap-3">
          <TriangleAlert className="h-5 w-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-amber-300">This code only works on this computer for now</p>
            <p className="text-body leading-relaxed">
              It points to <span className="tabular-nums">{url}</span>, which phones cannot open. Open this dashboard from your real website address
              (or set <span className="font-medium">NEXT_PUBLIC_SITE_URL</span> in .env.local) before you print the code, so it never changes.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start">
        {/* The code */}
        <section className={`${card} p-4 md:p-6 space-y-5`}>
          <div>
            <h3 className="text-base font-semibold text-ink tracking-tight">Employee QR code</h3>
            <p className="text-sm text-dim mt-0.5">Employees scan it to open TripleA, then sign up or sign in.</p>
          </div>

          <div className="rounded-2xl bg-white p-3 mx-auto w-full max-w-[320px] aspect-square flex items-center justify-center">
            {png ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={png} alt="QR code that opens the TripleA customer page" className="w-full h-full" />
            ) : (
              <div className="h-8 w-8 rounded-full border-2 border-black/20 border-t-black/70 animate-spin" aria-label="Preparing the code" />
            )}
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-inset pl-4 pr-1.5 py-1.5">
            <span className="flex-1 min-w-0 truncate text-sm text-body tabular-nums" title={url}>
              {url || '…'}
            </span>
            <button
              onClick={copy}
              disabled={!url}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition active:scale-95 cursor-pointer disabled:opacity-40"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={downloadPng}
              disabled={!png}
              className="flex items-center justify-center gap-2 py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-semibold transition active:scale-95 cursor-pointer disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Download PNG
            </button>
            <button
              onClick={downloadSvg}
              disabled={!svg}
              className="flex items-center justify-center gap-2 py-3 rounded-full bg-fill hover:bg-fill-strong text-ink text-[15px] transition active:scale-95 cursor-pointer disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Download SVG
            </button>
          </div>
          <p className="text-xs text-dim leading-relaxed">
            This code never changes. It opens a fixed address that counts the scan and sends the person to the customer page, so a printed copy keeps
            working. Use the SVG for large prints.
          </p>
        </section>

        {/* How it is doing */}
        <div className="space-y-4 min-w-0">
          <section className={`${card} p-4 md:p-6 space-y-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink tracking-tight">How the code is doing</h3>
                <p className="text-sm text-dim mt-0.5">Counted when a phone opens the code. Link previews are not counted.</p>
              </div>
              {statsError && <span className="text-xs text-rose-300 whitespace-nowrap">Could not load</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Scans" value={stats ? num(stats.total) : '–'} sub={stats ? `${num(stats.last24h)} in 24 hours` : undefined} />
              <Stat label="Last 7 days" value={stats ? num(stats.last7d) : '–'} sub={stats ? `${num(stats.last30d)} in 30 days` : undefined} />
              <Stat label="Signed up" value={stats ? num(stats.signups) : '–'} sub="new accounts from the code" />
              <Stat label="Signed in" value={stats ? num(stats.logins) : '–'} sub="existing accounts" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Scans that became an account use"
                value={pct(stats && stats.total > 0 ? Math.min(1, reached / stats.total) : null)}
                sub={stats ? `${num(reached)} of ${num(stats.total)} scans` : undefined}
              />
              <Stat label="Last scan" value={stats && now !== null ? ago(now, stats.lastScanAt) : '–'} />
            </div>
          </section>

          <section className={`${card} p-4 md:p-6 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ink tracking-tight">Scans, last 30 days</h3>
              <span className="text-sm text-muted tabular-nums">
                {hover !== null && days[hover] ? `${days[hover].day} · ${days[hover].scans}` : 'Hover or tap a bar'}
              </span>
            </div>
            {!stats || stats.last30d === 0 ? (
              <p className="text-sm text-dim py-8 text-center">No scans in the last 30 days.</p>
            ) : (
              <div>
                <div className="flex items-end gap-[3px] h-32" onMouseLeave={() => setHover(null)}>
                  {days.map((d, i) => (
                    <button
                      key={d.day}
                      type="button"
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onClick={() => setHover(i)}
                      aria-label={`${d.day}: ${d.scans} scans`}
                      className={`flex-1 min-w-0 h-full flex items-end outline-none cursor-pointer transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`block w-full rounded-md ${d.scans > 0 ? 'bg-[#0071e3]' : 'bg-fill'}`}
                        style={{ height: d.scans > 0 ? `${Math.max(6, (d.scans / maxDay) * 100)}%` : '3px' }}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex gap-[3px] mt-2 text-[11px] text-dim">
                  {days.map((d, i) => (
                    <span key={d.day} className="flex-1 min-w-0 text-center whitespace-nowrap overflow-visible">
                      {i % every === 0 ? d.day.slice(8) : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={`${card} p-4 md:p-6 space-y-4`}>
            <h3 className="text-base font-semibold text-ink tracking-tight">Devices</h3>
            {!stats || deviceTotal === 0 ? (
              <p className="text-sm text-dim">No scans yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex h-3 rounded-full overflow-hidden bg-fill gap-0.5">
                  {[
                    { k: 'mobile', v: stats.devices.mobile, c: 'bg-[#0071e3]' },
                    { k: 'desktop', v: stats.devices.desktop, c: 'bg-[#8e8e93]' },
                    { k: 'other', v: stats.devices.other, c: 'bg-fill-strong' },
                  ]
                    .filter((x) => x.v > 0)
                    .map((x) => (
                      <div key={x.k} className={x.c} style={{ width: `${(x.v / deviceTotal) * 100}%` }} />
                    ))}
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
                  <li>
                    Phones <span className="text-ink font-semibold tabular-nums">{num(stats.devices.mobile)}</span> <span className="text-dim">{pct(stats.devices.mobile / deviceTotal)}</span>
                  </li>
                  <li>
                    Computers <span className="text-ink font-semibold tabular-nums">{num(stats.devices.desktop)}</span> <span className="text-dim">{pct(stats.devices.desktop / deviceTotal)}</span>
                  </li>
                  {stats.devices.other > 0 && (
                    <li>
                      Other <span className="text-ink font-semibold tabular-nums">{num(stats.devices.other)}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
