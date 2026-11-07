'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface OtpCodeProps {
  /** The 8 digits, shown as +974 XXXX XXXX */
  phone: string;
  /** When "Send again" opens (ms) */
  resendAt: number;
  busy: boolean;
  /** The last error, already in words. A new error clears the boxes. */
  error: string;
  /** Changes each time an error comes in, so the same message twice still shakes */
  errorKey: number;
  onSubmit: (code: string) => void;
  onResend: () => Promise<boolean>;
  onChangeNumber: () => void;
}

/**
 * Step 2 of sign in: six boxes for the code. One real input sits over the boxes, so the code from the message
 * can be filled in by the phone (one-time-code), pasted, or typed. It checks itself when the sixth digit is in.
 */
export function OtpCode({ phone, resendAt, busy, error, errorKey, onSubmit, onResend, onChangeNumber }: OtpCodeProps) {
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [now, setNow] = useState(0);
  const [shake, setShake] = useState(false);
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = useRef('');

  // The clock for "Send again"
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- time is only known in the browser
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // A wrong or expired code: clear the boxes, shake once, ready for the next try
  useEffect(() => {
    if (!errorKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset after an answer from the server
    setCode('');
    submitted.current = '';
    setShake(true);
    const id = setTimeout(() => setShake(false), 450);
    input.current?.focus();
    return () => clearTimeout(id);
  }, [errorKey]);

  // Six digits: check right away, once per code
  useEffect(() => {
    if (code.length === 6 && !busy && submitted.current !== code) {
      submitted.current = code;
      onSubmit(code);
    }
  }, [code, busy, onSubmit]);

  const left = now === 0 ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));
  const canResend = now !== 0 && left === 0 && !sending && !busy;
  const shown = `+974 ${phone.slice(0, 4)} ${phone.slice(4)}`;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight text-ink">{t('otpTitle')}</h4>
        <p className="text-[15px] text-muted leading-relaxed">
          {t('otpSentTo')}{' '}
          <span dir="ltr" className="text-ink font-medium tabular-nums whitespace-nowrap">
            {shown}
          </span>
        </p>
        <button type="button" onClick={onChangeNumber} className="text-[15px] text-link hover:opacity-80 cursor-pointer">
          {t('otpChangeNumber')}
        </button>
      </div>

      {/* The boxes, always left to right */}
      <div dir="ltr" className={`relative ${shake ? 'otp-shake' : ''}`} onClick={() => input.current?.focus()}>
        <div className="grid grid-cols-6 gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => {
            const digit = code[i] || '';
            const active = i === Math.min(code.length, 5) && !busy;
            return (
              <div
                key={i}
                className={`h-14 rounded-2xl bg-raised flex items-center justify-center text-[24px] font-semibold text-ink tabular-nums transition ${
                  error ? 'ring-2 ring-rose-400/60' : active ? 'ring-2 ring-[#0071e3]' : ''
                }`}
              >
                {digit}
              </div>
            );
          })}
        </div>
        <input
          ref={input}
          autoFocus
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-label={t('otpCodeLabel')}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        />
      </div>

      <div className="min-h-[44px] space-y-3">
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('otpVerifying')}
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-rose-400 leading-relaxed">
            {error}
          </p>
        ) : resent ? (
          <p className="text-sm text-emerald-400">{t('otpResent')}</p>
        ) : null}

        {canResend ? (
          <button
            type="button"
            onClick={async () => {
              setSending(true);
              setResent(false);
              const ok = await onResend();
              setSending(false);
              if (ok) {
                setResent(true);
                setCode('');
                submitted.current = '';
                input.current?.focus();
              }
            }}
            className="text-[15px] text-link hover:opacity-80 cursor-pointer"
          >
            {t('otpResend')}
          </button>
        ) : (
          <p className="text-sm text-dim tabular-nums">
            {sending ? t('otpVerifying') : `${t('otpResendIn')} ${now === 0 ? '' : clock}`}
          </p>
        )}
      </div>
    </div>
  );
}
