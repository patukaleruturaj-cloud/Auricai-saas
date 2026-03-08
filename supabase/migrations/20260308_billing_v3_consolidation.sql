-- ============================================================
-- AuricAI — Billing V3 Consolidation
-- Canonical tables: wallet, subscriptions_v2, processed_webhooks
-- New: webhook_logs, atomic RPCs for all billing operations
-- ============================================================

-- ─── 1. WEBHOOK_LOGS — Full audit trail ───
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processed', 'failed', 'skipped')),
    error_message TEXT,
    user_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON public.webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON public.webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);

-- ─── 2. CREDIT_TRANSACTIONS — Ensure table exists ───
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER,
    type TEXT NOT NULL CHECK (type IN ('grant', 'deduct', 'reset', 'credit', 'debit', 'subscription', 'addon', 'refund')),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON public.credit_transactions(created_at DESC);

-- ─── 3. RPC: activate_plan ───
-- Atomic plan activation: updates subscriptions_v2 + wallet + logs tx
CREATE OR REPLACE FUNCTION public.activate_plan(
    p_user_id UUID,
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_credits INTEGER,
    p_paddle_subscription_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_next_reset TIMESTAMPTZ := NOW() + INTERVAL '30 days';
    v_current_addon INTEGER;
BEGIN
    -- 1. Upsert subscription
    INSERT INTO public.subscriptions_v2 (
        user_id, plan_type, billing_cycle, status,
        paddle_subscription_id, current_period_start,
        next_reset_at, updated_at
    ) VALUES (
        p_user_id, p_plan_type, p_billing_cycle, 'active',
        p_paddle_subscription_id, v_now,
        v_next_reset, v_now
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan_type = EXCLUDED.plan_type,
        billing_cycle = EXCLUDED.billing_cycle,
        status = 'active',
        paddle_subscription_id = COALESCE(EXCLUDED.paddle_subscription_id, subscriptions_v2.paddle_subscription_id),
        current_period_start = v_now,
        next_reset_at = v_next_reset,
        updated_at = v_now;

    -- 2. Get current addon credits (preserve them)
    SELECT COALESCE(addon_credits, 0) INTO v_current_addon
    FROM public.wallet WHERE user_id = p_user_id;

    -- 3. Upsert wallet — reset monthly credits, preserve addon
    INSERT INTO public.wallet (
        user_id, monthly_limit, credits_remaining,
        addon_credits, last_reset_at, next_reset_at, updated_at
    ) VALUES (
        p_user_id, p_credits, p_credits,
        0, v_now, v_next_reset, v_now
    )
    ON CONFLICT (user_id) DO UPDATE SET
        monthly_limit = p_credits,
        credits_remaining = p_credits,
        -- addon_credits is explicitly preserved
        last_reset_at = v_now,
        next_reset_at = v_next_reset,
        updated_at = v_now;

    -- 4. Audit log
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, p_credits, p_credits, 'grant',
            'plan activated: ' || p_plan_type || ' (' || p_billing_cycle || ')');
END;
$$;

-- ─── 4. RPC: increment_addon_credits ───
-- Atomic addon credit addition with row locking
CREATE OR REPLACE FUNCTION public.increment_addon_credits(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_addon INTEGER;
    v_monthly INTEGER;
BEGIN
    -- Lock and update
    UPDATE public.wallet
    SET addon_credits = addon_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING addon_credits, credits_remaining INTO v_new_addon, v_monthly;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No wallet found for user %', p_user_id;
    END IF;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, p_amount, v_monthly + v_new_addon, 'addon',
            'addon credit purchase: +' || p_amount);

    RETURN v_new_addon;
END;
$$;

-- ─── 5. RPC: reset_monthly_credits ───
-- Atomic monthly reset preserving addon credits
CREATE OR REPLACE FUNCTION public.reset_monthly_credits(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_limit INTEGER;
    v_next_reset TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
    -- Lock + update
    UPDATE public.wallet
    SET credits_remaining = monthly_limit,
        last_reset_at = NOW(),
        next_reset_at = v_next_reset,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING monthly_limit INTO v_limit;

    IF NOT FOUND THEN RETURN; END IF;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, v_limit, v_limit, 'reset', 'monthly credit reset');
END;
$$;

-- ─── 6. RPC: cancel_plan ───
CREATE OR REPLACE FUNCTION public.cancel_plan(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.subscriptions_v2
    SET status = 'cancelled', updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;

-- ─── 7. RPC: set_plan_past_due ───
CREATE OR REPLACE FUNCTION public.set_plan_past_due(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.subscriptions_v2
    SET status = 'past_due', updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;

-- ─── 8. RPC: downgrade_to_free_v3 ───
-- Full downgrade: resets plan + monthly credits, preserves addon
CREATE OR REPLACE FUNCTION public.downgrade_to_free_v3(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_reset TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
    -- 1. Reset subscription
    UPDATE public.subscriptions_v2
    SET plan_type = 'free',
        billing_cycle = 'monthly',
        status = 'active',
        paddle_subscription_id = NULL,
        current_period_start = NOW(),
        next_reset_at = v_next_reset,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 2. Reset wallet (preserve addon_credits)
    UPDATE public.wallet
    SET monthly_limit = 10,
        credits_remaining = 10,
        -- addon_credits preserved
        last_reset_at = NOW(),
        next_reset_at = v_next_reset,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 3. Audit log
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, 10, 10, 'grant', 'downgraded to free plan');
END;
$$;

-- ─── 9. Updated deduct_credit_v3 ───
-- Atomic deduction: monthly first, addon second, with row locking
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
        SET credits_remaining = v_credits - 1,
            updated_at = NOW()
        WHERE wallet.user_id = p_user_id;

        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits - 1, 'deduct', 'generation (monthly)');

        RETURN QUERY SELECT true, v_credits - 1, v_addon, v_limit;
        RETURN;
    END IF;

    -- Fallback to addon credits
    IF v_addon > 0 THEN
        UPDATE public.wallet
        SET addon_credits = v_addon - 1,
            updated_at = NOW()
        WHERE wallet.user_id = p_user_id;

        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits, 'deduct', 'generation (addon)');

        RETURN QUERY SELECT true, v_credits, v_addon - 1, v_limit;
        RETURN;
    END IF;

    -- No credits
    RETURN QUERY SELECT false, 0, 0, v_limit;
END;
$$;

-- ─── 10. Enable RLS on new tables ───
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_webhook_logs') THEN
        CREATE POLICY service_all_webhook_logs ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_credit_transactions') THEN
        CREATE POLICY service_all_credit_transactions ON public.credit_transactions FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─── 11. Enable Realtime on wallet for dashboard live updates ───
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'wallet'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet;
    END IF;
END $$;
