-- Run once in the Supabase SQL editor to move an existing database to numeric bays (1 to 1288).
-- Safe to run more than once. It does not delete any rows.

-- 1. One parking zone for the whole tower
INSERT INTO public.parking_zones (id, code, name, level, active)
VALUES ('zone-main', 'P', 'Tower Parking', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Turn old bay codes (A01, B14, B4 ...) into plain numbers (1, 14, 4 ...)
UPDATE public.orders
SET bay_code_snapshot = (regexp_replace(bay_code_snapshot, '\D', '', 'g'))::int::text,
    bay_id = 'bay-' || (regexp_replace(bay_code_snapshot, '\D', '', 'g'))::int::text,
    zone_code_snapshot = 'P'
WHERE bay_code_snapshot !~ '^[0-9]+$'
  AND bay_code_snapshot ~ '[0-9]';

UPDATE public.orders SET zone_code_snapshot = 'P' WHERE zone_code_snapshot IS DISTINCT FROM 'P';
