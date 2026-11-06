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

-- 7. Rows are opened to the existing policy style until you run migration 2 (lockdown)
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_issues" ON public.issues;
DROP POLICY IF EXISTS "allow_all_audit_logs" ON public.audit_logs;
CREATE POLICY "allow_all_issues" ON public.issues FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL TO public USING (true) WITH CHECK (true);

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
