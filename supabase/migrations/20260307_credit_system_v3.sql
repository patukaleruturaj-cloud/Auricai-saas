-- ============================================================
-- AuricAI — Credit System V3 (Production-Ready)
--
-- ROOT-CAUSE FIXES:
--   1. Atomic idempotency via INSERT ON CONFLICT (no race condition)
--   2. Atomic credit reset via RPC with FOR UPDATE (no partial updates)
--   3. atomic_deduct_credit_v2 with STRICT + EXCEPTION
--   4. All wallet mutations use row-level locking
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. ENSURE credit_wallet columns exist
-- ============================================================
ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'free';

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS subscription_id TEXT;

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS credits_remaining INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.credit_wallet
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for subscription_id lookups (webhook hot path)
CREATE INDEX IF NOT EXISTS idx_credit_wallet_subscription_id
  ON public.credit_wallet(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- ============================================================
-- 2. payment_events — idempotency table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id
  ON public.payment_events(event_id);

-- Migrate old column name if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_events'
      AND column_name = 'razorpay_event_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'payment_events'
        AND column_name = 'event_id'
    ) THEN
      ALTER TABLE public.payment_events ADD COLUMN event_id TEXT;
      UPDATE public.payment_events SET event_id = razorpay_event_id WHERE event_id IS NULL;
      ALTER TABLE public.payment_events ALTER COLUMN event_id SET NOT NULL;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_events_event_id_key'
      ) THEN
        ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_event_id_key UNIQUE (event_id);
      END IF;
    END IF;
  END IF;
END $$;

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 3. credit_transactions — audit log
-- ============================================================
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('grant', 'deduct', 'reset', 'credit', 'debit', 'subscription'));

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- ============================================================
-- 4. RPC: check_and_record_event
--    ATOMIC idempotency check using INSERT ON CONFLICT.
--    Returns TRUE if this is a NEW event (should be processed).
--    Returns FALSE if duplicate (already processed — stop).
--
--    This eliminates the SELECT-then-INSERT race condition.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_record_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_inserted_id UUID;
BEGIN
  INSERT INTO public.payment_events (event_id, event_type, processed_at)
  VALUES (p_event_id, p_event_type, NOW())
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- If v_inserted_id is NULL, the row already existed → duplicate
  RETURN v_inserted_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RPC: reset_credits_for_subscription
--    ATOMIC credit reset with FOR UPDATE row locking.
--    Used by webhook on invoice.paid / subscription.charged.
--    Returns the user_id that was credited (NULL if not found).
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_credits_for_subscription(
  p_subscription_id TEXT,
  p_reason TEXT DEFAULT 'subscription cycle reset'
)
RETURNS UUID AS $$
DECLARE
  v_wallet RECORD;
BEGIN
  -- Lock the wallet row by subscription_id
  SELECT * INTO v_wallet
  FROM public.credit_wallet
  WHERE subscription_id = p_subscription_id
    AND subscription_status = 'active'
  FOR UPDATE;

  IF v_wallet.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Reset credits to monthly_limit
  UPDATE public.credit_wallet
  SET credits_remaining = v_wallet.monthly_limit,
      last_reset_at = NOW(),
      updated_at = NOW()
  WHERE user_id = v_wallet.user_id;

  -- Audit log
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (v_wallet.user_id, v_wallet.monthly_limit, v_wallet.monthly_limit, 'reset', p_reason);

  RETURN v_wallet.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RPC: atomic_deduct_credit_v2
--    Row-lock safe, lazy monthly reset, negative balance guard.
-- ============================================================
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
  SELECT * INTO STRICT v_wallet
  FROM public.credit_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 2. Check subscription status
  IF v_wallet.subscription_status NOT IN ('active', 'cancelled') THEN
    RETURN QUERY SELECT false, v_wallet.credits_remaining, v_wallet.monthly_limit;
    RETURN;
  END IF;

  -- 3. Lazy monthly reset
  IF v_wallet.last_reset_at IS NOT NULL
     AND CURRENT_DATE - v_wallet.last_reset_at::date >= 30 THEN

    UPDATE public.credit_wallet
    SET credits_remaining = v_wallet.monthly_limit,
        last_reset_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
    VALUES (p_user_id, v_wallet.monthly_limit, v_wallet.monthly_limit, 'reset', 'lazy monthly auto-reset');

    v_wallet.credits_remaining := v_wallet.monthly_limit;
  END IF;

  -- 4. Prevent negative balance
  IF v_wallet.credits_remaining <= 0 THEN
    RETURN QUERY SELECT false, 0, v_wallet.monthly_limit;
    RETURN;
  END IF;

  -- 5. Deduct 1 credit
  v_new_balance := v_wallet.credits_remaining - 1;

  UPDATE public.credit_wallet
  SET credits_remaining = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 6. Audit log
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, -1, v_new_balance, 'deduct', 'ai message generation');

  RETURN QUERY SELECT true, v_new_balance, v_wallet.monthly_limit;

EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN QUERY SELECT false, 0, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RPC: activate_subscription
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

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
  VALUES (p_user_id, p_monthly_limit, p_monthly_limit, 'grant', 'subscription activated: ' || p_plan_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. RPC: cancel_subscription
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
-- 9. RPC: expire_to_free
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
  VALUES (p_user_id, 10, 10, 'grant', 'expired to free plan');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. RPC: refund_credit
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
  VALUES (p_user_id, 1, v_new_balance, 'grant', 'generation failure refund');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. Ensure Realtime for credit_wallet
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'credit_wallet'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_wallet;
  END IF;
END
$$;
