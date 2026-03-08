-- Backfill missing subscriptions for existing users
INSERT INTO public.subscriptions (
  user_id,
  plan_type,
  status,
  billing_cycle,
  current_period_start,
  current_period_end,
  next_credit_reset
)
SELECT 
  id,
  'free',
  'active',
  'monthly',
  now(),
  now() + interval '1 month',
  now() + interval '1 month'
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.subscriptions
);

-- Backfill missing wallets for existing users
INSERT INTO public.credit_wallet (user_id, available_credits, updated_at)
SELECT id, 10, now()
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.credit_wallet
);

-- Backfill transactions log
INSERT INTO public.credit_transactions (user_id, amount, type, reason, created_at)
SELECT id, 10, 'credit', 'migration_wallet_backfill', now()
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.credit_transactions WHERE reason = 'migration_wallet_backfill'
);
