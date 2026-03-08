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
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY || "pri_01kk48a3ag30jdg86w4mj6t3vm"]: {
        type: "subscription",
        planType: "starter",
        billingCycle: "monthly",
        credits: 400,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY || "pri_01kk48dyvfgxeg6g01f905r75v"]: {
        type: "subscription",
        planType: "starter",
        billingCycle: "yearly",
        credits: 400,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY || "pri_01kk48azf2tdv3kpg11vzcg497"]: {
        type: "subscription",
        planType: "growth",
        billingCycle: "monthly",
        credits: 1200,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY || "pri_01kk48etjaxhgzswtagfn43b0j"]: {
        type: "subscription",
        planType: "growth",
        billingCycle: "yearly",
        credits: 1200,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY || "pri_01kk48c7bq98e7e5tt4mq2br1s"]: {
        type: "subscription",
        planType: "pro",
        billingCycle: "monthly",
        credits: 3000,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY || "pri_01kk48g7zhw6smjabnyarbtv34"]: {
        type: "subscription",
        planType: "pro",
        billingCycle: "yearly",
        credits: 3000,
    },

    // Addon Credit Packs (placeholder price IDs — replace with real ones from Paddle)
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_200 || "pri_addon_200_placeholder"]: {
        type: "addon",
        credits: 200,
        label: "200 Credits",
        price: 9,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_600 || "pri_addon_600_placeholder"]: {
        type: "addon",
        credits: 600,
        label: "600 Credits",
        price: 19,
    },
    [process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_1500 || "pri_addon_1500_placeholder"]: {
        type: "addon",
        credits: 1500,
        label: "1500 Credits",
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
