-- Migration: Add paddle_customer_id to subscriptions_v2
ALTER TABLE public.subscriptions_v2 ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_subscriptions_v2_customer ON public.subscriptions_v2(paddle_customer_id);

-- Update activate_plan to support paddle_customer_id if needed, but for now we'll handle it in the webhook logic via direct update or updating the function if it's already used.
-- Let's update activate_plan to include paddle_customer_id.
CREATE OR REPLACE FUNCTION public.activate_plan(
    p_user_id UUID,
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_credits INTEGER,
    p_paddle_subscription_id TEXT DEFAULT NULL,
    p_paddle_customer_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_next_reset TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
    -- 1. Upsert subscription
    INSERT INTO public.subscriptions_v2 (
        user_id, plan_type, billing_cycle, status,
        paddle_subscription_id, paddle_customer_id, current_period_start,
        next_reset_at, updated_at
    ) VALUES (
        p_user_id, p_plan_type, p_billing_cycle, 'active',
        p_paddle_subscription_id, p_paddle_customer_id, v_now,
        v_next_reset, v_now
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan_type = EXCLUDED.plan_type,
        billing_cycle = EXCLUDED.billing_cycle,
        status = 'active',
        paddle_subscription_id = COALESCE(EXCLUDED.paddle_subscription_id, subscriptions_v2.paddle_subscription_id),
        paddle_customer_id = COALESCE(EXCLUDED.paddle_customer_id, subscriptions_v2.paddle_customer_id),
        current_period_start = v_now,
        next_reset_at = v_next_reset,
        updated_at = v_now;

    -- 2. Upsert wallet — reset monthly credits, preserve addon
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
        -- addon_credits is explicitly preserved in the actual schema logic
        last_reset_at = v_now,
        next_reset_at = v_next_reset,
        updated_at = v_now;

    -- 3. Audit log
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, p_credits, p_credits, 'grant', 
            'plan activated: ' || p_plan_type || ' (' || p_billing_cycle || ')');
END;
$$;
