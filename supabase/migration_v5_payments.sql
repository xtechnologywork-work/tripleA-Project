-- ==============================================================================
-- TripleA: online payment (MyFatoorah). Run once in the Supabase SQL editor.
-- One row per payment attempt. The order is made only after MyFatoorah confirms the payment.
-- Only the server (secret key) can read or write this table.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('single', 'pass')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'QAR',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FULFILLED', 'FAILED')),
    invoice_id TEXT,
    payment_id TEXT,
    gateway TEXT,
    draft JSONB NOT NULL DEFAULT '{}'::jsonb,
    order_id TEXT,
    order_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_employee ON public.payments (employee_id, created_at DESC);

-- Locked: no policies, so the public key cannot see or change anything here
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
