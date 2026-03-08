-- ============================================================
-- AuricAI — Production Credit System Migration
-- Consolidates credit_wallet as single source of truth.
-- Adds subscription fields, updated RPCs, RLS, provisioning trigger.
-- ============================================================

-- ============================================================
-- 1. ALTER credit_wallet — Add subscription fields
-- ============================================================
ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_id TEXT;

-- ============================================================
-- 2. MIGRATE data from subscriptions → credit_wallet
-- ============================================================
UPDATE public.credit_wallet cw
SET
  plan_id = COALESCE(s.plan_type, 'free'),
  billing_cycle = COALESCE(s.billing_cycle, 'monthly'),
  subscription_status = COALESCE(s.status, 'active'),
  subscription_id = s.razorpay_subscription_id
FROM public.subscriptions s
WHERE s.user_id = cw.user_id;

-- ============================================================
-- 3. ALTER credit_transactions — Add balance_after column
-- ============================================================
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- Allow 'reset' and 'subscription' types
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('credit', 'debit', 'reset', 'subscription'));

-- ============================================================
-- 4. FIX: Ensure all wallets with 0 credits that never used
--    any actually get their credits
-- ============================================================
UPDATE public.credit_wallet
SET credits_remaining = monthly_limit
WHERE credits_remaining = 0
  AND monthly_limit > 0
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM public.credit_transactions WHERE type = 'debit'
  );

-- ============================================================
-- 5. PROVISIONING TRIGGER — on auth.users INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Create profile row (clerk_id = Supabase auth user id initially)
  INSERT INTO public.profiles (id, clerk_id, email, created_at)
  VALUES (NEW.id, NEW.id::TEXT, COALESCE(NEW.email, 'unknown@generated.com'), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Create unified credit wallet
  INSERT INTO public.credit_wallet (
    user_id, plan_id, credits_remaining, monthly_limit,
    billing_cycle, subscription_status, last_reset_at, updated_at
  )
  VALUES (
    NEW.id, 'free', 10, 10,
    'monthly', 'active', NOW(), NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Log initial credit transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, type, reason, created_at
  )
  VALUES (
    NEW.id, 10, 10, 'credit', 'signup_bonus', NOW()
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_provisioning();

-- ============================================================
-- 6. RPC: provision_user_wallet (JIT — called from Next.js)
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_user_wallet(
  p_clerk_id TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_profile_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Check if profile exists
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE clerk_id = p_clerk_id;

  IF v_profile_id IS NOT NULL THEN
    -- Ensure wallet exists (defensive)
    INSERT INTO public.credit_wallet (
      user_id, plan_id, credits_remaining, monthly_limit,
      billing_cycle, subscription_status, last_reset_at, updated_at
    )
    VALUES (v_profile_id, 'free', 10, 10, 'monthly', 'active', v_now, v_now)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN v_profile_id;
  END IF;

  -- Create new profile
  INSERT INTO public.profiles (clerk_id, email, created_at)
  VALUES (p_clerk_id, COALESCE(p_email, 'user_' || p_clerk_id || '@generated.com'), v_now)
  RETURNING id INTO v_profile_id;

  -- Create wallet
  INSERT INTO public.credit_wallet (
    user_id, plan_id, credits_remaining, monthly_limit,
    billing_cycle, subscription_status, last_reset_at, updated_at
  )
  VALUES (v_profile_id, 'free', 10, 10, 'monthly', 'active', v_now, v_now);

  -- Initial credit transaction
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (v_profile_id, 10, 10, 'credit', 'initial free credits');

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RPC: atomic_deduct_credit (row-lock safe)
-- ============================================================
CREATE OR REPLACE FUNCTION public.atomic_deduct_credit(p_user_id UUID)
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

  -- 3. Auto-reset if 30+ days since last reset
  IF v_wallet.last_reset_at IS NOT NULL
     AND CURRENT_DATE - v_wallet.last_reset_at::date >= 30 THEN
    UPDATE public.credit_wallet
    SET credits_remaining = v_wallet.monthly_limit,
        last_reset_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log reset
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, v_wallet.monthly_limit, v_wallet.monthly_limit, 'reset', 'monthly automatic reset');

    v_wallet.credits_remaining := v_wallet.monthly_limit;
  END IF;

  -- 4. Check balance
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

-- ============================================================
-- 8. RPC: refund_credit
-- ============================================================
CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE public.credit_wallet
  SET credits_remaining = credits_remaining + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING credits_remaining INTO v_new_balance;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, 1, v_new_balance, 'credit', 'generation failure refund');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. RPC: activate_subscription
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_user_id UUID,
  p_plan_id TEXT,
  p_monthly_limit INT,
  p_billing_cycle TEXT,
  p_subscription_id TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_wallet
  SET plan_id = p_plan_id,
      monthly_limit = p_monthly_limit,
      credits_remaining = p_monthly_limit,
      billing_cycle = p_billing_cycle,
      subscription_status = 'active',
      subscription_id = p_subscription_id,
      last_reset_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, p_monthly_limit, p_monthly_limit, 'subscription', 'subscription activated: ' || p_plan_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. RPC: cancel_subscription
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_subscription(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_wallet
  SET subscription_status = 'cancelled',
      updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. RPC: expire_to_free (for cancelled subs past billing period)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_to_free(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_wallet
  SET plan_id = 'free',
      monthly_limit = 10,
      credits_remaining = LEAST(credits_remaining, 10),
      billing_cycle = 'monthly',
      subscription_status = 'active',
      subscription_id = NULL,
      last_reset_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, 10, 10, 'subscription', 'expired to free plan');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. RPC: reset_due_credits (batch cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_due_credits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT user_id, monthly_limit
    FROM public.credit_wallet
    WHERE subscription_status = 'active'
      AND last_reset_at IS NOT NULL
      AND CURRENT_DATE - last_reset_at::date >= 30
  LOOP
    UPDATE public.credit_wallet
    SET credits_remaining = v_row.monthly_limit,
        last_reset_at = NOW(),
        updated_at = NOW()
    WHERE user_id = v_row.user_id;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (v_row.user_id, v_row.monthly_limit, v_row.monthly_limit, 'reset', 'monthly credit reset');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. RLS Rules for credit_wallet
-- ============================================================
-- Users can SELECT their own wallet row
DROP POLICY IF EXISTS wallet_select_own ON public.credit_wallet;
CREATE POLICY wallet_select_own ON public.credit_wallet
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Block direct INSERT/UPDATE/DELETE from client (only RPCs can modify)
DROP POLICY IF EXISTS wallet_no_insert ON public.credit_wallet;
CREATE POLICY wallet_no_insert ON public.credit_wallet
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS wallet_no_update ON public.credit_wallet;
CREATE POLICY wallet_no_update ON public.credit_wallet
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS wallet_no_delete ON public.credit_wallet;
CREATE POLICY wallet_no_delete ON public.credit_wallet
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 14. Enable Realtime for credit_wallet
-- ============================================================
-- Required for the frontend to receive instant credit updates
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'credit_wallet'
  ) then
    alter publication supabase_realtime add table public.credit_wallet;
  end if;
end
$$;
