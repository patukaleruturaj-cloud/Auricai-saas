/**
 * Paddle Price ID mapping — subscriptions + addon credit packs.
 *
 * Each entry maps a Paddle price_id to its plan config.
 * The webhook handler uses `getPaddleProduct()` to resolve purchases.
 */

import type { PlanType } from "./plans";

// ─── TYPES ───

export interface PaddleSubscriptionProduct {
    type: "subscription";
    planType: PlanType;
    billingCycle: "monthly" | "yearly";
    credits: number;
}

export interface PaddleAddonProduct {
    type: "addon";
    credits: number;
    label: string;
    price: number;
}

export type PaddleProduct = PaddleSubscriptionProduct | PaddleAddonProduct;

// ─── PRICE MAP ───

export const PADDLE_PRICE_MAP: Record<string, PaddleProduct> = {
    // Subscriptions
    // Subscriptions
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY || "pri_01kkewa0zq9q2h9n4jf3dzppcz"]: {
        type: "subscription",
        planType: "starter",
        billingCycle: "monthly",
        credits: 150,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY || "pri_01kkevksxjk34bp98wywqdhjq0"]: {
        type: "subscription",
        planType: "starter",
        billingCycle: "yearly",
        credits: 150,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTHLY || "pri_01kkeveharsajd1j8jqmjz6p8y"]: {
        type: "subscription",
        planType: "basic",
        billingCycle: "monthly",
        credits: 400,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEARLY || "pri_01kkevn74qmwvrfp27zvr6anag"]: {
        type: "subscription",
        planType: "basic",
        billingCycle: "yearly",
        credits: 400,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY || "pri_01kkevg12ce2pemtwkqyg0ja74"]: {
        type: "subscription",
        planType: "growth",
        billingCycle: "monthly",
        credits: 1200,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY || "pri_01kkevptnbcgmn0sv5c4qs2s40"]: {
        type: "subscription",
        planType: "growth",
        billingCycle: "yearly",
        credits: 1200,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY || "pri_01kkevhkv3zh5v61v9yrhazk90"]: {
        type: "subscription",
        planType: "pro",
        billingCycle: "monthly",
        credits: 3000,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY || "pri_01kkevr1h59gf7mqsf4477b1mg"]: {
        type: "subscription",
        planType: "pro",
        billingCycle: "yearly",
        credits: 3000,
    },

    // Addon Credit Packs (placeholder price IDs — replace with real ones from Paddle)
    // Addon Credit Packs
    "pri_01kk7hem70v9mne26n9xj4047p": {
        type: "addon",
        credits: 200,
        label: "200 Credits",
        price: 12,
    },
    "pri_01kk7htz1mhmet73e0jpvfsfdg": {
        type: "addon",
        credits: 600,
        label: "600 Credits",
        price: 29,
    },
    "pri_01kk7r41j1esgf3gk7k19rkkh2": {
        type: "addon",
        credits: 1000,
        label: "1000 Credits",
        price: 39,
    },
};

/** Look up a Paddle product by its price_id */
export function getPaddleProduct(priceId: string): PaddleProduct | null {
    return PADDLE_PRICE_MAP[priceId] ?? null;
}

/** Get all subscription products */
export function getSubscriptionProducts(): Array<PaddleSubscriptionProduct & { priceId: string }> {
    return Object.entries(PADDLE_PRICE_MAP)
        .filter(([_, p]) => p.type === "subscription")
        .map(([priceId, p]) => ({ priceId, ...(p as PaddleSubscriptionProduct) }));
}

/** Get all addon products */
export function getAddonProducts(): Array<PaddleAddonProduct & { priceId: string }> {
    return Object.entries(PADDLE_PRICE_MAP)
        .filter(([_, p]) => p.type === "addon")
        .map(([priceId, p]) => ({ priceId, ...(p as PaddleAddonProduct) }));
}
