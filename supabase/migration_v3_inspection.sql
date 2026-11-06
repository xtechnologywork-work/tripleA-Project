-- ==============================================================================
-- TripleA dashboard v3: car inspection before and after the wash
-- Run it in the Supabase SQL editor. Safe to run more than once. It only ADDS things.
-- ==============================================================================

-- 1. One inspection row per order and phase (BEFORE the wash, AFTER the wash)
CREATE TABLE IF NOT EXISTS public.inspections (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    phase TEXT NOT NULL DEFAULT 'BEFORE',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    no_damage BOOLEAN DEFAULT FALSE,
    notes TEXT,
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    damages JSONB NOT NULL DEFAULT '[]'::jsonb,
    inspected_by TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    bypass_reason TEXT,
    UNIQUE (order_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_inspections_order ON public.inspections (order_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections (status);

-- 2. A submitted inspection can never be edited or deleted (the proof must stay as it was sent)
CREATE OR REPLACE FUNCTION public.protect_submitted_inspection() RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('SUBMITTED', 'SKIPPED') THEN
        RAISE EXCEPTION 'A submitted inspection cannot be changed';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspections_protect ON public.inspections;
CREATE TRIGGER trg_inspections_protect BEFORE UPDATE OR DELETE ON public.inspections
    FOR EACH ROW EXECUTE FUNCTION public.protect_submitted_inspection();

-- 3. Rows are opened like the other tables until you run the lockdown file
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_inspections" ON public.inspections;
CREATE POLICY "allow_all_inspections" ON public.inspections FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Private storage for the photos and videos (the app also creates it if it is missing)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inspections', 'inspections', false, 262144000)
ON CONFLICT (id) DO NOTHING;

-- 5. Live updates: the dashboard sees the photos arrive from the team's phones
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;
