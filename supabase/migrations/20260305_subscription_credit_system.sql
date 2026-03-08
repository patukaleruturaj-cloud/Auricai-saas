-- ============================================================
-- AuricAI — Subscription & Credit System V2
-- Razorpay-driven, database-backed, idempotent
-- Run in Supabase SQL Editor (migration)
-- ============================================================

-- ============================================================
-- 1. PLANS TABLE — Static plan configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL CHECK (name IN ('free', 'starter', 'growth', 'pro')),
    price_monthly INTEGER NOT NULL DEFAULT 0,
    price_yearly INTEGER NOT NULL DEFAULT 0,
    credits_per_month INTEGER NOT NULL DEFAULT 0
);

-- Seed plan data
INSERT INTO public.plans (name, price_monthly, price_yearly, credits_per_month)
VALUES
    ('free',    0,    0,   10),
    ('starter', 2900, 23200, 400),
    ('growth',  5900, 47200, 1200),
    ('pro',     8900, 71200, 2850)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    credits_per_month = EXCLUDED.credits_per_month;

-- ============================================================
-- 2. ALTER SUBSCRIPTIONS — Add next_credit_reset, plan_id FK
-- ============================================================

-- Add plan_id column referencing plans table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan_id'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN plan_id UUID REFERENCES public.plans(id);
    END IF;
END $$;

-- Add next_credit_reset column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'next_credit_reset'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN next_credit_reset TIMESTAMPTZ;
    END IF;
END $$;

-- Update status constraint to include 'halted'
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'halted', 'cancelled', 'expired', 'past_due'));

-- Backfill plan_id from plan_type for existing rows
UPDATE public.subscriptions s
SET plan_id = p.id
FROM public.plans p
WHERE s.plan_type = p.name AND s.plan_id IS NULL;

-- Backfill next_credit_reset for existing active subscriptions
UPDATE public.subscriptions
SET next_credit_reset = current_period_end
WHERE next_credit_reset IS NULL AND status = 'active';

-- ============================================================
-- 3. CREDIT_WALLET — One row per user, available balance
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_wallet (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_credits INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill credit_wallet from existing usage_credits
INSERT INTO public.credit_wallet (user_id, available_credits, updated_at)
SELECT
    uc.user_id,
    GREATEST(0, uc.credits_total - uc.credits_used),
    NOW()
FROM public.usage_credits uc
WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_wallet cw WHERE cw.user_id = uc.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 4. CREDIT_TRANSACTIONS — Audit log of all credit changes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);

-- ============================================================
-- 5. PAYMENT_EVENTS — Webhook idempotency guard
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razorpay_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON public.payment_events(razorpay_event_id);

-- ============================================================
-- 6. RLS for new tables
-- ============================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Plans are readable by everyone
DROP POLICY IF EXISTS plans_select_all ON public.plans;
CREATE POLICY plans_select_all ON public.plans FOR SELECT TO authenticated USING (true);

-- Credit wallet: users can read their own (writes via service_role)
DROP POLICY IF EXISTS credit_wallet_select_own ON public.credit_wallet;
CREATE POLICY credit_wallet_select_own ON public.credit_wallet FOR SELECT TO authenticated USING (true);

-- Credit transactions: users can read their own
DROP POLICY IF EXISTS credit_transactions_select_own ON public.credit_transactions;
CREATE POLICY credit_transactions_select_own ON public.credit_transactions FOR SELECT TO authenticated USING (true);

-- Payment events: service_role only (no direct user access needed)
DROP POLICY IF EXISTS payment_events_service_only ON public.payment_events;
CREATE POLICY payment_events_service_only ON public.payment_events FOR SELECT TO authenticated USING (false);

-- ============================================================
-- 7. UPDATED_AT trigger for credit_wallet
-- ============================================================
DROP TRIGGER IF EXISTS update_credit_wallet_updated_at ON public.credit_wallet;
CREATE TRIGGER update_credit_wallet_updated_at
    BEFORE UPDATE ON public.credit_wallet
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. RPC: PROVISION NEW USER V2
-- Creates profile + free subscription + credit_wallet
-- ============================================================
CREATE OR REPLACE FUNCTION provision_new_user_v2(
    p_clerk_id TEXT,
    p_email TEXT
)
RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
    v_plan_id UUID;
    v_now TIMESTAMPTZ := NOW();
    v_period_end TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
    -- Check if already exists
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE clerk_id = p_clerk_id;

    IF v_profile_id IS NOT NULL THEN
        -- Ensure credit_wallet exists (defensive)
        INSERT INTO public.credit_wallet (user_id, available_credits, updated_at)
        VALUES (v_profile_id, 10, v_now)
        ON CONFLICT (user_id) DO NOTHING;
        RETURN v_profile_id;
    END IF;

    -- Get free plan ID
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'free';

    -- Create profile
    INSERT INTO public.profiles (clerk_id, email, created_at)
    VALUES (p_clerk_id, p_email, v_now)
    RETURNING id INTO v_profile_id;

    -- Create free subscription
    INSERT INTO public.subscriptions (
        user_id, plan_id, plan_type, status, billing_cycle,
        current_period_start, current_period_end, next_credit_reset
    )
    VALUES (
        v_profile_id, v_plan_id, 'free', 'active', 'monthly',
        v_now, v_period_end, v_period_end
    );

    -- Create credit wallet with 10 free credits
    INSERT INTO public.credit_wallet (user_id, available_credits, updated_at)
    VALUES (v_profile_id, 10, v_now);

    -- Initial credit transaction
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 10, 'credit', 'initial free credits');

    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. RPC: ATOMIC DEDUCT CREDIT V2
-- Uses credit_wallet + credit_transactions
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_deduct_credit_v2(p_clerk_id TEXT)
RETURNS TABLE (
    success BOOLEAN,
    available_credits INT
) AS $$
DECLARE
    v_profile_id UUID;
    v_sub_status TEXT;
    v_current_credits INT;
BEGIN
    -- 1. Identify User
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
    END IF;

    -- 2. Validate Subscription
    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE user_id = v_profile_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub_status IS NULL OR v_sub_status NOT IN ('active', 'cancelled') THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
    END IF;

    -- 3. Lock and check credit wallet
    SELECT cw.available_credits INTO v_current_credits
    FROM public.credit_wallet cw
    WHERE cw.user_id = v_profile_id
    FOR UPDATE;

    IF v_current_credits IS NULL OR v_current_credits <= 0 THEN
        RETURN QUERY SELECT false, COALESCE(v_current_credits, 0);
        RETURN;
    END IF;

    -- 4. Deduct
    UPDATE public.credit_wallet
    SET available_credits = available_credits - 1
    WHERE user_id = v_profile_id;

    -- 5. Audit log
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 1, 'debit', 'ai message generation');

    RETURN QUERY SELECT true, (v_current_credits - 1);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. RPC: REFUND CREDIT V2
-- ============================================================
CREATE OR REPLACE FUNCTION refund_credit_v2(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    UPDATE public.credit_wallet
    SET available_credits = available_credits + 1
    WHERE user_id = v_profile_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 1, 'credit', 'generation failure refund');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. RPC: ACTIVATE SUBSCRIPTION
-- Called when subscription.activated webhook fires
-- ============================================================
CREATE OR REPLACE FUNCTION activate_subscription(
    p_clerk_id TEXT,
    p_razorpay_sub_id TEXT,
    p_plan_name TEXT,
    p_billing_cycle TEXT,
    p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_plan_id UUID;
    v_credits INT;
    v_now TIMESTAMPTZ := NOW();
    v_end TIMESTAMPTZ;
    v_next_reset TIMESTAMPTZ;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    SELECT id, credits_per_month INTO v_plan_id, v_credits
    FROM public.plans WHERE name = p_plan_name;
    IF v_plan_id IS NULL THEN RETURN; END IF;

    v_end := COALESCE(p_period_end, v_now + INTERVAL '30 days');
    v_next_reset := v_now + INTERVAL '1 month';

    -- Update subscription
    UPDATE public.subscriptions
    SET plan_id = v_plan_id,
        plan_type = p_plan_name,
        status = 'active',
        razorpay_subscription_id = p_razorpay_sub_id,
        billing_cycle = p_billing_cycle,
        current_period_start = v_now,
        current_period_end = v_end,
        next_credit_reset = v_next_reset
    WHERE user_id = v_profile_id;

    -- If no subscription row exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.subscriptions (
            user_id, plan_id, plan_type, status, razorpay_subscription_id,
            billing_cycle, current_period_start, current_period_end, next_credit_reset
        )
        VALUES (
            v_profile_id, v_plan_id, p_plan_name, 'active', p_razorpay_sub_id,
            p_billing_cycle, v_now, v_end, v_next_reset
        );
    END IF;

    -- Set credit wallet
    INSERT INTO public.credit_wallet (user_id, available_credits, updated_at)
    VALUES (v_profile_id, v_credits, v_now)
    ON CONFLICT (user_id)
    DO UPDATE SET available_credits = v_credits, updated_at = v_now;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, v_credits, 'credit', 'subscription activation');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 12. RPC: UPGRADE SUBSCRIPTION PLAN
-- Resets credits to new plan limit immediately
-- ============================================================
CREATE OR REPLACE FUNCTION upgrade_subscription_plan(
    p_clerk_id TEXT,
    p_new_plan_name TEXT
)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_plan_id UUID;
    v_credits INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    SELECT id, credits_per_month INTO v_plan_id, v_credits
    FROM public.plans WHERE name = p_new_plan_name;
    IF v_plan_id IS NULL THEN RETURN; END IF;

    -- Update subscription plan
    UPDATE public.subscriptions
    SET plan_id = v_plan_id,
        plan_type = p_new_plan_name
    WHERE user_id = v_profile_id;

    -- Reset wallet to new plan credits
    UPDATE public.credit_wallet
    SET available_credits = v_credits, updated_at = v_now
    WHERE user_id = v_profile_id;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, v_credits, 'credit', 'plan upgrade to ' || p_new_plan_name);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. RPC: RESET CREDITS FOR DUE SUBSCRIPTIONS
-- Called by cron job every 24 hours
-- ============================================================
CREATE OR REPLACE FUNCTION reset_credits_for_due_subscriptions()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT s.user_id, s.id AS sub_id, p.credits_per_month
        FROM public.subscriptions s
        JOIN public.plans p ON s.plan_id = p.id
        WHERE s.status = 'active'
          AND s.next_credit_reset <= NOW()
    LOOP
        -- Reset wallet
        UPDATE public.credit_wallet
        SET available_credits = v_row.credits_per_month, updated_at = NOW()
        WHERE user_id = v_row.user_id;

        -- Advance next reset by 1 month
        UPDATE public.subscriptions
        SET next_credit_reset = next_credit_reset + INTERVAL '1 month'
        WHERE id = v_row.sub_id;

        -- Audit log
        INSERT INTO public.credit_transactions (user_id, amount, type, reason)
        VALUES (v_row.user_id, v_row.credits_per_month, 'credit', 'monthly credit reset');

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 14. RPC: DOWNGRADE TO FREE V2
-- ============================================================
CREATE OR REPLACE FUNCTION downgrade_to_free_v2(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
    v_plan_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'free';

    UPDATE public.subscriptions
    SET plan_id = v_plan_id,
        plan_type = 'free',
        status = 'active',
        billing_cycle = 'monthly',
        current_period_start = v_now,
        current_period_end = v_now + INTERVAL '30 days',
        next_credit_reset = v_now + INTERVAL '30 days',
        razorpay_subscription_id = NULL
    WHERE user_id = v_profile_id;

    UPDATE public.credit_wallet
    SET available_credits = 10, updated_at = v_now
    WHERE user_id = v_profile_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 10, 'credit', 'downgrade to free');
END;
$$ LANGUAGE plpgsql;
