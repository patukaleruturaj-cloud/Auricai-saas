-- Migration: Production Security Fix (Final Robust Version)
-- Fixed type casting (text vs uuid) and string delimiters ($_$).

-- 1. SECURITY POLICIES (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see their own profile
DROP POLICY IF EXISTS "user_profile_access" ON public.profiles;
CREATE POLICY "user_profile_access" ON public.profiles
FOR ALL USING (clerk_id = auth.uid()::text) WITH CHECK (clerk_id = auth.uid()::text);

-- Tables using internal UUID (reference profiles.id)
DROP POLICY IF EXISTS "user_subscription_access" ON public.subscriptions_v2;
CREATE POLICY "user_subscription_access" ON public.subscriptions_v2
FOR ALL USING (user_id IN (SELECT id FROM public.profiles WHERE clerk_id = auth.uid()::text));

DROP POLICY IF EXISTS "user_transactions_access" ON public.credit_transactions;
CREATE POLICY "user_transactions_access" ON public.credit_transactions
FOR ALL USING (user_id IN (SELECT id FROM public.profiles WHERE clerk_id = auth.uid()::text));

DROP POLICY IF EXISTS "user_wallet_access" ON public.wallet;
CREATE POLICY "user_wallet_access" ON public.wallet
FOR ALL USING (user_id IN (SELECT id FROM public.profiles WHERE clerk_id = auth.uid()::text));

-- Tables using Clerk ID directly (TEXT/STRING)
DROP POLICY IF EXISTS "user_generations_access" ON public.generations;
CREATE POLICY "user_generations_access" ON public.generations
FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_stats_access" ON public.user_stats;
CREATE POLICY "user_stats_access" ON public.user_stats
FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_preferences_access" ON public.user_preferences;
CREATE POLICY "user_preferences_access" ON public.user_preferences
FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- 2. REPAIRING FUNCTIONS (Using $_$ delimiters for robustness)
CREATE OR REPLACE FUNCTION public.provision_wallet_v2(
    p_clerk_id TEXT,
    p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $_$
DECLARE
    v_profile_id UUID;
    v_safe_email TEXT;
    v_default_credits INTEGER := 5; 
BEGIN
    v_safe_email := COALESCE(p_email, 'user_' || p_clerk_id || '@generated.com');
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN
        INSERT INTO public.profiles (clerk_id, email)
        VALUES (p_clerk_id, v_safe_email)
        ON CONFLICT (clerk_id) DO NOTHING
        RETURNING id INTO v_profile_id;
        IF v_profile_id IS NULL THEN
            SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
        END IF;
    END IF;
    INSERT INTO public.wallet (user_id, monthly_limit, credits_remaining, addon_credits)
    VALUES (v_profile_id, v_default_credits, v_default_credits, 0)
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.subscriptions_v2 (user_id, plan_type, billing_cycle, status)
    VALUES (v_profile_id, 'free', 'monthly', 'active')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN v_profile_id;
END;
$_$;

CREATE OR REPLACE FUNCTION public.downgrade_to_free_v3(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $_$
DECLARE
    v_next_reset TIMESTAMPTZ := NOW() + INTERVAL '30 days';
    v_monthly_limit INTEGER := 5;
BEGIN
    UPDATE public.subscriptions_v2
    SET plan_type = 'free',
        billing_cycle = 'monthly',
        status = 'active',
        paddle_subscription_id = NULL,
        current_period_start = NOW(),
        next_reset_at = v_next_reset,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    UPDATE public.wallet
    SET monthly_limit = v_monthly_limit,
        credits_remaining = v_monthly_limit,
        last_reset_at = NOW(),
        next_reset_at = v_next_reset,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, v_monthly_limit, v_monthly_limit, 'grant', 'downgraded to free plan (5 credits)');
END;
$_$;

-- 3. UPDATE DEFAULTS
UPDATE public.plans SET credits_per_month = 5 WHERE name = 'free';
ALTER TABLE public.wallet ALTER COLUMN monthly_limit SET DEFAULT 5;
ALTER TABLE public.wallet ALTER COLUMN credits_remaining SET DEFAULT 5;
