-- ============================================================
-- AuricAI — Plan Tiers (Starter=400, Growth=1200, Pro=2850)
-- ============================================================

-- 1. Ensure constraints handle 'growth' and 'pro'
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_type_check CHECK (plan_type IN ('free', 'starter', 'growth', 'pro'));

-- 2. Clean up any legacy 'elite' subscriptions
UPDATE public.subscriptions SET plan_type = 'pro' WHERE plan_type = 'elite';

-- 3. Upsert the exact plans
INSERT INTO public.plans (name, display_name, description, monthly_price, credits_per_month)
VALUES 
    ('free', 'Free Plan', 'Try AuricAI with no commitment.', 0.00, 10),
    ('starter', 'Starter Plan', 'For founders testing outbound.', 29.00, 400),
    ('growth', 'Growth Plan', 'For 1–2 SDR teams scaling outreach.', 59.00, 1200),
    ('pro', 'Pro Plan', 'For serious outbound teams maximizing reply rates.', 89.00, 2850)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    monthly_price = EXCLUDED.monthly_price,
    credits_per_month = EXCLUDED.credits_per_month;

-- Clean up any lingering elite row
DELETE FROM public.plans WHERE name = 'elite';

-- 4. Update existing subscriptions' plan_ids to match
UPDATE public.subscriptions s
SET plan_id = p.id
FROM public.plans p
WHERE s.plan_type = p.name;
