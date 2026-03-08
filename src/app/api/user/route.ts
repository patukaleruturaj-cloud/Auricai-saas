import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProvisioned, getWallet, getSubscription } from "@/lib/credits";

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
                creditsRemaining: 10,
                monthlyLimit: 10,
                addonCredits: 0,
                creditsUsed: 0,
                nextResetDate: thirtyDays.toISOString(),
            });
        }

        const plan = subscription?.plan_type ?? "free";

        const PLAN_LIMITS: Record<string, number> = {
            free: 10,
            starter: 400,
            growth: 1200,
            pro: 3000
        };

        const monthlyLimit = PLAN_LIMITS[plan] ?? 10;
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
