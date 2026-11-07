/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/qr-stats.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { deviceOf, isBot, summarize } from '../src/domain/qr-stats.ts';

const T = (iso) => new Date(iso).getTime();
const NOW = T('2026-11-07T12:00:00Z'); // 15:00 in Doha

test('phones, computers and link previews are told apart', () => {
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), 'desktop');
  assert.equal(isBot('WhatsApp/2.23.20 A'), true);
  assert.equal(isBot('facebookexternalhit/1.1'), true);
  assert.equal(isBot('Googlebot/2.1'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari'), false);
});

test('no events gives zeros and 30 empty days', () => {
  const s = summarize([], NOW);
  assert.equal(s.total, 0);
  assert.equal(s.lastScanAt, null);
  assert.equal(s.byDay.length, 30);
  assert.ok(s.byDay.every((d) => d.scans === 0));
  assert.equal(s.byDay[29].day, '2026-11-07');
});

test('scans are counted by period, day and device', () => {
  const rows = [
    { kind: 'scan', device: 'mobile', at: T('2026-11-07T10:00:00Z') },
    { kind: 'scan', device: 'mobile', at: T('2026-11-06T10:00:00Z') },
    { kind: 'scan', device: 'desktop', at: T('2026-10-20T10:00:00Z') },
    { kind: 'scan', device: 'other', at: T('2026-08-01T10:00:00Z') }, // too old for the chart, still counted in total
    { kind: 'signup', device: 'mobile', at: T('2026-11-07T10:05:00Z') },
    { kind: 'login', device: 'mobile', at: T('2026-11-07T10:06:00Z') },
  ];
  const s = summarize(rows, NOW);
  assert.equal(s.total, 4);
  assert.equal(s.last24h, 1);
  assert.equal(s.last7d, 2);
  assert.equal(s.last30d, 3);
  assert.equal(s.signups, 1);
  assert.equal(s.logins, 1);
  assert.deepEqual(s.devices, { mobile: 2, desktop: 1, other: 1 });
  assert.equal(s.lastScanAt, T('2026-11-07T10:00:00Z'));
  assert.equal(s.byDay.reduce((a, d) => a + d.scans, 0), 3);
  assert.equal(s.byDay.find((d) => d.day === '2026-11-07').scans, 1);
});

test('a scan just after midnight in Doha counts on the new Doha day', () => {
  const rows = [{ kind: 'scan', device: 'mobile', at: T('2026-11-06T21:30:00Z') }]; // 00:30 on the 7th in Doha
  const s = summarize(rows, NOW);
  assert.equal(s.byDay.find((d) => d.day === '2026-11-07').scans, 1);
  assert.equal(s.byDay.find((d) => d.day === '2026-11-06').scans, 0);
});

test('the code always has the same content for the same address, and a different address gives a different code', async () => {
  const opts = { errorCorrectionLevel: 'H', margin: 2 };
  const a = await QRCode.toString('https://example.qa/qr', { ...opts, type: 'svg' });
  const b = await QRCode.toString('https://example.qa/qr', { ...opts, type: 'svg' });
  const c = await QRCode.toString('https://example.qa/qr2', { ...opts, type: 'svg' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
