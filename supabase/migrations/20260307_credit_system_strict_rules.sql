-- ============================================================
-- AuricAI — Production Credit System Database Schema Update
-- Addresses the exact specifications for the credit system constraints.
-- ============================================================

-- 1. Create or ensure payments table exists for idempotency
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    razorpay_payment_id TEXT,
    razorpay_invoice_id TEXT UNIQUE NOT NULL,
    razorpay_subscription_id TEXT,
    amount NUMERIC,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'captured',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Update credit_wallet with new required columns
ALTER TABLE public.credit_wallet
    ADD COLUMN IF NOT EXISTS next_reset_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'paid'));

-- 3. Update existing credit_wallet records to have a valid next_reset_at
UPDATE public.credit_wallet
SET next_reset_at = COALESCE(last_reset_at + interval '30 days', NOW() + interval '30 days')
WHERE next_reset_at IS NULL;

-- Ensure all non-free plans are marked as 'paid'
UPDATE public.credit_wallet
SET plan_type = CASE WHEN plan_id = 'free' THEN 'free' ELSE 'paid' END;

-- 4. Recreate reset_due_credits to use next_reset_at
CREATE OR REPLACE FUNCTION public.reset_due_credits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT user_id, monthly_limit, next_reset_at
    FROM public.credit_wallet
    WHERE subscription_status = 'active'
      AND next_reset_at IS NOT NULL
      AND CURRENT_DATE >= next_reset_at::date
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

-- 5. Recreate expire_to_free strictly to rules
CREATE OR REPLACE FUNCTION public.expire_to_free(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_wallet
  SET plan_id = 'free',
      plan_type = 'free',
      monthly_limit = 10,
      credits_remaining = 10,  -- Strictly overwrite to 10
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

-- 6. Recreate atomic_deduct_credit_v2 to ensure NO overdraft and correct check
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

-- 7. RLS policies on payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS payments_no_insert ON public.payments;
CREATE POLICY payments_no_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS payments_no_update ON public.payments;
CREATE POLICY payments_no_update ON public.payments
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS payments_no_delete ON public.payments;
CREATE POLICY payments_no_delete ON public.payments
  FOR DELETE TO authenticated
  USING (false);

-- 8. Enable Realtime for payments and subscriptions
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'subscriptions'
  ) then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end
$$;
