-- ============================================================
-- AuricAI Billing V2 — Clean 3-layer schema
-- Tables: subscriptions, wallet
-- RPCs: provision_wallet_v2, deduct_credit_v3
-- ============================================================

-- ─── SUBSCRIPTIONS ───
CREATE TABLE IF NOT EXISTS public.subscriptions_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'growth', 'pro')),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
    paddle_subscription_id TEXT,
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    next_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_v2_user ON public.subscriptions_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_v2_paddle ON public.subscriptions_v2(paddle_subscription_id);

-- ─── WALLET ───
CREATE TABLE IF NOT EXISTS public.wallet (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    monthly_limit INTEGER NOT NULL DEFAULT 10,
    credits_remaining INTEGER NOT NULL DEFAULT 10,
    addon_credits INTEGER NOT NULL DEFAULT 0,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    next_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_next_reset ON public.wallet(next_reset_at);

-- ─── PROCESSED WEBHOOKS (idempotency) ───
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PROVISION_WALLET_V2 ───
-- Idempotent: creates profile + wallet + subscription if not exist
CREATE OR REPLACE FUNCTION public.provision_wallet_v2(
    p_clerk_id TEXT,
    p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_id UUID;
    v_safe_email TEXT;
BEGIN
    v_safe_email := COALESCE(p_email, 'user_' || p_clerk_id || '@generated.com');

    -- Get or create profile
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NULL THEN
        INSERT INTO public.profiles (clerk_id, email)
        VALUES (p_clerk_id, v_safe_email)
        ON CONFLICT (clerk_id) DO NOTHING
        RETURNING id INTO v_profile_id;

        -- Race condition fallback
        IF v_profile_id IS NULL THEN
            SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
        END IF;
    END IF;

    -- Ensure wallet exists
    INSERT INTO public.wallet (user_id, monthly_limit, credits_remaining, addon_credits)
    VALUES (v_profile_id, 10, 10, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Ensure subscription exists
    INSERT INTO public.subscriptions_v2 (user_id, plan_type, billing_cycle, status)
    VALUES (v_profile_id, 'free', 'monthly', 'active')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN v_profile_id;
END;
$$;

-- ─── DEDUCT_CREDIT_V3 ───
-- Atomic deduction: monthly credits first, then addon credits
-- Returns: success, credits_remaining, addon_credits, monthly_limit
CREATE OR REPLACE FUNCTION public.deduct_credit_v3(p_user_id UUID)
RETURNS TABLE(success BOOLEAN, credits_remaining INTEGER, addon_credits INTEGER, monthly_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits INTEGER;
    v_addon INTEGER;
    v_limit INTEGER;
BEGIN
    -- Lock the wallet row
    SELECT w.credits_remaining, w.addon_credits, w.monthly_limit
    INTO v_credits, v_addon, v_limit
    FROM public.wallet w
    WHERE w.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0, 0, 0;
        RETURN;
    END IF;

    -- Try monthly credits first
    IF v_credits > 0 THEN
        UPDATE public.wallet
        SET credits_remaining = credits_remaining - 1,
            updated_at = NOW()
        WHERE wallet.user_id = p_user_id;

        -- Log transaction
        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits - 1, 'deduct', 'generation (monthly)');

        RETURN QUERY SELECT true, v_credits - 1, v_addon, v_limit;
        RETURN;
    END IF;

    -- Fallback to addon credits
    IF v_addon > 0 THEN
        UPDATE public.wallet
        SET addon_credits = addon_credits - 1,
            updated_at = NOW()
        WHERE wallet.user_id = p_user_id;

        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits, 'deduct', 'generation (addon)');

        RETURN QUERY SELECT true, v_credits, v_addon - 1, v_limit;
        RETURN;
    END IF;

    -- No credits available
    RETURN QUERY SELECT false, 0, 0, v_limit;
END;
$$;

-- ─── ENABLE RLS ───
ALTER TABLE public.subscriptions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all_subscriptions_v2" ON public.subscriptions_v2
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_wallet" ON public.wallet
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_processed_webhooks" ON public.processed_webhooks
    FOR ALL USING (true) WITH CHECK (true);
