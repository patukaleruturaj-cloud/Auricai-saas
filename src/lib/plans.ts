export type PlanType = "free" | "starter" | "basic" | "growth" | "pro";

export const plans = {
    starter: {
        slug_monthly: "starter_monthly",
        slug_yearly: "starter_yearly",
        price_monthly: 12,
        price_yearly: 144, // $12/mo
        credits: 150
    },
    basic: {
        slug_monthly: "basic_monthly",
        slug_yearly: "basic_yearly",
        price_monthly: 29,
        price_yearly: 276, // $23/mo
        credits: 400
    },
    growth: {
        slug_monthly: "growth_monthly",
        slug_yearly: "growth_yearly",
        price_monthly: 49,
        price_yearly: 468, // $39/mo
        credits: 1200
    },
    pro: {
        slug_monthly: "pro_monthly",
        slug_yearly: "pro_yearly",
        price_monthly: 69,
        price_yearly: 660, // ~$55/mo
        credits: 3000
    }
};

export const PLAN_LIMITS: Record<PlanType, number> = {
    free: 5,
    starter: plans.starter.credits,
    basic: plans.basic.credits,
    growth: plans.growth.credits,
    pro: plans.pro.credits,
};

export const PLAN_LABELS: Record<PlanType, string> = {
    free: "Free",
    starter: "Starter",
    basic: "Basic",
    growth: "Growth",
    pro: "Pro",
};
