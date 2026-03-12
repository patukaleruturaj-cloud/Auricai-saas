-- ============================================================
-- AuricAI — Fix: Add subscriptions_v2 to realtime publication
-- Also clean up deduct_credit_v3 table alias ambiguity
-- ============================================================

-- 1. Add subscriptions_v2 to realtime publication for dashboard live updates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions_v2'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions_v2;
    END IF;
END $$;

-- 2. Fix deduct_credit_v3 — use unambiguous WHERE clause
CREATE OR REPLACE FUNCTION public.deduct_credit_v3(p_user_id UUID)
RETURNS TABLE(success BOOLEAN, credits_remaining INTEGER, addon_credits INTEGER, monthly_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits INTEGER;
    v_addon INTEGER;
    v_limit INTEGER;
BEGIN
    -- Lock the wallet row
    SELECT w.credits_remaining, w.addon_credits, w.monthly_limit
    INTO v_credits, v_addon, v_limit
    FROM public.wallet w
    WHERE w.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0, 0, 0;
        RETURN;
    END IF;

    -- Try monthly credits first
    IF v_credits > 0 THEN
        UPDATE public.wallet
        SET credits_remaining = v_credits - 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits - 1, 'deduct', 'generation (monthly)');

        RETURN QUERY SELECT true, v_credits - 1, v_addon, v_limit;
        RETURN;
    END IF;

    -- Fallback to addon credits
    IF v_addon > 0 THEN
        UPDATE public.wallet
        SET addon_credits = v_addon - 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reason)
        VALUES (p_user_id, -1, v_credits, 'deduct', 'generation (addon)');

        RETURN QUERY SELECT true, v_credits, v_addon - 1, v_limit;
        RETURN;
    END IF;

    -- No credits available
    RETURN QUERY SELECT false, 0, 0, v_limit;
END;
$$;
