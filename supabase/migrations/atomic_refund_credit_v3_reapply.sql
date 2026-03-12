-- ============================================================
-- AuricAI — Atomic Credit Refund Fix (Full)
-- Filename: migrations/atomic_refund_credit_v3_reapply.sql
-- ============================================================

-- 1. Ensure 'source' column exists in credit_transactions
ALTER TABLE public.credit_transactions 
ADD COLUMN IF NOT EXISTS source TEXT;

-- 2. Update type constraint
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('grant', 'deduct', 'reset', 'credit', 'debit', 'subscription', 'addon', 'refund'));

-- 3. Create the Atomic Refund RPC
CREATE OR REPLACE FUNCTION public.refund_credit_v3(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits INTEGER;
    v_addon INTEGER;
    v_limit INTEGER;
BEGIN
    -- Select with row-level locking
    SELECT w.credits_remaining, w.addon_credits, w.monthly_limit
    INTO v_credits, v_addon, v_limit
    FROM public.wallet w
    WHERE w.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Apply refund logic
    IF v_credits < v_limit THEN
        -- Refill monthly credits first
        UPDATE public.wallet
        SET credits_remaining = v_credits + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;

        -- Log transaction
        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, source, reason)
        VALUES (p_user_id, 1, v_credits + 1, 'refund', 'generation_failure', 'generation refund (monthly)');
    ELSE
        -- Otherwise, refund to addon credits
        UPDATE public.wallet
        SET addon_credits = v_addon + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;

        -- Log transaction
        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, source, reason)
        VALUES (p_user_id, 1, v_credits + v_addon + 1, 'refund', 'generation_failure', 'generation refund (addon)');
    END IF;
END;
$$;

-- Reload schema cache (PostgREST specific hack, but worth a try by adding a comment)
COMMENT ON FUNCTION public.refund_credit_v3(UUID) IS 'Atomic refund logic for generation failures.';
