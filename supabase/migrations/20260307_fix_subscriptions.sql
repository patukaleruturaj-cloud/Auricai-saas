-- Fixes the `create-subscription` breaking bug by modifying the strict enum 
-- to allow 'pending' subscriptions (as created right before checkout).
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check 
  CHECK (status IN ('pending', 'active', 'halted', 'cancelled', 'expired', 'past_due'));
