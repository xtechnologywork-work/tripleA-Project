-- One employee number, one account. Run once in the Supabase SQL editor (safe to run again).
-- The app already refuses a second sign up with the same number; this makes the database refuse it too,
-- even if two people try in the very same moment.

-- 1. See any duplicates first (this must return no rows before step 2 can work)
SELECT employee_no, count(*) AS accounts, string_agg(full_name, ' | ') AS names
FROM public.employees
WHERE employee_no IS NOT NULL
GROUP BY employee_no
HAVING count(*) > 1;

-- 2. The rule: a number can be used by one account only (accounts without a number are not affected)
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_no_unique
    ON public.employees (employee_no)
    WHERE employee_no IS NOT NULL;

-- 3. CHECK: should say OK
SELECT 'unique employee number' AS check_name,
       CASE WHEN to_regclass('public.employees_employee_no_unique') IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS result;
