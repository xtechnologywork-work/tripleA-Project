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
