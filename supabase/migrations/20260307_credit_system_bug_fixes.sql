-- ============================================================
-- AuricAI — Credit System Bug Fixes
-- 1. Fix reset_due_credits to only affect active subscriptions.
-- 2. Add razorpay_subscription_id UNIQUE constraint to subscriptions table.
-- ============================================================

-- 1. Add UNIQUE constraint to subscriptions table
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_razorpay_subscription_id_key UNIQUE (razorpay_subscription_id);

-- 2. Update reset_due_credits RPC to enforce active subscription via JOIN
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
