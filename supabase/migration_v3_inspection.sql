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

-- 2. Who corrected a sent inspection, and when (the app also writes this to the audit log)
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS edited_by TEXT;

-- 3. A sent inspection can be corrected, but never deleted and never turned back into a draft
CREATE OR REPLACE FUNCTION public.protect_submitted_inspection() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('SUBMITTED', 'SKIPPED') THEN
            RAISE EXCEPTION 'A sent inspection cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status IN ('SUBMITTED', 'SKIPPED') AND NEW.status = 'DRAFT' THEN
        RAISE EXCEPTION 'A sent inspection cannot go back to a draft';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspections_protect ON public.inspections;
CREATE TRIGGER trg_inspections_protect BEFORE UPDATE OR DELETE ON public.inspections
    FOR EACH ROW EXECUTE FUNCTION public.protect_submitted_inspection();

-- 4. Rows are opened like the other tables until you run the lockdown file
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_inspections" ON public.inspections;
CREATE POLICY "allow_all_inspections" ON public.inspections FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. Private storage for the photos and videos (the app also creates it if it is missing)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inspections', 'inspections', false, 262144000)
ON CONFLICT (id) DO NOTHING;

-- 6. Live updates: the dashboard sees the photos arrive from the team's phones
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;
