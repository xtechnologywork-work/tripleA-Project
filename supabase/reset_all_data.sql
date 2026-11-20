-- RESET: empties every employee, order, payment, photo record and log so the system starts from zero.
-- KEPT: services, packages, parking zones/bays/buildings, staff/field team, ordering hours, VIP file.
-- A backup was saved on the computer before this (backups/backup-before-reset-2026-11-15.json).
-- Run it once in the Supabase SQL editor (choose "Run without RLS" if asked). Everything runs as one step:
-- if anything fails, nothing is deleted.

BEGIN;

-- Some tables are locked on purpose (sent inspections, the append-only audit log, ...).
-- The locks are switched off only inside this reset and switched back on at the end.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspections','order_photos','order_events','credit_ledger','payments','issues','orders',
                           'employee_subscriptions','vehicles','employees','audit_logs','audit_log','otp_events','rate_limit_hits']
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
  END LOOP;
END $$;

DELETE FROM public.inspections;
DELETE FROM public.order_photos;
DELETE FROM public.order_events;
DELETE FROM public.credit_ledger;
DELETE FROM public.payments;
DELETE FROM public.issues;
DELETE FROM public.orders;
DELETE FROM public.employee_subscriptions;
DELETE FROM public.vehicles;
DELETE FROM public.employees;

DELETE FROM public.audit_logs;
DELETE FROM public.audit_log;
DELETE FROM public.otp_events;
DELETE FROM public.rate_limit_hits;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspections','order_photos','order_events','credit_ledger','payments','issues','orders',
                           'employee_subscriptions','vehicles','employees','audit_logs','audit_log','otp_events','rate_limit_hits']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;
END $$;

COMMIT;

-- CHECK: every count should be 0
SELECT 'employees' AS tbl, count(*) AS rows FROM public.employees
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'order_events', count(*) FROM public.order_events
UNION ALL SELECT 'order_photos', count(*) FROM public.order_photos
UNION ALL SELECT 'inspections', count(*) FROM public.inspections
UNION ALL SELECT 'employee_subscriptions', count(*) FROM public.employee_subscriptions
UNION ALL SELECT 'credit_ledger', count(*) FROM public.credit_ledger
UNION ALL SELECT 'vehicles', count(*) FROM public.vehicles
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'audit_log', count(*) FROM public.audit_log
UNION ALL SELECT 'services (kept)', count(*) FROM public.services
UNION ALL SELECT 'subscription_packages (kept)', count(*) FROM public.subscription_packages;
