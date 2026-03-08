-- Add unique constraint to credit_wallet to enforce one wallet per user
ALTER TABLE public.credit_wallet
ADD CONSTRAINT unique_user_wallet UNIQUE (user_id);

-- Create a database function to provision a new user
CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Get the free plan ID
  SELECT id INTO v_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  -- Create free subscription
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    plan_type,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    next_credit_reset
  )
  VALUES (
    new.id,
    v_plan_id,
    'free',
    'active',
    'monthly',
    now(),
    now() + interval '1 month',
    now() + interval '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create credit wallet with 10 credits
  INSERT INTO public.credit_wallet (
    user_id,
    available_credits,
    updated_at
  )
  VALUES (
    new.id,
    10,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Log credit transaction
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    reason,
    created_at
  )
  VALUES (
    new.id,
    10,
    'credit',
    'signup_bonus',
    now()
  );

  RETURN new;
END;
$$;

-- Drop trigger if exists to allow safe re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on Supabase auth user creation
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_provisioning();
