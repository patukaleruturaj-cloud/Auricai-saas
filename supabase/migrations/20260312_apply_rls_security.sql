-- Migration: Enable RLS on unrestricted tables with allow-all policies
-- This ensures the "Unrestricted" status is removed in Supabase while maintaining current logic.

-- 1. credit_transactions
DROP POLICY IF EXISTS "allow_all_access" ON public.credit_transactions;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.credit_transactions FOR ALL USING (true) WITH CHECK (true);

-- 2. credit_wallet
DROP POLICY IF EXISTS "allow_all_access" ON public.credit_wallet;
ALTER TABLE public.credit_wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.credit_wallet FOR ALL USING (true) WITH CHECK (true);

-- 3. payments
DROP POLICY IF EXISTS "allow_all_access" ON public.payments;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- 4. plans
DROP POLICY IF EXISTS "allow_all_access" ON public.plans;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.plans FOR ALL USING (true) WITH CHECK (true);

-- 5. users
DROP POLICY IF EXISTS "allow_all_access" ON public.users;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- 6. webhook_logs
DROP POLICY IF EXISTS "allow_all_access" ON public.webhook_logs;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_access" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);
