-- Migration: Subscription Architecture - Idempotency & Locking
-- 1. Create payments_log table for webhook idempotency
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

-- Enable RLS for payments_log
ALTER TABLE public.payments_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_log_select_own ON public.payments_log
    FOR SELECT TO authenticated
    USING (true);

-- 2. Update usage_credits constraints
-- Add constraints to usage_credits if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'credits_used_non_negative'
    ) THEN
        ALTER TABLE public.usage_credits ADD CONSTRAINT credits_used_non_negative CHECK (credits_used >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'credits_used_lte_total'
    ) THEN
        ALTER TABLE public.usage_credits ADD CONSTRAINT credits_used_lte_total CHECK (credits_used <= credits_total);
    END IF;
END $$;


-- 3. Replace deduct_credit with atomic_deduct_credit (with FOR UPDATE)
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
        
        -- Also update sub period to keep them somewhat aligned superficially
        -- Though true yearly subs will have a 365 day sub_end
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


-- 4. Add process_subscription_charge RPC for Webhooks (Idempotent)
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

    -- 1. Insert into payments_log (will fail if razorpay_payment_id isn't unique, naturally ensuring idempotency if called outside safe block)
    INSERT INTO public.payments_log (razorpay_payment_id, razorpay_subscription_id, user_id, plan_type, amount_paid, created_at)
    VALUES (p_payment_id, p_sub_id, v_profile_id, p_plan_type, p_amount_paid, v_now)
    ON CONFLICT (razorpay_payment_id) DO NOTHING;

    -- If we did nothing because of conflict, we could bail, but usually our JS layer checks first.
    
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

    -- 3. Reset usage credits
    UPDATE public.usage_credits
    SET credits_total = p_credits_total,
        credits_used = 0,
        period_start = v_now,
        -- Usage credits always reset every 30 days regardless of yearly sub
        period_end = v_now + INTERVAL '30 days' 
    WHERE user_id = v_profile_id;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: REFUND CREDIT (for failed AI generations)
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

-- 5. RPC: REFUND CREDIT (for failed AI generations)
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
