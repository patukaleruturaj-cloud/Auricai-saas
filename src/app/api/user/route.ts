import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProvisioned, getWallet, getSubscription } from "@/lib/credits";
import { PLAN_LIMITS } from "@/lib/plans";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

/**
 * GET /api/user
 *
 * Returns unified billing state: subscription + wallet.
 * Auto-provisions on first call.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const clerkId = session.userId;

        // Auto-provision
        await ensureUserProvisioned(clerkId);

        // Read wallet + subscription
        const wallet = await getWallet(clerkId);
        const subscription = await getSubscription(clerkId);

        if (!wallet) {
            const thirtyDays = new Date();
            thirtyDays.setDate(thirtyDays.getDate() + 30);
            return NextResponse.json({
                plan: "free",
                billingInterval: "monthly",
                status: "active",
                creditsRemaining: PLAN_LIMITS.free,
                monthlyLimit: PLAN_LIMITS.free,
                addonCredits: 0,
                creditsUsed: 0,
                nextResetDate: thirtyDays.toISOString(),
            });
        }

        const plan = subscription?.plan_type ?? "free";

        // Use wallet.monthly_limit (set by activate_plan RPC) as primary source,
        // fall back to PLAN_LIMITS from plans.ts only as a safety net
        const monthlyLimit = wallet.monthly_limit > 0
            ? wallet.monthly_limit
            : (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? 5);
        const creditsUsed = Math.max(0, monthlyLimit - wallet.credits_remaining);

        return NextResponse.json({
            userId: wallet.user_id,
            plan,
            billingInterval: subscription?.billing_cycle ?? "monthly",
            status: subscription?.status ?? "active",
            paddleSubscriptionId: subscription?.paddle_subscription_id ?? null,
            creditsRemaining: wallet.credits_remaining,
            monthlyLimit,
            addonCredits: wallet.addon_credits,
            totalCredits: wallet.credits_remaining + wallet.addon_credits,
            creditsUsed,
            lastResetDate: wallet.last_reset_at,
            nextResetDate: wallet.next_reset_at,
        });

    } catch (error: any) {
        console.error("[api/user] error:", error);
        return NextResponse.json(
            { error: "Server Error", details: error.message },
            { status: 500 }
        );
    }
}
