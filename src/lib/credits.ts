/**
 * Server-side credit enforcement for AuricAI (V2).
 *
 * Uses the new `wallet` table as the single source of truth.
 * All mutations go through atomic Postgres RPCs.
 */

import { supabaseAdmin } from "./supabase-admin";

// ─── TYPES ───

export interface Wallet {
    user_id: string;
    monthly_limit: number;
    credits_remaining: number;
    addon_credits: number;
    last_reset_at: string | null;
    next_reset_at: string | null;
}

export interface Subscription {
    plan_type: string;
    billing_cycle: string;
    status: string;
    paddle_subscription_id: string | null;
    next_reset_at: string | null;
}

export interface DeductResult {
    success: boolean;
    credits_remaining: number;
    addon_credits: number;
    monthly_limit: number;
}

// ─── PROVISION USER ───

export async function ensureUserProvisioned(
    clerkId: string,
    email?: string
): Promise<string> {
    const safeEmail = email ?? `user_${clerkId}@generated.com`;

    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
        "provision_wallet_v2",
        { p_clerk_id: clerkId, p_email: safeEmail }
    );

    if (!rpcError && rpcData) {
        return rpcData as string;
    }

    // Fallback: manual provisioning
    console.warn("[credits] provision_wallet_v2 RPC failed, using fallback:", rpcError?.message);

    const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("clerk_id", clerkId)
        .single();

    if (existing?.id) {
        // Ensure wallet + subscription exist
        await supabaseAdmin.from("wallet").upsert(
            { user_id: existing.id, monthly_limit: 5, credits_remaining: 5, addon_credits: 0 },
            { onConflict: "user_id", ignoreDuplicates: true }
        );
        await supabaseAdmin.from("subscriptions_v2").upsert(
            { user_id: existing.id, plan_type: "free", billing_cycle: "monthly", status: "active" },
            { onConflict: "user_id", ignoreDuplicates: true }
        );
        return existing.id;
    }

    // Full new user
    const { data: newProfile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .insert({ clerk_id: clerkId, email: safeEmail })
        .select("id")
        .single();

    if (profileErr || !newProfile) {
        console.error("[credits] Profile insert failed:", profileErr);
        return "";
    }

    const profileId = newProfile.id;

    await supabaseAdmin.from("wallet").insert({
        user_id: profileId,
        monthly_limit: 5,
        credits_remaining: 5,
        addon_credits: 0,
    });

    await supabaseAdmin.from("subscriptions_v2").insert({
        user_id: profileId,
        plan_type: "free",
        billing_cycle: "monthly",
        status: "active",
    });

    await supabaseAdmin.from("credit_transactions").insert({
        user_id: profileId,
        amount: 5,
        balance_after: 5,
        type: "credit",
        reason: "initial free credits",
    });

    return profileId;
}

// ─── GET WALLET ───

export async function getWallet(clerkId: string): Promise<Wallet | null> {
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("clerk_id", clerkId)
        .single();

    if (!profile?.id) return null;

    const { data: wallet } = await supabaseAdmin
        .from("wallet")
        .select("user_id, monthly_limit, credits_remaining, addon_credits, last_reset_at, next_reset_at")
        .eq("user_id", profile.id)
        .single();

    if (!wallet) return null;

    return {
        user_id: wallet.user_id,
        monthly_limit: wallet.monthly_limit ?? 5,
        credits_remaining: wallet.credits_remaining ?? 5,
        addon_credits: wallet.addon_credits ?? 0,
        last_reset_at: wallet.last_reset_at ?? null,
        next_reset_at: wallet.next_reset_at ?? null,
    };
}

// ─── GET SUBSCRIPTION ───

export async function getSubscription(clerkId: string): Promise<Subscription | null> {
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("clerk_id", clerkId)
        .single();

    if (!profile?.id) return null;

    const { data: sub } = await supabaseAdmin
        .from("subscriptions_v2")
        .select("plan_type, billing_cycle, status, paddle_subscription_id, next_reset_at")
        .eq("user_id", profile.id)
        .single();

    if (!sub) return null;

    return {
        plan_type: sub.plan_type ?? "free",
        billing_cycle: sub.billing_cycle ?? "monthly",
        status: sub.status ?? "active",
        paddle_subscription_id: sub.paddle_subscription_id ?? null,
        next_reset_at: sub.next_reset_at ?? null,
    };
}

// ─── RESOLVE PROFILE ID ───

export async function resolveProfileId(clerkId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("clerk_id", clerkId)
        .single();
    return data?.id ?? null;
}

// ─── DEDUCT CREDIT ───

export async function deductCredit(clerkId: string): Promise<DeductResult> {
    const profileId = await resolveProfileId(clerkId);
    if (!profileId) {
        return { success: false, credits_remaining: 0, addon_credits: 0, monthly_limit: 0 };
    }

    // Try v3 first (monthly → addon fallback)
    const { data, error } = await supabaseAdmin.rpc("deduct_credit_v3", {
        p_user_id: profileId,
    });

    if (error) {
        console.error("[credits] deduct_credit_v3 RPC error:", error);
        return { success: false, credits_remaining: 0, addon_credits: 0, monthly_limit: 0 };
    }

    if (!data || data.length === 0) {
        return { success: false, credits_remaining: 0, addon_credits: 0, monthly_limit: 0 };
    }

    const row = data[0];
    return {
        success: row.success,
        credits_remaining: row.credits_remaining,
        addon_credits: row.addon_credits,
        monthly_limit: row.monthly_limit,
    };
}

// ─── REFUND CREDIT ───

export async function refundCredit(clerkId: string): Promise<void> {
    const profileId = await resolveProfileId(clerkId);
    if (!profileId) return;

    // Call atomic refund RPC (handles pool logic and row locking)
    const { error } = await supabaseAdmin.rpc("refund_credit_v3", {
        p_user_id: profileId,
    });

    if (error) {
        console.error("[credits] refund_credit_v3 RPC error:", error);
    }
}
