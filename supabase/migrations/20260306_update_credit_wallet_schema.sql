-- ============================================================
-- AuricAI — Credit Wallet Schema Update
-- Adds monthly_limit and last_reset_at columns, renames available_credits
-- Updates RPCs for monthly limits and logic
-- ============================================================

-- 1. Alter credit_wallet table
ALTER TABLE public.credit_wallet RENAME COLUMN available_credits TO credits_remaining;
ALTER TABLE public.credit_wallet ADD COLUMN IF NOT EXISTS monthly_limit INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.credit_wallet ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update provision_new_user_v2 to use the new columns
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
        INSERT INTO public.credit_wallet (user_id, credits_remaining, monthly_limit, last_reset_at, updated_at)
        VALUES (v_profile_id, 10, 10, v_now, v_now)
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
    INSERT INTO public.credit_wallet (user_id, credits_remaining, monthly_limit, last_reset_at, updated_at)
    VALUES (v_profile_id, 10, 10, v_now, v_now);

    -- Initial credit transaction
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 10, 'credit', 'initial free credits');

    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql;


-- 3. Update handle_new_user_provisioning trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Get the free plan ID
  SELECT id INTO v_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  -- Create free subscription
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    plan_type,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    next_credit_reset
  )
  VALUES (
    new.id,
    v_plan_id,
    'free',
    'active',
    'monthly',
    now(),
    now() + interval '1 month',
    now() + interval '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create credit wallet with 10 credits
  INSERT INTO public.credit_wallet (
    user_id,
    credits_remaining,
    monthly_limit,
    last_reset_at,
    updated_at
  )
  VALUES (
    new.id,
    10,
    10,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Log credit transaction
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    reason,
    created_at
  )
  VALUES (
    new.id,
    10,
    'credit',
    'signup_bonus',
    now()
  );

  RETURN new;
END;
$$;


-- 4. ATOMIC DEDUCT CREDIT V2 WITH AUTO 30-DAY RESET
CREATE OR REPLACE FUNCTION atomic_deduct_credit_v2(p_clerk_id TEXT)
RETURNS TABLE (
    success BOOLEAN,
    credits_remaining INT
) AS $$
DECLARE
    v_profile_id UUID;
    v_sub_status TEXT;
    v_wallet RECORD;
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
    SELECT * INTO v_wallet
    FROM public.credit_wallet
    WHERE user_id = v_profile_id
    FOR UPDATE;

    IF v_wallet.user_id IS NULL THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
    END IF;

    -- 4. Check for 30 day refresh
    IF current_date - v_wallet.last_reset_at::date >= 30 THEN
        UPDATE public.credit_wallet
        SET credits_remaining = monthly_limit,
            last_reset_at = NOW()
        WHERE user_id = v_profile_id;
        
        -- update local variable to reflect the reset
        v_wallet.credits_remaining := v_wallet.monthly_limit;
        v_wallet.last_reset_at := NOW();

        -- Audit log for reset
        INSERT INTO public.credit_transactions (user_id, amount, type, reason)
        VALUES (v_profile_id, v_wallet.monthly_limit, 'credit', 'monthly automatic reset');
    END IF;

    -- 5. Check if enough credits
    IF v_wallet.credits_remaining <= 0 THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
    END IF;

    -- 6. Deduct
    UPDATE public.credit_wallet
    SET credits_remaining = v_wallet.credits_remaining - 1
    WHERE user_id = v_profile_id;

    -- 7. Audit log for deduction
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 1, 'debit', 'ai message generation');

    RETURN QUERY SELECT true, (v_wallet.credits_remaining - 1);
END;
$$ LANGUAGE plpgsql;

-- 5. Refund Credit
CREATE OR REPLACE FUNCTION refund_credit_v2(p_clerk_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT id INTO v_profile_id FROM public.profiles WHERE clerk_id = p_clerk_id;
    IF v_profile_id IS NULL THEN RETURN; END IF;

    UPDATE public.credit_wallet
    SET credits_remaining = credits_remaining + 1
    WHERE user_id = v_profile_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 1, 'credit', 'generation failure refund');
END;
$$ LANGUAGE plpgsql;


-- 6. Activate Subscription
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
    v_next_reset := v_now + INTERVAL '30 days';

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

    -- Set credit wallet to updated plan credits and reset date
    INSERT INTO public.credit_wallet (user_id, credits_remaining, monthly_limit, last_reset_at, updated_at)
    VALUES (v_profile_id, v_credits, v_credits, v_now, v_now)
    ON CONFLICT (user_id)
    DO UPDATE SET credits_remaining = v_credits, monthly_limit = v_credits, last_reset_at = v_now, updated_at = v_now;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, v_credits, 'credit', 'subscription activation');
END;
$$ LANGUAGE plpgsql;

-- 7. Upgrade Subscription Plan
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

    -- Reset wallet to new plan credits and reset date
    UPDATE public.credit_wallet
    SET credits_remaining = v_credits, monthly_limit = v_credits, last_reset_at = v_now, updated_at = v_now
    WHERE user_id = v_profile_id;

    -- Audit log
    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, v_credits, 'credit', 'plan upgrade to ' || p_new_plan_name);
END;
$$ LANGUAGE plpgsql;

-- 8. Downgrade to Free V2
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
    SET credits_remaining = 10, monthly_limit = 10, last_reset_at = v_now, updated_at = v_now
    WHERE user_id = v_profile_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, reason)
    VALUES (v_profile_id, 10, 'credit', 'downgrade to free');
END;
$$ LANGUAGE plpgsql;

-- 9. Update the backfill script since column names changed
-- In 20260305_backfill_missing_wallets.sql, it will error out if it runs after this,
-- But typically this new migration runs after the existing ones. 
-- Just in case there are still missing wallets, backfill them.
INSERT INTO public.credit_wallet (user_id, credits_remaining, monthly_limit, last_reset_at, updated_at)
SELECT id, 10, 10, now(), now()
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.credit_wallet
);
