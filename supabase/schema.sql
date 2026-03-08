-- ============================================================
-- AuricAI — Production Credit-Based Billing Schema
-- Run in Supabase SQL Editor (full migration)
-- ============================================================
-- NOTE: This app uses Clerk for auth. The profiles table uses
-- clerk_id (TEXT) as the user identifier, not auth.users.id.
-- All server-side calls use service_role key (bypasses RLS).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- Core user identity, created on first login/signup
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    default_offer TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_clerk_id ON public.profiles(clerk_id);

-- ============================================================
-- 2. SUBSCRIPTIONS
-- One active subscription per user at a time
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
-- 3. USAGE_CREDITS
-- One active credit row per user per billing period
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
-- 3.5 PAYMENTS LOG (Idempotency Guard)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razorpay_payment_id TEXT UNIQUE NOT NULL,
    razorpay_subscription_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL,
    amount_paid INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_log_sub_id ON public.payments_log(razorpay_subscription_id);

-- ============================================================
-- 4. GENERATIONS (existing — keep for history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    prospect_bio TEXT,
    company_context TEXT,
    offer TEXT,
    tone TEXT,
    generated_options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 5. USER_STATS (existing — keep for analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id TEXT PRIMARY KEY,
    total_generations INTEGER DEFAULT 0,
    last_generated_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- 6. USER_CREDIT_VIEW — SINGLE SOURCE OF TRUTH
-- Unified view joining profiles + subscriptions + usage_credits.
-- All credit reads should go through this view.
-- ============================================================
CREATE OR REPLACE VIEW public.user_credit_view AS
SELECT
    p.clerk_id,
    p.id                AS profile_id,
    p.email,
    COALESCE(s.plan_type, 'free')           AS plan_type,
    COALESCE(s.status, 'active')            AS subscription_status,
    s.current_period_end,
    uc.id                                   AS credit_row_id,
    COALESCE(uc.credits_total, 10)          AS monthly_limit,
    COALESCE(uc.credits_used, 0)            AS messages_used,
    GREATEST(0, COALESCE(uc.credits_total, 10) - COALESCE(uc.credits_used, 0))
                                            AS credits_remaining,
    uc.period_start                         AS billing_cycle_start,
    uc.period_end                           AS billing_cycle_end
FROM public.profiles p
LEFT JOIN LATERAL (
    SELECT plan_type, status, current_period_end
    FROM public.subscriptions
    WHERE user_id = p.id
    ORDER BY created_at DESC LIMIT 1
) s ON true
LEFT JOIN LATERAL (
    SELECT id, credits_total, credits_used, period_start, period_end
    FROM public.usage_credits
    WHERE user_id = p.id
    ORDER BY created_at DESC LIMIT 1
) uc ON true;

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- These policies let anon/authenticated read their own rows only.
-- Write operations are service-role only (no client writes).

-- Profiles: users can read their own row
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT TO authenticated
    USING (true);  -- Clerk manages auth; server uses service_role

-- Subscriptions: users can read their own
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
    FOR SELECT TO authenticated
    USING (true);

-- Usage credits: users can read their own
DROP POLICY IF EXISTS usage_credits_select_own ON public.usage_credits;
CREATE POLICY usage_credits_select_own ON public.usage_credits
    FOR SELECT TO authenticated
    USING (true);

-- Generations: users can read their own
DROP POLICY IF EXISTS generations_select_own ON public.generations;
CREATE POLICY generations_select_own ON public.generations
    FOR SELECT TO authenticated
    USING (true);

-- User stats: users can read their own
DROP POLICY IF EXISTS user_stats_select_own ON public.user_stats;
CREATE POLICY user_stats_select_own ON public.user_stats
    FOR SELECT TO authenticated
    USING (true);

-- ============================================================
-- 7. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. RPC: PROVISION NEW USER
-- Called on first login (JIT). Creates profile + subscription
-- + usage_credits in one atomic transaction.
-- Returns the new profile UUID.
-- ============================================================
CREATE OR REPLACE FUNCTION provision_new_user(
    p_clerk_id TEXT,
    p_email TEXT
)
RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_period_end TIMESTAMP WITH TIME ZONE := NOW() + INTERVAL '30 days';
BEGIN
    -- Check if already exists
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NOT NULL THEN
        RETURN v_profile_id;
    END IF;

    -- Create profile
    INSERT INTO public.profiles (clerk_id, email, created_at)
    VALUES (p_clerk_id, p_email, v_now)
    RETURNING id INTO v_profile_id;

    -- Create free subscription
    INSERT INTO public.subscriptions (user_id, plan_type, status, billing_cycle, current_period_start, current_period_end)
    VALUES (v_profile_id, 'free', 'active', 'monthly', v_now, v_period_end);

    -- Create usage credits (10 free)
    INSERT INTO public.usage_credits (user_id, credits_total, credits_used, period_start, period_end)
    VALUES (v_profile_id, 10, 0, v_now, v_period_end);

    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. RPC: ATOMIC DEDUCT CREDIT
-- Lazy-resets if period expired, then atomically deducts 1 via
-- FOR UPDATE lock. Returns success status + current credit state.
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_deduct_credit(p_clerk_id TEXT)
RETURNS TABLE (
    success BOOLEAN, monthly_limit INT, messages_used INT, credits_remaining INT
) AS $$
DECLARE
    v_profile_id UUID; 
    v_sub_status TEXT; v_sub_end TIMESTAMPTZ;
    v_credit_id UUID; v_cred_total INT; v_cred_used INT; v_cred_end TIMESTAMPTZ;
BEGIN
    -- 1. Identify User
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN QUERY SELECT false, 0, 0, 0; RETURN; END IF;

    -- 2. Validate Subscription State (The Guard)
    SELECT status, current_period_end INTO v_sub_status, v_sub_end 
    FROM public.subscriptions 
    WHERE user_id = v_profile_id ORDER BY created_at DESC LIMIT 1;

    IF v_sub_status != 'active' AND v_sub_status != 'cancelled' THEN
        RETURN QUERY SELECT false, 0, 0, 0; RETURN;
    END IF;

    -- JIT Expiry Downgrade
    IF NOW() > v_sub_end THEN
        PERFORM downgrade_to_free(p_clerk_id);
        -- Re-fetch to guarantee state freshness
        SELECT status, current_period_end INTO v_sub_status, v_sub_end 
        FROM public.subscriptions WHERE user_id = v_profile_id ORDER BY created_at DESC LIMIT 1;
    END IF;

    -- 3. Lock the Credit Row (Row-level lock prevents concurrent modification)
    SELECT id, period_end, credits_total, credits_used 
    INTO v_credit_id, v_cred_end, v_cred_total, v_cred_used
    FROM public.usage_credits 
    WHERE user_id = v_profile_id 
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE; -- CRITICAL: Blocks concurrent calls here

    -- 4. Lazy Reset (if cycle ended but sub is still active)
    IF NOW() > v_cred_end THEN
        UPDATE public.usage_credits 
        SET credits_used = 0, period_start = NOW(), period_end = NOW() + INTERVAL '30 days'
        WHERE id = v_credit_id;
        v_cred_used := 0;
        v_cred_end := NOW() + INTERVAL '30 days';
        
        -- Keeps base subscription partially aligned, though main expiry is driven by sub_end
        UPDATE public.subscriptions
        SET current_period_start = NOW()
        WHERE user_id = v_profile_id AND status = 'active';
    END IF;

    -- 5. Final check
    IF v_cred_used >= v_cred_total THEN
       RETURN QUERY SELECT false, v_cred_total, v_cred_used, (v_cred_total - v_cred_used);
       RETURN;
    END IF;

    -- 6. Atomic Increment
    UPDATE public.usage_credits SET credits_used = credits_used + 1 WHERE id = v_credit_id;
    
    RETURN QUERY SELECT true, v_cred_total, (v_cred_used + 1), (v_cred_total - (v_cred_used + 1));
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. RPC: UPGRADE PLAN
-- Called after Razorpay webhook confirms upgrade.
-- Updates subscription + resets usage_credits.
-- ============================================================
CREATE OR REPLACE FUNCTION upgrade_plan(
    p_clerk_id TEXT,
    p_plan_type TEXT,
    p_credits_total INTEGER,
    p_razorpay_sub_id TEXT DEFAULT NULL,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    v_end := COALESCE(p_period_end, v_now + INTERVAL '30 days');

    -- Update subscription
    UPDATE public.subscriptions
    SET plan_type = p_plan_type,
        status = 'active',
        razorpay_subscription_id = COALESCE(p_razorpay_sub_id, razorpay_subscription_id),
        billing_cycle = p_billing_cycle,
        current_period_start = v_now,
        current_period_end = v_end
    WHERE user_id = v_profile_id;

    -- Upsert usage credits (Handle mid-cycle upgrade vs renewal)
    DECLARE
        v_existing_end TIMESTAMP WITH TIME ZONE;
    BEGIN
        SELECT period_end INTO v_existing_end FROM public.usage_credits WHERE user_id = v_profile_id ORDER BY created_at DESC LIMIT 1;

        IF v_existing_end IS NULL OR v_now >= v_existing_end THEN
            UPDATE public.usage_credits
            SET credits_total = p_credits_total,
                credits_used = 0,
                period_start = v_now,
                period_end = v_now + INTERVAL '30 days'
            WHERE user_id = v_profile_id;
        ELSE
            UPDATE public.usage_credits
            SET credits_total = p_credits_total
            WHERE user_id = v_profile_id;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. RPC: DOWNGRADE TO FREE
-- Called when subscription expires or is cancelled.
-- ============================================================
CREATE OR REPLACE FUNCTION downgrade_to_free(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.subscriptions
    SET plan_type = 'free',
        status = 'active',
        billing_cycle = 'monthly',
        current_period_start = v_now,
        current_period_end = v_now + INTERVAL '30 days'
    WHERE user_id = v_profile_id;

    UPDATE public.usage_credits
    SET credits_total = 10,
        credits_used = 0,
        period_start = v_now,
        period_end = v_now + INTERVAL '30 days'
    WHERE user_id = v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 12. CLEANUP: DROP OLD TABLES FROM PREVIOUS SCHEMA
-- Only run if migrating from the v1 schema
-- ============================================================
-- DROP TABLE IF EXISTS public.usage_logs CASCADE;
-- DROP TABLE IF EXISTS public.credits CASCADE;
-- ALTER TABLE public.users RENAME TO users_backup;
-- DROP FUNCTION IF EXISTS lazy_reset_if_expired(TEXT);
-- DROP FUNCTION IF EXISTS reset_credits(UUID);
-- DROP FUNCTION IF EXISTS increment_user_usage(TEXT);

-- ============================================================
-- 13. RPC: PROCESS SUBSCRIPTION CHARGE (WEBHOOK)
-- Idempotently creates payment log, assigns subscription & credits
-- ============================================================
CREATE OR REPLACE FUNCTION process_subscription_charge(
    p_clerk_id TEXT,
    p_payment_id TEXT,
    p_sub_id TEXT,
    p_plan_type TEXT,
    p_amount_paid INTEGER,
    p_credits_total INTEGER,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Insert into payments_log (Unique constraint ensures idempotency)
    INSERT INTO public.payments_log (razorpay_payment_id, razorpay_subscription_id, user_id, plan_type, amount_paid, created_at)
    VALUES (p_payment_id, p_sub_id, v_profile_id, p_plan_type, p_amount_paid, v_now)
    ON CONFLICT (razorpay_payment_id) DO NOTHING;

    v_end := COALESCE(p_period_end, v_now + (CASE WHEN p_billing_cycle = 'yearly' THEN INTERVAL '365 days' ELSE INTERVAL '30 days' END));

    -- 2. Update subscription
    UPDATE public.subscriptions
    SET plan_type = p_plan_type,
        status = 'active',
        razorpay_subscription_id = p_sub_id,
        billing_cycle = p_billing_cycle,
        current_period_start = v_now,
        current_period_end = v_end
    WHERE user_id = v_profile_id;

    -- 3. Upsert usage credits (Handle mid-cycle upgrade vs renewal)
    -- Get current period end for this user
    DECLARE
        v_existing_end TIMESTAMP WITH TIME ZONE;
    BEGIN
        SELECT period_end INTO v_existing_end FROM public.usage_credits WHERE user_id = v_profile_id ORDER BY created_at DESC LIMIT 1;

        IF v_existing_end IS NULL OR v_now >= v_existing_end THEN
            -- Renewal or completely new
            UPDATE public.usage_credits
            SET credits_total = p_credits_total,
                credits_used = 0,
                period_start = v_now,
                period_end = v_now + INTERVAL '30 days'
            WHERE user_id = v_profile_id;
        ELSE
            -- Mid-cycle Upgrade (Keep used, keep period end)
            UPDATE public.usage_credits
            SET credits_total = p_credits_total
            WHERE user_id = v_profile_id;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 14. RPC: REFUND CREDIT (for failed AI generations)
-- ============================================================
CREATE OR REPLACE FUNCTION refund_credit(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_credit_id UUID;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_credit_id FROM public.usage_credits 
    WHERE user_id = v_profile_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    UPDATE public.usage_credits SET credits_used = GREATEST(0, credits_used - 1) WHERE id = v_credit_id;
END;
$$ LANGUAGE plpgsql;
