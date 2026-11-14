-- ==============================================================================
-- TripleA: MASTER UPDATES. Paste all of this in the Supabase SQL editor and press Run.
--
-- What it does: brings an existing TripleA database up to date with everything the app needs
-- (dashboard columns and tables, inspections, SMS codes, online payments).
--
-- It is SAFE TO RUN MORE THAN ONCE: every statement says "if it does not exist yet", and nothing is deleted.
-- It leaves out, on purpose:
--   * schema.sql          : it DELETES every table and starts again. Never run it on a database with data.
--   * migration_v2_lockdown.sql : the security lockdown. Run it yourself, once, at the very end.
--   * the open policies of the first dashboard migration: so running this after the lockdown never re-opens anything.
--
-- The newer features (ordering hours, VIP clients, names, passes) need NO SQL: the app keeps them in
-- Supabase Storage and in the tables below. The result of the checks is shown at the bottom.
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- 1. Dashboard: order details, timeline, issues, audit log (migration_v2_dashboard.sql)
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- TripleA dashboard v2: migration 1 of 2 (safe to run more than once)
-- Run it in the Supabase SQL editor. It only ADDS things. It never deletes data.
-- ==============================================================================

-- 1. Orders: keep the cancellation, the issue state and the version number
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_before_issue TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. Credit ledger: keep what each entry was and who made it
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'GRANT';
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE public.credit_ledger ALTER COLUMN balance_after SET DEFAULT 0;

-- 3. Order events (the audit timeline) and photos
ALTER TABLE public.order_events ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'STATUS_CHANGED';
ALTER TABLE public.order_events ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.order_photos ADD COLUMN IF NOT EXISTS uploaded_by TEXT;

-- 4. Issues reported on orders, and a general audit log
CREATE TABLE IF NOT EXISTS public.issues (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    category TEXT,
    severity TEXT,
    description TEXT,
    status TEXT DEFAULT 'OPEN',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    actor JSONB,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for the dashboard queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_employee ON public.orders (employee_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_bay ON public.orders (bay_code_snapshot);
CREATE INDEX IF NOT EXISTS idx_events_order ON public.order_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_photos_order ON public.order_photos (order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_employee ON public.credit_ledger (employee_id);
CREATE INDEX IF NOT EXISTS idx_issues_order ON public.issues (order_id);
CREATE INDEX IF NOT EXISTS idx_employees_phone ON public.employees (phone);
CREATE INDEX IF NOT EXISTS idx_employees_no ON public.employees (employee_no);

-- 6. Keep orders.updated_at current on every change
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_touch ON public.orders;
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- (section 7 of the original file, the open policies, is left out on purpose: see the note at the top)

-- 8. Realtime: the dashboard hears about new orders and status changes instantly
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['orders','order_events','order_photos','employees','employee_subscriptions','credit_ledger','issues']
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        EXCEPTION WHEN duplicate_object THEN
            NULL; -- already in the publication
        END;
    END LOOP;
END $$;



-- ------------------------------------------------------------------------------
-- 2. Pre-wash inspection (migration_v3_inspection.sql)
-- ------------------------------------------------------------------------------



-- ------------------------------------------------------------------------------
-- 3. SMS code limits (migration_v4_otp.sql)
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- TripleA: sign in by SMS code. Run once in the Supabase SQL editor.
-- A small table that counts code messages and checks, so the limits hold on Netlify
-- (each request can run on a different machine, so memory cannot be used).
-- Only the server (secret key) can read or write it.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.otp_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bucket TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_events_bucket_time ON public.otp_events (bucket, created_at DESC);

-- Locked: no policies, so the public key cannot see or change anything here
ALTER TABLE public.otp_events ENABLE ROW LEVEL SECURITY;



-- ------------------------------------------------------------------------------
-- 4. Online payments (migration_v5_payments.sql)
-- ------------------------------------------------------------------------------
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



-- ------------------------------------------------------------------------------
-- CHECK: every line below should say OK
-- ------------------------------------------------------------------------------
SELECT 'orders: cancellation, version, status_before_issue' AS check_name,
       CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders'
                  AND column_name IN ('cancellation', 'version', 'status_before_issue')) = 3 THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'order_events: type, payload',
       CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_events'
                  AND column_name IN ('type', 'payload')) = 2 THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'table ' || t,
       CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
FROM unnest(ARRAY['issues', 'audit_logs', 'inspections', 'otp_events', 'payments']) AS t;
