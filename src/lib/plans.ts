export type PlanType = "free" | "starter" | "growth" | "pro";

export const plans = {
    starter: {
        slug_monthly: "starter_monthly",
        slug_yearly: "starter_yearly",
        price_monthly: 29,
        price_yearly: 276, // $23/mo
        credits: 400
    },
    growth: {
        slug_monthly: "growth_monthly",
        slug_yearly: "growth_yearly",
        price_monthly: 59,
        price_yearly: 564, // $47/mo
        credits: 1200
    },
    pro: {
        slug_monthly: "pro_monthly",
        slug_yearly: "pro_yearly",
        price_monthly: 89,
        price_yearly: 852, // $71/mo
        credits: 3000
    }
};

export const PLAN_LIMITS: Record<PlanType, number> = {
    free: 10,
    starter: plans.starter.credits,
    growth: plans.growth.credits,
    pro: plans.pro.credits,
};

export const PLAN_LABELS: Record<PlanType, string> = {
    free: "Free",
    starter: "Starter",
    growth: "Growth",
    pro: "Pro",
};
