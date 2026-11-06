-- ==============================================================================
-- TripleA dashboard v2: migration 2 of 2, LOCKDOWN. Run it AFTER:
--   1. migration_v2_dashboard.sql has run, and
--   2. SUPABASE_SERVICE_ROLE_KEY is set in .env.local and the app has been restarted.
-- The app server then does all reads and writes with the service key.
-- After this, the public (anon) key can no longer read or write any table directly.
-- Only signed-in admins (app_metadata.role = 'admin') can read tables, for Realtime.
-- ==============================================================================

DO $$
DECLARE t TEXT;
DECLARE p RECORD;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'employees','vehicles','services','subscription_packages','employee_subscriptions',
        'credit_ledger','parking_zones','parking_bays','orders','order_photos','order_events',
        'field_team_members','app_sync_state','issues','audit_logs'
    ]
    LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- drop every existing policy (the old allow_all_* ones)
        FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
        END LOOP;

        -- signed-in admins may read (this is what lets Realtime reach the dashboard)
        EXECUTE format(
            'CREATE POLICY "admin_read_%s" ON public.%I FOR SELECT TO authenticated USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')',
            t, t
        );
    END LOOP;
END $$;

-- To make someone an admin, run this once per staff member (replace the email):
-- UPDATE auth.users
--    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--  WHERE email = 'staff@example.com';
