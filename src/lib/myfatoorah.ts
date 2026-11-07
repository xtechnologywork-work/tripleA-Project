/**
 * MyFatoorah: makes the payment page and asks whether a payment went through. Server only.
 * The network call is passed in, so tests run without contacting MyFatoorah.
 */

export interface MyFatoorahConfig {
  apiKey: string;
  baseUrl: string;
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Test: https://apitest.myfatoorah.com. Qatar live: https://api-qa.myfatoorah.com */
export function myFatoorahConfig(env: Record<string, string | undefined> = process.env): MyFatoorahConfig | null {
  const apiKey = (env.MYFATOORAH_API_KEY || '').trim();
  const baseUrl = (env.MYFATOORAH_BASE_URL || 'https://apitest.myfatoorah.com').trim().replace(/\/+$/, '');
  if (apiKey.length < 20 || !/^https:\/\/[a-z0-9.-]+\.myfatoorah\.com$/i.test(baseUrl)) return null;
  return { apiKey, baseUrl };
}

interface Envelope<T> {
  IsSuccess?: boolean;
  Message?: string;
  ValidationErrors?: { Name?: string; Error?: string }[] | null;
  Data?: T;
}

async function call<T>(config: MyFatoorahConfig, path: string, body: unknown, fetcher: Fetcher): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetcher(`${config.baseUrl}/v2/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let json: Envelope<T> = {};
    try {
      json = (await res.json()) as Envelope<T>;
    } catch {
      // no body
    }
    if (!res.ok || json.IsSuccess === false || !json.Data) {
      const detail = json.ValidationErrors?.map((v) => `${v.Name}: ${v.Error}`).join('; ') || json.Message || `HTTP ${res.status}`;
      return { ok: false, error: detail };
    }
    return { ok: true, data: json.Data };
  } catch {
    return { ok: false, error: 'MyFatoorah could not be reached' };
  }
}

export interface PaymentPage {
  invoiceId: string;
  url: string;
}

/** Makes a payment page (all methods enabled on the account: Apple Pay, cards, ...). */
export async function createPaymentPage(
  config: MyFatoorahConfig,
  p: {
    amount: number;
    reference: string;
    customerName: string;
    mobile?: string;
    itemName: string;
    callbackUrl: string;
    lang: 'ar' | 'en';
    userField?: string;
  },
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<{ ok: true; page: PaymentPage } | { ok: false; error: string }> {
  const name = p.customerName.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 100) || 'TripleA customer';
  const body: Record<string, unknown> = {
    CustomerName: name,
    NotificationOption: 'LNK',
    InvoiceValue: p.amount,
    DisplayCurrencyIso: 'QAR',
    CallBackUrl: p.callbackUrl,
    ErrorUrl: p.callbackUrl,
    Language: p.lang === 'ar' ? 'AR' : 'EN',
    CustomerReference: p.reference,
    UserDefinedField: p.userField || '',
    InvoiceItems: [{ ItemName: p.itemName, Quantity: 1, UnitPrice: p.amount }],
  };
  if (p.mobile && /^\d{8}$/.test(p.mobile)) {
    body.MobileCountryCode = '+974';
    body.CustomerMobile = p.mobile;
  }
  const res = await call<{ InvoiceId?: number | string; InvoiceURL?: string }>(config, 'SendPayment', body, fetcher);
  if (!res.ok) return res;
  if (!res.data.InvoiceId || !res.data.InvoiceURL || !/^https:\/\//.test(res.data.InvoiceURL)) {
    return { ok: false, error: 'MyFatoorah did not return a payment page' };
  }
  return { ok: true, page: { invoiceId: String(res.data.InvoiceId), url: res.data.InvoiceURL } };
}

export interface PaymentCheck {
  invoiceId: string;
  /** Paid, Pending, Canceled (as MyFatoorah writes it) */
  invoiceStatus: string;
  paid: boolean;
  customerReference: string;
  paymentId?: string;
  gateway?: string;
  /** The status of the attempt this payment id belongs to (InProgress, Succss, Failed, Canceled) */
  attemptStatus?: string;
}

/** Asks MyFatoorah how a payment ended. The only answer the app trusts. */
export async function checkPayment(
  config: MyFatoorahConfig,
  key: string,
  keyType: 'PaymentId' | 'InvoiceId',
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<{ ok: true; check: PaymentCheck } | { ok: false; error: string }> {
  const res = await call<{
    InvoiceId?: number | string;
    InvoiceStatus?: string;
    CustomerReference?: string;
    InvoiceTransactions?: { TransactionStatus?: string; PaymentId?: string; PaymentGateway?: string }[];
  }>(config, 'GetPaymentStatus', { Key: key, KeyType: keyType }, fetcher);
  if (!res.ok) return res;
  const d = res.data;
  const status = String(d.InvoiceStatus || '');
  // "Succss" is how MyFatoorah spells a successful transaction
  const success = (d.InvoiceTransactions || []).find((t) => /^succ/i.test(String(t.TransactionStatus || '')));
  // The attempt the customer just made (a failed or cancelled card leaves the invoice Pending)
  const attempt = keyType === 'PaymentId' ? (d.InvoiceTransactions || []).find((t) => String(t.PaymentId || '') === key) : undefined;
  return {
    ok: true,
    check: {
      invoiceId: String(d.InvoiceId ?? ''),
      invoiceStatus: status,
      paid: status.toLowerCase() === 'paid',
      customerReference: String(d.CustomerReference || ''),
      paymentId: success?.PaymentId || (keyType === 'PaymentId' ? key : undefined),
      gateway: success?.PaymentGateway,
      attemptStatus: attempt?.TransactionStatus ? String(attempt.TransactionStatus) : undefined,
    },
  };
}

/**
 * Webhook v2 signature: the fields in this order as key=value joined by commas, HMAC SHA-256 with the secret
 * from the MyFatoorah portal, then base64. Returns the expected signature for a payment status event.
 */
export function webhookSignatureString(data: {
  Invoice?: { Id?: unknown; Status?: unknown; ExternalIdentifier?: unknown };
  Transaction?: { Status?: unknown; PaymentId?: unknown };
}): string {
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  return [
    `Invoice.Id=${v(data.Invoice?.Id)}`,
    `Invoice.Status=${v(data.Invoice?.Status)}`,
    `Transaction.Status=${v(data.Transaction?.Status)}`,
    `Transaction.PaymentId=${v(data.Transaction?.PaymentId)}`,
    `Invoice.ExternalIdentifier=${v(data.Invoice?.ExternalIdentifier)}`,
  ].join(',');
}
