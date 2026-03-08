-- ============================================================
-- AuricAI — ALL-IN-ONE PATCH SCRIPT
-- RUN THIS IN YOUR SUPABASE SQL EDITOR
-- Combines all missing table schemas, column updates, and logic fixes.
-- ============================================================

-- ============================================================
-- 1. Table Definitions
-- ============================================================

-- Create plans table if missing
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL CHECK (name IN ('free', 'starter', 'growth', 'pro')),
    price_monthly INTEGER NOT NULL DEFAULT 0,
    price_yearly INTEGER NOT NULL DEFAULT 0,
    credits_per_month INTEGER NOT NULL DEFAULT 0
);

-- Seed basic plans
INSERT INTO public.plans (name, price_monthly, price_yearly, credits_per_month)
VALUES
    ('free',    0,    0,   10),
    ('starter', 2900, 23200, 400),
    ('growth',  5900, 47200, 1200),
    ('pro',     8900, 71200, 2850)
ON CONFLICT (name) DO NOTHING;

-- Create credit_wallet from scratch with ALL columns
CREATE TABLE IF NOT EXISTS public.credit_wallet (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL DEFAULT 'free',
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'paid')),
    credits_remaining INTEGER NOT NULL DEFAULT 10,
    monthly_limit INTEGER NOT NULL DEFAULT 10,
    billing_cycle TEXT DEFAULT 'monthly',
    subscription_status TEXT DEFAULT 'active',
    subscription_id TEXT,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    next_reset_at TIMESTAMPTZ DEFAULT NOW() + interval '30 days',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill missing next_reset_at if the table somehow existed
UPDATE public.credit_wallet
SET next_reset_at = COALESCE(last_reset_at + interval '30 days', NOW() + interval '30 days')
WHERE next_reset_at IS NULL;

-- Create credit_transactions log table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER,
    type TEXT NOT NULL CHECK (type IN ('grant', 'deduct', 'reset', 'credit', 'debit', 'subscription')),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);

-- Create payments idempotency table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    razorpay_payment_id TEXT,
    razorpay_invoice_id TEXT UNIQUE NOT NULL,
    razorpay_subscription_id TEXT,
    amount NUMERIC,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'captured',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure subscriptions table has the unique constraint for Razorpay ID
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_razorpay_subscription_id_key;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_razorpay_subscription_id_key UNIQUE (razorpay_subscription_id);

-- ============================================================
-- 2. Stored Procedures (RPCs)
-- ============================================================

-- Provision missing wallets gracefully
CREATE OR REPLACE FUNCTION public.provision_user_wallet(
    p_user_id UUID,
    p_credits INT,
    p_monthly_limit INT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.credit_wallet (
        user_id,
        credits_remaining,
        monthly_limit,
        plan_type,
        last_reset_at,
        next_reset_at
    )
    VALUES (
        p_user_id,
        p_credits,
        p_monthly_limit,
        'free',
        NOW(),
        NOW() + interval '30 days'
    )
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset due credits (JOIN with subscriptions to ensure ONLY Active receive credits)
CREATE OR REPLACE FUNCTION public.reset_due_credits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT cw.user_id, cw.monthly_limit, cw.next_reset_at
    FROM public.credit_wallet cw
    JOIN public.subscriptions s ON cw.user_id = s.user_id
    WHERE s.status = 'active'
      AND cw.next_reset_at IS NOT NULL
      AND CURRENT_DATE >= cw.next_reset_at::date
  LOOP
    UPDATE public.credit_wallet
    SET credits_remaining = v_row.monthly_limit,
        last_reset_at = NOW(),
        next_reset_at = NOW() + interval '30 days',
        updated_at = NOW()
    WHERE user_id = v_row.user_id;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (v_row.user_id, v_row.monthly_limit, v_row.monthly_limit, 'reset', 'monthly credit reset');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire to free (strict rules)
CREATE OR REPLACE FUNCTION public.expire_to_free(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_wallet
  SET plan_id = 'free',
      plan_type = 'free',
      monthly_limit = 10,
      credits_remaining = 10,
      billing_cycle = 'monthly',
      subscription_status = 'active',
      subscription_id = NULL,
      last_reset_at = NOW(),
      next_reset_at = NOW() + interval '30 days',
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, 10, 10, 'subscription', 'expired to free plan');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic deduct with overdraft rules
CREATE OR REPLACE FUNCTION public.atomic_deduct_credit_v2(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  credits_remaining INT,
  monthly_limit INT
) AS $$
DECLARE
  v_wallet RECORD;
  v_new_balance INT;
BEGIN
  -- 1. Lock wallet row
  SELECT * INTO v_wallet
  FROM public.credit_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet.user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- 2. Check subscription status
  IF v_wallet.subscription_status NOT IN ('active', 'cancelled') THEN
    RETURN QUERY SELECT false, v_wallet.credits_remaining, v_wallet.monthly_limit;
    RETURN;
  END IF;

  -- 3. Auto-reset during deduction (Lazy Reset) if next_reset_at has passed
  IF v_wallet.next_reset_at IS NOT NULL
     AND CURRENT_DATE >= v_wallet.next_reset_at::date THEN
    UPDATE public.credit_wallet
    SET credits_remaining = v_wallet.monthly_limit,
        last_reset_at = NOW(),
        next_reset_at = NOW() + interval '30 days',
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log reset
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, v_wallet.monthly_limit, v_wallet.monthly_limit, 'reset', 'lazy monthly credit reset');

    v_wallet.credits_remaining := v_wallet.monthly_limit;
  END IF;

  -- 4. Check balance: Must be strictly > 0
  IF v_wallet.credits_remaining <= 0 THEN
    RETURN QUERY SELECT false, 0, v_wallet.monthly_limit;
    RETURN;
  END IF;

  -- 5. Deduct
  v_new_balance := v_wallet.credits_remaining - 1;

  UPDATE public.credit_wallet
  SET credits_remaining = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 6. Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, -1, v_new_balance, 'debit', 'ai message generation');

  -- 7. Return
  RETURN QUERY SELECT true, v_new_balance, v_wallet.monthly_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
