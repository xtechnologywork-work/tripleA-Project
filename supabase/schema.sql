-- ==============================================================================
-- TRIPLEA ENTERPRISE CAR WASH OPERATIONS - CLEAN SUPABASE SETUP
-- 1. DROPS ALL OLD/CONFLICTING TABLES
-- 2. CREATES ALL TABLES FRESH WITH EXACT MATCHING COLUMNS
-- 3. ENABLES OPEN RLS POLICIES FOR OPERATIONAL ACCESS
-- 4. INSERTS SEED DATA (Services, 140 QAR Passes, Zones, Employees with QID)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: DROP ALL EXISTING TABLES CLEANLY (CASCADE)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.order_photos CASCADE;
DROP TABLE IF EXISTS public.order_events CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.credit_ledger CASCADE;
DROP TABLE IF EXISTS public.employee_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_packages CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.parking_bays CASCADE;
DROP TABLE IF EXISTS public.parking_zones CASCADE;
DROP TABLE IF EXISTS public.field_team_members CASCADE;
DROP TABLE IF EXISTS public.app_sync_state CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- STEP 2: CREATE FRESH SCHEMAS
-- ------------------------------------------------------------------------------

-- 1. Employees Table (With QID and MOCI corporate details)
CREATE TABLE public.employees (
    id TEXT PRIMARY KEY,
    employee_no TEXT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    qid TEXT,
    company TEXT DEFAULT 'Ministry of Commerce and Industry - State of Qatar',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vehicles Table
CREATE TABLE public.vehicles (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    plate_number TEXT NOT NULL,
    plate_type TEXT DEFAULT 'Private',
    make TEXT DEFAULT 'Porsche',
    model TEXT DEFAULT 'Panamera',
    color TEXT DEFAULT 'Jet Black Metallic',
    is_default BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Services Catalog (Single Wash @ 20.00 QAR)
CREATE TABLE public.services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    duration_min INTEGER DEFAULT 35,
    price_minor INTEGER DEFAULT 2000, -- 20.00 QAR
    currency TEXT DEFAULT 'QAR',
    credit_cost INTEGER DEFAULT 1,
    active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Subscription Packages Catalog (140.00 QAR Pass)
CREATE TABLE public.subscription_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    paid_washes INTEGER NOT NULL,
    bonus_washes INTEGER NOT NULL,
    price_minor INTEGER NOT NULL, -- 14000 = 140.00 QAR
    currency TEXT DEFAULT 'QAR',
    validity_days INTEGER NOT NULL,
    eligible_service_ids JSONB DEFAULT '["srv-exterior"]'::jsonb,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Employee Subscriptions
CREATE TABLE public.employee_subscriptions (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    package_id TEXT REFERENCES public.subscription_packages(id) ON DELETE SET NULL,
    package_snapshot JSONB,
    status TEXT DEFAULT 'ACTIVE',
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    activated_by TEXT
);

-- 6. Credit Ledger Entries
CREATE TABLE public.credit_ledger (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    subscription_id TEXT,
    order_id TEXT,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Parking Zones & Bays
CREATE TABLE public.parking_zones (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    level TEXT,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.parking_bays (
    id TEXT PRIMARY KEY,
    zone_id TEXT REFERENCES public.parking_zones(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- 8. Orders Table
CREATE TABLE public.orders (
    id TEXT PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    bay_id TEXT NOT NULL,
    zone_code_snapshot TEXT,
    bay_code_snapshot TEXT,
    vehicle_snapshot JSONB,
    service_id TEXT,
    service_snapshot JSONB,
    payment_mode TEXT DEFAULT 'ONE_TIME',
    price_snapshot JSONB,
    credits_used INTEGER DEFAULT 0,
    payment_status TEXT DEFAULT 'NOT_APPLICABLE',
    instructions TEXT,
    status TEXT DEFAULT 'NEW',
    assignment JSONB,
    quality_check JSONB,
    return_confirmation JSONB,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Order Photos & Events
CREATE TABLE public.order_photos (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    kind TEXT DEFAULT 'REAR_WITH_PLATE',
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    plate_verified BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    actor_type TEXT,
    actor_id TEXT,
    actor_name TEXT,
    from_status TEXT,
    to_status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Field Team Members
CREATE TABLE public.field_team_members (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- 11. App Sync State (Instant cross-device real-time sync)
CREATE TABLE public.app_sync_state (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- STEP 3: ROW LEVEL SECURITY (RLS) OPEN OPERATIONAL ACCESS
-- ------------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_bays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_employees" ON public.employees FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_vehicles" ON public.vehicles FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_services" ON public.services FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_subscription_packages" ON public.subscription_packages FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_employee_subscriptions" ON public.employee_subscriptions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_credit_ledger" ON public.credit_ledger FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_parking_zones" ON public.parking_zones FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_parking_bays" ON public.parking_bays FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_orders" ON public.orders FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_order_photos" ON public.order_photos FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_order_events" ON public.order_events FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_field_team_members" ON public.field_team_members FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_app_sync_state" ON public.app_sync_state FOR ALL TO public USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- STEP 4: SEED INITIAL DATA
-- ------------------------------------------------------------------------------

-- Services (Single Wash @ 20.00 QAR)
INSERT INTO public.services (id, name, description, duration_min, price_minor, currency, credit_cost, active, sort_order)
VALUES 
    ('srv-exterior', 'Signature Exterior Hydro-Wash', 'Touchless high-pressure pre-wash, luxury foam treatment, microfibre hand wash, and tire gloss dressing.', 35, 2000, 'QAR', 1, true, 1),
    ('srv-interior', 'Interior Pure Detailing', 'Comprehensive vacuum, dashboard conditioning, glass polishing, and premium ozone fragrance.', 45, 3500, 'QAR', 2, true, 2);

-- Packages (140.00 QAR Pass)
INSERT INTO public.subscription_packages (id, name, paid_washes, bonus_washes, price_minor, currency, validity_days, eligible_service_ids, active)
VALUES 
    ('pkg-executive', 'Executive Concierge Pack (6 + 2 Free = 8 Washes)', 6, 2, 14000, 'QAR', 60, '["srv-exterior"]'::jsonb, true),
    ('pkg-prestige', 'Prestige Monthly Pass (16 + 4 Free)', 16, 4, 26000, 'QAR', 90, '["srv-exterior", "srv-interior"]'::jsonb, true);

-- Field Team Members
INSERT INTO public.field_team_members (id, display_name, active)
VALUES
    ('cleaner-1', 'Rashid Khan (Lead Tech)', true),
    ('cleaner-2', 'Bilal Ahmed (Detailer)', true),
    ('cleaner-3', 'Sunil Perera (Detailer)', true),
    ('cleaner-4', 'Farhan Mir (Hydro Specialist)', true),
    ('cleaner-5', 'Carlos Santos (Senior Tech)', true);

-- Zones
INSERT INTO public.parking_zones (id, code, name, level, active)
VALUES
    ('zone-main', 'P', 'Tower Parking', NULL, true);
-- Parking bays are plain numbers, 1 to 1288. The app generates them; they are stored on each order.

-- Initial Seed Employees (With QIDs)
INSERT INTO public.employees (id, employee_no, full_name, email, phone, qid, company, status)
VALUES
    ('emp-1', 'EMP-7401', 'Hamad Al-Thani', 'hamad.althani@investqatar.qa', '+974 5512 8901', '28863401928', 'Qatar Investment Authority', 'ACTIVE'),
    ('emp-2', 'EMP-3290', 'Fatima Al-Sulaiti', 'f.alsulaiti@qnb.com.qa', '+974 6620 4419', '29263408192', 'QNB Capital', 'ACTIVE'),
    ('emp-3', 'EMP-8842', 'Nasser Al-Kuwari', 'nasser.kuwari@ooredoo.qa', '+974 3309 7712', '28563404551', 'Ooredoo Tower', 'ACTIVE');

-- Initial Vehicles
INSERT INTO public.vehicles (id, employee_id, plate_number, plate_type, make, model, color, is_default)
VALUES
    ('veh-1', 'emp-1', '559201', 'Private', 'Porsche', 'Panamera GTS', 'Night Blue Metallic', true),
    ('veh-2', 'emp-2', '110488', 'Private', 'Land Rover', 'Range Rover Autobiography', 'Santorini Black', true),
    ('veh-3', 'emp-3', '88102', 'Private', 'Mercedes-Benz', 'S 580 Maybach', 'Obsidian Black', true);
