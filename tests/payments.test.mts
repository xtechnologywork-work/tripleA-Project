/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/payments.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cleanDraft, priceFor, pickService, pickPackage, buildFulfillment, fulfillmentIds } from '../src/domain/payments.ts';
import { myFatoorahConfig, createPaymentPage, checkPayment, webhookSignatureString } from '../src/lib/myfatoorah.ts';

const SERVICE = { id: 'srv-exterior', name: 'Wash', description: '', durationMin: 30, price: { amountMinor: 2000, currency: 'QAR' }, creditCost: 1, active: true, sortOrder: 1 };
const SERVICE2 = { ...SERVICE, id: 'srv-full', price: { amountMinor: 5000, currency: 'QAR' }, sortOrder: 3 };
const PKG = { id: 'pkg-executive', name: 'Pass', paidWashes: 6, bonusWashes: 2, price: { amountMinor: 14000, currency: 'QAR' }, validityDays: 60, eligibleServiceIds: [], active: true };
const PKG2 = { ...PKG, id: 'pkg-prestige', price: { amountMinor: 26000, currency: 'QAR' } };
const EMP = { id: 'emp-1', fullName: 'Sara', email: 's@x.qa', status: 'ACTIVE', createdAt: '' };
const NOW = '2026-11-07T10:00:00.000Z';
const intent = (over = {}) => ({ id: 'abc-123', employeeId: 'emp-1', plan: 'single', amountMinor: 2000, currency: 'QAR', status: 'PAID', invoiceId: '555', paymentId: 'P1', draft: { bay: '34', lang: 'en' }, createdAt: NOW, ...over });

// ---- the details the customer sends ----
test('bay must be a real bay; text is cut to size; the price is never taken from the browser', () => {
  assert.deepEqual(cleanDraft({ bay: '0' }, 1288), { ok: false, error: 'BAD_BAY' });
  assert.deepEqual(cleanDraft({ bay: '1289' }, 1288), { ok: false, error: 'BAD_BAY' });
  const ok = cleanDraft({ bay: '034', notes: 'x'.repeat(900), plate: '123456', price: 1, amount: 1, lang: 'ar' }, 1288);
  assert.equal(ok.ok, true);
  assert.equal(ok.draft.bay, '34');
  assert.equal(ok.draft.notes.length, 500);
  assert.equal(ok.draft.lang, 'ar');
  assert.equal('price' in ok.draft || 'amount' in ok.draft, false);
});

test('only real photos are accepted', () => {
  assert.equal(cleanDraft({ bay: '5', photo: 'data:image/svg+xml;base64,AAA' }, 1288).ok, false);
  assert.equal(cleanDraft({ bay: '5', photo: 'https://evil.example/x.jpg' }, 1288).ok, false);
  assert.equal(cleanDraft({ bay: '5', photo: 'data:image/jpeg;base64,AAAA' }, 1288).ok, true);
});

test('prices come from the saved service and pass', () => {
  assert.equal(pickService([SERVICE2, SERVICE]).id, 'srv-exterior');
  assert.equal(pickPackage([PKG2, PKG]).id, 'pkg-executive');
  assert.equal(priceFor('single', SERVICE, PKG), 2000);
  assert.equal(priceFor('pass', SERVICE, PKG), 14000);
  assert.equal(priceFor('pass', SERVICE, null), null);
});

// ---- after a confirmed payment ----
test('a paid single wash becomes one paid order', () => {
  const f = buildFulfillment({ intent: intent(), employee: EMP, service: SERVICE, pkg: PKG, activePass: null, reference: 'CB-261107-0001', now: NOW });
  assert.equal(f.order.id, fulfillmentIds('abc-123').order);
  assert.equal(f.order.paymentMode, 'ONE_TIME');
  assert.equal(f.order.paymentStatus, 'PAID_ONLINE');
  assert.equal(f.order.priceSnapshot.amountMinor, 2000);
  assert.equal(f.order.status, 'NEW');
  assert.equal(f.order.bayCodeSnapshot, '34');
  assert.equal(f.order.bayId, 'bay-34');
  assert.equal(f.credits.length, 0);
  assert.equal(f.subscriptions.length, 0);
  assert.equal(f.events[0].to, 'NEW');
});

test('a paid pass gives 8 washes and uses one for this first wash', () => {
  const f = buildFulfillment({ intent: intent({ plan: 'pass', amountMinor: 14000 }), employee: EMP, service: SERVICE, pkg: PKG, activePass: null, reference: 'CB-1', now: NOW });
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.subscriptions[0].status, 'ACTIVE');
  assert.equal(f.subscriptions[0].expiresAt, '2027-01-06T10:00:00.000Z');
  const grant = f.credits.find((c) => c.type === 'GRANT');
  const debit = f.credits.find((c) => c.type === 'DEBIT');
  assert.equal(grant.delta, 8);
  assert.equal(grant.subscriptionId, f.subscriptions[0].id);
  assert.equal(debit.delta, -1);
  assert.equal(debit.orderId, f.order.id);
  assert.equal(f.order.paymentMode, 'CREDIT');
  assert.equal(f.order.creditsUsed, 1);
  assert.equal(f.credits.reduce((s, c) => s + c.delta, 0), 7);
});

test('buying a pass twice at the same time adds the washes to the pass already there', () => {
  const active = { id: 'sub-old', employeeId: 'emp-1', status: 'ACTIVE' };
  const f = buildFulfillment({ intent: intent({ plan: 'pass', amountMinor: 14000 }), employee: EMP, service: SERVICE, pkg: PKG, activePass: active, reference: 'CB-1', now: NOW });
  assert.equal(f.subscriptions.length, 0);
  assert.equal(f.credits.find((c) => c.type === 'GRANT').subscriptionId, 'sub-old');
});

test('the same payment always gives the same ids, so it can never make two orders', () => {
  const a = buildFulfillment({ intent: intent(), employee: EMP, service: SERVICE, pkg: PKG, activePass: null, reference: 'CB-1', now: NOW });
  const b = buildFulfillment({ intent: intent(), employee: EMP, service: SERVICE, pkg: PKG, activePass: null, reference: 'CB-2', now: NOW });
  assert.equal(a.order.id, b.order.id);
  assert.equal(a.events[0].id, b.events[0].id);
});

test('the photo is attached when there is one', () => {
  const f = buildFulfillment({ intent: intent({ draft: { bay: '3', lang: 'en', photo: 'storage:pending/pay-abc.jpg' } }), employee: EMP, service: SERVICE, pkg: PKG, activePass: null, reference: 'CB-1', now: NOW });
  assert.equal(f.photos.length, 1);
  assert.equal(f.photos[0].blobKey, 'storage:pending/pay-abc.jpg');
});

// ---- MyFatoorah ----
const CONFIG = { apiKey: 'x'.repeat(40), baseUrl: 'https://apitest.myfatoorah.com' };
function fake(status, body) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
  };
}

test('settings: only MyFatoorah addresses and a real key are accepted', () => {
  assert.equal(myFatoorahConfig({}), null);
  assert.equal(myFatoorahConfig({ MYFATOORAH_API_KEY: 'x'.repeat(40), MYFATOORAH_BASE_URL: 'https://evil.example.com' }), null);
  assert.equal(myFatoorahConfig({ MYFATOORAH_API_KEY: 'x'.repeat(40) }).baseUrl, 'https://apitest.myfatoorah.com');
  assert.equal(myFatoorahConfig({ MYFATOORAH_API_KEY: 'x'.repeat(40), MYFATOORAH_BASE_URL: 'https://api-qa.myfatoorah.com/' }).baseUrl, 'https://api-qa.myfatoorah.com');
});

test('the payment page is asked for with our reference, QAR and the return address', async () => {
  const f = fake(200, { IsSuccess: true, Data: { InvoiceId: 300034, InvoiceURL: 'https://demo.myfatoorah.com/ie/01' } });
  const res = await createPaymentPage(CONFIG, { amount: 20, reference: 'abc-123', customerName: 'Sara <script>', mobile: '55128901', itemName: 'Wash', callbackUrl: 'https://tripleacenter.com/pay/return', lang: 'ar' }, f.fetcher);
  assert.deepEqual(res, { ok: true, page: { invoiceId: '300034', url: 'https://demo.myfatoorah.com/ie/01' } });
  assert.equal(f.calls[0].url, 'https://apitest.myfatoorah.com/v2/SendPayment');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer ' + 'x'.repeat(40));
  const b = f.calls[0].body;
  assert.equal(b.InvoiceValue, 20);
  assert.equal(b.DisplayCurrencyIso, 'QAR');
  assert.equal(b.CustomerReference, 'abc-123');
  assert.equal(b.CallBackUrl, 'https://tripleacenter.com/pay/return');
  assert.equal(b.ErrorUrl, 'https://tripleacenter.com/pay/return');
  assert.equal(b.Language, 'AR');
  assert.equal(b.CustomerName, 'Sara script');
  assert.equal(b.MobileCountryCode, '+974');
  assert.equal(b.InvoiceItems[0].UnitPrice, 20);
});

test('a refused page request is reported, not hidden', async () => {
  const f = fake(400, { IsSuccess: false, Message: 'Invalid data', ValidationErrors: [{ Name: 'CallBackUrl', Error: 'bad' }] });
  const res = await createPaymentPage(CONFIG, { amount: 20, reference: 'r', customerName: 'A', itemName: 'W', callbackUrl: 'https://x/pay', lang: 'en' }, f.fetcher);
  assert.equal(res.ok, false);
  assert.match(res.error, /CallBackUrl/);
});

test('only an invoice MyFatoorah calls Paid counts as paid', async () => {
  const paid = fake(200, { IsSuccess: true, Data: { InvoiceId: 555, InvoiceStatus: 'Paid', CustomerReference: 'abc-123', InvoiceTransactions: [{ TransactionStatus: 'Failed', PaymentId: 'P0' }, { TransactionStatus: 'Succss', PaymentId: 'P1', PaymentGateway: 'VISA/MASTER' }] } });
  const r = await checkPayment(CONFIG, 'P1', 'PaymentId', paid.fetcher);
  assert.equal(paid.calls[0].url, 'https://apitest.myfatoorah.com/v2/GetPaymentStatus');
  assert.deepEqual(paid.calls[0].body, { Key: 'P1', KeyType: 'PaymentId' });
  assert.equal(r.check.paid, true);
  assert.equal(r.check.invoiceId, '555');
  assert.equal(r.check.customerReference, 'abc-123');
  assert.equal(r.check.paymentId, 'P1');
  assert.equal(r.check.gateway, 'VISA/MASTER');
  const pending = fake(200, { IsSuccess: true, Data: { InvoiceId: 556, InvoiceStatus: 'Pending', CustomerReference: 'x', InvoiceTransactions: [{ TransactionStatus: 'Failed' }] } });
  assert.equal((await checkPayment(CONFIG, '556', 'InvoiceId', pending.fetcher)).check.paid, false);
});

test('no network gives a clear failure', async () => {
  const broken = async () => {
    throw new Error('offline');
  };
  assert.equal((await checkPayment(CONFIG, 'P1', 'PaymentId', broken)).ok, false);
});

test('the webhook signature string follows the documented order', () => {
  const s = webhookSignatureString({ Invoice: { Id: 6409988, Status: 'PAID', ExternalIdentifier: 'asdqwd-f13sdf-fasjkz' }, Transaction: { Status: 'SUCCESS', PaymentId: '07076409988323998875' } });
  assert.equal(s, 'Invoice.Id=6409988,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=07076409988323998875,Invoice.ExternalIdentifier=asdqwd-f13sdf-fasjkz');
  // null becomes empty
  assert.equal(webhookSignatureString({ Invoice: { Id: 1, Status: 'PAID', ExternalIdentifier: null }, Transaction: { Status: 'SUCCESS', PaymentId: 'P' } }).endsWith('Invoice.ExternalIdentifier='), true);
  // and the HMAC is base64 of SHA-256
  const sig = crypto.createHmac('sha256', 'secret').update(s, 'utf8').digest('base64');
  assert.match(sig, /^[A-Za-z0-9+/]+=*$/);
});
