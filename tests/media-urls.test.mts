/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/media-urls.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLink, keepFreshLinks, REPLACE_WHEN_LEFT_MS } from '../src/lib/media-urls.ts';

const NOW = Date.parse('2026-11-07T10:00:00Z');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const link = (path, expInMs, salt = '') =>
  `https://x.supabase.co/storage/v1/object/sign/inspections/${path}?token=${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor((NOW + expInMs) / 1000), salt })}.sig`;

const db = (url, damageUrl) => ({
  photos: [{ id: 'p1', blobKey: url }],
  inspections: [{ id: 'i1', media: [{ id: 'm1', url }], damages: [{ id: 'd1', photoUrl: damageUrl }] }],
});

test('the key ignores the token, the expiry is read from it', () => {
  const a = readLink(link('o1/v.mp4', 3600_000, 'a'));
  const b = readLink(link('o1/v.mp4', 3600_000, 'b'));
  assert.equal(a.key, b.key);
  assert.equal(a.expires, NOW + 3600_000 - ((NOW + 3600_000) % 1000));
});

test('things that are not signed links are left alone', () => {
  assert.equal(readLink(''), null);
  assert.equal(readLink(undefined), null);
  assert.equal(readLink('data:image/jpeg;base64,AAAA'), null);
  assert.equal(readLink('blob:http://localhost/abc'), null);
  const plain = readLink('https://example.com/photo.jpg');
  assert.equal(plain.expires, null);
});

test('a link that is still good is kept, so a playing video is not restarted', () => {
  const before = db(link('o1/v.mp4', 3600_000, 'old'), link('o1/d.jpg', 3600_000, 'old'));
  const after = db(link('o1/v.mp4', 3600_000, 'new'), link('o1/d.jpg', 3600_000, 'new'));
  const keepVideo = before.inspections[0].media[0].url;
  const keepDamage = before.inspections[0].damages[0].photoUrl;
  keepFreshLinks(after, before, NOW);
  assert.equal(after.inspections[0].media[0].url, keepVideo);
  assert.equal(after.photos[0].blobKey, keepVideo);
  assert.equal(after.inspections[0].damages[0].photoUrl, keepDamage);
});

test('a link that is about to expire is replaced by the new one', () => {
  const before = db(link('o1/v.mp4', REPLACE_WHEN_LEFT_MS - 1000, 'old'), link('o1/d.jpg', 3600_000, 'old'));
  const fresh = link('o1/v.mp4', 3600_000, 'new');
  const after = db(fresh, link('o1/d.jpg', 3600_000, 'new'));
  keepFreshLinks(after, before, NOW);
  assert.equal(after.inspections[0].media[0].url, fresh);
});

test('a different file always gets its own link', () => {
  const before = db(link('o1/a.mp4', 3600_000, 'old'), link('o1/d.jpg', 3600_000, 'old'));
  const fresh = link('o1/b.mp4', 3600_000, 'new');
  const after = db(fresh, link('o1/d.jpg', 3600_000, 'new'));
  keepFreshLinks(after, before, NOW);
  assert.equal(after.inspections[0].media[0].url, fresh);
});

test('no previous data, or a damage without a photo, does not break', () => {
  const after = { photos: [], inspections: [{ id: 'i', media: [], damages: [{ id: 'd' }] }] };
  keepFreshLinks(after, null, NOW);
  keepFreshLinks(after, { photos: [], inspections: [] }, NOW);
  assert.equal(after.inspections[0].damages[0].photoUrl, undefined);
});
