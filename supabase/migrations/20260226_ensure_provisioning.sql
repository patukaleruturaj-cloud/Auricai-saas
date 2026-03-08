-- ============================================================
-- AuricAI — Complete Production Schema (Idempotent)
-- Run this in your Supabase SQL Editor.
-- Safe to run multiple times — all statements are idempotent.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES — One row per Clerk user
-- id: internal UUID used in all foreign keys
-- clerk_id: Clerk's user ID (maps external auth to internal)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    default_offer TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_clerk_id ON public.profiles(clerk_id);

-- ============================================================
-- 2. SUBSCRIPTIONS — Plan info per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL DEFAULT 'free'
        CHECK (plan_type IN ('free', 'starter', 'growth', 'pro')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
    razorpay_subscription_id TEXT,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_period_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- ============================================================
-- 3. USAGE_CREDITS — Persistent credit tracking per user
-- credits_used and credits_total persist across logins.
-- Reset only happens on billing period change.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    credits_total INTEGER NOT NULL DEFAULT 10,
    credits_used INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    period_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT credits_used_non_negative CHECK (credits_used >= 0),
    CONSTRAINT credits_used_lte_total CHECK (credits_used <= credits_total)
);

CREATE INDEX IF NOT EXISTS idx_usage_credits_user_id ON public.usage_credits(user_id);

-- ============================================================
-- 4. GENERATIONS — Persistent history per user
-- user_id is TEXT (Clerk ID) for direct matching without join
-- subject and follow_up are saved with every generation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    prospect_bio TEXT,
    company_context TEXT,
    offer TEXT,
    tone TEXT,
    generated_options JSONB,
    subject TEXT,
    follow_up TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (idempotent for existing tables)
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS follow_up TEXT;

CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);

-- ============================================================
-- 5. USER_STATS — Analytics per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id TEXT PRIMARY KEY,
    total_generations INTEGER DEFAULT 0,
    last_generated_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- 6. USER_CREDIT_VIEW — Single source of truth for credits
-- All credit reads go through this view.
-- ============================================================
CREATE OR REPLACE VIEW public.user_credit_view AS
SELECT
    p.clerk_id,
    p.id                                        AS profile_id,
    p.email,
    COALESCE(s.plan_type, 'free')               AS plan_type,
    COALESCE(s.status, 'active')                AS subscription_status,
    s.current_period_end,
    uc.id                                       AS credit_row_id,
    COALESCE(uc.credits_total, 10)              AS monthly_limit,
    COALESCE(uc.credits_used, 0)                AS messages_used,
    GREATEST(0, COALESCE(uc.credits_total, 10) - COALESCE(uc.credits_used, 0))
                                                AS credits_remaining,
    uc.period_start                             AS billing_cycle_start,
    uc.period_end                               AS billing_cycle_end
FROM public.profiles p
LEFT JOIN LATERAL (
    SELECT plan_type, status, current_period_end
    FROM public.subscriptions
    WHERE user_id = p.id ORDER BY created_at DESC LIMIT 1
) s ON true
LEFT JOIN LATERAL (
    SELECT id, credits_total, credits_used, period_start, period_end
    FROM public.usage_credits
    WHERE user_id = p.id ORDER BY created_at DESC LIMIT 1
) uc ON true;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- All server-side writes use the service_role key (bypasses RLS).
-- Authenticated reads are unrestricted because Clerk + service_role
-- handles auth externally.
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usage_credits_select_own ON public.usage_credits;
CREATE POLICY usage_credits_select_own ON public.usage_credits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS generations_select_own ON public.generations;
CREATE POLICY generations_select_own ON public.generations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_stats_select_own ON public.user_stats;
CREATE POLICY user_stats_select_own ON public.user_stats FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 8. RPC: PROVISION NEW USER
-- Atomic. Called on first login. Idempotent — returns existing
-- profile ID if user already exists. Never resets credits.
-- ============================================================
CREATE OR REPLACE FUNCTION provision_new_user(p_clerk_id TEXT, p_email TEXT)
RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_period_end TIMESTAMP WITH TIME ZONE := NOW() + INTERVAL '30 days';
BEGIN
    -- Return existing profile immediately (never recreate)
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NOT NULL THEN
        -- Heal: ensure credit row exists (in case of data loss)
        IF NOT EXISTS (SELECT 1 FROM public.usage_credits WHERE user_id = v_profile_id) THEN
            INSERT INTO public.usage_credits (user_id, credits_total, credits_used, period_start, period_end)
            VALUES (v_profile_id, 10, 0, v_now, v_period_end);
        END IF;
        -- Heal: ensure subscription row exists
        IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_profile_id) THEN
            INSERT INTO public.subscriptions (user_id, plan_type, status, billing_cycle, current_period_start, current_period_end)
            VALUES (v_profile_id, 'free', 'active', 'monthly', v_now, v_period_end);
        END IF;
        RETURN v_profile_id;
    END IF;

    -- New user
    INSERT INTO public.profiles (clerk_id, email, created_at)
    VALUES (p_clerk_id, p_email, v_now) RETURNING id INTO v_profile_id;

    INSERT INTO public.subscriptions (user_id, plan_type, status, billing_cycle, current_period_start, current_period_end)
    VALUES (v_profile_id, 'free', 'active', 'monthly', v_now, v_period_end);

    INSERT INTO public.usage_credits (user_id, credits_total, credits_used, period_start, period_end)
    VALUES (v_profile_id, 10, 0, v_now, v_period_end);

    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. RPC: DEDUCT CREDIT
-- Atomic increment of credits_used.
-- Runs ONLY after successful generation + DB save.
-- Never runs if generation or save failed.
-- Handles lazy period reset automatically.
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_credit(p_clerk_id TEXT)
RETURNS TABLE(
    success BOOLEAN,
    credits_total INTEGER,
    credits_used INTEGER,
    credits_remaining INTEGER,
    period_end TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_profile_id UUID;
    v_credit_id UUID;
    v_period_end TIMESTAMP WITH TIME ZONE;
    v_credits_total INTEGER;
    v_credits_used INTEGER;
    v_rows INTEGER;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 0, NULL::TIMESTAMP WITH TIME ZONE; RETURN;
    END IF;

    SELECT uc.id, uc.period_end, uc.credits_total, uc.credits_used
    INTO v_credit_id, v_period_end, v_credits_total, v_credits_used
    FROM public.usage_credits uc
    WHERE uc.user_id = v_profile_id ORDER BY uc.created_at DESC LIMIT 1;

    IF v_credit_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 0, NULL::TIMESTAMP WITH TIME ZONE; RETURN;
    END IF;

    -- Lazy reset if billing period expired
    IF NOW() > v_period_end THEN
        UPDATE public.usage_credits
        SET credits_used = 0, period_start = NOW(), period_end = NOW() + INTERVAL '30 days'
        WHERE id = v_credit_id;
        UPDATE public.subscriptions
        SET current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days'
        WHERE user_id = v_profile_id AND status = 'active';
        v_credits_used := 0;
        v_period_end := NOW() + INTERVAL '30 days';
    END IF;

    IF v_credits_used >= v_credits_total THEN
        RETURN QUERY SELECT false, v_credits_total, v_credits_used,
            (v_credits_total - v_credits_used), v_period_end;
        RETURN;
    END IF;

    -- Atomic increment
    UPDATE public.usage_credits
    SET credits_used = credits_used + 1
    WHERE id = v_credit_id AND credits_used < credits_total;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RETURN QUERY
    SELECT (v_rows > 0)::BOOLEAN, uc.credits_total, uc.credits_used,
        (uc.credits_total - uc.credits_used), uc.period_end
    FROM public.usage_credits uc WHERE uc.id = v_credit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. RPC: UPGRADE PLAN (called from Razorpay webhook)
-- ============================================================
CREATE OR REPLACE FUNCTION upgrade_plan(
    p_clerk_id TEXT, p_plan_type TEXT, p_credits_total INTEGER,
    p_razorpay_sub_id TEXT DEFAULT NULL,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;
    v_end := COALESCE(p_period_end, v_now + INTERVAL '30 days');
    UPDATE public.subscriptions
    SET plan_type = p_plan_type, status = 'active',
        razorpay_subscription_id = COALESCE(p_razorpay_sub_id, razorpay_subscription_id),
        billing_cycle = p_billing_cycle,
        current_period_start = v_now, current_period_end = v_end
    WHERE user_id = v_profile_id;
    UPDATE public.usage_credits
    SET credits_total = p_credits_total, credits_used = 0,
        period_start = v_now, period_end = v_end
    WHERE user_id = v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. RPC: DOWNGRADE TO FREE
-- ============================================================
CREATE OR REPLACE FUNCTION downgrade_to_free(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;
    UPDATE public.subscriptions
    SET plan_type = 'free', status = 'active', billing_cycle = 'monthly',
        current_period_start = v_now, current_period_end = v_now + INTERVAL '30 days'
    WHERE user_id = v_profile_id;
    UPDATE public.usage_credits
    SET credits_total = 10, credits_used = 0,
        period_start = v_now, period_end = v_now + INTERVAL '30 days'
    WHERE user_id = v_profile_id;
END;
$$ LANGUAGE plpgsql;
